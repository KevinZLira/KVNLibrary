/* Bootstraps the panel: tab switching + wiring all feature modules together. */
(function () {
  'use strict';

  /**
   * Any uncaught error (a click handler throwing, a module that failed to
   * load, ...) would otherwise just vanish into the DevTools console and
   * make a button look like it "does nothing". Surface it in the UI instead
   * so a broken state is always visible and reportable.
   */
  function installGlobalErrorSurface() {
    function report(message) {
      var status = document.getElementById('url-status');
      if (status) {
        status.textContent = 'Erro inesperado na extensão: ' + message + ' (veja o console de depuração para detalhes).';
        status.style.color = 'var(--error)';
      }
    }
    window.addEventListener('error', function (e) {
      console.error('[YouTube Importer] Uncaught error:', e.error || e.message);
      report(e.message || 'erro desconhecido');
    });
    window.addEventListener('unhandledrejection', function (e) {
      var reason = e.reason;
      console.error('[YouTube Importer] Unhandled promise rejection:', reason);
      report((reason && reason.message) || String(reason));
    });
  }

  function initTabs() {
    var buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });
  }

  function warnIfNoProject() {
    HostBridge.hasOpenProject().then(function (data) {
      if (!data.hasProject) {
        var status = document.getElementById('url-status');
        status.textContent = 'Abra um projeto no Premiere Pro para importar vídeos.';
        status.style.color = 'var(--error)';
      }
    }).catch(function () {
      // Premiere not reachable yet (e.g. panel loaded before host finished init) — non-fatal.
    });
  }

  installGlobalErrorSurface();

  document.addEventListener('DOMContentLoaded', function () {
    initTabs();
    VideoLoader.init();
    TrimSelector.init();
    ImportController.init();
    HistoryPanel.init();
    SettingsPanel.init();
    BatchPanel.init();
    warnIfNoProject();
  });
})();
