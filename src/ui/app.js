/**
 * Controlador da UI do painel KVN Library. Liga os módulos de biblioteca e
 * de Premiere aos componentes visuais. Inicializa no evento "load" da
 * janela do painel (mesmo padrão do sample oficial da Adobe), já que os
 * hooks de ciclo de vida hide()/destroy() de painel não são confiáveis no
 * Premiere no momento.
 *
 * Navegação: o nível 0 (raiz da biblioteca) sempre mostra só categorias
 * (subpastas). A partir daí, qualquer nível mostra tanto subpastas quanto
 * arquivos - assim o usuário pode organizar cada categoria com quantos
 * níveis de subpasta quiser (ex.: Transitions/Zoom/arquivo.mp4).
 */

const libraryManager = require("../library/libraryManager");
const importManager = require("../premiere/importManager");
const timelineManager = require("../premiere/timelineManager");
const projectManager = require("../premiere/projectManager");
const { PLUGIN_NAME } = require("../config/settings");
const { renderCategories } = require("./components/categoryList");
const { renderAssets } = require("./components/assetGrid");
const { showStatus, clearStatus } = require("./components/statusBar");

const elements = {};

// Pilha de pastas visitadas a partir de uma categoria de topo. Vazia = tela
// de categorias (raiz da biblioteca).
let navigationStack = [];
let selectedAsset = null;

function cacheElements() {
  elements.title = document.getElementById("plugin-title");
  elements.refreshButton = document.getElementById("refresh-button");
  elements.settingsButton = document.getElementById("settings-button");
  elements.settingsInfo = document.getElementById("settings-info");
  elements.libraryPath = document.getElementById("library-path");
  elements.changeFolderButton = document.getElementById("change-folder-button");
  elements.projectStatus = document.getElementById("project-status");
  elements.statusBar = document.getElementById("status-bar");
  elements.noFolderView = document.getElementById("no-folder-view");
  elements.selectFolderButton = document.getElementById("select-folder-button");
  elements.categoriesView = document.getElementById("categories-view");
  elements.categoriesList = document.getElementById("categories-list");
  elements.assetsView = document.getElementById("assets-view");
  elements.subfoldersList = document.getElementById("subfolders-list");
  elements.assetsGrid = document.getElementById("assets-grid");
  elements.activeCategoryLabel = document.getElementById("active-category-label");
  elements.backButton = document.getElementById("back-button");
  elements.actionBar = document.getElementById("action-bar");
  elements.selectedAssetName = document.getElementById("selected-asset-name");
  elements.importButton = document.getElementById("import-button");
  elements.insertButton = document.getElementById("insert-button");
}

function showNoFolderView() {
  navigationStack = [];
  elements.noFolderView.classList.remove("kvn-hidden");
  elements.categoriesView.classList.add("kvn-hidden");
  elements.assetsView.classList.add("kvn-hidden");
  elements.actionBar.classList.add("kvn-hidden");
}

function showCategoriesView() {
  navigationStack = [];
  selectedAsset = null;
  elements.noFolderView.classList.add("kvn-hidden");
  elements.categoriesView.classList.remove("kvn-hidden");
  elements.assetsView.classList.add("kvn-hidden");
  elements.actionBar.classList.add("kvn-hidden");
}

function getCurrentFolder() {
  return navigationStack[navigationStack.length - 1] || null;
}

async function updateLibraryPathDisplay() {
  const folder = await libraryManager.getLibraryFolder();
  elements.libraryPath.textContent = folder
    ? folder.nativePath
    : "Nenhuma pasta selecionada.";
}

async function loadAndRenderCategories() {
  try {
    const categories = await libraryManager.loadCategories();
    showCategoriesView();
    renderCategories(elements.categoriesList, categories, handleSelectFolder);
    return true;
  } catch (error) {
    if (error.code === "NO_LIBRARY_FOLDER") {
      showNoFolderView();
      return false;
    }
    console.error("[KVN] Erro ao carregar categorias:", error);
    showCategoriesView();
    renderCategories(elements.categoriesList, [], () => {});
    showStatus(elements.statusBar, error.message, "error");
    return false;
  }
}

/**
 * Mostra o conteúdo de uma pasta (categoria de topo ou qualquer subpasta
 * dela): subpastas navegáveis e/ou arquivos. Não mexe em navigationStack -
 * quem decide empilhar/desempilhar é o chamador (handleSelectFolder ou
 * handleBack).
 */
function enterFolder(folder) {
  selectedAsset = null;

  elements.activeCategoryLabel.textContent = folder.name.toUpperCase();
  elements.noFolderView.classList.add("kvn-hidden");
  elements.categoriesView.classList.add("kvn-hidden");
  elements.assetsView.classList.remove("kvn-hidden");
  elements.actionBar.classList.add("kvn-hidden");

  loadAndRenderFolderContents(folder);
}

function handleSelectFolder(folder) {
  navigationStack.push(folder);
  enterFolder(folder);
}

function handleBack() {
  navigationStack.pop();
  const parent = getCurrentFolder();
  if (parent) {
    enterFolder(parent);
  } else {
    loadAndRenderCategories();
  }
}

async function loadAndRenderFolderContents(folder) {
  elements.subfoldersList.innerHTML = "";
  elements.assetsGrid.innerHTML = "";

  try {
    const { subfolders, assets } = await libraryManager.loadFolderContents(folder);

    if (subfolders.length === 0 && assets.length === 0) {
      renderAssets(elements.assetsGrid, [], null, handleSelectAsset, handleImportAsset);
      return true;
    }

    if (subfolders.length > 0) {
      renderCategories(elements.subfoldersList, subfolders, handleSelectFolder);
    }
    if (assets.length > 0) {
      renderAssets(
        elements.assetsGrid,
        assets,
        selectedAsset && selectedAsset.path,
        handleSelectAsset,
        handleImportAsset
      );
    }
    return true;
  } catch (error) {
    console.error(`[KVN] Erro ao carregar "${folder.name}":`, error);
    showStatus(elements.statusBar, `Não foi possível ler "${folder.name}": ${error.message}`, "error");
    return false;
  }
}

function handleSelectAsset(asset) {
  selectedAsset = asset;
  elements.selectedAssetName.textContent = asset.name;
  elements.actionBar.classList.remove("kvn-hidden");

  const currentFolder = getCurrentFolder();
  if (!currentFolder) {
    return;
  }

  // Re-render para refletir o card selecionado, usando o cache (sem custo de disco).
  libraryManager.loadFolderContents(currentFolder).then(({ assets }) => {
    renderAssets(elements.assetsGrid, assets, selectedAsset.path, handleSelectAsset, handleImportAsset);
  });
}

async function handleImportAsset(asset) {
  elements.importButton.disabled = true;
  try {
    await importManager.importAsset(asset);
    showStatus(elements.statusBar, `"${asset.name}" importado para o Project Panel.`, "success");
  } catch (error) {
    showStatus(elements.statusBar, error.message, "error");
  } finally {
    elements.importButton.disabled = false;
  }
}

async function handleInsertAsset(asset) {
  elements.insertButton.disabled = true;
  try {
    await timelineManager.insertAssetAtPlayhead(asset);
    showStatus(elements.statusBar, `"${asset.name}" inserido na timeline.`, "success");
  } catch (error) {
    showStatus(elements.statusBar, error.message, "error");
  } finally {
    elements.insertButton.disabled = false;
  }
}

async function handleRefresh() {
  clearStatus(elements.statusBar);
  libraryManager.invalidateCache();

  const currentFolder = getCurrentFolder();
  const success = currentFolder
    ? await loadAndRenderFolderContents(currentFolder)
    : await loadAndRenderCategories();

  // Só mostra "atualizado" se nada deu erro no meio do caminho - senão a
  // mensagem de erro (mostrada dentro das funções acima) fica escondida.
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
  await updateLibraryPathDisplay();
  await loadAndRenderCategories();
  showStatus(elements.statusBar, "Biblioteca atualizada.", "success");
}

function toggleSettingsInfo() {
  elements.settingsInfo.classList.toggle("kvn-hidden");
}

async function updateProjectStatus() {
  const project = await projectManager.getActiveProject();
  elements.projectStatus.textContent = project
    ? `Projeto ativo: ${project.name.replace(/\.\w+$/, "")}`
    : "Nenhum projeto aberto no Premiere Pro.";
}

async function init() {
  cacheElements();

  elements.title.textContent = PLUGIN_NAME;

  elements.refreshButton.addEventListener("click", handleRefresh);
  elements.settingsButton.addEventListener("click", toggleSettingsInfo);
  elements.backButton.addEventListener("click", handleBack);
  elements.selectFolderButton.addEventListener("click", handleChooseFolder);
  elements.changeFolderButton.addEventListener("click", handleChooseFolder);
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

  projectManager.onProjectActivated(updateProjectStatus);
  await updateProjectStatus();

  await updateLibraryPathDisplay();
  await loadAndRenderCategories();
}

window.addEventListener("load", () => {
  init();
});
