/*
 * Real YouTube preview player (YouTube IFrame Player API) so the user can
 * scrub the actual video and use "Definir início atual" / "Definir fim
 * atual". Requires outbound internet access from the panel's webview; if the
 * API script can't be loaded (offline, network policy), the preview card is
 * hidden and trim fields still work by manual entry — never blocks the core
 * flow.
 */
(function (global) {
  'use strict';

  var player = null;
  var apiReadyPromise = null;
  var containerEl = null;

  function loadApi() {
    if (apiReadyPromise) return apiReadyPromise;
    apiReadyPromise = new Promise(function (resolve, reject) {
      if (global.YT && global.YT.Player) {
        resolve();
        return;
      }
      var timeout = setTimeout(function () {
        reject(new Error('Tempo esgotado ao carregar a prévia do YouTube.'));
      }, 8000);

      global.onYouTubeIframeAPIReady = function () {
        clearTimeout(timeout);
        resolve();
      };

      var tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.onerror = function () {
        clearTimeout(timeout);
        reject(new Error('Não foi possível carregar a prévia do YouTube.'));
      };
      document.head.appendChild(tag);
    });
    return apiReadyPromise;
  }

  function mount(container) {
    containerEl = container;
  }

  function load(videoId) {
    return loadApi().then(function () {
      return new Promise(function (resolve, reject) {
        if (!containerEl) {
          reject(new Error('Contêiner de prévia não inicializado.'));
          return;
        }
        containerEl.innerHTML = '';
        var playerDiv = document.createElement('div');
        containerEl.appendChild(playerDiv);

        player = new global.YT.Player(playerDiv, {
          videoId: videoId,
          playerVars: { rel: 0, modestbranding: 1 },
          events: {
            onReady: function () { resolve(player); },
            onError: function (e) { reject(new Error('Não foi possível carregar a prévia deste vídeo.')); },
          },
        });
      });
    });
  }

  function getCurrentTime() {
    if (!player || typeof player.getCurrentTime !== 'function') return null;
    try {
      return player.getCurrentTime();
    } catch (e) {
      return null;
    }
  }

  function seekTo(seconds) {
    if (!player || typeof player.seekTo !== 'function') return;
    try {
      player.seekTo(seconds, true);
    } catch (e) {
      // ignore — preview is a convenience, not a requirement
    }
  }

  function isReady() {
    return !!player;
  }

  global.YoutubePreview = { mount: mount, load: load, getCurrentTime: getCurrentTime, seekTo: seekTo, isReady: isReady };
})(window);
