'use strict';

const fs = require('fs');
const path = require('path');

const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
const RESERVED_WIN_NAMES = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i;

/** Removes characters that are illegal on macOS/Windows file systems. */
function sanitizeFilename(name, maxLength) {
  let clean = String(name || 'video')
    .replace(INVALID_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  if (!clean) clean = 'video';
  if (RESERVED_WIN_NAMES.test(clean)) clean = `_${clean}`;

  const limit = maxLength || 150;
  if (clean.length > limit) clean = clean.slice(0, limit).trim();

  return clean;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Formats a whole-second offset as "00m30s" / "01m45s", matching the spec's naming example. */
function formatMinSec(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${pad2(m)}m${pad2(rem)}s`;
}

/**
 * Builds the canonical import filename:
 * "[YouTube] Nome do Video [00m30s-01m45s].ext"
 */
function buildClipFilename(title, startSeconds, endSeconds, ext) {
  const safeTitle = sanitizeFilename(title, 120);
  const range = `${formatMinSec(startSeconds)}-${formatMinSec(endSeconds)}`;
  return `[YouTube] ${safeTitle} [${range}].${ext}`;
}

/** Returns a path guaranteed not to overwrite an existing file, appending " (1)", " (2)", ... */
function uniquePath(dir, filename) {
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  let candidate = path.join(dir, filename);
  let n = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${n})${ext}`);
    n += 1;
  }
  return candidate;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Best-effort free-space check. Returns bytes free, or null when it can't be
 * determined on this platform/Node version (never throws).
 */
function freeSpaceBytes(targetDir) {
  try {
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(targetDir);
      return stats.bavail * stats.bsize;
    }
  } catch (_) {
    // fall through to null
  }
  return null;
}

function removeQuiet(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {
    // best effort cleanup, never throw during teardown
  }
}

module.exports = {
  sanitizeFilename,
  formatMinSec,
  buildClipFilename,
  uniquePath,
  ensureDir,
  freeSpaceBytes,
  removeQuiet,
};
