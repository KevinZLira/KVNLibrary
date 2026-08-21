'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ImporterError } = require('./errors');

/**
 * GUI apps on macOS (Premiere included) do NOT inherit the shell's PATH —
 * no /opt/homebrew/bin, no /usr/local/bin — so a bare-name spawn misses
 * Homebrew installs even though `which yt-dlp` works fine in Terminal.
 * We ask the user's actual login shell for its PATH once per process and
 * fold any new directories into the candidate list below. Synchronous and
 * best-effort: any failure just leaves the extra list empty.
 */
let shellPathDirs = null;
function loadShellPathDirsOnce() {
  if (shellPathDirs !== null) return shellPathDirs;
  shellPathDirs = [];
  if (process.platform !== 'win32') {
    try {
      const shell = process.env.SHELL || '/bin/zsh';
      const res = spawnSync(shell, ['-lc', 'echo -n "$PATH"'], { encoding: 'utf8', timeout: 8000 });
      if (res.status === 0 && res.stdout) {
        shellPathDirs = res.stdout.trim().split(':').filter((d) => d.startsWith('/'));
      }
    } catch (_) {
      // best effort — keep the empty list
    }
  }
  return shellPathDirs;
}

/** Extra locations to probe besides PATH, per binary/platform. Homebrew and
 *  common Windows package-manager install dirs aren't always on the PATH that
 *  a GUI app (Premiere) inherits, so we check them explicitly. */
function extraCandidates(binName) {
  const home = require('os').homedir();
  if (process.platform === 'darwin') {
    const dirs = [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/opt/local/bin',
      '/usr/bin',
      path.join(home, '.local', 'bin'),
      path.join(home, 'bin'),
      ...loadShellPathDirsOnce(),
    ];
    return [...new Set(dirs)].map((dir) => path.join(dir, binName));
  }
  if (process.platform === 'win32') {
    return [
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', `${binName}.exe`),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', binName, `${binName}.exe`),
      `C:\\${binName}\\${binName}.exe`,
      path.join(home, 'scoop', 'shims', `${binName}.exe`),
    ];
  }
  return [...new Set(['/usr/local/bin', '/usr/bin', ...loadShellPathDirsOnce()])].map((dir) => path.join(dir, binName));
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
