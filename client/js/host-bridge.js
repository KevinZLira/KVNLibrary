/*
 * Bridge between the panel UI and host/index.jsx (ExtendScript running
 * inside Premiere). Talks the simple "OK|<detail>" / "ERR|<message>"
 * pipe-delimited protocol that index.jsx returns — no JSON round trip
 * (ExtendScript's JSON support is not guaranteed, and a previous version's
 * hand-rolled JSON.parse-via-eval() polyfill was an unnecessary source of
 * fragility). This mirrors a pattern already verified working in a real
 * Premiere install.
 */
(function (global) {
  'use strict';

  var csInterface = new CSInterface();
  var jsxLoaded = false;

  function escapeForScript(text) {
    return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function jsxStringArg(value) {
    return '"' + escapeForScript(value) + '"';
  }

  /**
   * <ScriptPath> in the manifest should auto-load host/index.jsx when the
   * panel opens, but that auto-load can silently miss (panel reloaded
   * without a full Premiere restart, some CEP builds). Before every call we
   * check whether the entry point actually exists and, if not, load it
   * ourselves with $.evalFile — cheap once jsxLoaded flips true.
   */
  function ensureJsxLoaded(cb) {
    if (jsxLoaded) { cb(); return; }
    csInterface.evalScript('typeof YTI_importAndInsert', function (res) {
      if (res === 'function') {
        jsxLoaded = true;
        cb();
        return;
      }
      var extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
      var jsxPath = (extensionRoot + '/host/index.jsx').replace(/\\/g, '/');
      csInterface.evalScript('$.evalFile(' + jsxStringArg(jsxPath) + ')', function () {
        jsxLoaded = true;
        cb();
      });
    });
  }

  /** Calls a YTI_* function, expecting either a plain string or an "OK|.../ERR|..." result. */
  function callHost(script) {
    return new Promise(function (resolve, reject) {
      ensureJsxLoaded(function () {
        csInterface.evalScript(script, function (result) {
          if (result === undefined || result === null || result === 'EvalScript error.') {
            var bridgeErr = new Error('Não foi possível comunicar com o Premiere Pro.');
            bridgeErr.code = 'BRIDGE_UNAVAILABLE';
            reject(bridgeErr);
            return;
          }
          resolve(String(result));
        });
      });
    });
  }

  function callHostOkErr(script) {
    return callHost(script).then(function (raw) {
      var sep = raw.indexOf('|');
      var status = sep === -1 ? raw : raw.substring(0, sep);
      var detail = sep === -1 ? '' : raw.substring(sep + 1);
      if (status !== 'OK') {
        var err = new Error(detail || 'Erro desconhecido ao comunicar com o Premiere.');
        err.code = status === 'ERR' ? 'HOST_ERROR' : 'UNKNOWN';
        throw err;
      }
      return detail;
    });
  }

  global.HostBridge = {
    hasOpenProject: function () {
      return callHost('YTI_hasOpenProject()').then(function (raw) {
        return { hasProject: raw === 'yes' };
      });
    },

    /** Imports the file into the project bin only (no timeline insert). */
    importToProject: function (filePath, binName) {
      var script = 'YTI_importAndInsert(' + jsxStringArg(filePath) + ',"bin",' + jsxStringArg(binName) + ',"0")';
      return callHostOkErr(script);
    },

    /**
     * Imports (if needed) and inserts the clip at the current playhead
     * position on the active sequence. Resolves with 'playhead' on success,
     * or 'bin-noseq' if the file was imported but there is no open sequence
     * to insert into (the caller should tell the user to open/create one).
     */
    insertClipAtPlayhead: function (filePath, mediaType, binName) {
      var audioFlag = mediaType === 'audio-only' ? '1' : '0';
      var script = 'YTI_importAndInsert(' + jsxStringArg(filePath) + ',"playhead",' + jsxStringArg(binName) + ',' + jsxStringArg(audioFlag) + ')';
      return callHostOkErr(script);
    },
  };

  global.__csInterface = csInterface;
})(window);
