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

let cachedLibraryFolder = null;
let categoriesCache = null;
const assetsCacheByCategoryPath = new Map();

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

async function loadAssets(category) {
  if (assetsCacheByCategoryPath.has(category.path)) {
    return assetsCacheByCategoryPath.get(category.path);
  }
  const assets = await assetManager.getAssetsForCategory(category);
  assetsCacheByCategoryPath.set(category.path, assets);
  return assets;
}

function invalidateCache() {
  categoriesCache = null;
  assetsCacheByCategoryPath.clear();
}

module.exports = {
  getLibraryFolder,
  chooseLibraryFolder,
  loadCategories,
  loadAssets,
  invalidateCache,
};
