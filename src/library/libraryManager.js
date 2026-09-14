/**
 * Orquestra libraryLocation + categoryManager + assetManager, e mantém um
 * cache simples em memória para que reabrir uma categoria já visitada não
 * bata no disco de novo. Isso evita varrer a biblioteca inteira sempre que
 * o painel abre - importante para bibliotecas com centenas/milhares de
 * arquivos.
 *
 * O cache de categorias/assets só é invalidado explicitamente (botão
 * "Refresh Library" ou ao trocar de pasta).
 */

const libraryLocation = require("./libraryLocation");
const categoryManager = require("./categoryManager");
const assetManager = require("./assetManager");
const searchIndex = require("./searchIndex");
const fsUtils = require("../utils/fsUtils");

let cachedLibraryFolder = null;
let categoriesCache = null;
const folderContentsCache = new Map();
let searchIndexCache = null;

/**
 * Retorna a pasta da biblioteca já escolhida em uma sessão anterior, ou
 * null se o usuário ainda não escolheu nenhuma.
 */
async function getLibraryFolder() {
  if (!cachedLibraryFolder) {
    cachedLibraryFolder = await libraryLocation.getStoredLibraryFolder();
  }
  return cachedLibraryFolder;
}

/**
 * Abre o seletor nativo de pastas para o usuário escolher (ou trocar) a
 * biblioteca. Retorna a pasta escolhida, ou null se o usuário cancelar.
 */
async function chooseLibraryFolder() {
  const folder = await libraryLocation.pickLibraryFolder();
  if (folder) {
    cachedLibraryFolder = folder;
    await categoryManager.ensureDefaultCategories(folder);
    invalidateCache();
  }
  return folder;
}

async function loadCategories() {
  const libraryFolder = await getLibraryFolder();
  if (!libraryFolder) {
    const error = new Error("Nenhuma pasta de biblioteca selecionada ainda.");
    error.code = "NO_LIBRARY_FOLDER";
    throw error;
  }

  if (!categoriesCache) {
    categoriesCache = await categoryManager.getCategories(libraryFolder);
  }
  return categoriesCache;
}

/**
 * Lê o conteúdo de uma pasta (uma categoria de topo, ou qualquer subpasta
 * dentro dela) - tanto as subpastas navegáveis quanto os arquivos que
 * estão direto nela. Isso permite organizar cada categoria com quantos
 * níveis de subpastas o usuário quiser (ex.: Transitions/Zoom/arquivo.mp4),
 * em vez de exigir que os arquivos fiquem direto na pasta da categoria.
 *
 * Importante: a pasta é lida uma única vez (fsUtils.listDirectoryEntries).
 * Duas chamadas concorrentes a Folder.getEntries() na mesma pasta (uma para
 * subpastas, outra para arquivos) fazem uma delas voltar vazia - por isso
 * subpastas e arquivos são extraídos da mesma leitura em vez de reler a
 * pasta duas vezes em paralelo.
 */
async function loadFolderContents(folder) {
  if (folderContentsCache.has(folder.path)) {
    return folderContentsCache.get(folder.path);
  }

  const { directories, files } = await fsUtils.listDirectoryEntries(folder.folderEntry);

  const subfolders = directories
    .map((entry) => ({ name: entry.name, path: entry.nativePath, folderEntry: entry }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const assets = files
    .map((entry) => assetManager.toAsset(entry, folder.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const result = { subfolders, assets };
  folderContentsCache.set(folder.path, result);
  return result;
}

/**
 * Busca por nome, categoria (pasta imediata) ou tipo em toda a
 * biblioteca, não só na pasta ativa - varre a árvore inteira uma vez
 * (buildIndex) e reaproveita o resultado nas buscas seguintes até o
 * cache ser invalidado (troca de biblioteca ou Refresh), igual ao
 * cache de categorias/pastas.
 */
async function searchAssets(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const categories = await loadCategories();
  if (!searchIndexCache) {
    searchIndexCache = await searchIndex.buildIndex(categories);
  }

  return searchIndexCache.filter((asset) => {
    return (
      asset.name.toLowerCase().includes(normalized) ||
      asset.category.toLowerCase().includes(normalized) ||
      asset.kind.toLowerCase().includes(normalized)
    );
  });
}

function invalidateCache() {
  categoriesCache = null;
  folderContentsCache.clear();
  searchIndexCache = null;
}

module.exports = {
  getLibraryFolder,
  chooseLibraryFolder,
  loadCategories,
  loadFolderContents,
  searchAssets,
  invalidateCache,
};
