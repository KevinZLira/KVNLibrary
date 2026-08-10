/**
 * Renderiza a lista de categorias (subpastas de primeiro nível da
 * biblioteca) dentro de um container. Puramente apresentacional: recebe
 * dados prontos e um callback de seleção.
 */

function renderCategories(container, categories, onSelectCategory) {
  container.innerHTML = "";

  if (categories.length === 0) {
    const empty = document.createElement("p");
    empty.className = "kvn-empty-state";
    empty.textContent =
      "Nenhuma categoria encontrada. Crie subpastas dentro da biblioteca (ex.: Transitions, Sound Effects) e clique em Refresh.";
    container.appendChild(empty);
    return;
  }

  for (const category of categories) {
    const row = document.createElement("div");
    row.className = "kvn-category-row";

    const name = document.createElement("span");
    name.className = "kvn-category-name";
    name.textContent = category.name;

    const chevron = document.createElement("span");
    chevron.className = "kvn-category-chevron";
    chevron.textContent = "›";

    row.appendChild(name);
    row.appendChild(chevron);
    row.addEventListener("click", () => onSelectCategory(category));

    container.appendChild(row);
  }
}

module.exports = {
  renderCategories,
};
