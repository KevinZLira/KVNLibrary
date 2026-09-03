'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ytdlp = require('./ytdlp');
const ffmpeg = require('./ffmpeg');
const binaries = require('./binaries');
const cacheStore = require('./cache');
const historyStore = require('./history');
const fsUtils = require('./fsUtils');
const { ImporterError, fromRaw, friendlyMessage } = require('./errors');

/** jobId -> { cancelRequested, ytdlpChild } so cancel() can reach whichever process is active. */
const activeJobs = new Map();

function validateClip(start, end, duration) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new ImporterError('CLIP_INVALID', friendlyMessage('CLIP_INVALID'));
  }
  if (start < 0 || end <= start) {
    throw new ImporterError('CLIP_INVALID', friendlyMessage('CLIP_INVALID'));
  }
  if (duration && (start > duration || end > duration + 0.5)) {
    throw new ImporterError('CLIP_INVALID', friendlyMessage('CLIP_INVALID'));
  }
}

function checkCache({ videoId, startSeconds, endSeconds, mediaType, quality }) {
  return cacheStore.lookup({ videoId, startSeconds, endSeconds, mediaType, quality });
}

function extensionFor(mediaType) {
  return mediaType === 'audio-only' ? 'wav' : 'mp4';
}

/**
 * Runs the full pipeline: metadata already known (videoInfo) -> resolve format
 * -> download just the requested section -> make it Premiere-safe -> place the
 * result in the configured download folder -> record cache/history.
 *
 * Returns { jobId, promise, cancel }. `onProgress(event)` fires repeatedly with
 * { stage, percent?, speed?, totalSize?, eta?, message? }.
 */
/** crypto.randomUUID only became available in Node 14.17 — fall back to a
 *  manual UUID v4 built from crypto.randomBytes on older CEP-bundled Node. */
function makeJobId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function startJob(params, onProgress) {
  const jobId = makeJobId();
  const control = { cancelRequested: false, ytdlpChild: null };
  activeJobs.set(jobId, control);

  const promise = runPipeline(jobId, control, params, onProgress || (() => {})).finally(() => {
    activeJobs.delete(jobId);
  });

  return {
    jobId,
    promise,
    cancel: () => cancelJob(jobId),
  };
}

function cancelJob(jobId) {
  const control = activeJobs.get(jobId);
  if (!control) return false;
  control.cancelRequested = true;
  if (control.ytdlpChild && !control.ytdlpChild.killed) {
    control.ytdlpChild.kill('SIGTERM');
  }
  ffmpeg.cancelCurrent();
  return true;
}

async function runPipeline(jobId, control, params, onProgress) {
  const {
    videoInfo,
    startSeconds,
    endSeconds,
    mediaType, // 'video-audio' | 'video-only' | 'audio-only'
    quality, // 'best' | '1080p' | '720p' | '480p' | 'audio-best'
    downloadDir,
    config,
  } = params;

  validateClip(startSeconds, endSeconds, videoInfo.duration);

  const freeBytes = fsUtils.freeSpaceBytes(downloadDir);
  if (freeBytes !== null && freeBytes < 200 * 1024 * 1024) {
    throw new ImporterError('DISK_FULL', friendlyMessage('DISK_FULL'));
  }

  const { ytdlp: ytdlpPath, ffmpeg: ffmpegPath } = binaries.locateAll(config);
  if (!ytdlpPath) throw new ImporterError('YTDLP_MISSING', friendlyMessage('YTDLP_MISSING'));
  if (!ffmpegPath) throw new ImporterError('FFMPEG_MISSING', friendlyMessage('FFMPEG_MISSING'));

  const plan = ytdlp.resolveFormatPlan(mediaType, quality, videoInfo.availableHeights);
  if (plan.downgraded) {
    onProgress({
      stage: 'notice',
      message: `Qualidade ${quality} não disponível para este vídeo. Usando ${plan.effectiveHeight}p.`,
    });
  }

  fsUtils.ensureDir(downloadDir);
  const tempRoot = path.join(downloadDir, '.yti-temp', jobId);
  fsUtils.ensureDir(tempRoot);

  // Errors in this set won't be fixed by retrying with a full (unsectioned)
  // download, so don't waste time/bandwidth attempting it.
  const NON_RETRYABLE_CODES = new Set([
    'CANCELLED', 'VIDEO_PRIVATE', 'VIDEO_UNAVAILABLE', 'VIDEO_REMOVED',
    'VIDEO_AGE_RESTRICTED', 'VIDEO_MEMBERS_ONLY', 'VIDEO_UPCOMING_LIVE',
    'URL_INVALID', 'YTDLP_MISSING', 'FFMPEG_MISSING', 'DISK_FULL', 'CLIP_INVALID',
  ]);

  async function runYtdlpDownload(useSections) {
    const outputTemplate = path.join(tempRoot, '%(id)s.%(ext)s');
    const { child, donePromise } = ytdlp.downloadSection(
      {
        ytdlpPath,
        ffmpegDir: path.dirname(ffmpegPath),
        url: videoInfo.webpageUrl,
        startSeconds,
        endSeconds,
        formatSelector: plan.selector,
        mergeToMp4: plan.mergeToMp4,
        outputTemplate,
        useSections,
        extraArgsString: config.extraYtdlpArgs,
      },
      (evt) => onProgress(evt)
    );
    control.ytdlpChild = child;

    const { filePath: rawFilePath } = await donePromise;
    control.ytdlpChild = null;
    if (control.cancelRequested) {
      throw new ImporterError('CANCELLED', 'Download cancelado pelo usuário.');
    }

    const resolved = rawFilePath && fs.existsSync(rawFilePath) ? rawFilePath : findDownloadedFile(tempRoot);
    if (!resolved) {
      throw new ImporterError('UNKNOWN', friendlyMessage('UNKNOWN'), 'yt-dlp did not report an output file');
    }
    return resolved;
  }

  try {
    onProgress({ stage: 'downloading', percent: 0 });

    // Fast path: ask yt-dlp for only the requested section. This hands the
    // actual byte range fetch to ffmpeg as an "external downloader", talking
    // to YouTube's CDN directly without yt-dlp's own session/headers —
    // YouTube's anti-bot checks can 403 that even when a normal download
    // works fine. When that happens, fall back to downloading the whole
    // video through yt-dlp's native (more robust) downloader and trim it
    // locally with ffmpeg afterward instead.
    let resolvedRaw;
    let trimmedByServer = true;
    try {
      resolvedRaw = await runYtdlpDownload(true);
    } catch (sectionErr) {
      if (control.cancelRequested || NON_RETRYABLE_CODES.has(sectionErr.code)) {
        throw sectionErr;
      }
      onProgress({
        stage: 'notice',
        message: 'Não foi possível baixar apenas o trecho diretamente do YouTube. Baixando o vídeo completo e cortando localmente...',
      });
      trimmedByServer = false;
      resolvedRaw = await runYtdlpDownload(false);
    }

    onProgress({ stage: 'processing', message: 'Processando vídeo...' });

    const ext = extensionFor(mediaType);
    const filename = fsUtils.buildClipFilename(videoInfo.title, startSeconds, endSeconds, ext);
    const finalPath = fsUtils.uniquePath(downloadDir, filename);

    if (mediaType === 'audio-only') {
      if (trimmedByServer) {
        await ffmpeg.extractAudioToWav(ffmpegPath, resolvedRaw, finalPath, (evt) => onProgress(evt));
      } else {
        await ffmpeg.trimToWav(ffmpegPath, resolvedRaw, finalPath, startSeconds, endSeconds, (evt) => onProgress(evt));
      }
    } else if (trimmedByServer) {
      await ffmpeg.ensurePremiereCompatibleVideo(
        ffmpegPath,
        resolvedRaw,
        finalPath,
        mediaType === 'video-audio',
        (evt) => onProgress(evt)
      );
    } else {
      await ffmpeg.trimToCompatibleVideo(
        ffmpegPath,
        resolvedRaw,
        finalPath,
        startSeconds,
        endSeconds,
        mediaType === 'video-audio',
        (evt) => onProgress(evt)
      );
    }

    if (config.autoCleanupTemp !== false) {
      cleanupDir(tempRoot);
    }

    const cacheParams = { videoId: videoInfo.id, startSeconds, endSeconds, mediaType, quality };
    if (config.cacheEnabled !== false) {
      cacheStore.remember(cacheParams, finalPath, {
        title: videoInfo.title,
        effectiveHeight: plan.effectiveHeight,
      });
    }

    historyStore.addImport({
      videoId: videoInfo.id,
      title: videoInfo.title,
      channel: videoInfo.channel,
      thumbnail: videoInfo.thumbnail,
      webpageUrl: videoInfo.webpageUrl,
      startSeconds,
      endSeconds,
      mediaType,
      quality,
      filePath: finalPath,
    });

    onProgress({ stage: 'done', filePath: finalPath });

    return {
      filePath: finalPath,
      mediaType,
      downgraded: plan.downgraded,
      effectiveHeight: plan.effectiveHeight,
      title: videoInfo.title,
    };
  } catch (err) {
    cleanupDir(tempRoot);
    throw err instanceof ImporterError ? err : fromRaw(String(err && err.message ? err.message : err));
  }
}

function findDownloadedFile(dir) {
  try {
    const entries = fs.readdirSync(dir).filter((f) => !f.endsWith('.part') && !f.startsWith('.'));
    if (!entries.length) return null;
    return path.join(dir, entries[0]);
  } catch (_) {
    return null;
  }
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {
    // best effort
  }
}

module.exports = { startJob, cancelJob, checkCache, activeJobs };
