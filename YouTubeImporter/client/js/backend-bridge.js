/*
 * Bridge between the panel UI and the Node.js backend under /backend.
 * This file itself runs with Node integration (see CSXS/manifest.xml's
 * --enable-nodejs/--mixed-context flags), so plain require() works here
 * exactly like in a normal Node script.
 *
 * The extension root is resolved via the CEP native API
 * (CSInterface.getSystemPath('extension')) rather than __dirname: it is the
 * one path source guaranteed to be correct regardless of exactly how a given
 * CEP/Chromium build wires up Node's module system for a plain <script src>
 * tag. If require() still fails for some reason (Node integration disabled,
 * missing manifest flags, etc.), we surface a clear, visible error instead
 * of letting the whole script die silently — a silently-undefined
 * BackendBridge is what makes buttons look like they "do nothing".
 */
(function (global) {
  'use strict';

  function resolveBackendDir(pathMod) {
    try {
      var extensionRoot = global.__csInterface
        ? global.__csInterface.getSystemPath(SystemPath.EXTENSION)
        : null;
      if (extensionRoot) return pathMod.join(extensionRoot, 'backend');
    } catch (e) {
      // fall through to the __dirname-based guess below
    }
    return pathMod.join(__dirname, '..', '..', 'backend');
  }

  function showFatalBridgeError(err) {
    console.error('[YouTube Importer] Falha ao carregar o backend Node.js:', err);
    document.addEventListener('DOMContentLoaded', function () {
      var status = document.getElementById('url-status');
      if (status) {
        status.textContent =
          'Erro interno ao iniciar a extensão (backend Node.js não carregou). Abra o console de depuração (veja README > Solução de problemas) e reporte a mensagem exibida lá.';
        status.style.color = 'var(--error)';
      }
    });
  }

  /** Fallback object so every UI call fails loudly (via rejected promises) instead of "TypeError: BackendBridge is undefined". */
  function makeStubBridge(err) {
    function reject() {
      return Promise.reject(new Error('A extensão não conseguiu carregar seu backend Node.js: ' + err.message));
    }
    return {
      isValidYoutubeUrl: function () { return false; },
      getVideoInfo: reject,
      checkCache: function () { return null; },
      startImportJob: function () { return { jobId: null, promise: reject(), cancel: function () {} }; },
      cancelJob: function () {},
      getConfig: function () { return {}; },
      saveConfig: function () {},
      checkBinaries: function () { return { ytdlp: null, ffmpeg: null }; },
      listHistory: function () { return []; },
      listFavorites: function () { return []; },
      toggleFavorite: function () {},
      clearHistory: function () {},
      platform: '',
      revealInFileBrowser: function () {},
    };
  }

  var path, os, ytdlp, downloadManager, binaries, configStore, cacheStore, historyStore;
  try {
    path = require('path');
    os = require('os');

    var backendDir = resolveBackendDir(path);
    ytdlp = require(path.join(backendDir, 'ytdlp'));
    downloadManager = require(path.join(backendDir, 'downloadManager'));
    binaries = require(path.join(backendDir, 'binaries'));
    configStore = require(path.join(backendDir, 'config'));
    cacheStore = require(path.join(backendDir, 'cache'));
    historyStore = require(path.join(backendDir, 'history'));
  } catch (err) {
    showFatalBridgeError(err);
    global.BackendBridge = makeStubBridge(err);
    return;
  }

  function currentConfig() {
    return configStore.load();
  }

  global.BackendBridge = {
    // --- video metadata -----------------------------------------------
    isValidYoutubeUrl: ytdlp.isValidYoutubeUrl,

    getVideoInfo: function (url) {
      var config = currentConfig();
      var resolved = binaries.locateAll(config);
      if (!resolved.ytdlp) {
        return Promise.reject(Object.assign(new Error('O yt-dlp não foi encontrado neste computador. Instale-o e configure o caminho em ⚙ Configurações.'), { code: 'YTDLP_MISSING' }));
      }
      return ytdlp.getVideoInfo(resolved.ytdlp, url);
    },

    // --- import pipeline -------------------------------------------------
    checkCache: function (params) {
      return downloadManager.checkCache(params);
    },

    startImportJob: function (params, onProgress) {
      var config = currentConfig();
      var fullParams = Object.assign({}, params, {
        downloadDir: params.downloadDir || config.downloadDir,
        config: config,
      });
      return downloadManager.startJob(fullParams, onProgress);
    },

    cancelJob: function (jobId) {
      return downloadManager.cancelJob(jobId);
    },

    // --- settings ---------------------------------------------------------
    getConfig: function () {
      return currentConfig();
    },
    saveConfig: function (partial) {
      return configStore.update(partial);
    },
    defaultDownloadDir: configStore.defaultDownloadDir,
    checkBinaries: function () {
      var config = currentConfig();
      return binaries.locateAll(config);
    },

    // --- history / favorites ----------------------------------------------
    listHistory: historyStore.listImports,
    listFavorites: historyStore.listFavorites,
    toggleFavorite: historyStore.toggleFavorite,
    clearHistory: historyStore.clearHistory,

    // --- misc ---------------------------------------------------------
    platform: os.platform(),
    revealInFileBrowser: function (filePath) {
      var cp = require('child_process');
      try {
        if (os.platform() === 'darwin') cp.spawn('open', ['-R', filePath]);
        else if (os.platform() === 'win32') cp.spawn('explorer.exe', ['/select,', filePath]);
        else cp.spawn('xdg-open', [path.dirname(filePath)]);
      } catch (e) {
        // best effort — not critical to the import flow
      }
    },
  };
})(window);
