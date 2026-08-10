/**
 * Wrapper fino sobre os módulos globais/nativos do UXP ("fs" e "path")
 * usados para ler a biblioteca local de assets fora do sandbox do plugin.
 * Requer "localFileSystem": "fullAccess" no manifest.json.
 */

const fs = require("fs");

const IGNORED_ENTRY_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

async function pathExists(targetPath) {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Lê o conteúdo direto (não recursivo) de um diretório e separa
 * subpastas de arquivos. Entradas ilegíveis (permissão, link quebrado)
 * são ignoradas silenciosamente em vez de derrubar a listagem inteira.
 */
async function listDirectoryEntries(dirPath) {
  const entryNames = await fs.readdir(dirPath);
  const directories = [];
  const files = [];

  for (const name of entryNames) {
    if (IGNORED_ENTRY_NAMES.has(name)) {
      continue;
    }

    const entryPath = path.join(dirPath, name);

    try {
      const stats = await fs.lstat(entryPath);
      if (stats.isDirectory()) {
        directories.push({ name, path: entryPath });
      } else if (stats.isFile()) {
        files.push({ name, path: entryPath });
      }
    } catch (error) {
      // Entrada não pôde ser lida (permissão insuficiente, etc). Ignorar.
    }
  }

  return { directories, files };
}

module.exports = {
  pathExists,
  listDirectoryEntries,
};
