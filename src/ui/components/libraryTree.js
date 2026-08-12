/**
 * Renderiza a árvore de categorias/subpastas na sidebar esquerda.
 * Puramente apresentacional: recebe dados já carregados e callbacks.
 *
 * Modelo de navegação: `activePath` é a lista de pastas do topo até a
 * pasta ativa (mesmo array usado como pilha de navegação em app.js) -
 * cada pasta em `activePath[i]` é a única expandida entre suas irmãs
 * naquele nível (accordion: só um ramo aberto por vez em cada nível).
 * `pathContents[i]` é o resultado de loadFolderContents() para
 * activePath[i] (subpastas + arquivos), na mesma ordem.
 *
 * Arquivos aparecem tanto na árvore (como uma lista de nomes dentro da
 * pasta ativa) quanto na grade principal (com preview) - clicar em
 * qualquer um dos dois seleciona o mesmo asset.
 */

function isSameFolder(a, b) {
  return !!a && !!b && a.path === b.path;
}

function createChevron(expanded) {
  const chevron = document.createElement("span");
  chevron.className = "kvn-tree-chevron";
  chevron.textContent = expanded ? "⌄" : "›";
  return chevron;
}

function renderLibraryTree(container, categories, activePath, pathContents, callbacks) {
  container.innerHTML = "";
  renderFolderLevel(container, categories, 0);

  function renderFolderLevel(parentEl, folders, depth) {
    if (!folders || folders.length === 0) {
      return;
    }

    for (const folder of folders) {
      const isExpanded = isSameFolder(activePath[depth], folder);
      const isSelected = isExpanded && depth === activePath.length - 1;

      const row = document.createElement("div");
      row.className = "kvn-tree-folder-row";
      row.style.setProperty("--kvn-depth", depth);
      if (isSelected) {
        row.classList.add("kvn-tree-active");
      }

      const folderIcon = document.createElement("span");
      folderIcon.className = "kvn-tree-folder-icon";

      const name = document.createElement("span");
      name.className = "kvn-tree-folder-name";
      name.textContent = folder.name;

      row.appendChild(createChevron(isExpanded));
      row.appendChild(folderIcon);
      row.appendChild(name);
      row.addEventListener("click", () => callbacks.onSelectFolder(folder, depth));

      parentEl.appendChild(row);

      if (isExpanded) {
        const contents = pathContents[depth];
        if (contents) {
          renderFolderLevel(parentEl, contents.subfolders, depth + 1);
          for (const asset of contents.assets) {
            renderFileRow(parentEl, asset, depth + 1);
          }
        }
      }
    }
  }

  function renderFileRow(parentEl, asset, depth) {
    const row = document.createElement("div");
    row.className = "kvn-tree-file-row";
    row.style.setProperty("--kvn-depth", depth);
    row.dataset.assetPath = asset.path;
    if (asset.path === callbacks.selectedAssetPath) {
      row.classList.add("kvn-tree-active");
    }
    row.textContent = asset.name;
    row.addEventListener("click", (event) => {
      event.stopPropagation();
      callbacks.onSelectAsset(asset);
    });
    row.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      callbacks.onImportAsset(asset);
    });
    parentEl.appendChild(row);
  }
}

/**
 * Atualiza só o destaque visual do arquivo selecionado na árvore, sem
 * re-renderizar tudo - espelha updateSelection() da grade.
 */
function updateTreeSelection(container, selectedAssetPath) {
  const rows = container.querySelectorAll(".kvn-tree-file-row");
  rows.forEach((row) => {
    row.classList.toggle("kvn-tree-active", row.dataset.assetPath === selectedAssetPath);
  });
}

module.exports = {
  renderLibraryTree,
  updateTreeSelection,
};
