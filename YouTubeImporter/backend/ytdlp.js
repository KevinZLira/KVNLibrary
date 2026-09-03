'use strict';

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const { URL } = require('url'); // don't rely on the global `URL` — not present on the older Node some CEP builds bundle
const { fromRaw, ImporterError } = require('./errors');

/**
 * Forces yt-dlp's "android" player client, but ONLY when no cookies are
 * configured. YouTube's anti-bot checks (PO tokens, SABR streaming
 * enforcement) reject the default client selection with a bare HTTP 403 for
 * anonymous requests on some networks — "android" was the client that still
 * worked in that case. But once real cookies (an authenticated session) are
 * available, forcing android actively hurts: yt-dlp's own default
 * multi-client selection combined with valid auth reliably unlocks the full
 * format catalog (confirmed by a real side-by-side test — same video, same
 * network, only difference was cookies + no forced client), where android
 * alone stays capped low regardless. This is an active, ever-shifting fight
 * between YouTube and every downloader tool, so this choice may need
 * revisiting again later.
 */
function buildClientOverrideArgs(hasCookies) {
  return hasCookies ? [] : ['--extractor-args', 'youtube:player_client=android'];
}

/**
 * Minimal shell-like tokenizer for the user-editable "extra args" setting
 * (Configurações > avançado) — supports single/double-quoted segments so a
 * value containing spaces, e.g. --extractor-args "youtube:player_client=web",
 * splits into the right argv entries. This is the escape hatch that lets
 * the app absorb whatever new yt-dlp flag YouTube's restrictions require
 * next without a code update.
 */
function parseExtraArgs(raw) {
  const str = String(raw || '').trim();
  if (!str) return [];
  const tokens = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/** Extracts the YouTube video ID from any of the accepted URL shapes. */
function extractVideoId(rawUrl) {
  if (!rawUrl) return null;
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch (_) {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  }

  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v');
      return /^[\w-]{11}$/.test(id || '') ? id : null;
    }
    const shortMatch = url.pathname.match(/^\/(shorts|embed|live)\/([\w-]{11})/);
    if (shortMatch) return shortMatch[2];
  }

  return null;
}

function isValidYoutubeUrl(rawUrl) {
  return extractVideoId(rawUrl) !== null;
}

function buildCookiesArgs(cookiesPath) {
  const trimmed = String(cookiesPath || '').trim();
  return trimmed ? ['--cookies', trimmed] : [];
}

function normalizeUrl(rawUrl) {
  const id = extractVideoId(rawUrl);
  return id ? `https://www.youtube.com/watch?v=${id}` : rawUrl;
}

function secToClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Runs `yt-dlp -J <url>` and returns the parsed metadata (title, duration, formats, ...). */
function getVideoInfo(ytdlpPath, rawUrl, extraArgsString, cookiesPath) {
  return new Promise((resolve, reject) => {
    const url = normalizeUrl(rawUrl);
    if (!isValidYoutubeUrl(url)) {
      reject(fromRaw('invalid url', 'URL_INVALID'));
      return;
    }

    const args = [
      '-J', '--no-warnings', '--no-playlist', '--no-check-certificates',
      ...buildClientOverrideArgs(!!String(cookiesPath || '').trim()),
      ...buildCookiesArgs(cookiesPath),
      ...parseExtraArgs(extraArgsString),
      url,
    ];
    console.log('[YouTube Importer] getVideoInfo command:', ytdlpPath, args.join(' '));
    const child = spawn(ytdlpPath, args, { windowsHide: true });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => reject(fromRaw(err.message, 'YTDLP_MISSING')));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(fromRaw(stderr || `yt-dlp exited with code ${code}`));
        return;
      }
      try {
        const info = JSON.parse(stdout);
        const normalized = normalizeInfo(info);
        console.log('[YouTube Importer] availableHeights:', normalized.availableHeights);
        resolve(normalized);
      } catch (e) {
        reject(fromRaw(stderr || e.message));
      }
    });
  });
}

function normalizeInfo(info) {
  const formats = (info.formats || []).map((f) => ({
    formatId: f.format_id,
    ext: f.ext,
    height: f.height || null,
    vcodec: f.vcodec,
    acodec: f.acodec,
    filesize: f.filesize || f.filesize_approx || null,
    fps: f.fps || null,
    abr: f.abr || null,
  }));

  return {
    id: info.id,
    title: info.title || 'Video',
    channel: info.channel || info.uploader || 'Desconhecido',
    duration: Math.round(info.duration || 0),
    thumbnail: info.thumbnail || (Array.isArray(info.thumbnails) && info.thumbnails.length
      ? info.thumbnails[info.thumbnails.length - 1].url
      : null),
    webpageUrl: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
    availableHeights: Array.from(new Set(formats.filter((f) => f.height).map((f) => f.height))).sort((a, b) => b - a),
    formats,
  };
}

const QUALITY_HEIGHTS = { best: null, '1080p': 1080, '720p': 720, '480p': 480 };

/**
 * Builds the yt-dlp -f selector for the requested media type + quality, and
 * reports which quality will actually be used (yt-dlp's selector syntax
 * already falls back to the closest lower quality on its own; we just need
 * to detect *ahead of time* whether we must warn the user about it).
 */
function resolveFormatPlan(mediaType, quality, availableHeights) {
  const heights = availableHeights && availableHeights.length ? availableHeights : [];
  const requestedHeight = QUALITY_HEIGHTS[quality] !== undefined ? QUALITY_HEIGHTS[quality] : null; // avoid `??` — needs Node 14+, not guaranteed on older CEP-bundled Node

  let effectiveHeight = requestedHeight;
  let downgraded = false;
  if (requestedHeight && heights.length) {
    const maxAvailable = heights[0];
    if (!heights.includes(requestedHeight)) {
      const lower = heights.filter((h) => h <= requestedHeight);
      effectiveHeight = lower.length ? lower[0] : maxAvailable;
      downgraded = true;
    }
  }

  const heightClause = effectiveHeight ? `[height<=${effectiveHeight}]` : '';
  let selector;
  let mergeToMp4 = false;

  if (mediaType === 'audio-only' || quality === 'audio-best') {
    selector = 'bestaudio/best';
  } else if (mediaType === 'video-only') {
    // Prefer H.264 (avc1) at the target height — Premiere opens it reliably
    // everywhere; VP9/AV1 support varies by OS/GPU/Premiere version and can
    // silently fail to preview even when the file imports. Falls back to
    // any codec at that height, then to whatever's best overall.
    selector = `bestvideo${heightClause}[vcodec^=avc1]/bestvideo${heightClause}/best${heightClause}`;
  } else {
    selector = `bestvideo${heightClause}[vcodec^=avc1]+bestaudio/bestvideo${heightClause}+bestaudio/best${heightClause}`;
    mergeToMp4 = true;
  }

  return {
    selector,
    mergeToMp4,
    requestedHeight,
    effectiveHeight,
    downgraded,
  };
}

/**
 * Downloads the requested video. When `useSections` is true (the default,
 * fast path), only the [start,end] section is fetched via yt-dlp
 * --download-sections — but that hands the actual byte-range request to
 * ffmpeg as an "external downloader", talking to YouTube's CDN directly
 * without yt-dlp's own session/headers. YouTube's anti-bot measures can
 * reject that with a 403 even though yt-dlp's own (non-ffmpeg) downloader
 * works fine — in which case the caller should retry with `useSections:
 * false` to fetch the whole video through yt-dlp's native downloader and
 * trim it locally afterward instead. Streams progress events; returns the
 * child process handle so the caller can cancel.
 */
function downloadSection({ ytdlpPath, ffmpegDir, url, startSeconds, endSeconds, formatSelector, mergeToMp4, outputTemplate, useSections = true, extraArgsString, cookiesPath }, onProgress) {
  const args = [
    normalizeUrl(url),
    '-f', formatSelector,
    '--no-playlist',
    '--newline',
    '--no-check-certificates',
    '--no-warnings',
    '--ffmpeg-location', ffmpegDir,
    '-o', outputTemplate,
    '--print', 'after_move:filepath',
    ...buildClientOverrideArgs(!!String(cookiesPath || '').trim()),
    ...buildCookiesArgs(cookiesPath),
    ...parseExtraArgs(extraArgsString),
  ];
  if (useSections) {
    const section = `*${secToClock(startSeconds)}-${secToClock(endSeconds)}`;
    args.push('--download-sections', section, '--force-keyframes-at-cuts');
  }
  if (mergeToMp4) args.push('--merge-output-format', 'mp4');

  console.log('[YouTube Importer] downloadSection command:', ytdlpPath, args.join(' '));
  const child = spawn(ytdlpPath, args, { windowsHide: true });
  let stderr = '';
  let lastPrintedPath = '';
  let buffer = '';

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r|\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const progress = parseProgressLine(line);
      if (progress) {
        onProgress(progress);
      } else if (/^\/|^[A-Za-z]:\\/.test(line.trim())) {
        lastPrintedPath = line.trim();
      } else if (line.trim()) {
        onProgress({ stage: stageFromLine(line), raw: line.trim() });
      }
    }
  });
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  const donePromise = new Promise((resolve, reject) => {
    child.on('error', (err) => reject(fromRaw(err.message, 'YTDLP_MISSING')));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ filePath: lastPrintedPath || null });
      } else if (child.killed) {
        reject(new ImporterError('CANCELLED', 'Download cancelado pelo usuário.', stderr));
      } else {
        reject(fromRaw(stderr || `yt-dlp exited with code ${code}`));
      }
    });
  });

  return { child, donePromise };
}

function stageFromLine(line) {
  if (/\[Merger\]/.test(line)) return 'merging';
  if (/\[ExtractAudio\]/.test(line)) return 'extracting-audio';
  if (/\[VideoRemuxer\]|\[Remuxer\]/.test(line)) return 'remuxing';
  if (/\[ffmpeg\]/.test(line)) return 'processing';
  if (/\[download\] Destination/.test(line)) return 'starting';
  return 'info';
}

function parseProgressLine(line) {
  const m = line.match(/\[download\]\s+([\d.]+)%\s+of\s*~?\s*([\d.]+\s*\w+)?(?:\s+at\s+([\d.]+\s*\w+\/s|Unknown speed))?(?:\s+ETA\s+(\S+))?/);
  if (!m) return null;
  return {
    stage: 'downloading',
    percent: parseFloat(m[1]),
    totalSize: m[2] ? m[2].trim() : null,
    speed: m[3] ? m[3].trim() : null,
    eta: m[4] || null,
  };
}

module.exports = {
  extractVideoId,
  isValidYoutubeUrl,
  normalizeUrl,
  secToClock,
  getVideoInfo,
  resolveFormatPlan,
  downloadSection,
  parseProgressLine,
  parseExtraArgs,
};
