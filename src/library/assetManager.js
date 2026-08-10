/**
 * Responsável por listar os arquivos dentro de uma categoria e classificá-los
 * por extensão. A classificação por "kind" é usada apenas para exibir um
 * badge/ícone na UI - não bloqueia a importação de nenhum tipo de arquivo,
 * já que a API do Premiere não documenta uma lista fechada de formatos
 * suportados por importFiles().
 */

const fsUtils = require("../utils/fsUtils");

const KIND_BY_EXTENSION = {
  ".mp4": "video",
  ".mov": "video",
  ".mxf": "video",
  ".avi": "video",
  ".mkv": "video",
  ".m4v": "video",
  ".wav": "audio",
  ".mp3": "audio",
  ".aac": "audio",
  ".m4a": "audio",
  ".aif": "audio",
  ".aiff": "audio",
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".tif": "image",
  ".tiff": "image",
  ".psd": "image",
  ".ai": "image",
  ".mogrt": "mogrt",
  ".prfpset": "preset",
};

function getKind(extension) {
  return KIND_BY_EXTENSION[extension] || "file";
}

async function getAssetsForCategory(category) {
  const { files } = await fsUtils.listDirectoryEntries(category.path);

  return files
    .map((file) => {
      const extension = path.extname(file.name).toLowerCase();
      return {
        name: file.name,
        path: file.path,
        extension,
        kind: getKind(extension),
        category: category.name,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  getAssetsForCategory,
};
