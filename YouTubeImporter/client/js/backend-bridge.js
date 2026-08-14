/*
 * Bridge between the panel UI and the Node.js backend under /backend.
 * This file itself runs with Node integration (see CSXS/manifest.xml's
 * --enable-nodejs/--mixed-context flags), so plain require() works here
 * exactly like in a normal Node script.
 */
(function (global) {
  'use strict';

  var path = require('path');
  var os = require('os');

  var backendDir = path.join(__dirname, '..', '..', 'backend');
  var ytdlp = require(path.join(backendDir, 'ytdlp'));
  var downloadManager = require(path.join(backendDir, 'downloadManager'));
  var binaries = require(path.join(backendDir, 'binaries'));
  var configStore = require(path.join(backendDir, 'config'));
  var cacheStore = require(path.join(backendDir, 'cache'));
  var historyStore = require(path.join(backendDir, 'history'));

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
