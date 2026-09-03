'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Cross-platform per-user app data directory for this extension's own files. */
function appDataDir() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'YouTubeImporter');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'YouTubeImporter');
  }
  return path.join(home, '.config', 'YouTubeImporter');
}

function defaultDownloadDir() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Movies', 'Premiere YouTube Imports');
  }
  if (process.platform === 'win32') {
    return path.join(home, 'Videos', 'Premiere YouTube Imports');
  }
  return path.join(home, 'Videos', 'Premiere YouTube Imports');
}

const CONFIG_FILE = path.join(appDataDir(), 'config.json');

const DEFAULTS = {
  downloadDir: defaultDownloadDir(),
  binName: 'YouTube Imports',
  defaultQuality: 'best', // best | 1080p | 720p | 480p | audio-best
  defaultMediaType: 'video-audio', // video-audio | video-only | audio-only
  ytdlpPath: '', // empty = auto-detect on PATH
  ffmpegPath: '', // empty = auto-detect on PATH
  autoCleanupTemp: true,
  cacheEnabled: true,
  // Free-form extra CLI flags appended to every yt-dlp invocation. Lets the
  // app absorb whatever workaround YouTube's ever-changing restrictions
  // require next (e.g. a PO-token-provider --extractor-args string) without
  // needing a code update — see README > Solução de problemas.
  extraYtdlpArgs: '',
};

function load() {
  try {
    fs.mkdirSync(appDataDir(), { recursive: true });
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      const saved = JSON.parse(raw);
      return Object.assign({}, DEFAULTS, saved);
    }
  } catch (_) {
    // fall through to defaults on any read/parse error
  }
  return Object.assign({}, DEFAULTS);
}

function save(config) {
  fs.mkdirSync(appDataDir(), { recursive: true });
  const merged = Object.assign({}, DEFAULTS, config);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function update(partial) {
  const current = load();
  return save(Object.assign({}, current, partial));
}

module.exports = { appDataDir, defaultDownloadDir, load, save, update, CONFIG_FILE, DEFAULTS };
