/* Bridge between the panel UI and host/index.jsx (ExtendScript running inside Premiere). */
(function (global) {
  'use strict';

  var csInterface = new CSInterface();

  function escapeForScript(jsonString) {
    return jsonString.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /**
   * Calls a YTI_* function defined in host/index.jsx. `argsObj`, when given,
   * is JSON-encoded and passed as a single string argument (the JSX side
   * parses it back with JSON.parse). Resolves with the function's `data`
   * payload, or rejects with an Error carrying { code, message }.
   */
  function callHost(funcName, argsObj) {
    return new Promise(function (resolve, reject) {
      var script;
      if (argsObj === undefined) {
        script = funcName + '()';
      } else {
        var argsJson = escapeForScript(JSON.stringify(argsObj));
        script = funcName + '("' + argsJson + '")';
      }

      csInterface.evalScript(script, function (result) {
        if (result === undefined || result === null || result === 'EvalScript error.') {
          var err = new Error('Não foi possível comunicar com o Premiere Pro.');
          err.code = 'BRIDGE_UNAVAILABLE';
          reject(err);
          return;
        }
        var parsed;
        try {
          parsed = JSON.parse(result);
        } catch (e) {
          var parseErr = new Error('Resposta inesperada do Premiere Pro.');
          parseErr.code = 'BRIDGE_UNAVAILABLE';
          reject(parseErr);
          return;
        }
        if (parsed.ok) {
          resolve(parsed.data);
        } else {
          var hostErr = new Error(parsed.message || 'Erro ao comunicar com o Premiere.');
          hostErr.code = parsed.code || 'UNKNOWN';
          reject(hostErr);
        }
      });
    });
  }

  global.HostBridge = {
    hasOpenProject: function () {
      return callHost('YTI_hasOpenProject');
    },
    importToProject: function (filePath, binName) {
      return callHost('YTI_importToProject', { filePath: filePath, binName: binName });
    },
    getActiveSequenceInfo: function () {
      return callHost('YTI_getActiveSequenceInfo');
    },
    insertClipAtPlayhead: function (filePath, mediaType, binName) {
      return callHost('YTI_insertClipAtPlayhead', { filePath: filePath, mediaType: mediaType, binName: binName });
    },
  };

  global.__csInterface = csInterface;
})(window);
