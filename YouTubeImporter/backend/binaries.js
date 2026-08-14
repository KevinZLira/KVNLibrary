'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ImporterError } = require('./errors');

/** Extra locations to probe besides PATH, per binary/platform. Homebrew and
 *  common Windows package-manager install dirs aren't always on the PATH that
 *  a GUI app (Premiere) inherits, so we check them explicitly. */
function extraCandidates(binName) {
  const home = require('os').homedir();
  if (process.platform === 'darwin') {
    return [
      `/opt/homebrew/bin/${binName}`,
      `/usr/local/bin/${binName}`,
      `/usr/bin/${binName}`,
      path.join(home, '.local', 'bin', binName),
    ];
  }
  if (process.platform === 'win32') {
    return [
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', `${binName}.exe`),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', binName, `${binName}.exe`),
      `C:\\${binName}\\${binName}.exe`,
      path.join(home, 'scoop', 'shims', `${binName}.exe`),
    ];
  }
  return [`/usr/local/bin/${binName}`, `/usr/bin/${binName}`];
}

function whichOnPath(binName) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const exeName = process.platform === 'win32' && !binName.endsWith('.exe') ? `${binName}.exe` : binName;
  try {
    const res = spawnSync(cmd, [exeName], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout) {
      const first = res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      if (first) return first;
    }
  } catch (_) {
    // ignore, fall through to candidate probing
  }
  return null;
}

function verifyExecutable(candidatePath) {
  if (!candidatePath) return false;
  try {
    if (!fs.existsSync(candidatePath)) return false;
    const res = spawnSync(candidatePath, ['--version'], { encoding: 'utf8', timeout: 8000 });
    return res.status === 0;
  } catch (_) {
    return false;
  }
}

/**
 * Resolves the absolute path to `binName` ("yt-dlp" or "ffmpeg"), trying,
 * in order: an explicit override (from settings), the PATH, then a list of
 * well-known install locations. Returns null if nothing usable was found.
 */
function resolveBinary(binName, overridePath) {
  if (overridePath && verifyExecutable(overridePath)) return overridePath;

  const onPath = whichOnPath(binName);
  if (onPath && verifyExecutable(onPath)) return onPath;

  for (const candidate of extraCandidates(binName)) {
    if (verifyExecutable(candidate)) return candidate;
  }

  return null;
}

function requireBinary(binName, overridePath, missingErrorCode) {
  const found = resolveBinary(binName, overridePath);
  if (!found) {
    const { friendlyMessage } = require('./errors');
    throw new ImporterError(missingErrorCode, friendlyMessage(missingErrorCode), `${binName} not found`);
  }
  return found;
}

function locateAll(config) {
  return {
    ytdlp: resolveBinary('yt-dlp', config && config.ytdlpPath),
    ffmpeg: resolveBinary('ffmpeg', config && config.ffmpegPath),
  };
}

module.exports = { resolveBinary, requireBinary, locateAll, verifyExecutable };
