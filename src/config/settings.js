/**
 * Configuração centralizada do KVN Library.
 *
 * A localização da biblioteca não é mais um caminho fixo no código (isso só
 * funcionaria em uma máquina/SO específico). Ela é escolhida pelo usuário via
 * seletor de pastas nativo e persistida por um token - ver
 * src/library/libraryLocation.js.
 */

const PLUGIN_NAME = "KVN Library";

module.exports = {
  PLUGIN_NAME,
};
