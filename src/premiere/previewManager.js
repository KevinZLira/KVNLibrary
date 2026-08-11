/**
 * Pré-escuta de um asset usando o Source Monitor do próprio Premiere -
 * abre o arquivo direto pelo caminho em disco (sem precisar importar pro
 * projeto) e toca usando o motor de áudio nativo do Premiere. Diferente de
 * tocar dentro do painel, que não é possível nesse ambiente (o UXP não
 * expõe Web Audio API nem <audio>, e o <video> aceita play() mas nunca
 * decodifica de fato - testado exaustivamente).
 *
 * `SourceMonitor.openFilePath()` e `SourceMonitor.play()` são confirmados
 * na referência oficial (ppro-reference/classes/sourcemonitor.md).
 */

const ppro = require("./premiereBridge");
const projectManager = require("./projectManager");

// Pequena espera entre abrir o clipe e mandar tocar - openFilePath()
// resolve antes do Source Monitor terminar de carregar o clipe de fato,
// então um play() imediato às vezes não "pega".
const PLAY_DELAY_MS = 400;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function previewAsset(asset) {
  const project = await projectManager.getActiveProject();
  if (!project) {
    const error = new Error(
      "Nenhum projeto aberto no Premiere Pro. Abra ou crie um projeto antes de pré-escutar."
    );
    error.code = "NO_ACTIVE_PROJECT";
    throw error;
  }

  let opened = false;
  try {
    opened = await ppro.SourceMonitor.openFilePath(asset.path);
  } catch (error) {
    const message = error && typeof error === "object" ? error.message : String(error);
    const wrapped = new Error(`Falha ao abrir "${asset.name}" no Source Monitor: ${message}`);
    wrapped.code = "PREVIEW_OPEN_ERROR";
    throw wrapped;
  }

  if (!opened) {
    const error = new Error(`O Premiere não conseguiu abrir "${asset.name}" no Source Monitor.`);
    error.code = "PREVIEW_OPEN_FAILED";
    throw error;
  }

  await wait(PLAY_DELAY_MS);

  try {
    await ppro.SourceMonitor.play(1);
  } catch (error) {
    const message = error && typeof error === "object" ? error.message : String(error);
    const wrapped = new Error(`Falha ao tocar "${asset.name}" no Source Monitor: ${message}`);
    wrapped.code = "PREVIEW_PLAY_ERROR";
    throw wrapped;
  }
}

module.exports = {
  previewAsset,
};
