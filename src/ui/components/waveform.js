/**
 * Gera e desenha a forma de onda de um arquivo de áudio usando a Web Audio
 * API do próprio Chromium embutido no UXP (AudioContext.decodeAudioData) -
 * não existe API dedicada de waveform no Premiere, então isso é puramente
 * client-side, a partir dos bytes do arquivo (via fetch do Entry.url, o
 * mesmo usado no <audio> de pré-escuta).
 */

let sharedAudioContext = null;

function getAudioContext() {
  if (!sharedAudioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    sharedAudioContext = new AudioContextClass();
  }
  return sharedAudioContext;
}

async function decodeAudioFromUrl(url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return getAudioContext().decodeAudioData(arrayBuffer);
}

function drawPlaceholderLine(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(224, 224, 224, 0.2)";
  ctx.fillRect(0, height / 2 - 1, width, 2);
}

function drawWaveform(canvas, audioBuffer) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const channelData = audioBuffer.getChannelData(0);
  const samplesPerPixel = Math.max(1, Math.floor(channelData.length / width));
  const mid = height / 2;

  ctx.fillStyle = "#5c9dff";
  for (let x = 0; x < width; x++) {
    const start = x * samplesPerPixel;
    let min = 0;
    let max = 0;
    for (let i = 0; i < samplesPerPixel; i++) {
      const sample = channelData[start + i] || 0;
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    const y = mid + min * mid;
    const barHeight = Math.max(1, (max - min) * mid);
    ctx.fillRect(x, y, 1, barHeight);
  }
}

module.exports = {
  decodeAudioFromUrl,
  drawPlaceholderLine,
  drawWaveform,
};
