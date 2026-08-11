/**
 * Renderiza a grade de assets de uma categoria. Puramente apresentacional:
 * recebe dados prontos e callbacks de seleção/duplo clique/pré-escuta - a
 * chamada real de API do Premiere fica em src/premiere/previewManager.js.
 *
 * Preview real: usa Entry.url (concedido via seletor de pastas) diretamente
 * em <img>/<video>. Áudio ganha um padrão visual decorativo (ver
 * waveform.js - não é uma forma de onda real, o UXP não expõe Web Audio
 * API nem <audio>) e a pré-escuta é disparada no clique (via onPreviewAsset).
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
  wrapper.title = "Pré-escutar no Source Monitor do Premiere";

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

  return wrapper;
}

function createThumb(asset) {
  if (asset.kind === "image" && asset.url) {
    return createImageThumb(asset);
  }
  if (asset.kind === "video" && asset.url) {
    return createVideoThumb(asset);
  }
  if (asset.kind === "audio") {
    return createAudioThumb(asset);
  }
  return createBadgeThumb(asset);
}

function renderAssets(container, assets, selectedAssetPath, onSelectAsset, onImportAsset, onPreviewAsset) {
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

    // Para áudio, clicar em qualquer lugar do card pré-escuta no Source
    // Monitor do Premiere - não só na tira da forma de onda (o usuário
    // clica onde for mais natural, ex.: em cima do nome do arquivo).
    card.addEventListener("click", () => {
      onSelectAsset(asset);
      if (asset.kind === "audio" && onPreviewAsset) {
        onPreviewAsset(asset);
      }
    });
    card.addEventListener("dblclick", () => onImportAsset(asset));

    container.appendChild(card);
  }
}

module.exports = {
  renderAssets,
};
