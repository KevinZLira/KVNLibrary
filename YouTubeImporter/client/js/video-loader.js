/* Handles the URL field: parsing, "Carregar", and populating the video-info card. */
(function (global) {
  'use strict';

  var currentVideoInfo = null;

  function el(id) { return document.getElementById(id); }

  function setStatus(text, isError) {
    var node = el('url-status');
    node.textContent = text || '';
    node.style.color = isError ? 'var(--error)' : 'var(--text-dim)';
  }

  function showCards(show) {
    ['video-info-card', 'preview-card', 'trim-card', 'media-card', 'import-card'].forEach(function (id) {
      el(id).classList.toggle('hidden', !show);
    });
  }

  function updateFavButton() {
    var btn = el('fav-btn');
    var favorites = BackendBridge.listFavorites();
    var isFav = currentVideoInfo && favorites.some(function (f) { return f.videoId === currentVideoInfo.id; });
    btn.textContent = isFav ? '★ Favoritado' : '☆ Favoritar';
  }

  function populateInfo(info) {
    currentVideoInfo = info;
    el('video-thumb').src = info.thumbnail || '';
    el('video-title').textContent = info.title;
    el('video-channel').querySelector('span').textContent = info.channel;
    el('video-duration').querySelector('span').textContent = TimeUtils.formatDuration(info.duration);
    el('video-url').textContent = info.webpageUrl;
    updateFavButton();
    showCards(true);

    document.dispatchEvent(new CustomEvent('yti:video-loaded', { detail: info }));

    YoutubePreview.load(info.id).then(function () {
      el('preview-card').classList.remove('hidden');
    }).catch(function () {
      el('preview-card').classList.add('hidden');
    });
  }

  function loadUrl(rawUrl) {
    var url = (rawUrl || el('url-input').value || '').trim();
    if (!url) {
      setStatus('Cole uma URL do YouTube.', true);
      return Promise.resolve();
    }
    if (!BackendBridge.isValidYoutubeUrl(url)) {
      setStatus('URL inválida. Use um link como https://www.youtube.com/watch?v=... ou https://youtu.be/...', true);
      return Promise.resolve();
    }

    el('url-input').value = url;
    el('load-btn').disabled = true;
    setStatus('Obtendo informações...');
    showCards(false);

    return BackendBridge.getVideoInfo(url)
      .then(function (info) {
        setStatus('Vídeo carregado com sucesso.');
        populateInfo(info);
      })
      .catch(function (err) {
        setStatus(err.message || 'Não foi possível carregar este vídeo.', true);
      })
      .finally(function () {
        el('load-btn').disabled = false;
      });
  }

  function getCurrentVideoInfo() {
    return currentVideoInfo;
  }

  function init() {
    YoutubePreview.mount(el('player-container'));

    el('load-btn').addEventListener('click', function () { loadUrl(); });
    el('url-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') loadUrl();
    });

    el('fav-btn').addEventListener('click', function () {
      if (!currentVideoInfo) return;
      BackendBridge.toggleFavorite({
        videoId: currentVideoInfo.id,
        title: currentVideoInfo.title,
        channel: currentVideoInfo.channel,
        thumbnail: currentVideoInfo.thumbnail,
        webpageUrl: currentVideoInfo.webpageUrl,
      });
      updateFavButton();
      document.dispatchEvent(new CustomEvent('yti:favorites-changed'));
    });

    // Drag & drop a YouTube link straight onto the panel.
    var dropZone = el('app');
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      var text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (text && BackendBridge.isValidYoutubeUrl(text.trim())) {
        el('url-input').value = text.trim();
        loadUrl(text.trim());
      }
    });
  }

  global.VideoLoader = { init: init, loadUrl: loadUrl, getCurrentVideoInfo: getCurrentVideoInfo };
})(window);
