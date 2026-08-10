/**
 * Insere um asset na sequência ativa, na posição atual do playhead, sempre
 * na última trilha de vídeo e de áudio que estiver vazia (mesmo
 * comportamento do Mister Horse Animation/Composer) - assim nunca sobrepõe
 * um clipe já existente e o usuário não precisa mover nada depois.
 *
 * Baseado no padrão oficial da Adobe - SequenceEditor.getEditor(),
 * SequenceEditor.createInsertProjectItemAction(), Project.executeTransaction()
 * dentro de Project.lockedAccess() - confirmado no sample oficial
 * (uxp-premiere-pro-samples/sample-panels/premiere-api/src/sequenceEditor.ts).
 * A detecção de trilha vazia usa Sequence.getVideoTrack()/getAudioTrack() +
 * Track.getTrackItems(Constants.TrackItemType.CLIP, false), documentados na
 * referência oficial (ppro-reference/classes/sequence.md, videotrack.md,
 * audiotrack.md).
 *
 * Limitações conhecidas (documentadas, não contornadas às escondidas):
 * - O ProjectItem recém-importado é localizado pelo nome do arquivo dentro
 *   do bin raiz do projeto, já que Project.importFiles() não retorna uma
 *   referência direta ao item criado. Em caso raro de dois arquivos com o
 *   mesmo nome já existirem no projeto, o primeiro encontrado é usado.
 * - Se nenhuma trilha de vídeo (ou de áudio) estiver vazia, uma trilha nova
 *   é criada acima das existentes - comportamento documentado da própria
 *   createInsertProjectItemAction ("se o índice passado for maior que a
 *   contagem atual de trilhas, uma nova trilha é criada").
 */

const ppro = require("./premiereBridge");
const projectManager = require("./projectManager");

/**
 * Procura, de cima para baixo, a trilha (vídeo ou áudio) mais alta que não
 * tenha nenhum clipe. Se todas tiverem conteúdo, retorna a contagem atual de
 * trilhas - createInsertProjectItemAction cria uma trilha nova nesse índice.
 */
async function findLastEmptyTrackIndex(sequence, kind) {
  const getCount = () =>
    kind === "video" ? sequence.getVideoTrackCount() : sequence.getAudioTrackCount();
  const getTrack = (index) =>
    kind === "video" ? sequence.getVideoTrack(index) : sequence.getAudioTrack(index);

  const count = await getCount();
  for (let index = count - 1; index >= 0; index--) {
    const track = await getTrack(index);
    // A referência oficial documenta getTrackItems() como síncrono (retorna
    // o array direto, sem Promise), mas o binding nativo desta versão do
    // Premiere devolveu uma Promise na prática - Promise.resolve()+await
    // funciona nos dois casos sem assumir qual é real.
    const clipItems = await Promise.resolve(
      track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false)
    );
    if (!clipItems || clipItems.length === 0) {
      return index;
    }
  }
  return count;
}

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

  const [videoTrackIndex, audioTrackIndex] = await Promise.all([
    findLastEmptyTrackIndex(sequence, "video"),
    findLastEmptyTrackIndex(sequence, "audio"),
  ]);

  let success = false;
  try {
    project.lockedAccess(() => {
      success = project.executeTransaction((compoundAction) => {
        const insertAction = sequenceEditor.createInsertProjectItemAction(
          projectItem,
          playheadTime,
          videoTrackIndex,
          audioTrackIndex,
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
