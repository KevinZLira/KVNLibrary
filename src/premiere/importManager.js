/**
 * Importação de assets para o projeto atual do Premiere.
 *
 * Usa Project.importFiles(filePaths, suppressUI, targetBin, asNumberedStills).
 * O sample oficial da Adobe passa `undefined` explicitamente para targetBin,
 * mas isso causou "Illegal Parameter type" na versão do Premiere testada -
 * aparentemente esse binding nativo não aceita `undefined` explícito nesse
 * parâmetro em todas as versões. Chamando só com os dois primeiros
 * parâmetros (filePaths, suppressUI) evita o problema e ainda importa para
 * a raiz do Project Panel, que é o comportamento padrão quando nenhum bin
 * é especificado.
 *
 * Inserção automática na timeline/playhead NÃO é feita aqui: essa API não
 * foi confirmada na pesquisa inicial e fica para uma etapa futura (V3).
 */

const projectManager = require("./projectManager");

async function importAsset(asset) {
  const project = await projectManager.getActiveProject();

  if (!project) {
    const error = new Error(
      "Nenhum projeto aberto no Premiere Pro. Abra ou crie um projeto antes de importar."
    );
    error.code = "NO_ACTIVE_PROJECT";
    throw error;
  }

  let success = false;
  try {
    success = await project.importFiles([asset.path], true);
  } catch (error) {
    const message = error && typeof error === "object" ? error.message : String(error);
    const wrapped = new Error(`Falha ao importar "${asset.name}": ${message}`);
    wrapped.code = "IMPORT_ERROR";
    throw wrapped;
  }

  if (!success) {
    const error = new Error(`O Premiere não conseguiu importar "${asset.name}".`);
    error.code = "IMPORT_FAILED";
    throw error;
  }

  return true;
}

module.exports = {
  importAsset,
};
