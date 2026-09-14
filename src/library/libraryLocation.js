/**
 * Localização da biblioteca: escolhida pelo usuário via seletor de pastas
 * nativo do sistema operacional (funciona igual no Windows e no macOS), e
 * lembrada entre sessões através de um token persistente do UXP.
 *
 * APIs usadas (require("uxp").storage), todas confirmadas na referência
 * oficial (uxp-api/reference-js/modules/uxp/persistent-file-storage):
 * - localFileSystem.getFolder(): abre o seletor nativo de pastas.
 * - localFileSystem.createPersistentToken() / getEntryForPersistentToken():
 *   permite reabrir a mesma pasta em sessões futuras sem pedir de novo.
 *
 * Requer "localFileSystem": "request" no manifest.json (não "fullAccess") -
 * o usuário concede acesso apenas à pasta que ele escolher.
 */

const { localFileSystem, domains } = require("uxp").storage;

const TOKEN_STORAGE_KEY = "kvn-library-folder-token";

/**
 * Abre o seletor nativo de pastas para o usuário escolher (ou trocar) a
 * pasta raiz da biblioteca. Retorna null se o usuário cancelar o seletor.
 */
async function pickLibraryFolder() {
  const folder = await localFileSystem.getFolder({
    initialDomain: domains.userDocuments,
  });

  if (!folder) {
    return null;
  }

  const token = await localFileSystem.createPersistentToken(folder);
  localStorage.setItem(TOKEN_STORAGE_KEY, token);

  return folder;
}

/**
 * Tenta recuperar a pasta escolhida em uma sessão anterior. Retorna null se
 * nunca foi escolhida uma pasta, ou se o token não é mais válido (pasta
 * movida/apagada, permissão revogada pelo usuário/SO etc.) - nesse caso o
 * token inválido é descartado para não insistir nele nas próximas vezes.
 */
async function getStoredLibraryFolder() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) {
    return null;
  }

  try {
    const entry = await localFileSystem.getEntryForPersistentToken(token);
    if (!entry || !entry.isFolder) {
      return null;
    }
    return entry;
  } catch (error) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }
}

function clearLibraryFolder() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

module.exports = {
  pickLibraryFolder,
  getStoredLibraryFolder,
  clearLibraryFolder,
};
