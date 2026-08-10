/**
 * Renderiza a grade de assets de uma categoria. Puramente apresentacional:
 * recebe dados prontos e callbacks de seleção/duplo clique.
 *
 * Preview real: usa Entry.url (concedido via seletor de pastas) diretamente
 * em <img>/<video>, já que o painel roda num webview Chromium comum e não
 * existe (nem foi encontrada na pesquisa) uma API dedicada de geração de
 * thumbnail no Premiere. Áudio ganha uma forma de onda real (Web Audio API,
 * ver waveform.js) com play/pause e barra de progresso para pré-ouvir o som
 * sem precisar importar primeiro.
 */

const waveform = require("./waveform");

const KIND_LABEL = {
  video: "VID",
  audio: "AUD",
  image: "IMG",
  mogrt: "MGT",
  preset: "PST",
  file: "FILE",
};

function createBadgeThumb(asset) {
  const thumb = document.createElement("div");
  thumb.className = `kvn-asset-thumb kvn-asset-thumb-${asset.kind}`;
  thumb.textContent = KIND_LABEL[asset.kind] || "FILE";
  return thumb;
}

function createImageThumb(asset) {
  const img = document.createElement("img");
  img.className = "kvn-asset-thumb kvn-asset-thumb-media";
  img.src = asset.url;
  img.loading = "lazy";
  img.alt = asset.name;
  img.addEventListener("error", () => {
    img.replaceWith(createBadgeThumb(asset));
  });
  return img;
}

function createVideoThumb(asset) {
  const video = document.createElement("video");
  video.className = "kvn-asset-thumb kvn-asset-thumb-media";
  video.src = asset.url;
  video.muted = true;
  video.preload = "metadata";
  video.addEventListener("error", () => {
    video.replaceWith(createBadgeThumb(asset));
  });
  return video;
}

function createAudioThumb(asset) {
  const wrapper = document.createElement("div");
  wrapper.className = "kvn-asset-thumb kvn-audio-thumb";

  const canvas = document.createElement("canvas");
  canvas.className = "kvn-audio-waveform";
  canvas.width = 240;
  canvas.height = 68;
  wrapper.appendChild(canvas);
  waveform.drawPlaceholderLine(canvas);

  const playIcon = document.createElement("div");
  playIcon.className = "kvn-audio-thumb-play";
  playIcon.textContent = "▶";
  wrapper.appendChild(playIcon);

  const progress = document.createElement("div");
  progress.className = "kvn-audio-thumb-progress";
  wrapper.appendChild(progress);

  let audioBuffer = null;
  let sourceNode = null;
  let startedAtContextTime = 0;
  let pausedAtOffset = 0;
  let isPlaying = false;
  let progressRafId = null;

  waveform
    .decodeAudioFromUrl(asset.url)
    .then((buffer) => {
      audioBuffer = buffer;
      waveform.drawWaveform(canvas, audioBuffer);
    })
    .catch((error) => {
      // Sem preview pra esse arquivo (ex.: codec não suportado pela Web
      // Audio API) - fica só a linha reta e o play não faz nada.
      console.error(`[KVN] Não foi possível decodificar "${asset.name}" para pré-escuta:`, error);
    });

  function stopSourceNode() {
    if (sourceNode) {
      sourceNode.onended = null;
      try {
        sourceNode.stop();
      } catch (error) {
        // Já parado - ignora.
      }
      sourceNode = null;
    }
  }

  function updateProgressLoop() {
    if (!isPlaying || !audioBuffer) {
      return;
    }
    const elapsed =
      waveform.getAudioContext().currentTime - startedAtContextTime + pausedAtOffset;
    const ratio = Math.min(1, elapsed / audioBuffer.duration);
    progress.style.width = `${ratio * 100}%`;
    if (elapsed >= audioBuffer.duration) {
      stopPlayback(true);
      return;
    }
    progressRafId = requestAnimationFrame(updateProgressLoop);
  }

  function startPlayback() {
    const context = waveform.getAudioContext();
    sourceNode = context.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(context.destination);
    sourceNode.onended = () => {
      if (isPlaying) {
        stopPlayback(true);
      }
    };
    startedAtContextTime = context.currentTime;
    sourceNode.start(0, pausedAtOffset);
    isPlaying = true;
    playIcon.textContent = "❚❚";
    progressRafId = requestAnimationFrame(updateProgressLoop);
  }

  function stopPlayback(reachedEnd) {
    isPlaying = false;
    playIcon.textContent = "▶";
    if (progressRafId) {
      cancelAnimationFrame(progressRafId);
      progressRafId = null;
    }
    if (reachedEnd) {
      pausedAtOffset = 0;
      progress.style.width = "0%";
    } else {
      pausedAtOffset += waveform.getAudioContext().currentTime - startedAtContextTime;
    }
    stopSourceNode();
  }

  wrapper.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!audioBuffer) {
      return;
    }
    if (isPlaying) {
      stopPlayback(false);
    } else {
      startPlayback();
    }
  });

  return wrapper;
}

function createThumb(asset) {
  if (asset.kind === "image" && asset.url) {
    return createImageThumb(asset);
  }
  if (asset.kind === "video" && asset.url) {
    return createVideoThumb(asset);
  }
  if (asset.kind === "audio" && asset.url) {
    return createAudioThumb(asset);
  }
  return createBadgeThumb(asset);
}

function renderAssets(container, assets, selectedAssetPath, onSelectAsset, onImportAsset) {
  container.innerHTML = "";

  if (assets.length === 0) {
    const empty = document.createElement("p");
    empty.className = "kvn-empty-state";
    empty.textContent = "Nenhum arquivo aqui.";
    container.appendChild(empty);
    return;
  }

  for (const asset of assets) {
    const card = document.createElement("div");
    card.className = "kvn-asset-card";
    if (asset.path === selectedAssetPath) {
      card.classList.add("kvn-asset-selected");
    }

    const thumb = createThumb(asset);

    const name = document.createElement("div");
    name.className = "kvn-asset-name";
    name.textContent = asset.name;

    const ext = document.createElement("div");
    ext.className = "kvn-asset-ext";
    ext.textContent = asset.extension || "";

    card.appendChild(thumb);
    card.appendChild(name);
    card.appendChild(ext);

    card.addEventListener("click", () => onSelectAsset(asset));
    card.addEventListener("dblclick", () => onImportAsset(asset));

    container.appendChild(card);
  }
}

module.exports = {
  renderAssets,
};
