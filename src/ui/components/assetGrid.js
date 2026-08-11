/**
 * Renderiza a grade de assets de uma categoria. Puramente apresentacional:
 * recebe dados prontos e callbacks de seleção/duplo clique.
 *
 * Preview real: usa Entry.url (concedido via seletor de pastas) diretamente
 * em <img>/<video>. Áudio toca via um <video> escondido (ver comentário em
 * createAudioThumb) com play/pause e barra de progresso, e ganha um padrão
 * visual decorativo (ver waveform.js) - não é uma forma de onda real, já
 * que o UXP não expõe Web Audio API nem <audio> pra decodificar o áudio.
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
  waveform.drawGeneratedWaveform(canvas, asset.name);

  const playIcon = document.createElement("div");
  playIcon.className = "kvn-audio-thumb-play";
  playIcon.textContent = "▶";
  wrapper.appendChild(playIcon);

  const progress = document.createElement("div");
  progress.className = "kvn-audio-thumb-progress";
  wrapper.appendChild(progress);

  // O UXP não documenta <audio> nem a Web Audio API na sua lista de
  // globais (só HTMLVideoElement) - reaproveita o <video>, que já
  // funciona para os thumbs de vídeo, como player de áudio escondido.
  const player = document.createElement("video");
  player.className = "kvn-audio-player";
  player.src = asset.url;
  player.preload = "none";
  wrapper.appendChild(player);

  let progressRafId = null;

  function updateProgressLoop() {
    if (player.paused || !player.duration) {
      progressRafId = null;
      return;
    }
    progress.style.width = `${(player.currentTime / player.duration) * 100}%`;
    progressRafId = requestAnimationFrame(updateProgressLoop);
  }

  player.addEventListener("play", () => {
    playIcon.textContent = "❚❚";
    if (!progressRafId) {
      progressRafId = requestAnimationFrame(updateProgressLoop);
    }
  });
  player.addEventListener("pause", () => {
    playIcon.textContent = "▶";
  });
  player.addEventListener("ended", () => {
    playIcon.textContent = "▶";
    progress.style.width = "0%";
  });
  player.addEventListener("error", () => {
    console.error(`[KVN] Não foi possível carregar "${asset.name}" para pré-escuta.`);
  });

  wrapper.addEventListener("click", (event) => {
    event.stopPropagation();
    if (player.paused) {
      player.play().catch((error) => {
        console.error(`[KVN] Falha ao tocar "${asset.name}":`, error);
      });
    } else {
      player.pause();
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
