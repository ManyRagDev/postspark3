import { FPS, transitionPack, defaultTransitionFrames as exampleFrames } from "./montage-model.js";
import {
  loadTransitionOverlay, loadTransitionOverlayPoster, paintTransition, paintTransitionOverlay,
} from "./transitions.js";

const width = 216;
const height = 126;
const portraitHeight = 384;
const cropTop = (portraitHeight - height) / 2;
const context = canvas => canvas.getContext("2d", {alpha: false, willReadFrequently: true});
const surface = height => Object.assign(document.createElement("canvas"), {width, height});
const directCut = {name: "Corte direto", group: ""};

async function samplePainter(loadPictures) {
  const blobs = await loadPictures?.();
  const portraits = await Promise.all(["coast", "tide"].map(async (name,i) => {
    const image = new Image();
    image.src = blobs ? URL.createObjectURL(blobs[i]) : new URL(`./assets/${name}.jpg`, import.meta.url).href;
    try { await image.decode(); } finally { if (blobs) URL.revokeObjectURL(image.src); }
    const picture = surface(portraitHeight);
    context(picture).drawImage(image, 0, 0, width, portraitHeight);
    return picture;
  }));
  const crop = (ctx, picture) => ctx.drawImage(picture, 0, cropTop, width, height, 0, 0, width, height);
  const landscapes = portraits.map(portrait => {
    const picture = surface(height);
    crop(context(picture), portrait);
    return picture;
  });
  const overlayPreview = context(surface(portraitHeight));

  return (canvas, type, progress, frames) => {
    const ctx = context(canvas);
    const picture = progress < .5 ? 0 : 1;
    if (!type || progress < 0 || progress >= 1) {
      ctx.drawImage(landscapes[picture], 0, 0);
    } else if (transitionPack[type].overlay) {
      overlayPreview.drawImage(portraits[picture], 0, 0);
      paintTransitionOverlay(overlayPreview, type, progress, frames, width, portraitHeight);
      crop(ctx, overlayPreview.canvas);
    } else {
      paintTransition(ctx, ...landscapes, type, progress, width, height);
    }
  };
}

export function openTransitionGallery({dialog, showDialog, icon, from, to, max, current, privateLab, loadPictures, onApply}) {
  const presets = [["", directCut], ...Object.entries(transitionPack).filter(([, preset]) => !preset.overlay || privateLab)];
  const effects = new Map(presets);
  const groups = new Set(presets.map(([, preset]) => preset.group));
  showDialog("Transições", `
    <div class="transition-gallery">
      <p class="transition-pair"></p>
      <div class="transition-filters" role="group" aria-label="Filtrar transições">
        ${[...groups].map(group => `<button type="button" data-transition-filter="${group}" aria-pressed="${!group}">${group || "Todos"}</button>`).join("")}
      </div>
      <p class="transition-hint">Passe o mouse ou toque em um efeito para ver a prévia do corte.</p>
      <div class="transition-cards" role="group" aria-label="Efeitos de transição">
        ${presets.map(([type, preset]) => `
          <button type="button" class="transition-card" data-transition="${type}" aria-pressed="false">
            <span class="transition-card-picture">
              <canvas width="${width}" height="${height}" aria-hidden="true"></canvas>
              <span class="transition-play" aria-hidden="true">${icon("Play")}</span>
            </span>
            <span class="transition-card-name">${preset.name}${icon("Check")}</span>
          </button>`).join("")}
      </div>
    </div>`, `
    <form class="transition-settings">
      <p class="transition-error" role="alert" hidden></p>
      <div class="transition-controls">
        <div class="transition-choice"><span>Efeito selecionado</span><strong aria-live="polite"></strong></div>
        <label class="transition-duration">
          <span>Duração</span>
          <span><input id="dip-frames" type="number" min="2" max="${max}" step="2" required aria-label="Duração em quadros"> quadros</span>
        </label>
        <div class="transition-actions">
          <button type="button" class="btn" data-transition-cancel>Cancelar</button>
          <button type="submit" class="btn primary" id="dip-apply">Aplicar</button>
        </div>
      </div>
    </form>`);
  const root = dialog.querySelector(".transition-gallery");
  root.querySelector(".transition-pair").textContent = `${from} → ${to}`;
  const grid = root.querySelector(".transition-cards");
  const cards = [...grid.querySelectorAll(".transition-card")];
  const filters = [...root.querySelectorAll("[data-transition-filter]")];
  const form = dialog.querySelector(".transition-settings");
  const input = form.querySelector("#dip-frames");
  const apply = form.querySelector("#dip-apply");
  const error = form.querySelector(".transition-error");
  const duration = form.querySelector(".transition-duration");
  const choice = form.querySelector(".transition-choice strong");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const alive = () => dialog.open && root.isConnected;
  const cardType = card => card.dataset.transition;
  const values = new Map();
  let selected = effects.has(current?.type) ? current.type : "";
  if (selected) values.set(selected, current.frames);
  const framesFor = type => values.get(type) ?? Math.min(max, exampleFrames(type));
  let painter, hoverTimer, frame, active;
  let applying = false;

  function getPainter() {
    painter ??= samplePainter(loadPictures).catch(() => {
      if (alive()) root.querySelector(".transition-hint").textContent = "Prévia ilustrativa. Um dos clipes está indisponível.";
      return samplePainter();
    });
    return painter;
  }

  function showError(message = "") {
    error.hidden = !message;
    error.textContent = message;
  }

  async function paintPoster(card) {
    const type = cardType(card);
    const overlay = effects.get(type).overlay;
    const canvas = card.querySelector("canvas");
    const frames = exampleFrames(type);
    // Sample paper before complete coverage so its edge and the scene are both visible.
    const progress = overlay?.blend === "normal" ? .22 : type.startsWith("dip_") ? .36 : .5;
    try {
      const paint = await getPainter();
      if (!alive() || active?.card === card) return;
      if (overlay) {
        paint(canvas, "", 0, frames);
        await loadTransitionOverlayPoster(type, progress, frames);
      }
      if (alive() && active?.card !== card) paint(canvas, type, progress, frames);
    } catch {
      // The card stays selectable and a playback request can retry.
    }
  }

  function stopPreview(restore = true) {
    clearTimeout(hoverTimer);
    cancelAnimationFrame(frame);
    if (!active) return;
    const {card} = active;
    active = undefined;
    delete card.dataset.preview;
    card.removeAttribute("aria-busy");
    if (restore && alive()) paintPoster(card);
  }

  async function play(card, hover = false) {
    stopPreview();
    const playback = active = {card, hover};
    const type = cardType(card);
    const frames = type ? (type === selected && input.validity.valid ? input.valueAsNumber : framesFor(type)) : 8;
    const canvas = card.querySelector("canvas");
    card.dataset.preview = "loading";
    card.setAttribute("aria-busy", "true");
    showError();
    try {
      const [paint] = await Promise.all([getPainter(), loadTransitionOverlay(type)]);
      if (active !== playback || !alive()) return;
      card.dataset.preview = "playing";
      card.removeAttribute("aria-busy");
      const start = performance.now();
      let last;
      function tick(now) {
        if (active !== playback || !alive()) return;
        const elapsed = now - start - 200;
        const index = Math.min(frames, Math.max(-1, Math.floor(elapsed * FPS / 1000)));
        if (index !== last) {
          paint(canvas, type, index / frames, frames);
          last = index;
        }
        if (elapsed < frames * 1000 / FPS + 340) frame = requestAnimationFrame(tick);
        else stopPreview();
      }
      tick(start);
    } catch {
      if (active !== playback || !alive()) return;
      stopPreview();
      if (!hover) showError("A prévia não carregou. Clique no efeito para tentar de novo.");
    }
  }

  function updateSelection() {
    cards.forEach(card => card.setAttribute("aria-pressed", cardType(card) === selected));
    choice.textContent = effects.get(selected).name;
    duration.hidden = input.disabled = !selected;
    input.value = framesFor(selected);
  }

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      paintPoster(entry.target);
    }
  }, {root: grid, rootMargin: "48px 0px"});
  for (const card of cards) {
    observer.observe(card);
    card.onpointerenter = event => {
      if (event.pointerType === "mouse" && !reduceMotion.matches && !applying)
        hoverTimer = setTimeout(() => play(card, true), 180);
    };
    card.onpointerleave = () => {
      clearTimeout(hoverTimer);
      if (active?.card === card && active.hover) stopPreview();
    };
    card.onclick = () => {
      if (applying) return;
      if (selected && input.validity.valid) values.set(selected, input.valueAsNumber);
      selected = cardType(card);
      updateSelection();
      play(card);
    };
  }
  for (const filter of filters) {
    filter.onclick = () => {
      stopPreview();
      showError();
      const group = filter.dataset.transitionFilter;
      filters.forEach(button => button.setAttribute("aria-pressed", button === filter));
      cards.forEach(card => card.hidden = Boolean(group && effects.get(cardType(card)).group !== group));
      grid.scrollTop = 0;
    };
  }

  form.querySelector("[data-transition-cancel]").onclick = () => dialog.close();
  form.onsubmit = async event => {
    event.preventDefault();
    if (applying) return;
    const frames = input.valueAsNumber;
    applying = apply.disabled = input.disabled = true;
    apply.textContent = "Aplicando…";
    stopPreview();
    showError();
    try {
      await loadTransitionOverlay(selected);
      if (!alive()) return;
      onApply(selected, frames);
      dialog.close();
    } catch (err) {
      if (alive()) showError(err.message);
    } finally {
      applying = apply.disabled = false;
      input.disabled = !selected;
      apply.textContent = "Aplicar";
    }
  };
  dialog.addEventListener("close", () => {
    observer.disconnect();
    stopPreview(false);
  }, {once: true});
  updateSelection();
}
