/* "Importação em lote": paste several URLs, process them one after another into the project bin. */
(function (global) {
  'use strict';

  function el(id) { return document.getElementById(id); }

  function getMediaType() {
    var checked = document.querySelector('input[name="mediaType"]:checked');
    return checked ? checked.value : 'video-audio';
  }

  function getQuality() {
    return el('quality-select').value;
  }

  function parseUrls() {
    return el('batch-input').value
      .split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l && BackendBridge.isValidYoutubeUrl(l); });
  }

  function renderItem(url, status) {
    var row = document.createElement('div');
    row.className = 'batch-item';
    row.innerHTML = '<span class="batch-url">' + url + '</span><span class="batch-status">' + status + '</span>';
    return row;
  }

  function setRowStatus(row, text, cssClass) {
    row.querySelector('.batch-status').textContent = text;
    row.classList.remove('status-done', 'status-error');
    if (cssClass) row.classList.add(cssClass);
  }

  function processOne(url, row) {
    var config = BackendBridge.getConfig();
    setRowStatus(row, 'Obtendo informações...');
    return BackendBridge.getVideoInfo(url)
      .then(function (info) {
        setRowStatus(row, 'Baixando...');
        var job = BackendBridge.startImportJob(
          {
            videoInfo: info,
            startSeconds: 0,
            endSeconds: info.duration,
            mediaType: getMediaType(),
            quality: getQuality(),
          },
          function (evt) {
            if (evt.stage === 'downloading' && evt.percent != null) {
              setRowStatus(row, 'Baixando... ' + Math.round(evt.percent) + '%');
            } else if (evt.stage === 'processing') {
              var pct = evt.percent != null ? Math.round(evt.percent) : null;
              setRowStatus(row, 'Processando vídeo...' + (pct !== null ? ' ' + pct + '%' : ''));
            }
          }
        );
        return job.promise;
      })
      .then(function (result) {
        setRowStatus(row, 'Importando para o projeto...');
        return HostBridge.importToProject(result.filePath, config.binName);
      })
      .then(function () {
        setRowStatus(row, 'Concluído', 'status-done');
      })
      .catch(function (err) {
        setRowStatus(row, (err && err.message) || 'Erro desconhecido.', 'status-error');
      });
  }

  function runBatch() {
    var urls = parseUrls();
    var listEl = el('batch-list');
    listEl.innerHTML = '';
    if (!urls.length) return;

    var rows = urls.map(function (url) {
      var row = renderItem(url, 'Na fila');
      listEl.appendChild(row);
      return row;
    });

    el('batch-run-btn').disabled = true;

    var chain = Promise.resolve();
    urls.forEach(function (url, i) {
      chain = chain.then(function () { return processOne(url, rows[i]); });
    });
    chain.finally(function () {
      el('batch-run-btn').disabled = false;
      HistoryPanel.renderHistory();
    });
  }

  function init() {
    el('toggle-batch-btn').addEventListener('click', function () {
      var card = el('batch-card');
      card.classList.toggle('hidden');
      el('toggle-batch-btn').textContent = card.classList.contains('hidden')
        ? 'Importação em lote ▾'
        : 'Importação em lote ▴';
    });
    el('batch-run-btn').addEventListener('click', runBatch);
  }

  global.BatchPanel = { init: init };
})(window);
