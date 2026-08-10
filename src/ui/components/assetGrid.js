/**
 * Renderiza a grade de assets de uma categoria. Puramente apresentacional:
 * recebe dados prontos e callbacks de seleção/duplo clique.
 */

const KIND_LABEL = {
  video: "VID",
  audio: "AUD",
  image: "IMG",
  mogrt: "MGT",
  preset: "PST",
  file: "FILE",
};

function renderAssets(container, assets, selectedAssetPath, onSelectAsset, onImportAsset) {
  container.innerHTML = "";

  if (assets.length === 0) {
    const empty = document.createElement("p");
    empty.className = "kvn-empty-state";
    empty.textContent = "Nenhum asset nesta categoria.";
    container.appendChild(empty);
    return;
  }

  for (const asset of assets) {
    const card = document.createElement("div");
    card.className = "kvn-asset-card";
    if (asset.path === selectedAssetPath) {
      card.classList.add("kvn-asset-selected");
    }

    const thumb = document.createElement("div");
    thumb.className = `kvn-asset-thumb kvn-asset-thumb-${asset.kind}`;
    thumb.textContent = KIND_LABEL[asset.kind] || "FILE";

    const name = document.createElement("div");
    name.className = "kvn-asset-name";
    name.textContent = asset.name;

    const ext = document.createElement("div");
    ext.className = "kvn-asset-ext";
    ext.textContent = asset.extension || "";

    card.appendChild(thumb);
    card.appendChild(name);
    card.appendChild(ext);

    card.addEventListener("click", () => onSelectAsset(asset));
    card.addEventListener("dblclick", () => onImportAsset(asset));

    container.appendChild(card);
  }
}

module.exports = {
  renderAssets,
};
