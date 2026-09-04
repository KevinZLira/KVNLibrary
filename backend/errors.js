'use strict';

/**
 * Central place that turns raw failures (spawn errors, non-zero exit codes,
 * yt-dlp/ffmpeg stderr text) into short, user-facing Portuguese messages.
 * Nothing in the UI should ever show a raw stack trace or "exit code 1".
 */

class ImporterError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ImporterError';
    this.code = code;
    this.details = details || null;
  }
}

const RULES = [
  [/yt-dlp.*(ENOENT|not found|não é reconhecido|command not found)/i, 'YTDLP_MISSING'],
  [/spawn (yt-dlp|yt-dlp\.exe) ENOENT/i, 'YTDLP_MISSING'],
  [/ffmpeg.*(ENOENT|not found|não é reconhecido|command not found)/i, 'FFMPEG_MISSING'],
  [/spawn (ffmpeg|ffmpeg\.exe) ENOENT/i, 'FFMPEG_MISSING'],
  [/Private video/i, 'VIDEO_PRIVATE'],
  [/This video is private/i, 'VIDEO_PRIVATE'],
  [/Video unavailable/i, 'VIDEO_UNAVAILABLE'],
  [/has been removed/i, 'VIDEO_REMOVED'],
  [/This video is no longer available/i, 'VIDEO_REMOVED'],
  [/Sign in to confirm you.{0,3}re not a bot/i, 'YOUTUBE_BOT_CHECK'],
  [/Sign in to confirm your age/i, 'VIDEO_AGE_RESTRICTED'],
  [/Could not copy .*cookie database/i, 'COOKIES_BROWSER_LOCKED'],
  [/Could not find .*cookies database/i, 'COOKIES_BROWSER_LOCKED'],
  [/members-only/i, 'VIDEO_MEMBERS_ONLY'],
  [/live event will begin/i, 'VIDEO_UPCOMING_LIVE'],
  [/is not a valid URL/i, 'URL_INVALID'],
  [/Unsupported URL/i, 'URL_INVALID'],
  [/Incomplete YouTube ID/i, 'URL_INVALID'],
  [/Requested format is not available/i, 'FORMAT_UNAVAILABLE'],
  [/HTTP Error 429/i, 'RATE_LIMITED'],
  [/HTTP Error 403/i, 'YOUTUBE_FORBIDDEN'],
  [/ENOTFOUND|ENETUNREACH|EAI_AGAIN|network is unreachable/i, 'NETWORK_LOST'],
  [/ETIMEDOUT|timed out/i, 'NETWORK_LOST'],
  [/ENOSPC|No space left on device/i, 'DISK_FULL'],
  [/ECONNRESET/i, 'NETWORK_LOST'],
];

const MESSAGES = {
  YTDLP_MISSING:
    'O yt-dlp não foi encontrado neste computador. Instale-o e configure o caminho em ⚙ Configurações (veja o README para instruções).',
  FFMPEG_MISSING:
    'O FFmpeg não foi encontrado neste computador. Instale-o e configure o caminho em ⚙ Configurações (veja o README para instruções).',
  VIDEO_PRIVATE: 'Este vídeo é privado e não pode ser baixado.',
  VIDEO_UNAVAILABLE: 'Este vídeo não está disponível no momento.',
  VIDEO_REMOVED: 'Este vídeo foi removido do YouTube.',
  VIDEO_AGE_RESTRICTED: 'Este vídeo tem restrição de idade e não pôde ser acessado sem login.',
  COOKIES_BROWSER_LOCKED:
    'Não foi possível ler os cookies do navegador porque ele está aberto (o arquivo de cookies fica travado enquanto o navegador roda). Feche o navegador completamente — confira no Gerenciador de Tarefas se não sobrou nenhum processo dele em segundo plano — e tente novamente.',
  YOUTUBE_BOT_CHECK:
    'O YouTube pediu confirmação de que você não é um robô. Isso quase sempre significa que o arquivo cookies.txt configurado expirou ou está desatualizado. Exporte um novo cookies.txt do seu navegador (logado no YouTube) e atualize o caminho em ⚙ Configurações > Auth // Cookies.',
  VIDEO_MEMBERS_ONLY: 'Este vídeo é exclusivo para membros do canal e não pode ser baixado.',
  VIDEO_UPCOMING_LIVE: 'Este vídeo é uma transmissão ao vivo que ainda não começou.',
  URL_INVALID: 'URL inválida. Verifique se é um link válido do YouTube (youtube.com/watch?v=... ou youtu.be/...).',
  FORMAT_UNAVAILABLE: 'O formato/qualidade selecionado não está disponível para este vídeo.',
  RATE_LIMITED: 'O YouTube limitou temporariamente as solicitações. Aguarde alguns minutos e tente novamente.',
  YOUTUBE_FORBIDDEN:
    'O YouTube recusou o acesso a este vídeo (erro 403). Isso costuma acontecer quando o yt-dlp está desatualizado frente às proteções mais recentes do YouTube. Atualize o yt-dlp (Windows: "winget upgrade yt-dlp.yt-dlp"; macOS: "brew upgrade yt-dlp") e tente novamente.',
  NETWORK_LOST: 'A conexão com a internet foi perdida durante o processo. Verifique sua conexão e tente novamente.',
  DISK_FULL: 'Não há espaço suficiente em disco para concluir o download.',
  CLIP_INVALID: 'O trecho selecionado é inválido. Verifique os tempos de início e fim.',
  NO_SEQUENCE: 'Não há nenhuma sequência aberta no Premiere. Abra ou crie uma sequência antes de enviar para a timeline.',
  IMPORT_FAILED: 'Não foi possível importar o arquivo para o projeto do Premiere.',
  UNKNOWN: 'Não foi possível concluir a operação. Verifique se a URL está correta e se o vídeo está disponível publicamente.',
};

function classify(rawText) {
  const text = String(rawText || '');
  for (const [pattern, code] of RULES) {
    if (pattern.test(text)) return code;
  }
  return 'UNKNOWN';
}

function friendlyMessage(code) {
  return MESSAGES[code] || MESSAGES.UNKNOWN;
}

function fromRaw(rawText, fallbackCode) {
  const code = fallbackCode || classify(rawText);
  const err = new ImporterError(code, friendlyMessage(code), rawText);
  return err;
}

module.exports = { ImporterError, classify, friendlyMessage, fromRaw, MESSAGES };
