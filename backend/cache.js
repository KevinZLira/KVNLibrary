'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { appDataDir } = require('./config');

const INDEX_FILE = path.join(appDataDir(), 'cache-index.json');

function loadIndex() {
  try {
    if (fs.existsSync(INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    }
  } catch (_) {
    // corrupted index: start clean rather than fail the whole app
  }
  return {};
}

function saveIndex(index) {
  fs.mkdirSync(appDataDir(), { recursive: true });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
}

/** Deterministic key for a specific (video, trim range, media type, quality) combination. */
function keyFor({ videoId, startSeconds, endSeconds, mediaType, quality }) {
  const raw = `${videoId}|${Math.round(startSeconds)}|${Math.round(endSeconds)}|${mediaType}|${quality}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

/** Returns the cached entry if it exists AND the file is still on disk, else null. */
function lookup(params) {
  const index = loadIndex();
  const entry = index[keyFor(params)];
  if (entry && fs.existsSync(entry.filePath)) return entry;
  return null;
}

function remember(params, filePath, extra) {
  const index = loadIndex();
  index[keyFor(params)] = Object.assign(
    { filePath, createdAt: new Date().toISOString() },
    extra || {}
  );
  saveIndex(index);
}

function forget(params) {
  const index = loadIndex();
  delete index[keyFor(params)];
  saveIndex(index);
}

module.exports = { keyFor, lookup, remember, forget };
