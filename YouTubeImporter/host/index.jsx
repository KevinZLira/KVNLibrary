// ExtendScript (JSX) host bridge for the YouTube Importer panel.
// Runs inside Premiere Pro's scripting engine — this is the only layer that
// may touch app.project / app.project.activeSequence.
//
// Every entry point returns a JSON string of the shape:
//   { ok: true, data: <...> }  or  { ok: false, code: "...", message: "..." }
// so the panel's JS side always gets something it can JSON.parse().

// --- Minimal JSON polyfill -------------------------------------------------
// Some ExtendScript engine builds still lack a global JSON object.
if (typeof JSON === 'undefined') {
  JSON = {};
}
if (!JSON.stringify) {
  JSON.stringify = function (obj) {
    var t = typeof obj;
    if (t !== 'object' || obj === null) {
      if (t === 'string') return '"' + obj.replace(/[\\"]/g, '\\$&').replace(/\n/g, '\\n') + '"';
      return String(obj);
    }
    var isArray = obj && obj.constructor === Array;
    var pieces = [];
    if (isArray) {
      for (var i = 0; i < obj.length; i++) pieces.push(JSON.stringify(obj[i]));
      return '[' + pieces.join(',') + ']';
    }
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) pieces.push('"' + k + '":' + JSON.stringify(obj[k]));
    }
    return '{' + pieces.join(',') + '}';
  };
}
if (!JSON.parse) {
  JSON.parse = function (text) {
    // eslint-disable-next-line no-eval
    return eval('(' + text + ')');
  };
}

// --- Helpers -----------------------------------------------------------

function YTI_ok(data) {
  return JSON.stringify({ ok: true, data: data });
}

function YTI_err(code, message) {
  return JSON.stringify({ ok: false, code: code, message: message });
}

function YTI_normalizePath(p) {
  return String(p).replace(/\\/g, '/');
}

function YTI_getOrCreateBin(name) {
  var root = app.project.rootItem;
  for (var i = 0; i < root.children.numItems; i++) {
    var item = root.children[i];
    if (item.type === ProjectItemType.BIN && item.name === name) {
      return item;
    }
  }
  return root.createBin(name);
}

function YTI_findItemByPath(container, targetPath) {
  var wanted = YTI_normalizePath(targetPath).toLowerCase();
  for (var i = 0; i < container.children.numItems; i++) {
    var item = container.children[i];
    if (item.type === ProjectItemType.BIN) {
      var found = YTI_findItemByPath(item, targetPath);
      if (found) return found;
    } else {
      try {
        var mediaPath = item.getMediaPath ? item.getMediaPath() : null;
        if (mediaPath && YTI_normalizePath(mediaPath).toLowerCase() === wanted) return item;
      } catch (e) {
        // items without media (e.g. sequences) throw on getMediaPath; skip them
      }
    }
  }
  return null;
}

// --- Public entry points -------------------------------------------------

/**
 * Imports a downloaded clip into the project, inside the given bin
 * (created on demand). Returns the resulting media path so the panel can
 * later locate the ProjectItem again (e.g. to send it to the timeline).
 */
function YTI_importToProject(argsJson) {
  try {
    var args = JSON.parse(argsJson);
    if (!app.project) return YTI_err('NO_PROJECT', 'Nenhum projeto do Premiere está aberto.');

    var bin = YTI_getOrCreateBin(args.binName || 'YouTube Imports');
    var existing = YTI_findItemByPath(bin, args.filePath);
    if (existing) {
      return YTI_ok({ imported: true, alreadyPresent: true, mediaPath: args.filePath, name: existing.name });
    }

    var success = app.project.importFiles([args.filePath], true, bin, false);
    if (!success) {
      return YTI_err('IMPORT_FAILED', 'Não foi possível importar o arquivo para o projeto do Premiere.');
    }

    var imported = YTI_findItemByPath(bin, args.filePath);
    return YTI_ok({
      imported: true,
      alreadyPresent: false,
      mediaPath: args.filePath,
      name: imported ? imported.name : null,
    });
  } catch (e) {
    return YTI_err('IMPORT_FAILED', 'Não foi possível importar o arquivo para o projeto do Premiere: ' + e.toString());
  }
}

/** Reports whether a sequence is currently open, and the playhead position. */
function YTI_getActiveSequenceInfo() {
  try {
    if (!app.project) return YTI_err('NO_PROJECT', 'Nenhum projeto do Premiere está aberto.');
    var seq = app.project.activeSequence;
    if (!seq) {
      return YTI_ok({ hasSequence: false });
    }
    var pos = seq.getPlayerPosition();
    return YTI_ok({
      hasSequence: true,
      sequenceName: seq.name,
      playheadSeconds: pos.seconds,
      playheadTicks: pos.ticks,
    });
  } catch (e) {
    return YTI_err('UNKNOWN', e.toString());
  }
}

/**
 * Inserts the given (already-imported) clip onto the currently active
 * sequence at the current playhead position. Video+audio and video-only
 * clips go on the first video track (Premiere carries the linked audio
 * along automatically); audio-only clips go on the first audio track.
 */
function YTI_insertClipAtPlayhead(argsJson) {
  try {
    var args = JSON.parse(argsJson);
    if (!app.project) return YTI_err('NO_PROJECT', 'Nenhum projeto do Premiere está aberto.');

    var seq = app.project.activeSequence;
    if (!seq) {
      return YTI_err('NO_SEQUENCE', 'Não há nenhuma sequência aberta no Premiere. Abra ou crie uma sequência antes de enviar para a timeline.');
    }

    var bin = YTI_getOrCreateBin(args.binName || 'YouTube Imports');
    var item = YTI_findItemByPath(bin, args.filePath);
    if (!item) {
      return YTI_err('IMPORT_FAILED', 'O clipe precisa estar no projeto antes de ser enviado para a timeline.');
    }

    var ticks = seq.getPlayerPosition().ticks;

    if (args.mediaType === 'audio-only') {
      if (seq.audioTracks.numTracks === 0) {
        return YTI_err('NO_SEQUENCE', 'A sequência ativa não tem nenhuma faixa de áudio.');
      }
      seq.audioTracks[0].insertClip(item, ticks);
    } else {
      if (seq.videoTracks.numTracks === 0) {
        return YTI_err('NO_SEQUENCE', 'A sequência ativa não tem nenhuma faixa de vídeo.');
      }
      seq.videoTracks[0].insertClip(item, ticks);
    }

    return YTI_ok({ inserted: true, sequenceName: seq.name, atTicks: ticks });
  } catch (e) {
    return YTI_err('UNKNOWN', e.toString());
  }
}

/** Used by the panel to confirm a project is open before starting any work. */
function YTI_hasOpenProject() {
  try {
    return YTI_ok({ hasProject: !!app.project });
  } catch (e) {
    return YTI_ok({ hasProject: false });
  }
}
