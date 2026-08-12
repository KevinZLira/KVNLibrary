/**
 * Classifica arquivos por extensão em um "kind" (usado só para o badge/ícone
 * na UI - não bloqueia a importação de nenhum tipo de arquivo, já que a API
 * do Premiere não documenta uma lista fechada de formatos suportados por
 * importFiles()) e converte um Entry de arquivo do UXP em um objeto de
 * asset pronto para a UI.
 */

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

function toAsset(entry, categoryLabel) {
  const extension = path.extname(entry.name).toLowerCase();
  return {
    name: entry.name,
    path: entry.nativePath,
    url: entry.url,
    extension,
    kind: getKind(extension),
    category: categoryLabel,
  };
}

module.exports = {
  toAsset,
};
