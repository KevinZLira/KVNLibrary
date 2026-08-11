/**
 * Desenha um padrão visual para o card de áudio, no estilo "forma de onda"
 * do Mister Horse.
 *
 * IMPORTANTE: não é uma análise real do áudio do arquivo. Pesquisa na
 * referência oficial do UXP (uxp-api/reference-js/global-members/html-
 * elements/index.md) mostra que o único elemento de mídia documentado é
 * HTMLVideoElement - não existe HTMLAudioElement nem a Web Audio API
 * (AudioContext), então não há como decodificar PCM real nesse ambiente
 * sem um decoder próprio (fora de escopo). O padrão abaixo é gerado
 * deterministicamente a partir do nome do arquivo (mesmo arquivo sempre
 * desenha o mesmo desenho), só como identidade visual do card.
 */

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

function drawGeneratedWaveform(canvas, seed) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  let state = hashString(seed) || 1;
  const nextRandom = () => {
    // xorshift32 - só para gerar um padrão determinístico, não é aleatório
    // "de verdade" nem precisa ser: o objetivo é só reproduzir sempre o
    // mesmo desenho para o mesmo nome de arquivo.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };

  // Barras verticais em pílula com glow verde, espelhadas a partir do
  // centro - reproduz o estilo de "espectro" do rascunho (barras
  // arredondadas, não uma linha contínua de onda).
  const barCount = 20;
  const gap = 3;
  const barWidth = Math.max(2, width / barCount - gap);
  const radius = barWidth / 2;
  const mid = height / 2;
  const color = "#7FF425";

  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;

  for (let i = 0; i < barCount; i++) {
    const amplitude = 0.15 + nextRandom() * 0.85;
    const barHeight = Math.max(3, amplitude * height * 0.85);
    const x = i * (barWidth + gap);
    const y = mid - barHeight / 2;

    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, barWidth, barHeight, radius);
    } else {
      ctx.rect(x, y, barWidth, barHeight);
    }
    ctx.fill();
  }
}

module.exports = {
  drawGeneratedWaveform,
};
