/**
 * Wrapper fino sobre a API de Entry do UXP (Folder/File), usada para ler a
 * biblioteca local a partir de uma pasta concedida via seletor nativo
 * ("localFileSystem": "request" no manifest.json). Diferente da API "fs"
 * baseada em string de caminho, aqui a navegação é feita chamando
 * Folder.getEntries() a partir de uma referência de pasta já concedida.
 */

const IGNORED_ENTRY_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/**
 * Lê o conteúdo direto (não recursivo) de uma pasta e separa subpastas de
 * arquivos, ambos como Entry do UXP (com .name, .nativePath, etc).
 */
async function listDirectoryEntries(folderEntry) {
  const entries = await folderEntry.getEntries();
  const directories = [];
  const files = [];

  // DIAGNÓSTICO TEMPORÁRIO - remover depois de identificar por que os
  // arquivos não aparecem. Abra o console do UDT (botão "{}" na linha do
  // plugin) para ver esta saída.
  console.log(
    `[KVN] listDirectoryEntries("${folderEntry.name}") -> ${entries.length} entrada(s):`,
    entries.map((e) => ({
      name: e.name,
      isFile: e.isFile,
      isFolder: e.isFolder,
      nativePath: e.nativePath,
    }))
  );

  for (const entry of entries) {
    if (IGNORED_ENTRY_NAMES.has(entry.name)) {
      continue;
    }

    if (entry.isFolder) {
      directories.push(entry);
    } else if (entry.isFile) {
      files.push(entry);
    }
  }

  return { directories, files };
}

module.exports = {
  listDirectoryEntries,
};
