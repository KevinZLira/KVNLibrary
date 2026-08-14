/* Bootstraps the panel: tab switching + wiring all feature modules together. */
(function () {
  'use strict';

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
