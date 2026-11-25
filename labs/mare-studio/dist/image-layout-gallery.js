import { imageLayerFromFile } from "./composition-model.js";
import { IMAGE_LAYOUTS, imageLayout } from "./image-layouts.js";

function renderArrangement(container, layoutId, images) {
  const cards = imageLayout(layoutId, images.length).map((placement, index) => {
    const {x, y, width, height, rotation} = placement;
    const image = images[index];
    const card = document.createElement(image ? "img" : "span");
    card.className = "image-layout-card";
    if (image) {
      card.src = image.src;
      card.alt = "";
    }
    card.style.left = `${x / 540 * 100}%`;
    card.style.top = `${y / 960 * 100}%`;
    card.style.width = `${width / 540 * 100}%`;
    card.style.height = `${height / 960 * 100}%`;
    card.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
    return card;
  });
  container.replaceChildren(...cards);
}

export function openImageLayoutGallery({dialog, showDialog, composition, duration, apply}) {
  showDialog("Organizar imagens", `
    <div class="image-layout-gallery">
      <div class="image-layout-options" role="group" aria-label="Layouts">
        ${IMAGE_LAYOUTS.map(layout => `<button type="button" data-image-layout="${layout.id}" aria-pressed="false">
          <span class="image-layout-sample" aria-hidden="true"></span><span>${layout.label}</span>
        </button>`).join("")}
      </div>
      <section class="image-layout-picker" aria-label="Imagens do layout">
        <div class="image-layout-picker-head">
          <h3>Imagens</h3><button type="button" class="btn" id="layout-import">Importar imagens</button>
          <input type="file" id="layout-files" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden>
        </div>
        <div class="image-layout-files"></div>
        <p class="image-layout-status" role="status"></p>
      </section>
      <section class="image-layout-preview" aria-label="Prévia do layout">
        <div class="image-layout-stage" role="img" aria-label="Distribuição das imagens"></div>
      </section>
    </div>`, `<button type="button" class="btn" id="layout-cancel">Cancelar</button>
      <button type="button" class="btn primary" id="layout-apply">Aplicar layout</button>`);

  const view = dialog.querySelector(".image-layout-gallery");
  const choose = view.querySelector("#layout-import");
  const files = view.querySelector("#layout-files");
  const list = view.querySelector(".image-layout-files");
  const preview = view.querySelector(".image-layout-stage");
  const status = view.querySelector(".image-layout-status");
  const confirm = dialog.querySelector("#layout-apply");
  const buttons = [...view.querySelectorAll("[data-image-layout]")];
  const images = composition.layers.filter(layer => layer.type === "image");
  const existingCount = images.length;
  const selected = new Set();
  const available = 64 - composition.layers.length;
  const active = () => dialog.open && view.isConnected;
  let busy = false;
  let layoutId = IMAGE_LAYOUTS[0].id;
  let importError = "";
  preview.style.backgroundColor = composition.background;

  function renderPreview() {
    const chosen = images.filter(image => selected.has(image.id));
    const empty = chosen.length < 2;
    renderArrangement(preview, layoutId, empty ? [null, null, null] : chosen);
    preview.classList.toggle("is-placeholder", empty);
    confirm.disabled = busy || empty;
    status.textContent = importError || (busy ? "Importando imagens…" : empty
      ? "Selecione pelo menos duas imagens." : `${chosen.length} imagens selecionadas`);
    for (const button of buttons) button.setAttribute("aria-pressed", button.dataset.imageLayout === layoutId);
  }

  function renderList() {
    list.replaceChildren(...images.map(layer => {
      const label = document.createElement("label");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = selected.has(layer.id);
      check.onchange = () => {
        if (check.checked) selected.add(layer.id);
        else selected.delete(layer.id);
        importError = "";
        renderPreview();
      };
      const thumbnail = document.createElement("img");
      thumbnail.src = layer.src;
      thumbnail.alt = "";
      thumbnail.loading = "lazy";
      const title = document.createElement("span");
      title.textContent = layer.name;
      label.append(check, thumbnail, title);
      return label;
    }));
    choose.disabled = busy || images.length - existingCount >= available;
  }

  for (const button of buttons) {
    const id = button.dataset.imageLayout;
    renderArrangement(button.firstElementChild, id, [null, null, null]);
    button.onclick = () => {layoutId = id; renderPreview();};
  }
  choose.onclick = () => files.click();
  files.onchange = async () => {
    const entries = [...files.files];
    files.value = "";
    if (!entries.length || busy) return;
    const pending = images.length - existingCount;
    if (entries.length + pending > available) {
      importError = "A composição aceita até 64 camadas. Selecione menos imagens.";
      renderPreview();
      return;
    }
    busy = choose.disabled = true;
    importError = "";
    renderPreview();
    for (const file of entries) {
      if (!active()) return;
      try {
        const layer = await imageLayerFromFile(file, duration);
        images.push(layer);
        selected.add(layer.id);
      } catch (error) {
        importError = `${file.name} · ${error.message}`;
      }
    }
    if (!active()) return;
    busy = false;
    renderList();
    renderPreview();
  };
  dialog.querySelector("#layout-cancel").onclick = () => dialog.close();
  confirm.onclick = () => {
    if (!busy && selected.size >= 2) {
      apply(images.filter(image => selected.has(image.id)), layoutId);
      dialog.close();
    }
  };
  renderList();
  renderPreview();
}
