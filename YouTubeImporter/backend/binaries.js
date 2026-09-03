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

/**
 * Bounded depth-first search for `targetNameLower` under `dir`. WinGet
 * "portable/zip" packages (ffmpeg's Gyan.FFmpeg build included) don't always
 * get a PATH shim in WinGet\Links — the real exe can sit several
 * version-numbered subfolders deep, e.g.
 * WinGet\Packages\Gyan.FFmpeg_.../ffmpeg-9.0.1-full_build\bin\ffmpeg.exe.
 * Depth is capped so a huge/broken folder tree can't hang startup.
 */
function searchForFile(dir, targetNameLower, depthRemaining) {
  if (depthRemaining < 0) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return null;
  }

  // Dirent.isDirectory()/isFile() report the entry's own type and do NOT
  // follow symlinks/junctions — WinGet packages can store their extracted
  // content behind exactly that (observed: ffmpeg's install has a symlinked
  // version subfolder, which made isDirectory() report false and silently
  // skip the whole subtree containing ffmpeg.exe). fs.statSync follows
  // links, so use that instead; entries statSync can't resolve (broken
  // links, permissions) are just skipped.
  for (const entry of entries) {
    if (entry.name.toLowerCase() !== targetNameLower) continue;
    try {
      if (fs.statSync(path.join(dir, entry.name)).isFile()) return path.join(dir, entry.name);
    } catch (_) {
      // unresolvable entry — keep looking
    }
  }
  for (const entry of entries) {
    let isDir;
    try {
      isDir = fs.statSync(path.join(dir, entry.name)).isDirectory();
    } catch (_) {
      continue;
    }
    if (isDir) {
      const found = searchForFile(path.join(dir, entry.name), targetNameLower, depthRemaining - 1);
      if (found) return found;
    }
  }
  return null;
}

/** Searches WinGet's per-package install folders for `<binName>.exe` when
 *  it isn't reachable via the WinGet\Links PATH shim (see searchForFile). */
function findInWinGetPackages(binName) {
  const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  let entries;
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch (_) {
    return null;
  }
  const nameLower = binName.toLowerCase();
  const targetNameLower = `${binName}.exe`.toLowerCase();
  const packageDirs = entries
    .filter((e) => e.name.toLowerCase().includes(nameLower))
    .map((e) => path.join(base, e.name))
    .filter((fullPath) => {
      // Same fix as searchForFile: WinGet's package folders themselves can be
      // symlinks/junctions, which Dirent.isDirectory() (unlike statSync)
      // doesn't see through — that alone was enough to make this whole
      // function return null before even reaching the recursive search.
      try {
        return fs.statSync(fullPath).isDirectory();
      } catch (_) {
        return false;
      }
    });

  for (const dir of packageDirs) {
    const found = searchForFile(dir, targetNameLower, 4);
    if (found) return found;
  }
  return null;
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
    const candidates = [
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', `${binName}.exe`),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', binName, `${binName}.exe`),
      `C:\\${binName}\\${binName}.exe`,
      path.join(home, 'scoop', 'shims', `${binName}.exe`),
    ];
    const wingetPackageHit = findInWinGetPackages(binName);
    if (wingetPackageHit) candidates.push(wingetPackageHit);
    return candidates;
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

/**
 * ffmpeg uses its own single-dash CLI convention (-version), not the
 * double-dash GNU style yt-dlp follows (--version) — confirmed by a real
 * install where a valid, working ffmpeg.exe was rejected here because
 * `--version` isn't a flag it recognizes. Try both rather than hardcode one.
 */
function verifyExecutable(candidatePath) {
  if (!candidatePath) return false;
  if (!fs.existsSync(candidatePath)) return false;
  for (const versionArg of ['--version', '-version']) {
    try {
      const res = spawnSync(candidatePath, [versionArg], { encoding: 'utf8', timeout: 8000 });
      if (res.status === 0) return true;
    } catch (_) {
      // try the next flag
    }
  }
  return false;
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

/** yt-dlp's own self-update flag. Works for the standalone binary (winget's
 *  package on Windows, manual/direct-download installs everywhere), but
 *  yt-dlp deliberately refuses to self-update a Homebrew install and tells
 *  the caller to use `brew upgrade` instead — that refusal (non-zero exit,
 *  message mentioning brew/pip) is what triggers the package-manager
 *  fallback below. */
function selfUpdateYtdlp(ytdlpPath) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(ytdlpPath, ['-U'], { windowsHide: true, timeout: 60000 });
    } catch (e) {
      resolve({ ok: false, blocked: false, message: e.message });
      return;
    }
    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });
    child.on('error', (err) => resolve({ ok: false, blocked: false, message: err.message }));
    child.on('close', (code) => {
      const trimmed = output.trim();
      const blocked = /brew upgrade|pip install|not been built with|self-update/i.test(trimmed);
      resolve({ ok: code === 0 && !blocked, blocked, message: trimmed || `yt-dlp -U saiu com código ${code}` });
    });
  });
}

/** Fallback for installs yt-dlp itself won't self-update (Homebrew) or
 *  when -U fails outright: ask the platform's package manager instead. */
function updateViaPackageManager() {
  return new Promise((resolve) => {
    let cmd;
    let args;
    if (process.platform === 'darwin') {
      cmd = 'brew';
      args = ['upgrade', 'yt-dlp'];
    } else if (process.platform === 'win32') {
      cmd = 'winget';
      args = ['upgrade', '--id', 'yt-dlp.yt-dlp', '-e', '--accept-package-agreements', '--accept-source-agreements'];
    } else {
      resolve({ ok: false, message: 'Atualização automática não suportada nesta plataforma. Atualize o yt-dlp manualmente.' });
      return;
    }

    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true, timeout: 120000 });
    } catch (e) {
      resolve({ ok: false, message: `${cmd} não encontrado (${e.message}).` });
      return;
    }
    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });
    child.on('error', (err) => resolve({ ok: false, message: `${cmd} não encontrado (${err.message}).` }));
    child.on('close', (code) => {
      const lastLines = output.trim().split('\n').slice(-2).join(' ').trim();
      resolve({ ok: code === 0, message: lastLines || `${cmd} saiu com código ${code}` });
    });
  });
}

/** Tries yt-dlp's own self-update first, falls back to winget/brew if that's blocked or fails. */
async function updateYtdlp(config) {
  const ytdlpPath = resolveBinary('yt-dlp', config && config.ytdlpPath);
  if (!ytdlpPath) {
    return { ok: false, message: 'yt-dlp não foi encontrado — nada para atualizar.' };
  }

  const selfResult = await selfUpdateYtdlp(ytdlpPath);
  if (selfResult.ok) return selfResult;

  return updateViaPackageManager();
}

module.exports = { resolveBinary, requireBinary, locateAll, verifyExecutable, updateYtdlp };
