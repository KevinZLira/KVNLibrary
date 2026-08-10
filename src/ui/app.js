/**
 * Controlador da UI do painel KVN Library. Liga os módulos de biblioteca e
 * de Premiere aos componentes visuais. Inicializa no evento "load" da
 * janela do painel (mesmo padrão do sample oficial da Adobe), já que os
 * hooks de ciclo de vida hide()/destroy() de painel não são confiáveis no
 * Premiere no momento.
 */

const libraryManager = require("../library/libraryManager");
const importManager = require("../premiere/importManager");
const projectManager = require("../premiere/projectManager");
const { PLUGIN_NAME } = require("../config/settings");
const { renderCategories } = require("./components/categoryList");
const { renderAssets } = require("./components/assetGrid");
const { showStatus, clearStatus } = require("./components/statusBar");

const elements = {};

let activeCategory = null;
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
  elements.assetsGrid = document.getElementById("assets-grid");
  elements.activeCategoryLabel = document.getElementById("active-category-label");
  elements.backButton = document.getElementById("back-button");
  elements.actionBar = document.getElementById("action-bar");
  elements.selectedAssetName = document.getElementById("selected-asset-name");
  elements.importButton = document.getElementById("import-button");
}

function showNoFolderView() {
  elements.noFolderView.classList.remove("kvn-hidden");
  elements.categoriesView.classList.add("kvn-hidden");
  elements.assetsView.classList.add("kvn-hidden");
  elements.actionBar.classList.add("kvn-hidden");
}

function showCategoriesView() {
  activeCategory = null;
  selectedAsset = null;
  elements.noFolderView.classList.add("kvn-hidden");
  elements.categoriesView.classList.remove("kvn-hidden");
  elements.assetsView.classList.add("kvn-hidden");
  elements.actionBar.classList.add("kvn-hidden");
}

function showAssetsView(category) {
  activeCategory = category;
  selectedAsset = null;
  elements.activeCategoryLabel.textContent = category.name.toUpperCase();
  elements.noFolderView.classList.add("kvn-hidden");
  elements.categoriesView.classList.add("kvn-hidden");
  elements.assetsView.classList.remove("kvn-hidden");
  elements.actionBar.classList.add("kvn-hidden");
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
    renderCategories(elements.categoriesList, categories, handleSelectCategory);
  } catch (error) {
    if (error.code === "NO_LIBRARY_FOLDER") {
      showNoFolderView();
      return;
    }
    showCategoriesView();
    renderCategories(elements.categoriesList, [], () => {});
    showStatus(elements.statusBar, error.message, "error");
  }
}

async function handleSelectCategory(category) {
  showAssetsView(category);
  elements.assetsGrid.innerHTML = "";

  try {
    const assets = await libraryManager.loadAssets(category);
    renderAssets(
      elements.assetsGrid,
      assets,
      selectedAsset && selectedAsset.path,
      handleSelectAsset,
      handleImportAsset
    );
  } catch (error) {
    showStatus(elements.statusBar, `Não foi possível ler "${category.name}": ${error.message}`, "error");
  }
}

function handleSelectAsset(asset) {
  selectedAsset = asset;
  elements.selectedAssetName.textContent = asset.name;
  elements.actionBar.classList.remove("kvn-hidden");

  // Re-render para refletir o card selecionado, usando o cache (sem custo de disco).
  libraryManager.loadAssets(activeCategory).then((assets) => {
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

async function handleRefresh() {
  clearStatus(elements.statusBar);
  libraryManager.invalidateCache();
  await loadAndRenderCategories();
  if (activeCategory === null) {
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
  elements.backButton.addEventListener("click", showCategoriesView);
  elements.selectFolderButton.addEventListener("click", handleChooseFolder);
  elements.changeFolderButton.addEventListener("click", handleChooseFolder);
  elements.importButton.addEventListener("click", () => {
    if (selectedAsset) {
      handleImportAsset(selectedAsset);
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
