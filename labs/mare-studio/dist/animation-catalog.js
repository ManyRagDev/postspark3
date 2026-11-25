import { animationTemplates, buildAnimationTemplate } from "./animation-templates.js";
import { imageLayerFromFile } from "./composition-model.js";
import { drawFrame } from "./renderer.js";

const artwork = new Map();
export function loadArtwork(file) {
  if (artwork.has(file)) return artwork.get(file);
  const load = (async () => {
    const response = await fetch("./assets/" + file);
    if (!response.ok) throw new Error("A imagem do modelo está indisponível.");
    const blob = await response.blob();
    const {src} = await imageLayerFromFile(new File([blob], file, {type: blob.type}), 1);
    const image = new Image();
    image.src = src;
    await image.decode();
    return {src, image};
  })();
  artwork.set(file, load);
  load.catch(() => artwork.delete(file));
  return load;
}

const searchWords = value => value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}]+/gu) ?? [];
const verticalSearchTerms = "reels story stories Instagram TikTok Shorts vertical 9:16 vídeo animação";
const searchTopics = {
  dialogue: "fala caixa texto balão jogo",
  sunrise: "amanhecer paisagem horizonte",
  offer: "promoção desconto venda preço cafeteria café cardápio",
  "high-tide": "onda mar oceano movimento",
  road: "estrada viagem placa rota percurso",
  spotlight: "produto lançamento vitrine cafeteria café loja",
  comparison: "comparativo transformação resultado",
  testimonial: "avaliação cliente comentário recomendação",
  "carousel-cover": "capa abertura sequência carrossel",
  "call-to-action": "cta botão chamada venda",
  "kinetic-title": "abertura título texto tipografia",
  countdown: "abertura contagem estreia lançamento",
  "illustrated-route": "mapa viagem percurso caminho trajeto",
  "bar-chart": "gráfico dados números infográfico",
  "spring-stamp": "selo adesivo etiqueta promoção desconto",
  orbits: "espaço planetas círculos",
  "geometric-portal": "forma geometria loop",
  "three-steps": "tutorial lista etapas passo a passo",
  "event-invite": "convite evento data aniversário",
  "mosaic-showcase": "fotos galeria vitrine coleção loja",
};
const searchableTemplates = animationTemplates.map(template => searchWords(
  `${template.name} ${template.category} ${verticalSearchTerms} ${searchTopics[template.id] ?? ""}`
));
const filters = [
  ["all", "Todos"], ["new", "Novos"], ["scene", "Cenas"], ["marketing", "Divulgação"],
];

export function findTemplates(text = "", group = "all") {
  if (!filters.some(([id])=>id===group)) throw Error("Filtro de modelos desconhecido.");
  const words = searchWords(text);
  return animationTemplates.filter((t,i)=>
    (group === "all" || (group === "new" && t.collection === 2) ||
     (group === "scene" && t.category === "Cena") || (group === "marketing" && t.category === "Divulgação")) &&
    words.every(word=>searchableTemplates[i].some(term=>term.startsWith(word))));
}

export function openAnimationCatalog({dialog, showDialog, insert, initialFilter = "all"}) {
  showDialog("Modelos de animação", `
    <div class="animation-catalog">
      <div class="animation-catalog-browser">
        <input class="animation-catalog-search" type="search" placeholder="Buscar por Reels, oferta, título…" aria-label="Buscar modelo">
        <div class="animation-catalog-filters" role="group" aria-label="Filtrar modelos">
          ${filters.map(([value, label]) => `<button type="button" class="btn" data-animation-filter="${value}" aria-pressed="${value === initialFilter}">${label}</button>`).join("")}
        </div>
        <p class="animation-catalog-count" aria-live="polite"></p>
        <div class="animation-catalog-empty" hidden>
          <p>Tente buscar por assunto, como “oferta” ou “café”, ou pelo formato “Reels”.</p>
          <button type="button" class="btn" data-animation-clear>Limpar busca e filtros</button>
        </div>
        <div class="animation-catalog-list" role="group" aria-label="Modelos">
          ${animationTemplates.map(template => `
            <button class="animation-card" type="button" data-template="${template.id}" aria-pressed="false">
              <canvas width="90" height="160" aria-hidden="true"></canvas>
              <b>${template.name}</b><small>${template.category}</small>
            </button>`).join("")}
        </div>
      </div>
      <section class="animation-catalog-preview" aria-label="Prévia do modelo">
        <canvas width="270" height="480" role="img" aria-label="Animação de exemplo"></canvas>
        <div class="animation-catalog-caption"><h3></h3><span></span></div>
        <div class="animation-catalog-controls">
          <button type="button" class="btn" data-animation-play>Pausar</button>
          <button type="button" class="btn primary" data-animation-insert disabled>Usar modelo</button>
        </div>
        <p class="animation-catalog-error" role="alert" hidden></p>
      </section>
    </div>`);
  const root = dialog.querySelector(".animation-catalog");
  const previewPanel = root.querySelector(".animation-catalog-preview");
  const preview = previewPanel.querySelector("canvas");
  const title = root.querySelector("h3");
  const duration = root.querySelector(".animation-catalog-caption span");
  const play = root.querySelector("[data-animation-play]");
  const insertButton = root.querySelector("[data-animation-insert]");
  const error = root.querySelector("[role=alert]");
  const cards = [...root.querySelectorAll("[data-template]")];
  const filterButtons = [...root.querySelectorAll("[data-animation-filter]")];
  const search = root.querySelector(".animation-catalog-search");
  const resultCount = root.querySelector(".animation-catalog-count");
  const empty = root.querySelector(".animation-catalog-empty");
  const samples = new Map();
  let active;
  let currentFilter = initialFilter;
  let frame;
  let time;
  let running = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const alive = () => dialog.open && root.isConnected;
  const paint = (canvas, sample, cursor) => drawFrame(canvas, {clips: [sample.clip]}, cursor, sample.media);
  function animate(now) {
    const sample = samples.get(active?.id);
    if (!alive() || !running || !sample) return;
    time ??= now;
    paint(preview, sample, ((now - time) / 1000) % active.duration);
    frame = requestAnimationFrame(animate);
  }
  function update() {
    cancelAnimationFrame(frame);
    previewPanel.hidden = !active;
    if (!active) return;
    const sample = samples.get(active.id);
    error.hidden = !sample?.error;
    error.textContent = sample?.error || "";
    play.disabled = insertButton.disabled = !sample?.clip;
    play.textContent = running ? "Pausar" : "Reproduzir";
    title.textContent = active.name;
    duration.textContent = new Intl.NumberFormat("pt-BR").format(active.duration) + " s · Vertical (9:16)";
    preview.setAttribute("aria-label", "Prévia de " + active.name);
    if (!sample?.clip) {
      preview.getContext("2d").clearRect(0, 0, preview.width, preview.height);
      return;
    }
    paint(preview, sample, running ? 0 : active.duration * .64);
    time = undefined;
    if (running) frame = requestAnimationFrame(animate);
  }
  function select(template) {
    active = template;
    cards.forEach(card => card.setAttribute("aria-pressed", card.dataset.template === active?.id));
    update();
  }
  function filterCards() {
    const visible = findTemplates(search.value, currentFilter);
    cards.forEach((card,i)=>{card.hidden=!visible.includes(animationTemplates[i]);});
    resultCount.textContent = !visible.length ? "Nenhum modelo encontrado" :
      visible.length === 1 ? "1 modelo" : visible.length + " modelos";
    empty.hidden = visible.length > 0;
    if (!visible.includes(active)) select(visible[0]);
  }
  cards.forEach((card, index) => {
    const template = animationTemplates[index];
    card.onclick = () => {
      select(template);
      if (matchMedia("(max-width: 540px)").matches)
        previewPanel.scrollIntoView({block: "nearest"});
    };
    const sources = template.sources ?? [];
    const prepare = async () => {
      try {
        const entries = await Promise.all(sources.map(loadArtwork));
        if (!alive()) return;
        const images = new Map(sources.map((file, i) => [file, entries[i].src]));
        const media = new Map(entries.map(({src, image}) => [src, image]));
        const clip = {kind: "scene", duration: template.duration, trim: 0,
          composition: buildAnimationTemplate(template, images)};
        const sample = {clip, media};
        samples.set(template.id, sample);
        paint(card.querySelector("canvas"), sample, template.poster ?? (template.id === "comparison" ? 1.4 : template.duration * .63));
      } catch (err) {
        console.error("Falha ao preparar o modelo", template.id, err);
        samples.set(template.id, {error: "A prévia deste modelo não carregou. Reabra o catálogo para tentar novamente."});
      }
      if (alive() && active === template) update();
    };
    prepare();
  });
  search.oninput = filterCards;
  function setFilter(value) {
    currentFilter = value;
    filterButtons.forEach(filter => filter.setAttribute("aria-pressed", filter.dataset.animationFilter === value));
    filterCards();
  }
  filterButtons.forEach(button => {
    button.onclick = () => setFilter(button.dataset.animationFilter);
  });
  empty.querySelector("button").onclick = () => {
    search.value = "";
    setFilter("all");
    search.focus();
  };
  play.onclick = () => {
    running = !running;
    cancelAnimationFrame(frame);
    play.textContent = running ? "Pausar" : "Reproduzir";
    if (running) {
      time = undefined;
      frame = requestAnimationFrame(animate);
    }
  };
  insertButton.onclick = () => {
    const sample = samples.get(active?.id);
    if (!sample?.clip) return;
    dialog.close();
    insert(active, structuredClone(sample.clip.composition));
  };
  dialog.addEventListener("close", () => cancelAnimationFrame(frame), {once: true});
  filterCards();
}
