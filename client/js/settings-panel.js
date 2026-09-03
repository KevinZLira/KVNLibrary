/* Renders/saves the "⚙ Configurações" tab. */
(function (global) {
  'use strict';

  function el(id) { return document.getElementById(id); }

  function loadIntoForm() {
    var config = BackendBridge.getConfig();
    el('download-dir-input').value = config.downloadDir;
    el('bin-name-input').value = config.binName;
    el('ytdlp-path-input').value = config.ytdlpPath || '';
    el('ffmpeg-path-input').value = config.ffmpegPath || '';
    el('cookies-path-input').value = config.cookiesPath || '';
    el('extra-ytdlp-args-input').value = config.extraYtdlpArgs || '';
    el('cache-enabled-input').checked = config.cacheEnabled !== false;
    el('cleanup-temp-input').checked = config.autoCleanupTemp !== false;
  }

  function save() {
    var partial = {
      downloadDir: el('download-dir-input').value.trim(),
      binName: el('bin-name-input').value.trim() || 'YouTube Imports',
      ytdlpPath: el('ytdlp-path-input').value.trim(),
      ffmpegPath: el('ffmpeg-path-input').value.trim(),
      cookiesPath: el('cookies-path-input').value.trim(),
      extraYtdlpArgs: el('extra-ytdlp-args-input').value.trim(),
      cacheEnabled: el('cache-enabled-input').checked,
      autoCleanupTemp: el('cleanup-temp-input').checked,
    };
    BackendBridge.saveConfig(partial);
    var msg = el('settings-saved-msg');
    msg.classList.remove('hidden');
    setTimeout(function () { msg.classList.add('hidden'); }, 2500);
    checkBinaries();
  }

  function checkBinaries() {
    el('ytdlp-status').textContent = 'yt-dlp: verificando...';
    el('ffmpeg-status').textContent = 'ffmpeg: verificando...';
    var found = BackendBridge.checkBinaries();
    el('ytdlp-status').textContent = found.ytdlp
      ? 'yt-dlp: encontrado (' + found.ytdlp + ')'
      : 'yt-dlp: não encontrado — veja o README para instalar.';
    el('ffmpeg-status').textContent = found.ffmpeg
      ? 'ffmpeg: encontrado (' + found.ffmpeg + ')'
      : 'ffmpeg: não encontrado — veja o README para instalar.';
  }

  function updateYtdlp() {
    var btn = el('update-ytdlp-btn');
    var status = el('update-ytdlp-status');
    btn.disabled = true;
    status.textContent = 'Atualizando yt-dlp (pode levar um minuto)...';
    status.style.color = 'var(--text-dim)';
    BackendBridge.updateYtdlp()
      .then(function (result) {
        status.textContent = result.message;
        status.style.color = result.ok ? 'var(--accent)' : 'var(--error)';
        checkBinaries();
      })
      .catch(function (err) {
        status.textContent = (err && err.message) || 'Não foi possível atualizar o yt-dlp.';
        status.style.color = 'var(--error)';
      })
      .finally(function () {
        btn.disabled = false;
      });
  }

  function init() {
    loadIntoForm();
    checkBinaries();
    el('save-settings-btn').addEventListener('click', save);
    el('recheck-binaries-btn').addEventListener('click', checkBinaries);
    el('update-ytdlp-btn').addEventListener('click', updateYtdlp);
  }

  global.SettingsPanel = { init: init, checkBinaries: checkBinaries };
})(window);
