/**
 * Insere um asset na sequência ativa, na posição atual do playhead.
 *
 * Baseado no padrão oficial da Adobe - SequenceEditor.getEditor(),
 * SequenceEditor.createInsertProjectItemAction(), Project.executeTransaction()
 * dentro de Project.lockedAccess() - confirmado no sample oficial
 * (uxp-premiere-pro-samples/sample-panels/premiere-api/src/sequenceEditor.ts).
 *
 * Limitações conhecidas (documentadas, não contornadas às escondidas):
 * - Sempre insere na primeira trilha de vídeo e de áudio (V1/A1, índice 0).
 *   Escolha de trilha fica para uma etapa futura (V3 do roadmap).
 * - O ProjectItem recém-importado é localizado pelo nome do arquivo dentro
 *   do bin raiz do projeto, já que Project.importFiles() não retorna uma
 *   referência direta ao item criado. Em caso raro de dois arquivos com o
 *   mesmo nome já existirem no projeto, o primeiro encontrado é usado.
 */

const ppro = require("./premiereBridge");
const projectManager = require("./projectManager");

const TARGET_VIDEO_TRACK_INDEX = 0;
const TARGET_AUDIO_TRACK_INDEX = 0;

async function findProjectItemByName(project, name) {
  const rootItem = await project.getRootItem();
  const items = await rootItem.getItems();
  return items.find((item) => item.name === name) || null;
}

async function ensureImported(project, asset) {
  const fileName = path.basename(asset.path);
  const existing = await findProjectItemByName(project, fileName);
  if (existing) {
    return existing;
  }

  let imported = false;
  try {
    imported = await project.importFiles([asset.path], true);
  } catch (error) {
    const message = error && typeof error === "object" ? error.message : String(error);
    const wrapped = new Error(`Falha ao importar "${asset.name}": ${message}`);
    wrapped.code = "IMPORT_ERROR";
    throw wrapped;
  }

  if (!imported) {
    const error = new Error(`O Premiere não conseguiu importar "${asset.name}".`);
    error.code = "IMPORT_FAILED";
    throw error;
  }

  const projectItem = await findProjectItemByName(project, fileName);
  if (!projectItem) {
    const error = new Error(
      `"${asset.name}" foi importado, mas não foi possível localizá-lo no projeto para inserir na timeline.`
    );
    error.code = "PROJECT_ITEM_NOT_FOUND";
    throw error;
  }
  return projectItem;
}

async function insertAssetAtPlayhead(asset) {
  const project = await projectManager.getActiveProject();
  if (!project) {
    const error = new Error(
      "Nenhum projeto aberto no Premiere Pro. Abra ou crie um projeto antes de inserir na timeline."
    );
    error.code = "NO_ACTIVE_PROJECT";
    throw error;
  }

  const sequence = await project.getActiveSequence();
  if (!sequence) {
    const error = new Error(
      "Nenhuma sequência ativa. Abra ou crie uma sequência no Premiere antes de inserir na timeline."
    );
    error.code = "NO_ACTIVE_SEQUENCE";
    throw error;
  }

  const projectItem = await ensureImported(project, asset);
  const playheadTime = await sequence.getPlayerPosition();
  const sequenceEditor = ppro.SequenceEditor.getEditor(sequence);

  let success = false;
  try {
    project.lockedAccess(() => {
      success = project.executeTransaction((compoundAction) => {
        const insertAction = sequenceEditor.createInsertProjectItemAction(
          projectItem,
          playheadTime,
          TARGET_VIDEO_TRACK_INDEX,
          TARGET_AUDIO_TRACK_INDEX,
          true
        );
        compoundAction.addAction(insertAction);
      }, "Inserir asset do KVN Library");
    });
  } catch (error) {
    const message = error && typeof error === "object" ? error.message : String(error);
    const wrapped = new Error(`Falha ao inserir "${asset.name}" na timeline: ${message}`);
    wrapped.code = "INSERT_ERROR";
    throw wrapped;
  }

  if (!success) {
    const error = new Error(`O Premiere não conseguiu inserir "${asset.name}" na timeline.`);
    error.code = "INSERT_FAILED";
    throw error;
  }

  return true;
}

module.exports = {
  insertAssetAtPlayhead,
};
