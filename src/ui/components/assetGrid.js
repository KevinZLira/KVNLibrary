/**
 * Renderiza a grade de assets de uma categoria. Puramente apresentacional:
 * recebe dados prontos e callbacks de seleção/duplo clique/pré-escuta - a
 * chamada real de API do Premiere fica em src/premiere/previewManager.js.
 *
 * Preview real: usa Entry.url (concedido via seletor de pastas) num
 * <img>/<video> escondido (hideMediaSource) só como fonte de dados - o
 * frame decodificado é desenhado num <canvas> visível via drawImage()
 * (drawMediaFrameToCanvas). Nesse webview do UXP, <img>/<video> não
 * pintam nada sozinhos mesmo carregando com sucesso, mas canvas
 * desenhado direto funciona. Áudio ganha um padrão visual decorativo
 * (ver waveform.js - não é uma forma de onda real, o UXP não expõe Web
 * Audio API nem <audio>) e a pré-escuta é disparada no clique (via
 * onPreviewAsset).
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

// Fila global de carregamento de vídeo - só um vídeo decodifica por vez,
// mesmo que vários cards fiquem visíveis ao mesmo tempo (ex.: rolar a
// grade rápido faz o observer disparar 6+ kvnLoad quase juntos). Cada
// vídeo com preload="auto" pode ser um clipe 4K pesado - decodificar
// vários ao mesmo tempo é o suspeito nº1 do painel ficando instável
// (ex.: a forma de onda de áudio parar de aparecer logo depois de
// testar uma pasta cheia de vídeo 4K, sem nenhum código de áudio ter
// mudado).
const videoLoadQueue = [];
let videoLoadInFlight = false;

function processVideoQueue() {
  if (videoLoadInFlight || videoLoadQueue.length === 0) {
    return;
  }
  videoLoadInFlight = true;
  const { video, url } = videoLoadQueue.shift();
  const finish = () => {
    videoLoadInFlight = false;
    processVideoQueue();
  };
  video.addEventListener("loadeddata", finish, { once: true });
  video.addEventListener("error", finish, { once: true });
  video.preload = "auto";
  video.src = url;
}

function enqueueVideoLoad(video, url) {
  videoLoadQueue.push({ video, url });
  processVideoQueue();
}

/**
 * <img>/<video> sozinhos não pintam nada nesse webview do UXP mesmo
 * carregando com sucesso (confirmado no painel real: "loadeddata"
 * dispara com videoWidth/videoHeight corretos - o frame É decodificado
 * internamente - mas a tela continua preta). Canvas com fillRect()
 * comprovadamente funciona (a forma de onda de áudio aparece). Por
 * isso o elemento de mídia real fica escondido, só usado como fonte
 * pra desenhar o frame decodificado num canvas via drawImage() - o
 * canvas é o que de fato aparece na tela.
 */
function drawMediaFrameToCanvas(source, canvas, assetName) {
  try {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    console.log(`[KVN] frame desenhado no canvas - "${assetName}"`);
    return true;
  } catch (error) {
    console.error(`[KVN] drawImage erro - "${assetName}"`, error);
    return false;
  }
}

/**
 * Esconde um <img>/<video> visualmente sem tirar ele do layout/DOM
 * (nada de display:none) - em alguns engines display:none impede o
 * elemento de sequer carregar/decodificar. position:absolute com
 * 1x1px + opacity:0 tira ele do fluxo normal (o canvas irmão continua
 * ocupando 100% do wrapper) sem arriscar isso.
 */
function hideMediaSource(el) {
  el.style.position = "absolute";
  el.style.width = "1px";
  el.style.height = "1px";
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
}

function createImageThumb(asset, observer) {
  const wrapper = document.createElement("div");
  wrapper.className = "kvn-asset-thumb kvn-asset-thumb-canvas-wrap";

  const canvas = document.createElement("canvas");
  canvas.className = "kvn-asset-thumb-canvas";
  canvas.width = 304;
  canvas.height = 187;
  wrapper.appendChild(canvas);

  const img = document.createElement("img");
  img.alt = asset.name;
  hideMediaSource(img);
  wrapper.appendChild(img);

  img.addEventListener("load", () => {
    console.log(`[KVN] img carregada - "${asset.name}" natural=${img.naturalWidth}x${img.naturalHeight}`);
    if (!drawMediaFrameToCanvas(img, canvas, asset.name)) {
      wrapper.replaceWith(createBadgeThumb(asset));
    }
  });
  img.addEventListener("error", (event) => {
    console.error(`[KVN] img erro - "${asset.name}" url=${asset.url}`, event);
    wrapper.replaceWith(createBadgeThumb(asset));
  });
  wrapper.kvnLoad = () => {
    console.log(`[KVN] kvnLoad (img) - "${asset.name}" url=${asset.url}`);
    img.src = asset.url;
  };
  observer.observe(wrapper);
  return wrapper;
}

function createVideoThumb(asset, observer) {
  const wrapper = document.createElement("div");
  wrapper.className = "kvn-asset-thumb kvn-asset-thumb-canvas-wrap";

  const canvas = document.createElement("canvas");
  canvas.className = "kvn-asset-thumb-canvas";
  canvas.width = 304;
  canvas.height = 187;
  wrapper.appendChild(canvas);

  const video = document.createElement("video");
  video.muted = true;
  hideMediaSource(video);
  wrapper.appendChild(video);

  video.addEventListener("loadeddata", () => {
    console.log(`[KVN] video loadeddata - "${asset.name}" videoSize=${video.videoWidth}x${video.videoHeight}`);
    if (!drawMediaFrameToCanvas(video, canvas, asset.name)) {
      wrapper.replaceWith(createBadgeThumb(asset));
    }
  });
  video.addEventListener("error", (event) => {
    console.error(`[KVN] video erro - "${asset.name}" url=${asset.url}`, event);
    wrapper.replaceWith(createBadgeThumb(asset));
  });
  wrapper.kvnLoad = () => {
    console.log(`[KVN] kvnLoad (video) - "${asset.name}" url=${asset.url}`);
    enqueueVideoLoad(video, asset.url);
  };
  observer.observe(wrapper);
  return wrapper;
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
    console.log(`[KVN] kvnLoad (audio) - "${asset.name}"`);
    waveform.drawGeneratedWaveform(canvas, asset.name);
    const rect = canvas.getBoundingClientRect();
    console.log(
      `[KVN] canvas depois de desenhar - rect=${rect.width.toFixed(1)}x${rect.height.toFixed(1)} buffer=${canvas.width}x${canvas.height}`
    );
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

  // root explícito (a área com scroll de verdade, .kvn-library-main) em
  // vez de root:null (viewport do documento) - o painel não rola no
  // nível do documento, só essa div interna, e sem apontar isso o
  // observer nunca reportava interseção nenhuma nesse ambiente (nenhuma
  // thumbnail chegava a carregar). ".kvn-view" era a classe antiga, de
  // antes do redesign da árvore+grade - não existe mais como ancestral
  // da grade, então o observer estava silenciosamente sem root nenhum.
  const observerRoot = container.closest(".kvn-library-main");
  console.log(`[KVN] renderAssets - ${assets.length} asset(s), observerRoot=${observerRoot ? "achado" : "NULO"}`);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        console.log(
          `[KVN] observer entry - ${entry.target.tagName} isIntersecting=${entry.isIntersecting} ratio=${entry.intersectionRatio.toFixed(2)}`
        );
        if (!entry.isIntersecting) {
          continue;
        }
        if (typeof entry.target.kvnLoad === "function") {
          entry.target.kvnLoad();
        }
        observer.unobserve(entry.target);
      }
    },
    { root: observerRoot, rootMargin: LAZY_ROOT_MARGIN }
  );

  function appendCard(asset) {
    const card = document.createElement("div");
    card.className = "kvn-asset-card";
    card.dataset.assetPath = asset.path;
    if (asset.path === selectedAssetPath) {
      card.classList.add("kvn-asset-selected");
    }

    const thumb = createThumb(asset, observer);

    // Proporção da "tela" travada em 304:187 (a mesma do rascunho) via
    // padding-top percentual - técnica clássica que funciona em
    // qualquer engine, ao contrário de aspect-ratio (que não dimensiona
    // o elemento nesse webview do UXP e fazia o thumb sumir por
    // completo). O elemento real do thumb fica absolute, preenchendo
    // esse frame.
    const thumbFrame = document.createElement("div");
    thumbFrame.className = "kvn-asset-thumb-frame";
    thumbFrame.appendChild(thumb);

    // O nome já inclui a extensão (ex.: "Arquivo1.wav") - sem badge
    // separado, igual ao rascunho.
    const name = document.createElement("div");
    name.className = "kvn-asset-name";
    name.textContent = asset.name;

    card.appendChild(thumbFrame);
    card.appendChild(name);

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
