/**
 * Responsável exclusivamente por descobrir as categorias da biblioteca:
 * cada subpasta de primeiro nível dentro de getLibraryRootPath() vira uma
 * categoria. Nenhuma alteração de código é necessária para adicionar uma
 * categoria nova - basta criar a pasta no disco.
 */

const fsUtils = require("../utils/fsUtils");
const { getLibraryRootPath } = require("../config/settings");

async function getCategories() {
  const rootPath = getLibraryRootPath();
  const exists = await fsUtils.pathExists(rootPath);

  if (!exists) {
    const error = new Error(
      `Biblioteca não encontrada em "${rootPath}". Verifique se a pasta existe e se o caminho está correto.`
    );
    error.code = "LIBRARY_NOT_FOUND";
    throw error;
  }

  const { directories } = await fsUtils.listDirectoryEntries(rootPath);

  return directories
    .map((dir) => ({ name: dir.name, path: dir.path }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  getCategories,
};
