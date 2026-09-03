/* Orchestrates the actual import: cache check -> download/processing -> Premiere import -> timeline insert. */
(function (global) {
  'use strict';

  function el(id) { return document.getElementById(id); }

  var currentJob = null;
  var busy = false;

  function getMediaType() {
    var checked = document.querySelector('input[name="mediaType"]:checked');
    return checked ? checked.value : 'video-audio';
  }

  function getQuality() {
    return el('quality-select').value;
  }

  function setBusy(isBusy) {
    busy = isBusy;
    el('import-project-btn').disabled = isBusy;
    el('import-timeline-btn').disabled = isBusy;
    el('load-btn').disabled = isBusy;
  }

  function resetProgress() {
    el('progress-area').classList.remove('hidden');
    el('progress-bar-fill').style.width = '0%';
    el('progress-details').textContent = '';
    el('result-line').classList.add('hidden');
  }

  function setStage(text) {
    el('progress-stage').textContent = text;
  }

  function showResult(text, isError) {
    var node = el('result-line');
    node.textContent = text;
    node.classList.remove('hidden');
    node.classList.toggle('is-error', !!isError);
  }

  function onBackendProgress(evt) {
    if (evt.stage === 'downloading') {
      var pct = evt.percent != null ? Math.round(evt.percent) : null;
      setStage('Baixando...' + (pct !== null ? ' ' + pct + '%' : ''));
      if (pct !== null) el('progress-bar-fill').style.width = pct + '%';
      var bits = [];
      if (evt.totalSize) bits.push(evt.totalSize);
      if (evt.speed) bits.push(evt.speed);
      if (evt.eta) bits.push('ETA ' + evt.eta);
      el('progress-details').textContent = bits.join(' • ');
    } else if (evt.stage === 'processing' || evt.stage === 'merging' || evt.stage === 'extracting-audio' || evt.stage === 'remuxing') {
      setStage('Processando vídeo...');
      el('progress-bar-fill').style.width = '100%';
      el('progress-details').textContent = '';
    } else if (evt.stage === 'starting') {
      setStage('Iniciando download...');
    } else if (evt.stage === 'notice') {
      el('progress-details').textContent = evt.message || '';
    }
  }

  function askReuseCache() {
    return new Promise(function (resolve) {
      el('cache-modal').classList.remove('hidden');
      function cleanup(choice) {
        el('cache-modal').classList.add('hidden');
        el('cache-use-btn').removeEventListener('click', onUse);
        el('cache-redownload-btn').removeEventListener('click', onRedownload);
        resolve(choice);
      }
      function onUse() { cleanup('use'); }
      function onRedownload() { cleanup('redownload'); }
      el('cache-use-btn').addEventListener('click', onUse);
      el('cache-redownload-btn').addEventListener('click', onRedownload);
    });
  }

  function runDownload(videoInfo, selection, mediaType, quality) {
    var cacheParams = {
      videoId: videoInfo.id,
      startSeconds: selection.startSeconds,
      endSeconds: selection.endSeconds,
      mediaType: mediaType,
      quality: quality,
    };

    var cached = BackendBridge.checkCache(cacheParams);
    var reuse = Promise.resolve(false);
    if (cached) {
      reuse = askReuseCache().then(function (choice) { return choice === 'use'; });
    }

    return reuse.then(function (shouldReuse) {
      if (shouldReuse) {
        setStage('Usando arquivo em cache...');
        el('progress-bar-fill').style.width = '100%';
        return { filePath: cached.filePath, mediaType: mediaType, title: videoInfo.title };
      }

      return new Promise(function (resolve, reject) {
        var job = BackendBridge.startImportJob(
          {
            videoInfo: videoInfo,
            startSeconds: selection.startSeconds,
            endSeconds: selection.endSeconds,
            mediaType: mediaType,
            quality: quality,
          },
          onBackendProgress
        );
        currentJob = job;
        job.promise.then(resolve).catch(reject).finally(function () { currentJob = null; });
      });
    });
  }

  function runImport(target) {
    if (busy) return;

    var videoInfo = VideoLoader.getCurrentVideoInfo();
    if (!videoInfo) {
      showResult('Carregue um vídeo primeiro.', true);
      return;
    }
    var selection = TrimSelector.getSelection();
    if (!selection.valid) {
      showResult('Corrija o trecho selecionado antes de importar.', true);
      return;
    }

    var mediaType = getMediaType();
    var quality = getQuality();
    var config = BackendBridge.getConfig();

    setBusy(true);
    resetProgress();
    setStage('Obtendo informações...');

    runDownload(videoInfo, selection, mediaType, quality)
      .then(function (result) {
        setStage('Importando para Premiere...');
        el('progress-bar-fill').style.width = '100%';

        var hostCall = target === 'timeline'
          ? HostBridge.insertClipAtPlayhead(result.filePath, result.mediaType, config.binName)
          : HostBridge.importToProject(result.filePath, config.binName).then(function () { return 'bin'; });

        return hostCall.then(function (detail) {
          return { result: result, detail: detail };
        });
      })
      .then(function (outcome) {
        setStage('Concluído');
        var result = outcome.result;
        var where;
        if (outcome.detail === 'bin-noseq') {
          where = 'Importado para o projeto. Não há nenhuma sequência aberta — abra ou crie uma sequência e clique em "Enviar para Timeline" novamente para inserir o clipe.';
        } else if (target === 'timeline') {
          where = 'Importado para o projeto e enviado para a timeline.';
        } else {
          where = 'Importado para o projeto.';
        }
        showResult(where + ' Arquivo: ' + result.title, false);
      })
      .catch(function (err) {
        console.error('[YouTube Importer] Falha na importação — código:', err && err.code, '| detalhes técnicos:', err && err.details, '| erro completo:', err);
        if (err && err.code === 'CANCELLED') {
          setStage('Cancelado');
          showResult('Importação cancelada.', false);
        } else {
          setStage('Erro');
          showResult((err && err.message) || 'Não foi possível concluir a importação.', true);
        }
      })
      .finally(function () {
        setBusy(false);
      });
  }

  function cancel() {
    if (currentJob) BackendBridge.cancelJob(currentJob.jobId);
  }

  function init() {
    el('import-project-btn').addEventListener('click', function () { runImport('project'); });
    el('import-timeline-btn').addEventListener('click', function () { runImport('timeline'); });
    el('cancel-btn').addEventListener('click', cancel);
  }

  global.ImportController = { init: init };
})(window);
