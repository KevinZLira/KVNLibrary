/* Renders the "Histórico" tab: recent imports and favorites. */
(function (global) {
  'use strict';

  function el(id) { return document.getElementById(id); }

  function rangeLabel(item) {
    return TimeUtils.formatDuration(item.startSeconds) + ' - ' + TimeUtils.formatDuration(item.endSeconds);
  }

  function renderHistory() {
    var items = BackendBridge.listHistory();
    var container = el('history-list');
    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = '<div class="hint">Nenhuma importação ainda.</div>';
      return;
    }
    items.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'history-item';
      row.innerHTML =
        '<img src="' + (item.thumbnail || '') + '" alt="" />' +
        '<div class="hi-meta">' +
          '<div class="hi-title">' + escapeHtml(item.title) + '</div>' +
          '<div class="hi-sub">' + escapeHtml(item.channel) + ' • ' + rangeLabel(item) + '</div>' +
        '</div>';
      row.addEventListener('click', function () {
        el('url-input').value = item.webpageUrl;
        document.querySelector('.tab-btn[data-tab="import"]').click();
        VideoLoader.loadUrl(item.webpageUrl);
      });
      container.appendChild(row);
    });
  }

  function renderFavorites() {
    var favs = BackendBridge.listFavorites();
    var container = el('favorites-list');
    container.innerHTML = '';
    if (!favs.length) {
      container.innerHTML = '<div class="hint">Nenhum favorito ainda.</div>';
      return;
    }
    favs.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'history-item';
      row.innerHTML =
        '<img src="' + (item.thumbnail || '') + '" alt="" />' +
        '<div class="hi-meta">' +
          '<div class="hi-title">' + escapeHtml(item.title) + '</div>' +
          '<div class="hi-sub">' + escapeHtml(item.channel) + '</div>' +
        '</div>';
      row.addEventListener('click', function () {
        el('url-input').value = item.webpageUrl;
        document.querySelector('.tab-btn[data-tab="import"]').click();
        VideoLoader.loadUrl(item.webpageUrl);
      });
      container.appendChild(row);
    });
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function init() {
    el('clear-history-btn').addEventListener('click', function () {
      BackendBridge.clearHistory();
      renderHistory();
    });
    document.addEventListener('yti:favorites-changed', renderFavorites);
    document.querySelector('.tab-btn[data-tab="history"]').addEventListener('click', function () {
      renderHistory();
      renderFavorites();
    });
    renderHistory();
    renderFavorites();
  }

  global.HistoryPanel = { init: init, renderHistory: renderHistory, renderFavorites: renderFavorites };
})(window);
