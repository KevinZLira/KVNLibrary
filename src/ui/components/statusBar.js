/**
 * Barra de mensagens do painel: erros permanecem visíveis até a próxima
 * ação do usuário, mensagens de sucesso/info somem sozinhas.
 */

let dismissTimer = null;

function showStatus(element, message, type) {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  element.textContent = message;
  element.className = `kvn-status-bar kvn-status-${type}`;

  if (type !== "error") {
    dismissTimer = setTimeout(() => {
      element.classList.add("kvn-hidden");
    }, 4000);
  }
}

function clearStatus(element) {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  element.textContent = "";
  element.className = "kvn-status-bar kvn-hidden";
}

module.exports = {
  showStatus,
  clearStatus,
};
