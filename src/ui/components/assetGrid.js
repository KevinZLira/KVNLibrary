/**
 * Renderiza a grade de assets de uma categoria. Puramente apresentacional:
 * recebe dados prontos e callbacks de seleção/duplo clique/pré-escuta - a
 * chamada real de API do Premiere fica em src/premiere/previewManager.js.
 *
 * Preview real: usa Entry.url (concedido via seletor de pastas) diretamente
 * em <img>/<video>. Áudio ganha um padrão visual decorativo (ver
 * waveform.js - não é uma forma de onda real, o UXP não expõe Web Audio
 * API nem <audio>) e a pré-escuta é disparada no clique (via onPreviewAsset).
 *
 * Carregamento sob demanda: numa pasta com muitos arquivos, criar todos os
 * cards já disparando o carregamento de cada <img>/<video> ao mesmo tempo
 * trava o painel (cada um decodifica de imediato). Por isso o src só é
 * atribuído quando o card entra (ou está perto de entrar) na área visível,
 * via IntersectionObserver - um observer novo por chamada de renderAssets,
 * descartado junto com os cards antigos ao trocar de pasta.
 *
 * Renderização em lotes: mesmo sem carregar mídia nenhuma, criar milhares
 * de elementos de card (+ registrar cada um no observer) num laço síncrono
 * só trava o painel de outro jeito. Por isso os cards são criados em lotes
 * pequenos, um por frame (requestAnimationFrame), deixando a interface
 * respirar entre eles.
 */

const waveform = require("./waveform");

const LAZY_ROOT_MARGIN = "300px";
const RENDER_CHUNK_SIZE = 40;

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

function createImageThumb(asset, observer) {
  const img = document.createElement("img");
  img.className = "kvn-asset-thumb kvn-asset-thumb-media";
  img.alt = asset.name;
  img.addEventListener("error", () => {
    img.replaceWith(createBadgeThumb(asset));
  });
  img.kvnLoad = () => {
    img.src = asset.url;
  };
  observer.observe(img);
  return img;
}

function createVideoThumb(asset, observer) {
  const video = document.createElement("video");
  video.className = "kvn-asset-thumb kvn-asset-thumb-media";
  video.muted = true;
  video.addEventListener("error", () => {
    video.replaceWith(createBadgeThumb(asset));
  });
  video.kvnLoad = () => {
    video.preload = "metadata";
    video.src = asset.url;
  };
  observer.observe(video);
  return video;
}

function createAudioThumb(asset, observer) {
  const wrapper = document.createElement("div");
  wrapper.className = "kvn-asset-thumb kvn-audio-thumb";
  wrapper.title = "Pré-escutar no Source Monitor do Premiere";

  const canvas = document.createElement("canvas");
  canvas.className = "kvn-audio-waveform";
  canvas.width = 240;
  canvas.height = 68;
  wrapper.appendChild(canvas);

  const playIcon = document.createElement("div");
  playIcon.className = "kvn-audio-thumb-play";
  playIcon.textContent = "▶";
  wrapper.appendChild(playIcon);

  wrapper.kvnLoad = () => {
    waveform.drawGeneratedWaveform(canvas, asset.name);
  };
  observer.observe(wrapper);

  return wrapper;
}

function createThumb(asset, observer) {
  if (asset.kind === "image" && asset.url) {
    return createImageThumb(asset, observer);
  }
  if (asset.kind === "video" && asset.url) {
    return createVideoThumb(asset, observer);
  }
  if (asset.kind === "audio") {
    return createAudioThumb(asset, observer);
  }
  return createBadgeThumb(asset);
}

function renderAssets(container, assets, selectedAssetPath, onSelectAsset, onImportAsset, onPreviewAsset) {
  container.innerHTML = "";

  // Identifica essa chamada específica de renderAssets - se uma navegação
  // nova acontecer antes dos lotes acabarem, o laço abaixo para de
  // adicionar cards no container (que já pertence à renderização nova).
  const renderToken = (container.kvnRenderToken || 0) + 1;
  container.kvnRenderToken = renderToken;

  if (assets.length === 0) {
    const empty = document.createElement("p");
    empty.className = "kvn-empty-state";
    empty.textContent = "Nenhum arquivo aqui.";
    container.appendChild(empty);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        if (typeof entry.target.kvnLoad === "function") {
          entry.target.kvnLoad();
        }
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: LAZY_ROOT_MARGIN }
  );

  function appendCard(asset) {
    const card = document.createElement("div");
    card.className = "kvn-asset-card";
    card.dataset.assetPath = asset.path;
    if (asset.path === selectedAssetPath) {
      card.classList.add("kvn-asset-selected");
    }

    const thumb = createThumb(asset, observer);

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

  let index = 0;
  function appendChunk() {
    if (container.kvnRenderToken !== renderToken) {
      return;
    }
    const end = Math.min(index + RENDER_CHUNK_SIZE, assets.length);
    for (; index < end; index++) {
      appendCard(assets[index]);
    }
    if (index < assets.length) {
      requestAnimationFrame(appendChunk);
    }
  }
  appendChunk();
}

/**
 * Atualiza só o destaque visual do card selecionado, sem recriar a grade -
 * chamado a cada seleção de asset, que é bem mais frequente que uma
 * navegação de pasta de verdade.
 */
function updateSelection(container, selectedAssetPath) {
  const cards = container.querySelectorAll(".kvn-asset-card");
  cards.forEach((card) => {
    card.classList.toggle("kvn-asset-selected", card.dataset.assetPath === selectedAssetPath);
  });
}

module.exports = {
  renderAssets,
  updateSelection,
};
