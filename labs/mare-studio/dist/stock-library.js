const library = new URL("./assets/video-library/", import.meta.url);
const folded = value => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const duration = new Intl.NumberFormat("pt-BR", {maximumFractionDigits: 1});
const formatName = entry => entry.width === entry.height ? "Quadrado" : entry.width < entry.height ? "Vertical" : "Horizontal";

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function sourceLink(text, href) {
  const link = node("a", text);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

export function filterStock(entries, { query = "", category = "", format = "" } = {}) {
  const words = folded(query).trim().split(/\s+/).filter(Boolean);
  return entries.filter(entry => {
    const haystack = folded([entry.title, entry.category, entry.tags].join(" "));
    return (!category || entry.category === category) &&
      (!format || format === formatName(entry)) && words.every(word => haystack.includes(word));
  });
}

export async function stockCatalog(signal) {
  const response=await fetch(new URL("catalog.json", library),{signal});
  if (!response.ok) throw Error("Catálogo indisponível.");
  return response.json();
}
export async function stockFile(entry,signal) {
  const response=await fetch(entry.mp4??new URL(entry.id+".mp4",library),{signal});
  if (!response.ok) throw Error("Vídeo indisponível.");
  return new File([await response.blob()],entry.title+".mp4",{type:"video/mp4"});
}

export async function openStockLibrary({dialog, showDialog, add}) {
  showDialog("Biblioteca de vídeos",
    '<div class="stock-library"><div class="stock-filters">' +
    '<label>Buscar <input type="search" placeholder="Ex. café, chuva, cidade"></label>' +
    '<label>Categoria <select><option value="">Todas</option></select></label>' +
    '<label>Formato <select><option value="">Todos</option><option>Vertical</option>' +
    '<option>Horizontal</option><option>Quadrado</option></select></label></div>' +
    '<p class="stock-status" role="status">Carregando vídeos…</p><div class="stock-grid"></div></div>');
  const view = dialog.querySelector(".stock-library");
  const [category, format] = view.querySelectorAll("select");
  const search = view.querySelector("input");
  const status = view.querySelector(".stock-status");
  const grid = view.querySelector(".stock-grid");
  const controller = new AbortController();
  const {signal} = controller;
  let preview;
  let loading = false;

  function stopPreview() {
    if (!preview) return;
    const {video, image, button} = preview;
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.replaceWith(image);
    button.textContent = "Ver prévia";
    button.setAttribute("aria-pressed", "false");
    preview = null;
  }

  dialog.addEventListener("close", () => {
    controller.abort();
    stopPreview();
  }, {once: true});
  view.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    dialog.close();
  });

  const active = () => view.isConnected && dialog.open && !signal.aborted;
  const mediaFor = (entry, extension) => entry[extension] ?? new URL(entry.id + "." + extension, library);
  const setLoading = value => {
    loading = value;
    grid.querySelectorAll(".stock-add").forEach(button => {button.disabled = value;});
  };

  async function addClip(entry) {
    if (loading) return;
    setLoading(true);
    stopPreview();
    status.textContent = "Carregando “" + entry.title + "”…";
    try {
      const file = await stockFile(entry,signal);
      if (!active()) return;
      await add(file,entry.title,signal);
      if (active()) dialog.close();
    } catch {
      if (active()) status.textContent = "Não foi possível adicionar “" + entry.title + "”. Tente novamente.";
    } finally {
      setLoading(false);
    }
  }

  function card(entry) {
    const item = node("article", null, "stock-card");
    const visual = node("div", null, "stock-visual");
    const image = node("img");
    image.src = mediaFor(entry, "jpg");
    image.alt = "";
    image.loading = "lazy";
    visual.append(image);
    const heading = node("h3", entry.title);
    const info = node("p", duration.format(entry.duration) + " s · " + formatName(entry));
    const credits = node("p", null, "stock-credits");
    credits.append(entry.author);
    if (entry.source) credits.append(" · ", sourceLink(entry.license, entry.source));
    const actions = node("div", null, "stock-actions");
    const play = node("button", "Ver prévia", "btn");
    const use = node("button", "Adicionar à timeline", "btn primary stock-add");
    play.type = use.type = "button";
    play.setAttribute("aria-pressed", "false");
    use.disabled = loading;
    play.onclick = () => {
      const wasPlaying = preview?.button === play;
      stopPreview();
      if (wasPlaying) return;
      const video = node("video");
      video.src = entry.mp4 ?? mediaFor(entry, "preview.mp4");
      video.muted = video.playsInline = video.loop = true;
      video.setAttribute("aria-label", "Prévia de " + entry.title);
      image.replaceWith(video);
      play.textContent = "Parar prévia";
      play.setAttribute("aria-pressed", "true");
      preview = {video, image, button: play};
      video.play().catch(() => {
        if (preview?.video !== video) return;
        stopPreview();
        status.textContent = "Não foi possível reproduzir a prévia de “" + entry.title + "”.";
      });
    };
    use.onclick = () => addClip(entry);
    actions.append(play, use);
    item.append(visual, heading, info, credits, actions);
    return item;
  }

  try {
    const entries = await stockCatalog(signal);
    if (!active()) return;
    for (const name of new Set(entries.map(entry => entry.category))) {
      category.add(new Option(name, name));
    }
    function render() {
      stopPreview();
      const results = filterStock(entries, {query:search.value, category:category.value, format:format.value});
      if (!loading) status.textContent = results.length
        ? results.length + (results.length === 1 ? " vídeo" : " vídeos")
        : "Nenhum vídeo encontrado. Experimente outro termo ou remova um filtro.";
      grid.replaceChildren(...results.map(card));
    }
    search.addEventListener("input", render);
    category.addEventListener("change", render);
    format.addEventListener("change", render);
    render();
  } catch {
    if (active()) status.textContent = "Não foi possível abrir a biblioteca. Feche e tente novamente.";
  }
}
