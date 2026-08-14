/* Start/end trim fields: manual editing, "definir atual" buttons, and validation. */
(function (global) {
  'use strict';

  function el(id) { return document.getElementById(id); }

  var duration = 0;

  function showError(msg) {
    var node = el('trim-error');
    if (msg) {
      node.textContent = msg;
      node.classList.remove('hidden');
    } else {
      node.classList.add('hidden');
      node.textContent = '';
    }
  }

  function validate() {
    var start = TimeUtils.parseClock(el('start-input').value);
    var end = TimeUtils.parseClock(el('end-input').value);

    if (start === null || end === null) {
      showError('Use o formato HH:MM:SS.');
      return { valid: false };
    }
    if (start >= end) {
      showError('O início não pode ser maior ou igual ao fim.');
      return { valid: false };
    }
    if (duration && start > duration) {
      showError('O início não pode ultrapassar a duração do vídeo (' + TimeUtils.formatDuration(duration) + ').');
      return { valid: false };
    }
    if (duration && end > duration) {
      showError('O fim não pode ultrapassar a duração do vídeo (' + TimeUtils.formatDuration(duration) + ').');
      return { valid: false };
    }

    showError(null);
    el('trim-duration').textContent = 'Trecho selecionado: ' + TimeUtils.formatDuration(end - start);
    return { valid: true, startSeconds: start, endSeconds: end };
  }

  function getSelection() {
    return validate();
  }

  function setDuration(newDuration) {
    duration = newDuration || 0;
    var defaultEnd = Math.min(30, duration || 30);
    el('start-input').value = TimeUtils.formatClock(0);
    el('end-input').value = TimeUtils.formatClock(defaultEnd);
    validate();
  }

  function init() {
    document.addEventListener('yti:video-loaded', function (e) {
      setDuration(e.detail.duration);
    });

    el('start-input').addEventListener('change', validate);
    el('end-input').addEventListener('change', validate);

    el('set-start-btn').addEventListener('click', function () {
      var t = YoutubePreview.getCurrentTime();
      if (t !== null) {
        el('start-input').value = TimeUtils.formatClock(t);
        validate();
      }
    });
    el('set-end-btn').addEventListener('click', function () {
      var t = YoutubePreview.getCurrentTime();
      if (t !== null) {
        el('end-input').value = TimeUtils.formatClock(t);
        validate();
      }
    });
  }

  global.TrimSelector = { init: init, getSelection: getSelection, setDuration: setDuration };
})(window);
