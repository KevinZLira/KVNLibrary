/**
 * Responsável exclusivamente por descobrir as categorias da biblioteca:
 * cada subpasta de primeiro nível da pasta escolhida pelo usuário vira uma
 * categoria. Nenhuma alteração de código é necessária para adicionar uma
 * categoria nova - basta criar a pasta no disco.
 */

const fsUtils = require("../utils/fsUtils");

async function getCategories(libraryFolder) {
  const { directories } = await fsUtils.listDirectoryEntries(libraryFolder);

  return directories
    .map((entry) => ({
      name: entry.name,
      path: entry.nativePath,
      folderEntry: entry,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  getCategories,
};
