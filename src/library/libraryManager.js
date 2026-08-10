/**
 * Orquestra categoryManager + assetManager e mantém um cache simples em
 * memória para que reabrir uma categoria já visitada não bata no disco de
 * novo. Isso evita varrer a biblioteca inteira sempre que o painel abre -
 * importante para bibliotecas com centenas/milhares de arquivos.
 *
 * O cache só é invalidado explicitamente (botão "Refresh Library").
 */

const categoryManager = require("./categoryManager");
const assetManager = require("./assetManager");

let categoriesCache = null;
const assetsCacheByCategoryPath = new Map();

async function loadCategories() {
  if (!categoriesCache) {
    categoriesCache = await categoryManager.getCategories();
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
  loadCategories,
  loadAssets,
  invalidateCache,
};
