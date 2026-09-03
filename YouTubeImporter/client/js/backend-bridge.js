/*
 * Bridge between the panel UI and the Node.js backend under /backend.
 *
 * CEP's Node.js integration (--enable-nodejs/--mixed-context in
 * CSXS/manifest.xml) does NOT put a bare `require`/`__dirname` in scope for
 * a plain <script src> tag. The real, confirmed-working entry point is
 * `window.cep_node.require` (falling back to `window.require` on older CEP
 * builds) — this pattern is verified against a known-working Premiere Pro
 * CEP extension. Using a bare `require(...)` here throws a ReferenceError
 * before anything else runs, which is what made every button look like it
 * "did nothing": BackendBridge never got defined and nothing said why.
 */
(function (global) {
  'use strict';

  var nodeRequire =
    (typeof global.cep_node !== 'undefined' && global.cep_node.require)
      ? global.cep_node.require
      : (typeof global.require === 'function' ? global.require : null);

  function showFatalBridgeError(detail) {
    console.error('[YouTube Importer] Falha ao carregar o backend Node.js:', detail);
    document.addEventListener('DOMContentLoaded', function () {
      var status = document.getElementById('url-status');
      if (status) {
        status.textContent =
          'Erro interno ao iniciar a extensão (backend Node.js não carregou: ' + detail + '). Veja README > Solução de problemas.';
        status.style.color = 'var(--error)';
      }
    });
  }

  /** Fallback object so every UI call fails loudly (via rejected promises) instead of "TypeError: BackendBridge is undefined". */
  function makeStubBridge(detail) {
    function reject() {
      return Promise.reject(new Error('A extensão não conseguiu carregar seu backend Node.js: ' + detail));
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

  if (!nodeRequire) {
    showFatalBridgeError('window.cep_node.require e window.require estão indisponíveis — o Node.js não foi habilitado para este painel.');
    global.BackendBridge = makeStubBridge('Node.js não habilitado.');
    return;
  }

  var path, os, ytdlp, downloadManager, binaries, configStore, cacheStore, historyStore;
  try {
    path = nodeRequire('path');
    os = nodeRequire('os');

    var extensionRoot = global.__csInterface ? global.__csInterface.getSystemPath(SystemPath.EXTENSION) : null;
    if (!extensionRoot) throw new Error('CSInterface.getSystemPath(EXTENSION) não retornou um caminho.');
    var backendDir = path.join(extensionRoot, 'backend');

    ytdlp = nodeRequire(path.join(backendDir, 'ytdlp'));
    downloadManager = nodeRequire(path.join(backendDir, 'downloadManager'));
    binaries = nodeRequire(path.join(backendDir, 'binaries'));
    configStore = nodeRequire(path.join(backendDir, 'config'));
    cacheStore = nodeRequire(path.join(backendDir, 'cache'));
    historyStore = nodeRequire(path.join(backendDir, 'history'));
  } catch (err) {
    showFatalBridgeError(err.message);
    global.BackendBridge = makeStubBridge(err.message);
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
      return ytdlp.getVideoInfo(resolved.ytdlp, url, config.extraYtdlpArgs, config.cookiesPath);
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
    updateYtdlp: function () {
      var config = currentConfig();
      return binaries.updateYtdlp(config);
    },

    // --- history / favorites ----------------------------------------------
    listHistory: historyStore.listImports,
    listFavorites: historyStore.listFavorites,
    toggleFavorite: historyStore.toggleFavorite,
    clearHistory: historyStore.clearHistory,

    // --- misc ---------------------------------------------------------
    platform: os.platform(),
    revealInFileBrowser: function (filePath) {
      try {
        var cp = nodeRequire('child_process');
        if (os.platform() === 'darwin') cp.spawn('open', ['-R', filePath]);
        else if (os.platform() === 'win32') cp.spawn('explorer.exe', ['/select,', filePath]);
        else cp.spawn('xdg-open', [path.dirname(filePath)]);
      } catch (e) {
        // best effort — not critical to the import flow
      }
    },
  };
})(window);
