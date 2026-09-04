'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { fromRaw, ImporterError } = require('./errors');

function probeFilePath(ffmpegPath, binName) {
  return path.join(path.dirname(ffmpegPath), process.platform === 'win32' ? `${binName}.exe` : binName);
}

// Tracks the ffmpeg child currently running so cancelCurrent() can kill it
// without every caller threading a child handle through async/await chains.
let currentChild = null;

function cancelCurrent() {
  if (currentChild && !currentChild.killed) {
    currentChild.kill('SIGTERM');
    return true;
  }
  return false;
}

function run(ffmpegPath, args, onProgress) {
  return new Promise((resolve, reject) => {
    const fullArgs = ['-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', ...args];
    const child = spawn(ffmpegPath, fullArgs, { windowsHide: true });
    currentChild = child;

    let stderr = '';
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      const kv = {};
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key && value !== undefined) kv[key.trim()] = value.trim();
        if (key && key.trim() === 'progress' && onProgress) {
          onProgress({ stage: 'processing', outTimeMs: kv.out_time_ms ? Number(kv.out_time_ms) : null, speed: kv.speed || null });
        }
      }
    });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (err) => {
      if (currentChild === child) currentChild = null;
      reject(fromRaw(err.message, 'FFMPEG_MISSING'));
    });
    child.on('close', (code) => {
      if (currentChild === child) currentChild = null;
      if (code === 0) resolve();
      else if (child.killed) reject(new ImporterError('CANCELLED', 'Processamento cancelado pelo usuário.', stderr));
      else reject(fromRaw(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

/**
 * Ensures the given media file is in a container/codec combination Premiere
 * Pro opens reliably. Tries a fast stream-copy remux to .mp4 first; if that
 * fails (e.g. VP9/Opus payload that Premiere can't decode on this system),
 * falls back to a full H.264/AAC transcode.
 */
async function ensurePremiereCompatibleVideo(ffmpegPath, inputPath, outputPath, hasAudio, onProgress) {
  try {
    const copyArgs = ['-i', inputPath, '-c', 'copy'];
    if (!hasAudio) copyArgs.push('-an');
    copyArgs.push(outputPath);
    await run(ffmpegPath, copyArgs, onProgress);
    return { transcoded: false };
  } catch (copyErr) {
    if (copyErr.code === 'CANCELLED') throw copyErr;
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    const transcodeArgs = ['-i', inputPath, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p'];
    if (hasAudio) transcodeArgs.push('-c:a', 'aac', '-b:a', '192k');
    else transcodeArgs.push('-an');
    transcodeArgs.push(outputPath);
    await run(ffmpegPath, transcodeArgs, onProgress);
    return { transcoded: true };
  }
}

/** Extracts (or transcodes) the audio track to a WAV PCM file, universally readable by Premiere. */
async function extractAudioToWav(ffmpegPath, inputPath, outputPath, onProgress) {
  const args = ['-i', inputPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '48000', '-ac', '2', outputPath];
  await run(ffmpegPath, args, onProgress);
}

/**
 * Trims [startSeconds,endSeconds] out of a full-length download and makes
 * sure the result is Premiere-safe. Tries a fast stream-copy trim first
 * (near-instant — no re-encoding) since the source is almost always already
 * H.264/AAC mp4 (resolveFormatPlan prefers avc1). Only falls back to a full
 * libx264/AAC transcode if the copy fails (e.g. a codec Premiere can't
 * decode). Used when the server-side section download failed or was skipped
 * (see ytdlp.js's `useSections`) and we fell back to a full download that
 * still needs cutting locally.
 */
async function trimToCompatibleVideo(ffmpegPath, inputPath, outputPath, startSeconds, endSeconds, hasAudio, onProgress) {
  const duration = Math.max(0.1, endSeconds - startSeconds);
  try {
    const copyArgs = ['-ss', String(startSeconds), '-i', inputPath, '-t', String(duration), '-c', 'copy'];
    if (!hasAudio) copyArgs.push('-an');
    copyArgs.push(outputPath);
    await run(ffmpegPath, copyArgs, onProgress);
    return { transcoded: false };
  } catch (copyErr) {
    if (copyErr.code === 'CANCELLED') throw copyErr;
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    const transcodeArgs = ['-ss', String(startSeconds), '-i', inputPath, '-t', String(duration), '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p'];
    if (hasAudio) transcodeArgs.push('-c:a', 'aac', '-b:a', '192k');
    else transcodeArgs.push('-an');
    transcodeArgs.push(outputPath);
    await run(ffmpegPath, transcodeArgs, onProgress);
    return { transcoded: true };
  }
}

/** Same idea as trimToCompatibleVideo but for the audio-only pipeline (WAV output). */
async function trimToWav(ffmpegPath, inputPath, outputPath, startSeconds, endSeconds, onProgress) {
  const duration = Math.max(0.1, endSeconds - startSeconds);
  const args = ['-ss', String(startSeconds), '-i', inputPath, '-t', String(duration), '-vn', '-acodec', 'pcm_s16le', '-ar', '48000', '-ac', '2', outputPath];
  await run(ffmpegPath, args, onProgress);
}

module.exports = {
  run,
  ensurePremiereCompatibleVideo,
  extractAudioToWav,
  trimToCompatibleVideo,
  trimToWav,
  probeFilePath,
  cancelCurrent,
};
