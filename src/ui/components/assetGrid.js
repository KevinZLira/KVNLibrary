/**
 * Renderiza a grade de assets de uma categoria. Puramente apresentacional:
 * recebe dados prontos e callbacks de seleção/duplo clique/pré-escuta - a
 * chamada real de API do Premiere fica em src/premiere/previewManager.js.
 *
 * Thumbnail de imagem: usa Entry.url (concedido via seletor de pastas)
 * numa <img> normal, exibida direto na tela. Vídeo não tem thumbnail
 * real nesse ambiente - cai num badge (ver createImageThumb pra
 * detalhes de por que a técnica antiga, via <canvas>.drawImage(), foi
 * abandonada). Áudio ganha um padrão visual decorativo (ver waveform.js
 * - não é uma forma de onda real, o UXP não expõe Web Audio API nem
 * <audio>) e a pré-escuta é disparada no clique (via onPreviewAsset).
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
const { storage } = require("uxp");

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

const IMAGE_MIME_BY_EXTENSION = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

// object URLs criadas via URL.createObjectURL() pra thumbnail de
// imagem (ver createImageThumb) ficam vivas até serem revogadas
// explicitamente - nunca são liberadas sozinhas. Cada renderAssets()
// descarta os cards da renderização anterior (container.innerHTML),
// então é o ponto certo pra revogar as URLs criadas por eles também,
// senão cada troca de pasta vaza memória.
const activeObjectUrls = new Set();

function revokeActiveObjectUrls() {
  for (const url of activeObjectUrls) {
    URL.revokeObjectURL(url);
  }
  activeObjectUrls.clear();
}

function createBadgeThumb(asset) {
  const thumb = document.createElement("div");
  thumb.className = `kvn-asset-thumb kvn-asset-thumb-${asset.kind}`;
  thumb.textContent = KIND_LABEL[asset.kind] || "FILE";
  return thumb;
}

/**
 * Confirmado no painel real (console do DevTools via UDT "Inspect"):
 * `ctx.drawImage is not a function` - o contexto 2d do <canvas> nesse
 * webview do UXP simplesmente não implementa drawImage(). Não era um
 * problema de decodificação - o vídeo testado decodificou certinho
 * ("loadeddata" disparou com videoSize=3840x2160 correto) - o erro
 * acontecia bem depois, na hora de tentar desenhar o frame no canvas.
 * A técnica antiga (vídeo/imagem escondidos, frame desenhado via
 * drawImage() num canvas visível) nunca teve como funcionar aqui. A
 * forma de onda de áudio continua funcionando porque desenha com
 * fillRect()/linhas, que não depende de drawImage().
 *
 * Vídeo: sem alternativa conhecida pra gerar thumbnail real nesse
 * ambiente (o <video> também não pinta nada sozinho na tela, testado
 * antes) - cai direto no badge (kind + nome), sem tentar carregar o
 * arquivo pra isso.
 *
 * Imagem: usar entry.url direto como src de <img>/Image() falhou de
 * duas formas diferentes nos testes reais - um Image() fora do DOM
 * nunca disparava nem "load" nem "error" (preso pra sempre), e uma
 * <img> de verdade dentro do DOM disparava "error" (confirmado no
 * console). entry.url é um esquema interno do UXP (formato real visto
 * no console: "blob:/blob-1/Pasta/arquivo.png") - não necessariamente
 * pensado pra ser consumido direto por toda API que aceita uma URL de
 * imagem, mesmo funcionando bem como src de <video>.
 *
 * Por isso agora os BYTES do arquivo são lidos de verdade via
 * entry.read() (API de leitura de arquivo do UXP, não tem relação com
 * entry.url) e viram um Blob local, do qual URL.createObjectURL()
 * gera uma blob: URL padrão da Web - essa sim garantidamente aceita
 * por <img>, já que não depende de nenhum esquema específico do UXP.
 */
function createImageThumb(asset, observer) {
  const img = document.createElement("img");
  img.className = "kvn-asset-thumb kvn-asset-thumb-image-el";
  img.alt = asset.name;

  img.addEventListener("load", () => {
    console.log(`[KVN] img carregada - "${asset.name}" natural=${img.naturalWidth}x${img.naturalHeight}`);
  });
  img.addEventListener("error", (event) => {
    console.error(`[KVN] img erro (blob local) - "${asset.name}"`, event);
    img.replaceWith(createBadgeThumb(asset));
  });

  img.kvnLoad = async () => {
    console.log(`[KVN] kvnLoad (img) - "${asset.name}" lendo via entry.read()`);
    try {
      const buffer = await asset.fileEntry.read({ format: storage.formats.binary });
      const mimeType = IMAGE_MIME_BY_EXTENSION[asset.extension] || "application/octet-stream";
      const blob = new Blob([buffer], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      activeObjectUrls.add(objectUrl);
      console.log(`[KVN] entry.read() ok - "${asset.name}" bytes=${buffer.byteLength} objectUrl=${objectUrl}`);
      img.src = objectUrl;
    } catch (error) {
      console.error(`[KVN] entry.read() erro - "${asset.name}"`, error);
      img.replaceWith(createBadgeThumb(asset));
    }
  };
  observer.observe(img);
  return img;
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
  if (asset.kind === "audio") {
    return createAudioThumb(asset, observer);
  }
  // "video" cai aqui de propósito - sem drawImage() nesse canvas 2d e
  // sem <video> pintando sozinho na tela, não tem como gerar thumbnail
  // real de vídeo nesse ambiente (ver comentário em createImageThumb).
  return createBadgeThumb(asset);
}

function renderAssets(container, assets, selectedAssetPath, onSelectAsset, onImportAsset, onPreviewAsset) {
  revokeActiveObjectUrls();
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
