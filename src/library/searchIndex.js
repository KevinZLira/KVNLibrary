/**
 * Monta um índice plano (achatado) de todos os assets da biblioteca,
 * varrendo cada categoria recursivamente - só metadado (nome/caminho/
 * tipo/categoria), nenhum preview é carregado aqui, então isso é barato
 * mesmo em bibliotecas com centenas/milhares de arquivos: cada pasta
 * custa uma chamada a Folder.getEntries(), não abre nem lê o conteúdo
 * dos arquivos.
 *
 * asset.category segue o mesmo critério já usado em loadFolderContents
 * (libraryManager.js): é o nome da pasta IMEDIATA que contém o arquivo,
 * não da categoria de topo - assim a busca por categoria continua
 * consistente com o resto do app.
 */

const fsUtils = require("../utils/fsUtils");
const assetManager = require("./assetManager");

async function walkFolder(folderEntry, results) {
  const { directories, files } = await fsUtils.listDirectoryEntries(folderEntry);

  for (const entry of files) {
    results.push(assetManager.toAsset(entry, folderEntry.name));
  }

  for (const directory of directories) {
    await walkFolder(directory, results);
  }
}

async function buildIndex(categories) {
  const results = [];
  for (const category of categories) {
    await walkFolder(category.folderEntry, results);
  }
  return results;
}

module.exports = {
  buildIndex,
};
