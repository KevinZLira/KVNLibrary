/**
 * Controlador da UI do painel KVN Library. Liga os módulos de biblioteca e
 * de Premiere aos componentes visuais. Inicializa no evento "load" da
 * janela do painel (mesmo padrão do sample oficial da Adobe), já que os
 * hooks de ciclo de vida hide()/destroy() de painel não são confiáveis no
 * Premiere no momento.
 *
 * Navegação: árvore fixa na esquerda (accordion - um ramo aberto por vez
 * em cada nível) + grade fixa na direita, sempre visíveis juntas. A grade
 * mostra sempre o conteúdo da pasta mais profunda de navigationStack (a
 * "pasta ativa"), em espelho com o que está expandido na árvore.
 */

const libraryManager = require("../library/libraryManager");
const importManager = require("../premiere/importManager");
const timelineManager = require("../premiere/timelineManager");
const previewManager = require("../premiere/previewManager");
const projectManager = require("../premiere/projectManager");
const { renderLibraryTree, updateTreeSelection } = require("./components/libraryTree");
const { renderAssets, updateSelection } = require("./components/assetGrid");
const { showStatus, clearStatus } = require("./components/statusBar");

const elements = {};

// Pilha de pastas expandidas a partir de uma categoria de topo (mesma
// pasta por nível - accordion). Vazia = nenhuma categoria de topo
// selecionada ainda. A pasta ativa (grade da direita) é sempre a última.
let navigationStack = [];
let selectedAsset = null;
let categories = [];

function cacheElements() {
  elements.title = document.getElementById("plugin-title");
  elements.refreshButton = document.getElementById("refresh-button");
  elements.projectStatus = document.getElementById("project-status");
  elements.statusBar = document.getElementById("status-bar");
  elements.noFolderView = document.getElementById("no-folder-view");
  elements.chooseFolderHeaderButton = document.getElementById("choose-folder-header-button");
  elements.libraryView = document.getElementById("library-view");
  elements.libraryTree = document.getElementById("library-tree");
  elements.assetsGrid = document.getElementById("assets-grid");
  elements.actionBar = document.getElementById("action-bar");
  elements.selectedAssetName = document.getElementById("selected-asset-name");
  elements.importButton = document.getElementById("import-button");
  elements.insertButton = document.getElementById("insert-button");
}

function showNoFolderView() {
  navigationStack = [];
  elements.noFolderView.classList.remove("kvn-hidden");
  elements.libraryView.classList.add("kvn-hidden");
  elements.actionBar.classList.add("kvn-hidden");
}

function showLibraryView() {
  elements.noFolderView.classList.add("kvn-hidden");
  elements.libraryView.classList.remove("kvn-hidden");
}

function getActiveFolder() {
  return navigationStack[navigationStack.length - 1] || null;
}

async function updateChooseFolderButtonLabel() {
  const folder = await libraryManager.getLibraryFolder();

  // Mesmo botão do header serve pra escolher a pasta a primeira vez e pra
  // trocar depois - só muda o texto conforme já existe uma pasta ou não.
  elements.chooseFolderHeaderButton.textContent = folder
    ? "Trocar Biblioteca"
    : "Selecionar Biblioteca";
}

/**
 * Recarrega a árvore inteira (categorias + conteúdo de cada nível
 * expandido em navigationStack) e a grade da pasta ativa. É a única forma
 * de "navegar" agora - não existem mais telas separadas de categoria vs.
 * pasta, só re-renderizações desse mesmo par árvore+grade.
 */
async function refreshLibraryView() {
  try {
    categories = await libraryManager.loadCategories();
  } catch (error) {
    if (error.code === "NO_LIBRARY_FOLDER") {
      showNoFolderView();
      return false;
    }
    console.error("[KVN] Erro ao carregar categorias:", error);
    showLibraryView();
    renderLibraryTree(elements.libraryTree, [], [], [], {});
    elements.assetsGrid.innerHTML = "";
    showStatus(elements.statusBar, error.message, "error");
    return false;
  }

  showLibraryView();

  let pathContents = [];
  try {
    pathContents = await Promise.all(
      navigationStack.map((folder) => libraryManager.loadFolderContents(folder))
    );
  } catch (error) {
    console.error("[KVN] Erro ao carregar pastas:", error);
    showStatus(elements.statusBar, error.message, "error");
  }

  renderLibraryTree(elements.libraryTree, categories, navigationStack, pathContents, {
    onSelectFolder: handleSelectFolder,
    onSelectAsset: handleSelectAsset,
    onImportAsset: handleImportAsset,
    selectedAssetPath: selectedAsset && selectedAsset.path,
  });

  const activeContents = pathContents[pathContents.length - 1];
  const activeAssets = activeContents ? activeContents.assets : [];
  renderAssets(
    elements.assetsGrid,
    activeAssets,
    selectedAsset && selectedAsset.path,
    handleSelectAsset,
    handleImportAsset,
    handlePreviewAsset
  );

  return true;
}

/**
 * Clique numa pasta da árvore, em qualquer nível. Se já é a pasta ativa
 * naquele nível, mantém (não fecha o ramo - accordion só troca quem está
 * aberto, não colapsa tudo num clique repetido). Trunca navigationStack
 * em depth antes de empilhar a nova escolha, para fechar qualquer ramo
 * irmão que estivesse aberto nesse nível ou em níveis mais profundos.
 */
function handleSelectFolder(folder, depth) {
  navigationStack = navigationStack.slice(0, depth);
  navigationStack.push(folder);
  selectedAsset = null;
  elements.actionBar.classList.add("kvn-hidden");
  refreshLibraryView();
}

function handleSelectAsset(asset) {
  selectedAsset = asset;
  elements.selectedAssetName.textContent = asset.name;
  elements.actionBar.classList.remove("kvn-hidden");

  // Só atualiza o destaque (árvore + grade) - recriar tudo a cada seleção
  // refazia o carregamento de todo <img>/<video> já carregado, o que
  // travava pastas com muitos arquivos.
  updateSelection(elements.assetsGrid, asset.path);
  updateTreeSelection(elements.libraryTree, asset.path);
}

async function handlePreviewAsset(asset) {
  try {
    await previewManager.previewAsset(asset);
  } catch (error) {
    showStatus(elements.statusBar, error.message, "error");
  }
}

async function handleImportAsset(asset) {
  elements.importButton.classList.add("kvn-btn-disabled");
  try {
    await importManager.importAsset(asset);
    showStatus(elements.statusBar, `"${asset.name}" importado para o Project Panel.`, "success");
  } catch (error) {
    showStatus(elements.statusBar, error.message, "error");
  } finally {
    elements.importButton.classList.remove("kvn-btn-disabled");
  }
}

async function handleInsertAsset(asset) {
  elements.insertButton.classList.add("kvn-btn-disabled");
  try {
    await timelineManager.insertAssetAtPlayhead(asset);
    showStatus(elements.statusBar, `"${asset.name}" inserido na timeline.`, "success");
  } catch (error) {
    showStatus(elements.statusBar, error.message, "error");
  } finally {
    elements.insertButton.classList.remove("kvn-btn-disabled");
  }
}

async function handleRefresh() {
  clearStatus(elements.statusBar);
  libraryManager.invalidateCache();

  const success = await refreshLibraryView();

  // Só mostra "atualizado" se nada deu erro no meio do caminho - senão a
  // mensagem de erro (mostrada dentro de refreshLibraryView) fica escondida.
  if (success) {
    showStatus(elements.statusBar, "Biblioteca atualizada.", "info");
  }
}

async function handleChooseFolder() {
  const folder = await libraryManager.chooseLibraryFolder();
  if (!folder) {
    // Usuário cancelou o seletor de pastas - nada muda.
    return;
  }
  await updateChooseFolderButtonLabel();
  navigationStack = [];
  selectedAsset = null;
  await refreshLibraryView();
  showStatus(elements.statusBar, "Biblioteca atualizada.", "success");
}

/**
 * "Selecionar/Trocar Biblioteca", Importar e Inserir na Timeline são
 * <div role="button"> (não <button> - ver comentário no CSS sobre o
 * botão nativo renderizando cinza nesse webview), então não ganham
 * ativação por teclado de graça como um <button> ganharia.
 */
function makeKeyboardActivatable(element) {
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      element.click();
    }
  });
}

async function updateProjectStatus() {
  const project = await projectManager.getActiveProject();
  elements.projectStatus.textContent = project
    ? `Projeto ativo: ${project.name.replace(/\.\w+$/, "")}`
    : "Nenhum projeto aberto no Premiere Pro.";
}

async function init() {
  cacheElements();

  elements.refreshButton.addEventListener("click", handleRefresh);
  elements.chooseFolderHeaderButton.addEventListener("click", handleChooseFolder);
  elements.importButton.addEventListener("click", () => {
    if (selectedAsset) {
      handleImportAsset(selectedAsset);
    }
  });
  elements.insertButton.addEventListener("click", () => {
    if (selectedAsset) {
      handleInsertAsset(selectedAsset);
    }
  });
  [
    elements.refreshButton,
    elements.chooseFolderHeaderButton,
    elements.importButton,
    elements.insertButton,
  ].forEach(makeKeyboardActivatable);

  projectManager.onProjectActivated(updateProjectStatus);
  await updateProjectStatus();

  await updateChooseFolderButtonLabel();
  await refreshLibraryView();
}

window.addEventListener("load", () => {
  init();
});
