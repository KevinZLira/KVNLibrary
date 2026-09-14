/**
 * Acesso ao projeto atualmente ativo no Premiere e a eventos relacionados.
 * Baseado em ppro.Project.getActiveProject() e ppro.EventManager, conforme
 * a referência oficial (classes/project.md, constants/index.md).
 */

const ppro = require("./premiereBridge");

async function getActiveProject() {
  try {
    const project = await ppro.Project.getActiveProject();
    return project || null;
  } catch (error) {
    return null;
  }
}

/**
 * Registra um listener global para o evento ACTIVATED, disparado quando o
 * usuário abre/troca de projeto no Premiere. Usado para manter a UI em
 * sincronia com o estado real (ex.: habilitar/desabilitar importação).
 */
function onProjectActivated(callback) {
  ppro.EventManager.addGlobalEventListener(
    ppro.Constants.ProjectEvent.ACTIVATED,
    callback,
    true // capture phase, conforme exemplo oficial
  );
}

module.exports = {
  getActiveProject,
  onProjectActivated,
};
