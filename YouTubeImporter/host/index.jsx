/* YouTube Importer — Premiere Pro host script.
 *
 * Runs inside Premiere's ExtendScript engine (ES3: var only, no modern JS,
 * no native JSON guaranteed). Loaded automatically via <ScriptPath> in the
 * manifest; the panel also re-loads it with $.evalFile as a fallback (see
 * client/js/host-bridge.js) in case the manifest auto-load didn't take.
 *
 * Protocol: every entry point returns a plain "OK|<detail>" or
 * "ERR|<message>" string — deliberately not JSON. A previous version used a
 * hand-rolled JSON polyfill (JSON.parse via eval()) here; this simpler
 * pipe-delimited protocol removes that whole class of fragile parsing and
 * matches a pattern already verified working in a real Premiere install.
 *
 * Entry points:
 *   YTI_hasOpenProject()                                -> "yes" | "no"
 *   YTI_importAndInsert(filePath, mode, binName, audioFlag)
 *     mode: "bin" (import only) | "playhead" (import + insert at playhead)
 *     audioFlag: "1" for audio-only clips, "0" otherwise
 *     -> "OK|bin" | "OK|playhead" | "OK|bin-noseq" | "ERR|<message>"
 */

var YTI_TICKS_PER_SECOND = 254016000000; // Premiere's internal ticks-per-second

function YTI_hasOpenProject() {
  try {
    return app.project ? "yes" : "no";
  } catch (e) {
    return "no";
  }
}

function YTI_norm(p) {
  return String(p).replace(/\//g, "\\").toLowerCase();
}

function YTI_findItemByPath(container, target) {
  var i, it, hit;
  for (i = 0; i < container.children.numItems; i++) {
    it = container.children[i];
    if (it.type === ProjectItemType.BIN) {
      hit = YTI_findItemByPath(it, target);
      if (hit) return hit;
    } else {
      try {
        var mp = it.getMediaPath();
        if (mp && YTI_norm(mp) === target) return it;
      } catch (e) {
        // some item types (e.g. sequences) have no media path
      }
    }
  }
  return null;
}

function YTI_getOrCreateBin(name) {
  var root = app.project.rootItem;
  var i, it;
  for (i = 0; i < root.children.numItems; i++) {
    it = root.children[i];
    if (it.type === ProjectItemType.BIN && it.name === name) return it;
  }
  return root.createBin(name);
}

/** Prefers the track the editor has targeted in the timeline header, then
 *  falls back to the first unlocked track — never picks a locked one. */
function YTI_firstUsableTrack(tracks) {
  var i, t;
  for (i = 0; i < tracks.numTracks; i++) {
    t = tracks[i];
    try {
      if (t.isTargeted() && !t.isLocked()) return t;
    } catch (eTarget) {
      break; // isTargeted() unavailable on very old versions — fall through
    }
  }
  for (i = 0; i < tracks.numTracks; i++) {
    t = tracks[i];
    try {
      if (!t.isLocked()) return t;
    } catch (e) {
      return t; // isLocked() unavailable — assume usable
    }
  }
  return tracks.numTracks > 0 ? tracks[0] : null;
}

function YTI_importAndInsert(filePath, mode, binName, audioFlag) {
  try {
    if (!app.project) return "ERR|Nenhum projeto do Premiere está aberto.";

    var bin = YTI_getOrCreateBin(binName || "YouTube Imports");
    var target = YTI_norm(filePath);
    var item = YTI_findItemByPath(bin, target) || YTI_findItemByPath(app.project.rootItem, target);

    if (!item) {
      app.project.importFiles([filePath], true, bin, false);
      item = YTI_findItemByPath(bin, target) || YTI_findItemByPath(app.project.rootItem, target);
    }
    if (!item) {
      return "ERR|O arquivo foi importado, mas não foi possível localizá-lo no projeto.";
    }

    if (mode === "bin") return "OK|bin";

    var seq = app.project.activeSequence;
    if (!seq) return "OK|bin-noseq"; // imported, nothing to insert into

    var seconds = seq.getPlayerPosition().seconds;
    var wantAudio = (audioFlag === "1");
    var track = YTI_firstUsableTrack(wantAudio ? seq.audioTracks : seq.videoTracks);
    if (!track) {
      return "ERR|A sequência ativa não tem nenhuma faixa de " + (wantAudio ? "áudio" : "vídeo") + " disponível (destravada).";
    }

    // insertClip performs an insert edit (ripples downstream clips) and
    // brings the linked audio/video along automatically. Some Premiere
    // builds want seconds as a float, others want a tick string — try the
    // float first and fall back to ticks.
    try {
      track.insertClip(item, seconds);
    } catch (e1) {
      try {
        track.insertClip(item, "" + Math.round(seconds * YTI_TICKS_PER_SECOND));
      } catch (e2) {
        return "ERR|Falha ao inserir na timeline: " + e2 + " (a faixa está travada?)";
      }
    }

    return "OK|playhead";
  } catch (e) {
    return "ERR|" + e;
  }
}
