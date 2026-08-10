/**
 * Importação de assets para o projeto atual do Premiere.
 *
 * Usa Project.importFiles(filePaths, suppressUI, targetBin, asNumberedStills),
 * passando targetBin como undefined para importar direto na raiz do
 * Project Panel - o mesmo padrão usado no sample oficial da Adobe
 * (uxp-premiere-pro-samples/sample-panels/premiere-api/src/import.ts).
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

  // DIAGNÓSTICO TEMPORÁRIO - remover depois de identificar o erro real.
  console.log("[KVN] Chamando project.importFiles() com:", [asset.path]);

  let success = false;
  try {
    success = await project.importFiles([asset.path], true, undefined, false);
    console.log("[KVN] project.importFiles() retornou:", success);
  } catch (error) {
    console.log(
      "[KVN] project.importFiles() lançou erro:",
      error,
      "| typeof:",
      typeof error,
      "| String(error):",
      String(error),
      "| keys:",
      error && typeof error === "object" ? Object.keys(error) : "n/a"
    );
    const wrapped = new Error(`Falha ao importar "${asset.name}": ${error && error.message}`);
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
