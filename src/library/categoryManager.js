/**
 * Responsável exclusivamente por descobrir as categorias da biblioteca:
 * cada subpasta de primeiro nível da pasta escolhida pelo usuário vira uma
 * categoria. Nenhuma alteração de código é necessária para adicionar uma
 * categoria nova - basta criar a pasta no disco.
 *
 * As DEFAULT_CATEGORY_NAMES são criadas automaticamente (ver
 * ensureDefaultCategories, chamada por libraryManager ao escolher uma
 * biblioteca) e sempre aparecem primeiro na lista, nessa ordem fixa -
 * "fixadas no topo" - com qualquer outra pasta que o usuário criar
 * depois entrando alfabeticamente atrás delas.
 */

const fsUtils = require("../utils/fsUtils");

const DEFAULT_CATEGORY_NAMES = ["Transições", "Sound Effects", "Overlays", "Elementos", "Predefinições"];

async function getCategories(libraryFolder) {
  const { directories } = await fsUtils.listDirectoryEntries(libraryFolder);

  const categories = directories.map((entry) => ({
    name: entry.name,
    path: entry.nativePath,
    folderEntry: entry,
  }));

  const defaultOrder = new Map(DEFAULT_CATEGORY_NAMES.map((name, index) => [name.toLowerCase(), index]));

  return categories.sort((a, b) => {
    const aRank = defaultOrder.has(a.name.toLowerCase()) ? defaultOrder.get(a.name.toLowerCase()) : Infinity;
    const bRank = defaultOrder.has(b.name.toLowerCase()) ? defaultOrder.get(b.name.toLowerCase()) : Infinity;
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Cria as pastas de categoria padrão que ainda não existirem na raiz da
 * biblioteca (idempotente - não sobrescreve nem duplica as que já
 * existem, comparando por nome sem diferenciar maiúsculas/minúsculas).
 * Chamada uma vez ao escolher/trocar a pasta da biblioteca, não em
 * todo carregamento - se o usuário apagar uma dessas pastas de
 * propósito, ela não volta sozinha.
 */
async function ensureDefaultCategories(libraryFolder) {
  const { directories } = await fsUtils.listDirectoryEntries(libraryFolder);
  const existingNames = new Set(directories.map((entry) => entry.name.toLowerCase()));

  for (const name of DEFAULT_CATEGORY_NAMES) {
    if (!existingNames.has(name.toLowerCase())) {
      await libraryFolder.createFolder(name);
    }
  }
}

module.exports = {
  getCategories,
  ensureDefaultCategories,
};
