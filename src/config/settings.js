/**
 * Configuração centralizada do KVN Library.
 *
 * Para o MVP, o caminho da biblioteca é fixo. A arquitetura mantém esse valor
 * em um único lugar para que uma futura tela de configurações (V4) possa
 * sobrescrevê-lo (ex.: lendo de "plugin-data:/settings.json") sem precisar
 * tocar no restante do código, que sempre consulta getLibraryRootPath().
 */

const PLUGIN_NAME = "KVN Library";

const DEFAULT_LIBRARY_ROOT_PATH = "D:/KVN/Premiere Library";

function getLibraryRootPath() {
  return DEFAULT_LIBRARY_ROOT_PATH;
}

module.exports = {
  PLUGIN_NAME,
  getLibraryRootPath,
};
