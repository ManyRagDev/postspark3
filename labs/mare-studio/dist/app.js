import {prepareSelection,readCanvasImage,selectionPreview,selectionViewport} from "./canvas-selection.js";
import { createEditorSession } from "./editor-session.js";
import { integrated, openPostSpark, listAccountProjects, assetBytes, saveAccountProject, returnToPostSpark,queueProjectRender,returnProjectVideo } from "./postspark-session.js";
import { mediaOperations, previewFrame, serverExport, renderScope } from "./editor-media.js";

import { openProjectAssistant } from "./project-assistant.js";
import { openTransitionGallery } from "./transition-gallery.js";
import { durationOf, FPS, trackCount, TRACK_LIMIT, transitionFrames } from "./montage-model.js";

import { imageLayerFromFile, newComposition } from "./composition-model.js";
import { createCompositionUI } from "./compose-ui.js";
import { findTemplates, openAnimationCatalog } from "./animation-catalog.js";
import { openStockLibrary, filterStock, stockCatalog, stockFile } from "./stock-library.js";
import { drawFrame } from "./renderer.js";
import { mountTimeline } from "./timeline.js";
import { narrationPlacement, openNarrationEditor } from "./narration.js";
import { openSpeechEditor } from "./speech-ui.js";
import { montageSrt } from "./speech-model.js";
import {
  compositionForClip, insertCompositionAt, normalizeProject, requiredCompositionDuration,
  canSplitAt, sourceClip, timeInComposition, validateCompositionSource,
} from "./project-model.js";
import {
  MediaEngine,
  setProjectCacheScope,
  saveProject,
  loadProject,
  importLegacyProject,legacyProjectPresent,
  packProject,
  unpackProject,
  downloadBlob,
} from "./engine.js";

const $ = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const esc = value =>
  String(value).replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]
  );
const icon = name =>
  '<svg class="ico" aria-hidden="true"><use href="./icons.svg#' +
  name +
  '"></use></svg>';
const clock = value => {
  const n = Math.max(0, Math.round(value * 100));
  return (
    [Math.floor(n / 6000), Math.floor(n / 100) % 60]
      .map(v => String(v).padStart(2, "0"))
      .join(":") +
    "," +
    String(n % 100).padStart(2, "0")
  );
};
const seconds = n =>
  Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " s";
const uid = () => crypto.randomUUID();
const sample = () => ({
  name: "Maré alta",
  clips: [
    {
      id: "opening",
      kind: "scene",
      assetId: "wave",
      name: "Maré alta",
      duration: 4,
      trim: 0,
    },
    {
      id: "shot1",
      kind: "video",
      assetId: "coast",
      name: "Costa ao sol",
      duration: 3,
      trim: 0,
      sourceDuration: 6,
    },
    {
      id: "shot2",
      kind: "video",
      assetId: "tide",
      name: "Maré azul",
      duration: 3,
      trim: 0,
      sourceDuration: 6,
    },
  ],
  scene: {
    title: "Maré alta",
    color: "#ff693e",
    speed: 1,
    amplitude: 1,
    entry: 0.65,
    keys: [
      { t: 0, y: 35, opacity: 0.85 },
      { t: 1.5, y: 0, opacity: 1 },
    ],
  },
  sound: {
    assetId: "sound",
    name: "Pulso oceânico",
    volume: 0.55,
    enabled: true,
  },
});
let account;
if (location.pathname.startsWith("/previa-mare/")) {
  const response = await fetch("/api/mare/capabilities", {credentials:"same-origin", cache:"no-store"});
  const caps = response.ok && await response.json();
  if (!caps?.localPreview || !caps.previewActorId) {
    document.body.textContent = "Entre com uma conta autorizada para abrir a prévia do Maré.";
    throw Error("Prévia indisponível para esta sessão.");
  }
  setProjectCacheScope(caps.previewActorId, "previa-local", "editor");
}
if (integrated) {
  document.body.inert = true;
  try {
    account = await openPostSpark();
    document.title="Maré Studio · PostSpark";
    setProjectCacheScope(account.actorId, account.projectId, account.anchor?.id || account.projectId);
    if (account.speech){const flag=document.createElement("meta");flag.name="mare-speech";document.head.append(flag);}
    if (account.paid) {
      for (const name of ["mare-narration","mare-edit","mare-director"]) {
        const flag = document.createElement("meta");
        flag.name = name;
        document.head.append(flag);
      }
    }
  } catch (error) {
    const notice = document.createElement("p");
    notice.textContent = error.message;
    const back = document.createElement("a");
    back.href = "/thevoid";
    back.textContent = error.status===401 ? "Entrar no PostSpark" : "Abrir o PostSpark";
    document.body.replaceChildren(notice, back);
    if(error.status===401){
      notice.textContent="Entre na sua conta para retomar esta edição.";
      back.target="_blank";back.rel="noopener";
      const retry=document.createElement("button");
      retry.textContent="Retomar edição após entrar";
      retry.onclick=()=>location.reload();
      document.body.append(retry);
    }
    for(const item of error.recoverable || []){
      const link=document.createElement("a");
      link.textContent="Baixar "+item.name;link.download=item.name+".mare";
      link.href="/api/mare/assets/"+encodeURIComponent(item.revisionId);
      document.body.append(document.createElement("p"),link);
    }
    throw error;
  } finally { document.body.inert = false; }
}
const engine = new MediaEngine($("#screen"), drawFrame);
const silent = {enabled: false, assetId: null, volume: 0};
let project = normalizeProject(sample()),
  selected = "opening",
  mode = "montage",
  time = 1.9,
  playing = false,
  filter = "all",
  history = [],
  future = [],
  keyIndex = 1,
  dirty = false,
  projectStatus = "Projeto de exemplo",
  busy = false;
let editorRevision = 0, projectEpoch = 0;
let animation = null;
let montageView = null;
let lastCompositionId = null;
let groupIds = null;
let hasOpenProject = false;
let toastTimer,
  playVersion = 0;
const sum = clips => clips.reduce((s, c) => s + c.duration, 0);
const total = () => durationOf(project);
const chosen = () => project.clips.find(c => c.id === selected);
const startOf = c => sum(project.clips.slice(0, project.clips.indexOf(c)));
const findComposition = id => project.compositions.find(item => item.id === id);
const activeWave = () => animation?.draft.scene;
const compositionClip = () => {
  const draft = animation?.draft;
  return draft ? {...sourceClip(draft, draft.id), composition: draft.document} : null;
};
const animationProject = () => {
  const draft = animation?.draft;
  return {
    name: draft?.name ?? project.name, sound: silent, extraTracks: [],
    compositions: draft ? [draft] : [], clips: draft ? [sourceClip(draft, draft.id)] : [],
  };
};
const liveScope = () => mode === "motion" ? animationProject() : project;
const currentDuration = () => mode === "motion" ? animation?.draft.duration ?? 0 : total();
const info = message => {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  toastTimer = setTimeout(() => ($("#toast").textContent = ""), 4000);
};
const problem = err => info(err?.message || "Não foi possível concluir.");
const safe =
  fn =>
  (...args) =>
    Promise.resolve()
      .then(() => fn(...args))
      .catch(problem);
function paintIcons() {
  all("[data-i]").forEach(i => {
    i.outerHTML = icon(i.dataset.i);
  });
}
function stop() {
  playVersion++;
  engine.pause();
  playing = false;
  playState();
}
function playState() {
  $("#play").innerHTML = icon(playing ? "Pause" : "Play");
  $("#play").setAttribute("aria-label", playing ? "Pausar" : "Reproduzir");
  if (editingComposition()) compositionUI.updateResizeOverlay();
}
function setPanel(panel) {
  $(".workspace").dataset.panel = panel;
  all("[data-panel]")
    .filter(x => x.tagName === "BUTTON")
    .forEach(b => b.setAttribute("aria-pressed", b.dataset.panel === panel));
}
function remember() {
  history.push(structuredClone(project));
  if (history.length > 45) history.shift();
  future = [];
  mark();
}
function mark() {
  editorRevision++;
  dirty = true;
  projectStatus = "Alterações não salvas";
  updateHistory();
}
function updateHistory() {
  const editing = mode === "motion" && animation;
  $("#save-status").textContent = editing?.edited ? "Alterações não salvas" : projectStatus;
  $("#undo").disabled = !(editing ? animation.undo.length : history.length);
  $("#redo").disabled = !(editing ? animation.redo.length : future.length);
  if (editing?.clipId) $("#return-label").textContent = editing.edited ? "Aplicar na montagem" : "Voltar à montagem";
}
function rememberAnimation() {
  editorRevision++;
  animation.undo.push(structuredClone(animation.draft));
  if (animation.undo.length > 45) animation.undo.shift();
  animation.redo = [];
  animation.edited = true;
  updateHistory();
}
function mutateAnimation(edit) {
  if (!animation) return;
  stop();
  rememberAnimation();
  edit(animation.draft);
  refresh();
  redraw();
}
function applyAnimation() {
  if (!animation?.edited) return true;
  const {draft} = animation;
  try {
    validateCompositionSource(draft);
    checkDurationForClips(draft.id, draft.duration);
  } catch (error) {
    problem(error);
    return false;
  }
  const index = project.compositions.findIndex(item => item.id === draft.id);
  if (index < 0) {
    info("A composição precisa estar na biblioteca deste projeto.");
    return false;
  }
  if (JSON.stringify(draft) !== JSON.stringify(project.compositions[index])) {
    remember();
    project.compositions[index] = structuredClone(draft);
  }
  animation.edited = false;
  updateHistory();
  return true;
}
function checkDurationForClips(id, duration) {
  const min = requiredCompositionDuration(project, id);
  if (duration + 1e-7 >= min) return;
  const clip = project.clips.find(item => item.compositionId === id && item.trim + item.duration === min);
  throw new Error("O clipe “" + clip.name + "” usa a composição até " + seconds(min) + ". Ajuste o trecho na Montagem.");
}
const editingComposition = () =>
  mode === "motion" && Boolean(animation?.draft.document);
const compositionUI = createCompositionUI({
  getState: () => ({ clip: compositionClip(), time, playing, media: engine.media }),
  change: document => editingComposition() && manualCommand({id:"composition.apply",compositionId:animation.draft.id,document}),
  seek,
  openTemplates: () => showAnimationCatalog(),
  notify: info,
  setPanel,
  showDialog,
  pausePreview: stop,
  requestProjectEdit: () => showProjectAssistant("", true),
});
function timeUI() {
  $("#current").textContent = clock(time);
  $("#length").textContent = clock(currentDuration());
  if (mode === "montage") timeline.setTime(time);
  if (editingComposition()) compositionUI.setTime();
  if ($("#scene-cursor")) {
    $("#scene-cursor").value = time;
    $("#scene-read").textContent = seconds(time);
  }
}
function seek(t) {
  stop();
  time = clamp(t, 0, currentDuration());
  timeUI();
  redraw();
}
function stepFrame(direction) {
  // The end marker is exclusive, even when the last frame is shorter than 1/FPS.
  const frame = time >= currentDuration()
    ? Math.ceil(currentDuration() * FPS - 1e-8)
    : Math.floor(time * FPS + 1e-8);
  seek((frame + direction) / FPS);
}
function redraw() {
  engine.seek(liveScope(), time).catch(problem);
}
function select(id, move = false) {
  groupIds = null;
  const last = selected;
  selected = id;
  if (move && chosen())
    time = startOf(chosen()) + Math.min(chosen().duration / 2, 1.9);
  if (last !== id && playing) stop();
  refresh();
  if (move) seek(time);
}
function normalize() {
  if (mode !== "montage") groupIds = null;
  if (groupIds)
    groupIds = new Set(
      project.clips.filter(c => groupIds.has(c.id)).map(c => c.id)
    );
  if (!chosen() && selected !== "audio") selected = project.clips[0]?.id ?? null;
  time = clamp(time, 0, currentDuration());
  if (activeWave()) keyIndex = clamp(keyIndex, 0, Math.max(0, activeWave().keys.length - 1));
}
function refresh() {
  normalize();
  $("#project-name").textContent = project.name || "Projeto";
  refreshEnvironment();
  updateHistory();
  if (editingComposition()) compositionUI.render();
  else {
    compositionUI.leave();
    renderLibrary();
    renderInspector();
    renderMotion();
  }
  if (mode === "montage") timeline.update(project, time, selected, groupIds);
  timeUI();
  paintIcons();
}
function mutate(fn) {
  stop();
  remember();
  fn();
  refresh();
  redraw();
}
const timeline = mountTimeline($("#timeline"), {
  onToggleGroup: id => {
    stop();
    if (!id) groupIds = groupIds ? null : new Set(chosen() ? [selected] : []);
    else {
      groupIds ??= new Set(chosen() ? [selected] : []);
      if (groupIds.has(id)) groupIds.delete(id);
      else groupIds.add(id);
    }
    refresh();
    if (groupIds?.size > 1) setPanel("props");
  },
  onSeek: t => seek(t),
  onSelect: id => {select(id);if(matchMedia("(max-width:760px)").matches && document.body.dataset.mobileView==="contextual")setPanel("props");},
  onOpenComposition: id => {
    const clip = project.clips.find(item => item.id === id);
    if (clip?.compositionId) openAnimation(clip.compositionId, {clip});
  },
  onOpenSpeech: (id, at, trigger) => {
    if (groupIds) return;
    selected = id;
    seek(at);
    refresh();
    editSpeech(trigger?.isConnected ? trigger : $("#edit-speech"));
  },
  onChange: (_, clipId, index) => manualCommand({id:"clip.order", clipId, index}),
  onAction: action => editClip(action),
  onNewTrack: () => {
    if (trackCount(project) >= TRACK_LIMIT) return;
    stop();
    showDialog("Adicionar pista", "<p>" + trackCount(project) + " de 5 pistas em uso.</p>",
      '<button class="btn" id="add-video-track">Vídeo</button><button class="btn" id="add-audio-track">Áudio</button>');
    for (const kind of ["video", "audio"]) $("#add-" + kind + "-track").onclick = () => {
      const track = {id: uid(), kind, clips: []};
      manualCommand({id:"track.add",trackId:track.id,kind});
      editTrack(track.id);
    };
  },
  onTrackEdit: editTrack,
  onTransition: editTransition,
});
const narrationAvailable = Boolean($('meta[name="mare-narration"]'));
function editNarration(originalTrack, originalClip) {
  stop();
  const owner = project;
  const placement = (start, duration) => narrationPlacement(project, start, duration, originalTrack, originalClip);
  openNarrationEditor({dialog: $("#dialog"), showDialog, clip: originalClip, start: originalClip?.start ?? time,
    checkPlacement: placement,
    async apply(file, narration, start, current) {
      const asset = await engine.importMedia(file, "audio");
      if (!current() || owner !== project) return;
      const target = placement(start, asset.duration);
      const track = target ?? {id: uid(), kind: "audio", clips: []};
      const fields = {...asset, name: "Narração · " + narration.text.slice(0, 48),
        start, trim: 0, sourceDuration: asset.duration, narration};
      mutate(() => {
        if (!target) (project.extraTracks ??= []).push(track);
        if (originalClip) Object.assign(originalClip, fields);
        else track.clips.push({id: uid(), ...fields});
        time = start;
      });
    },
  });
}
function editTrack(id, clipId) {
  stop();
  const track = project.extraTracks?.find(t => t.id === id);
  if (!track) return;
  const c = track.clips.find(c => c.id === clipId);
  const video = track.kind === "video";
  const title = video ? "Pista de vídeo" : "Pista de áudio";
  const field = (key, label, value) => '<label>' + label + ' (s)<input id="lane-' + key +
    '" type="number" step="any" min="0" value="' + Number(value.toFixed(4)) + '"></label>';
  const close = () => $("#dialog").close();
  if (c) {
    showDialog(esc(c.name), '<div class="lane-fields">' + field("start", "Posição na montagem", c.start) +
      field("trim", "Entrada na fonte", c.trim) + field("length", "Duração", c.duration) +
      (c.narration ? '<label>Volume da narração (%)<input id="lane-volume" type="number" min="0" max="100" value="' + Math.round((c.volume ?? 1) * 100) + '"></label>' : '') +
      '</div><p role="alert" id="lane-error"></p>',
      '<button class="btn" id="lane-delete">Excluir clipe</button>' +
      (c.narration && narrationAvailable ? '<button class="btn" id="lane-narration">Editar roteiro e voz</button>' : '') +
      '<button class="btn primary" id="lane-apply">Aplicar</button>');
    if ($("#lane-narration")) $("#lane-narration").onclick = () => editNarration(track, c);
    $("#lane-delete").onclick = () => { manualCommand({id:"clip.remove",trackId:id,clipId:c.id}); close(); };
    $("#lane-apply").onclick = () => {
      const [start, trim, duration] = ["start", "trim", "length"].map(k => $("#lane-" + k).valueAsNumber);
      if (![start, trim, duration].every(Number.isFinite) || start < 0 || trim < 0 || duration < 1/30 ||
          trim + duration > c.sourceDuration + .0001 ||
          track.clips.some(other => other !== c && start < other.start + other.duration - 1e-8 && start + duration > other.start + 1e-8)) {
        $("#lane-error").textContent = "Confira a duração da fonte e escolha um espaço livre na pista."; return;
      }
      const volume = $("#lane-volume")?.valueAsNumber / 100;
      if (c.narration && (!Number.isFinite(volume) || volume < 0 || volume > 1 || start + duration > 60.000001)) {
        $("#lane-error").textContent = "Use volume de 0 a 100% e termine a narração até 60 s."; return;
      }
      const fields = {start, trim, duration, ...(c.narration ? {volume} : {})};
      if (Object.entries(fields).some(([key,value]) => c[key] !== value))
        manualCommand({id:"clip.set",trackId:id,clipId:c.id,fields});
      seek(start); close();
    };
    return;
  }
  const cursor = time;
  showDialog(title, '<p>' + (video ? 'O vídeo desta pista aparece acima da pista principal, sem áudio.' :
    'O áudio desta pista toca junto com o som original e a trilha.') + '</p>' +
    '<p>Inserir no marcador · ' + clock(cursor) + '</p><p role="alert" id="lane-error"></p>' +
    '<input hidden type="file" id="lane-file" accept="' + track.kind + '/*">',
    '<button class="btn" id="lane-remove">Excluir pista</button><button class="btn" id="lane-example">Usar ' +
    (video ? 'Maré azul' : 'Pulso oceânico') + '</button><button class="btn primary" id="lane-import">Importar mídia</button>');
  const insert = async (getAsset) => {
    const error = $("#lane-error"), dialog = $("#dialog");
    try {
      const asset = await getAsset();
      if (!dialog.open || !error.isConnected || !project.extraTracks.includes(track)) return;
      const next = track.clips.filter(c => c.start > cursor).sort((a,b) => a.start - b.start)[0];
      const length = Math.min(asset.duration, next ? next.start - cursor : Infinity);
      if (length < 1/30 || track.clips.some(c => c.start <= cursor && cursor < c.start + c.duration - 1e-8)) {
        error.textContent = "O marcador está ocupado. Posicione-o em um espaço livre desta pista."; return;
      }
      mutate(() => track.clips.push({...asset, id:uid(), sourceDuration:asset.duration, start:cursor, trim:0, duration:length}));
      close();
    } catch (err) { error.textContent = err.message; }
  };
  $("#lane-example").onclick = () => insert(async () => {
    const assetId = video ? "tide" : "sound";
    const el = await engine.loadAsset(assetId, track.kind);
    return {assetId, name:video ? "Maré azul" : "Pulso oceânico", duration:el.duration};
  });
  $("#lane-import").onclick = () => $("#lane-file").click();
  $("#lane-file").onchange = e => { const f = e.target.files[0]; if (f) insert(() => engine.importMedia(f, track.kind)); };
  $("#lane-remove").onclick = () => {
    manualCommand({id:"track.remove",trackId:id}); close();
  };
}

function editTransition(index) {
  stop();
  const clip = project.clips[index], previous = project.clips[index - 1];
  if (!previous || !clip) return;
  const max = Math.min(60, 2 * Math.floor(Math.min(clip.duration, previous.duration) * FPS / 2 + 1e-8));
  if (max < 2) { info("Os clipes precisam ter pelo menos dois quadros para esta transição."); return; }
  const frames = transitionFrames(previous, clip);
  const dialog = $("#dialog");
  openTransitionGallery({
    dialog, showDialog, icon, max, from: previous.name, to: clip.name,
    current: frames ? {type: clip.transitionIn.type, frames} : null,
    loadPictures: async () => {
      const pictures = [];
      for (const [item, local] of [[previous, Math.max(0,previous.duration - 1/FPS)], [clip, Math.min(clip.duration/2, .12)]]) {
        const clean = {...project, clips:[{...item,transitionIn:undefined}], extraTracks:[], sound:{enabled:false,volume:0}};
        const blob = await previewFrame(clean, {}, local);
        pictures.push(blob);
      }
      return pictures;
    },
    privateLab: Boolean($('meta[name="mare-processor"]')),
    onApply: (type, length) => {
      if (project.clips[index] !== clip || project.clips[index - 1] !== previous)
        throw new Error("O corte mudou. Reabra a galeria para escolher a transição.");
      const existing = clip.transitionIn;
      const same = type ? existing?.from === previous.id && existing.type === type && existing.frames === length : !existing;
      if (same) return;
      const at=startOf(clip);
      manualCommand({id:"transition.set",clipId:clip.id,fromId:previous.id,type:type||null,frames:length});
      seek(at);
    },
  });
  dialog.addEventListener("close", () => {
    if (!dialog.open)
      $(`.lane-join[data-transition-to="${CSS.escape(clip.id)}"]`)?.focus({preventScroll: true});
  }, {once: true});
}
function editClip(action) {
  const clip = chosen();
  if (!clip) {
    if (action === "delete" && selected === "audio")
      manualCommand({id:"sound.set",enabled:false});
    return;
  }
  const index = project.clips.indexOf(clip),
    offset = time - startOf(clip);
  if (action === "split" && !canSplitAt(clip, offset)) {
    info("Posicione o marcador no interior do clipe.");
    return;
  }
  const clipId=clip.id;
  if (action==="delete") {
    manualCommand({id:"clip.remove",clipId});
    const nearest=project.clips[Math.min(index,project.clips.length-1)];
    select(nearest?.id??null);
    seek(nearest?startOf(nearest):0);
  } else if (action==="split" || action==="duplicate") {
    const newId=uid();
    manualCommand(action==="split"?{id:"clip.split",clipId,offset,newId}:{id:"clip.duplicate",clipId,newId});
    select(newId);
    if (action==="duplicate") seek(startOf(chosen()));
  }
}
const sourceVideos = () => {
  const ids = new Map(
    sample()
      .clips.filter(c => c.kind === "video")
      .map(c => [c.assetId, c])
  );
  project.clips
    .filter(c => c.kind === "video")
    .forEach(c => ids.set(c.assetId, c));
  return [...ids.values()];
};
function refreshEnvironment() {
  const motion = mode === "motion";
  const draft = animation?.draft;
  const clip = chosen();
  const returning = Boolean(animation?.clipId);
  const hasAnimation = Boolean(draft?.scene || draft?.document?.layers.length);
  document.body.dataset.environment = motion ? "animation" : "montage";
  $("#environment-label").textContent = motion ? "Animação" : "Montagem";
  $("#environment-item").textContent = motion ? draft?.name ?? "Composições do projeto" : clip?.name ?? "Linha do tempo";
  $("#mobile-library-label").textContent=motion?"Camadas":"Biblioteca";
  $("#mobile-fine").textContent=motion?"Keyframes e ajustes finos":"Ajustes finos";
  $("#library-label").textContent = motion ? "Composições e camadas" : "Mídias do projeto";
  $("#inspector-label").textContent = motion ? "Propriedades da composição" : "Propriedades do clipe";
  $("#screen").setAttribute("aria-label", motion ? "Prévia da composição" : "Prévia da montagem");
  $("#export").disabled = motion ? !hasAnimation : !project.clips.length;
  const canPlay = motion ? hasAnimation : Boolean(currentDuration());
  $("#play").disabled = $("#back").disabled = $("#end").disabled = $("#full").disabled = !canPlay;
  $("#animation-starter").hidden = !motion || hasAnimation;
  $("#rename-animation").hidden = !motion || !draft;
  $("#montage-mode").setAttribute("aria-pressed", !motion);
  $("#motion-mode").setAttribute("aria-pressed", motion);
  $("#timeline").hidden = motion;
  $("#motion-track").hidden = !motion || !hasAnimation;
  $(".filters").hidden = $("#import").hidden = motion;
  $("#stock-library").hidden = motion;
  $("#create-composition").hidden = $("#animation-catalog").hidden = !motion;
  $("#edit-scene").hidden = motion || !clip?.compositionId || Boolean(groupIds);
  $("#generate-narration").hidden = motion || !narrationAvailable;
  $("#generate-narration").disabled = !project.clips.length;
  $("#edit-speech").hidden = motion || clip?.kind !== "video" || Boolean(groupIds);
  $("#apply-and-return").hidden = !motion || !returning;
  $("#return-label").textContent = "Voltar à montagem";
  $("#apply-and-return").classList.toggle("environment-primary", returning);
  $("#duplicate-composition").hidden = !motion || !hasAnimation;
  $("#insert-composition").hidden = !motion || !hasAnimation || returning;
  $("#duplicate-composition").title = returning ? "Cria uma cópia para este clipe" : "Cria uma cópia na biblioteca";
  $("#insertion-point").hidden = $("#insert-composition").hidden || !project.clips.length;
  $("#insertion-point").textContent = "Posição na montagem · " + clock(Math.min(montageView?.time ?? 0, sum(project.clips)));
  $("#composition-duration-field").hidden = !motion || !draft;
  if (motion && draft) $("#composition-duration").value = draft.duration;
  const library = $("#composition-library");
  library.hidden = !motion || !project.compositions.length;
  if (motion) {
    library.innerHTML = '<div class="asset-heading">Composições do projeto</div><div class="composition-library-list">' +
      project.compositions.map(item =>
        '<button type="button" class="composition-source" data-open-comp="' + esc(item.id) +
        '" aria-pressed="' + (draft?.id === item.id) + '">' + icon(item.kind === "wave" ? "Waves" : "SquareStack") +
        '<span>' + esc(item.name) + "</span></button>"
      ).join("") + "</div>";
  }
}
function startAnimationSession(source, clipId = null) {
  animation = source ? {draft: structuredClone(source), clipId, undo: [], redo: [], edited: false} : null;
  lastCompositionId = source?.id ?? null;
}
function openAnimation(id, {clip, cursor, panel = "preview"} = {}) {
  if (mode === "motion" && id && id === animation?.draft.id && (!clip || clip.id===animation.clipId)) {
    setPanel(panel);
    return;
  }
  if (!applyAnimation()) return;
  stop();
  if (mode === "montage") {
    montageView = {time, selected: clip?.id ?? selected, groupIds,
      panel: $(".workspace").dataset.panel, viewport: timeline.getViewport()};
  }
  mode = "motion";
  startAnimationSession(findComposition(id), clip?.id);
  time = cursor ?? (clip ? timeInComposition(clip, startOf(clip), montageView?.time??0) : 0);
  keyIndex = 0;
  refresh();
  setPanel(animation ? panel : "preview");
  redraw();
}
function returnToMontage({clip, at} = {}) {
  if (!applyAnimation()) return;
  stop();
  const view = montageView;
  animation = montageView = null;
  mode = "montage";
  time = at ?? view?.time ?? 0;
  selected = clip?.id ?? view?.selected ?? selected;
  groupIds = clip ? null : view?.groupIds ?? null;
  refresh();
  setPanel(clip ? "preview" : view?.panel ?? "preview");
  if (view) timeline.restoreViewport(view.viewport);
  redraw();
}
function availableCompositionName(name) {
  const names = new Set(project.compositions.map(item => item.name));
  let next = name;
  for (let ordinal = 2; names.has(next); ordinal++) next = name + " " + ordinal;
  return next;
}
function addComposition(name, document, duration, cursor = 0, panel = "props") {
  if (!applyAnimation()) return;
  const entry = {id: uid(), name: availableCompositionName(name), kind: "composition", document, duration};
  validateCompositionSource(entry);
  remember();
  project.compositions.push(entry);
  openAnimation(entry.id, {cursor, panel});
}
function duplicateComposition() {
  if (!animation) return;
  const {draft, clipId} = animation;
  const copy = {...structuredClone(draft), id: uid(), name: availableCompositionName(draft.name + " (cópia)")};
  const clip = project.clips.find(item => item.id === clipId && item.compositionId === draft.id);
  validateCompositionSource(copy);
  remember();
  project.compositions.push(copy);
  if (clip) clip.compositionId = copy.id;
  startAnimationSession(copy, clip?.id);
  refresh();
  redraw();
  info(clip ? "Cópia vinculada apenas a este clipe." : "Cópia adicionada às composições do projeto.");
}
function placeComposition(id) {
  if (!applyAnimation()) return;
  const composition = findComposition(id);
  if (!composition) return;
  stop();
  const placement = mode === "motion" ? montageView?.time ?? 0 : time;
  remember();
  const {clip, time: at} = insertCompositionAt(project.clips, composition, placement);
  if (mode === "motion") returnToMontage({clip, at});
  else {
    selected = clip.id;
    time = at;
    groupIds = null;
    refresh();
    redraw();
  }
  info("Composição adicionada em " + seconds(at) + ".");
}
function createCompositionClip() {
  addComposition("Composição", newComposition(), 4, 0, "preview");
}
function showAnimationCatalog(initialFilter = "all", {newProject = false} = {}) {
  stop();
  openAnimationCatalog({
    dialog: $("#dialog"),
    showDialog,
    initialFilter,
    insert(template, composition) {
      const cursor = template.duration * .63;
      if (newProject) startAnimationProject(template.name, composition, template.duration, cursor);
      else addComposition(template.name, composition, template.duration, cursor);
    },
  });
}
function renderLibrary() {
  if (mode === "motion") {
    $("#library-items").replaceChildren();
    return;
  }
  all("[data-filter]").forEach(b =>
    b.setAttribute("aria-pressed", b.dataset.filter === filter)
  );
  const videos = sourceVideos()
    .map(
      c =>
        '<button class="asset-card" data-add="' +
        esc(c.assetId) +
        '" title="Adicionar ' +
        esc(c.name) +
        ' à montagem"><span class="thumb">' +
        (["coast", "tide"].includes(c.assetId)
          ? '<img alt="" src="./assets/' + c.assetId + '.jpg">'
          : icon("Video")) +
        '<span class="duration">' +
        clock(
          c.sourceDuration ||
            engine.media.get(c.assetId)?.duration ||
            c.duration
        ).slice(0, 5) +
        '</span></span><span class="asset-name">' +
        esc(c.name) +
        "</span></button>"
    )
    .join("");
  const sections = [];
  if (filter === "all" && project.compositions.length) {
    sections.push('<div class="asset-heading">Composições</div>');
    for (const composition of project.compositions) {
      sections.push(
        '<button class="composition-source" data-place-comp="' +
          esc(composition.id) +
          '" title="' + esc("Adicionar ao marcador · " + composition.name) + '">' +
          icon(composition.kind === "wave" ? "Waves" : "SquareStack") +
          "<span>" +
          esc(composition.name) +
          "</span>" +
          icon("Plus") +
          "</button>"
      );
    }
  }
  if (filter !== "audio")
    sections.push(
      '<div class="asset-heading">Clipes de vídeo</div><div class="asset-grid">' +
        videos +
        "</div>"
    );
  if (filter !== "video")
    sections.push(
      '<div class="asset-heading">Trilha sonora</div><button class="asset-audio" data-add="sound">' +
        icon("AudioLines") +
        "<span>" +
        esc(project.sound.name || "Pulso oceânico") +
        "</span><small>" +
        icon("SlidersHorizontal") +
        "</small></button>"
    );
  $("#library-items").innerHTML = sections.join("");
}
function setMode(next) {
  if (mode === next) return;
  if (next === "montage") {
    returnToMontage();
    return;
  }
  const clip = chosen();
  if (clip?.compositionId) openAnimation(clip.compositionId, {clip});
  else openAnimation(findComposition(lastCompositionId)?.id ?? project.compositions[0]?.id);
}
function addAsset(asset) {
  if (asset === "sound") {
    mode = "montage";
    select("audio");
    setPanel("props");
    return;
  }
  const src = sourceVideos().find(c => c.assetId === asset);
  if (!src) return;
  mode = "montage";
  mutate(() => {
    const c = {
      ...src,
      id: uid(),
      trim: 0,
      duration: Math.min(3, src.sourceDuration || src.duration),
    };
    delete c.talk;
    project.clips.push(c);
    selected = c.id;
    time = startOf(c);
  });
  info("Clipe adicionado à montagem.");
}
const input = (id, label, value, max = 80) =>
  '<label class="field"><span class="field-label">' +
  label +
  '</span><input class="text-input" id="' +
  id +
  '" maxlength="' +
  max +
  '" value="' +
  esc(value) +
  '"></label>';
const slider = (id, label, value, min, max, step, display) =>
  '<label class="field"><span class="value-head"><span>' +
  label +
  '</span><output id="' +
  id +
  '-out">' +
  esc(display) +
  '</output></span><input class="slider" id="' +
  id +
  '" type="range" min="' +
  min +
  '" max="' +
  max +
  '" step="' +
  step +
  '" value="' +
  value +
  '"></label>';
const propTitle = (symbol, name, type) =>
  '<div class="prop-title"><span class="prop-symbol">' +
  icon(symbol) +
  "</span><div><b>" +
  esc(name) +
  "</b><small>" +
  type +
  "</small></div></div>";
const btn = (id, symbol, label) =>
  '<button id="' +
  id +
  '" class="btn edit-motion">' +
  icon(symbol) +
  label +
  "</button>";
function groupSelection() {
  return project.clips.filter(c => groupIds?.has(c.id));
}
function applyGroupDuration(value) {
  const clips = groupSelection();
  manualCommand({id:"clips.shorten",clipIds:clips.map(c=>c.id),duration:value});
  info(
    clips.length + " clipes ajustados para " + seconds(value) + " no total."
  );
}
function holdFinalScene(clip) {
  const source = compositionForClip(project, clip);
  if (!clip || clip !== project.clips.at(-1) || !source?.document ||
      Math.abs(clip.trim + clip.duration - source.duration) > 1e-6 ||
      project.extraTracks?.some(t => t.clips.some(c => c.start + c.duration > sum(project.clips) + 1e-6))) return [];
  const end = source.duration + 1;
  const visible = source.document.layers.filter(l => l.start < source.duration && l.end >= source.duration - 1e-6);
  if (!visible.length || end > 3600 || visible.some(l => l.end > source.duration + 1e-6)) return [];
  const shared = project.clips.some(c => c !== clip && c.compositionId === source.id);
  const compositionId = shared ? crypto.randomUUID() : source.id;
  return [
    ...(shared ? [{id:"composition.duplicate",compositionId:source.id,newId:compositionId,clipId:clip.id}] : []),
    {id:"composition.duration",compositionId,duration:end},
    ...visible.map(l => ({id:"layer.set",compositionId,layerId:l.id,fields:{end}})),
    {id:"clip.set",clipId:clip.id,fields:{duration:clip.duration+1}}
  ];
}
function renderInspector() {
  if (mode === "motion") {
    $("#inspector").innerHTML = activeWave() ? waveProperties() :
      '<p class="group-help">Crie uma composição ou escolha um modelo na biblioteca.</p>';
    return;
  }
  const c = chosen();
  const source = compositionForClip(project, c);
  let html = "";
  if (groupIds) {
    const clips = groupSelection(),
      duration = sum(clips);
    html = propTitle(
      "Clapperboard",
      "Seleção de clipes",
      clips.length + " selecionados · " + seconds(duration)
    );
    if (clips.length < 2)
      html +=
        '<p class="group-help">Toque nos clipes da timeline para incluí-los na seleção.</p>';
    else
      html +=
        '<p class="group-help">O ajuste encurta o final de cada clipe na mesma proporção.</p>' +
        '<label class="field"><span class="field-label">Duração total (s)</span><input class="num-input" id="group-seconds" min=".1" step=".1" type="number" value="' +
        Number(duration.toFixed(2)) +
        '"></label>' +
        btn("group-apply", "Clock3", "Aplicar duração") +
        btn("group-ask", "Sparkles", "Pedir à IA");
    html += btn("group-done", "Check", "Concluir seleção");
  } else if (selected === "audio") {
    html =
      propTitle(
        "AudioLines",
        project.sound.name || "Trilha",
        "Faixa de áudio"
      ) +
      slider(
        "volume",
        "Volume",
        project.sound.volume,
        0,
        1,
        0.01,
        Math.round(project.sound.volume * 100) + "%"
      ) +
      btn(
        "sound-toggle",
        project.sound.enabled ? "Volume2" : "VolumeX",
        project.sound.enabled ? "Silenciar trilha" : "Ativar trilha"
      ) +
      btn("replace-audio", "Upload", "Importar outra trilha");
  } else if (source) {
    html =
      propTitle(
        source.kind === "wave" ? "Waves" : "SquareStack",
        c.name,
        source.name + " · Composição vinculada"
      ) +
      input("clip-name", "Nome do clipe", c.name) +
      slider(
        "trim", "Início na composição", c.trim, 0, Math.max(0, source.duration - c.duration),
        0.01, seconds(c.trim)
      ) +
      slider(
        "clip-length",
        "Duração na montagem",
        c.duration,
        Math.min(0.1, c.duration),
        Math.max(c.duration, source.duration - c.trim),
        0.01,
        seconds(c.duration)
      );
  } else if (c?.kind === "video") {
    const source =
      engine.media.get(c.assetId)?.duration ||
      c.sourceDuration ||
      c.duration + c.trim;
    html =
      propTitle("Film", c.name, "Clipe de vídeo") +
      input("clip-name", "Nome do clipe", c.name) +
      slider(
        "trim",
        "Início na fonte",
        c.trim,
        0,
        Math.max(0, source - c.duration),
        0.01,
        seconds(c.trim)
      ) +
      slider(
        "clip-length",
        "Duração",
        c.duration,
        0.1,
        source - c.trim,
        0.01,
        seconds(c.duration)
      ) +
      slider("clip-volume","Volume do clipe",c.volume??1,0,1,.01,Math.round((c.volume??1)*100)+"%") +
      btn("split", "Clapperboard", "Dividir no marcador");
  } else {
    html = '<p class="group-help">Adicione uma mídia ou composição à pista principal para começar.</p>';
  }
  if (!groupIds && selected !== "audio" && c) {
    const index = project.clips.indexOf(c);
    const transition = index > 0 ? btn("quick-transition", "Clapperboard", "Experimentar uma transição") : "";
    const hold = holdFinalScene(c).length ? btn("quick-hold", "Clock3", "Segurar a cena final por mais 1 s") : "";
    if (transition || hold) html += '<section class="cp-quick"><div class="cp-heading">Ações rápidas</div>' + hold + transition + '</section>';
  }
  $("#inspector").innerHTML = html;
}
function waveProperties() {
  const sc = activeWave();
  let html =
      propTitle("Waves", "Cena animada", "Animação procedural") +
      input("scene-title", "Título da cena", sc.title) +
      '<div class="field-label">Cor da onda</div><div class="colorline">' +
      ["#ff693e", "#f4ba56", "#a3ceae", "#98bbed", "#c89bd9"]
        .map(
          (color, i) =>
            '<button class="swatch" data-color="' +
            color +
            '" style="--sw:' +
            color +
            '" aria-label="' +
            ["Coral", "Âmbar", "Sálvia", "Azul", "Lilás"][i] +
            '" aria-pressed="' +
            (sc.color === color) +
            '"></button>'
        )
        .join("") +
      '<input id="custom-color" aria-label="Cor personalizada" type="color" value="' +
      esc(sc.color) +
      '"></div><hr><div class="section-title">' +
      icon("Waves") +
      "Movimento da onda</div>" +
      slider(
        "amplitude",
        "Amplitude",
        sc.amplitude,
        0.15,
        1.85,
        0.05,
        Math.round(sc.amplitude * 100) + "%"
      ) +
      slider("speed", "Velocidade", sc.speed, 0.25, 2.5, 0.05, sc.speed + "×");
  html += slider(
        "entry",
        "Entrada do título",
        sc.entry,
        0,
        Math.max(currentDuration(), sc.entry),
        0.05,
        seconds(sc.entry)
      );
  const key = sc.keys[keyIndex];
  if (key) {
    html +=
          '<hr><div class="section-title">' +
          icon("Diamond") +
          "Keyframe do título · " +
          seconds(key.t) +
          "</div>" +
          slider(
            "key-y",
            "Deslocamento vertical",
            key.y,
            -360,
            360,
            1,
            key.y + " px"
          ) +
          slider(
            "key-opacity",
            "Opacidade",
            key.opacity,
            0,
            1,
            0.01,
            Math.round(key.opacity * 100) + "%"
          ) +
          slider(
            "key-time",
            "Tempo do keyframe",
            key.t,
            0,
            Math.max(currentDuration(), key.t),
            0.01,
            seconds(key.t)
          ) +
          btn("remove-key", "Trash2", "Remover keyframe");
  }
  return html;
}
function renderMotion() {
  const wave = mode === "motion" && activeWave();
  if (!wave) {
    $("#motion-track").replaceChildren();
    return;
  }
  const max = currentDuration();
  const keys = wave.keys
    .map(
      (k, i) =>
        '<button aria-label="Selecionar keyframe em ' +
        seconds(k.t) +
        '" aria-pressed="' +
        (i === keyIndex) +
        '" data-key="' +
        i +
        '">◇ ' +
        seconds(k.t) +
        "</button>"
    )
    .join("");
  $("#motion-track").innerHTML =
    '<div class="motion-header"><h2>' +
    icon("Diamond") +
    "Keyframes do título</h2>" +
    btn("add-key", "Plus", "Adicionar keyframe").replace("edit-motion", "") +
    '</div><div class="motion-rail"><input type="range" aria-label="Tempo da composição" id="scene-cursor" min="0" max="' +
    max +
    '" step=".01" value="' +
    time +
    '">' +
    wave.keys
      .map((k, i) =>
        k.t < 0 || k.t > max
          ? ""
          : '<button class="key-mark" data-drag-key="' +
            i +
            '" aria-label="Mover keyframe em ' +
            seconds(k.t) +
            '" title="Arraste para ajustar o tempo" style="left:' +
            (100 * k.t) / max +
            '%">◆</button>'
      )
      .join("") +
    '</div><div class="motion-footer"><div class="key-list">' +
    keys +
    '</div><span id="scene-read">' +
    seconds(time) +
    "</span></div>";
}
let fieldStarted = null;
function fieldInput(el) {
  const c = chosen(),
    sc = activeWave(),
    n = Number(el.value);
  let label;
  if (
    ![
      "scene-title",
      "clip-name",
      "amplitude",
      "speed",
      "entry",
      "volume",
      "clip-volume",
      "custom-color",
      "trim",
      "clip-length",
      "key-y",
      "key-opacity",
      "key-time",
    ].includes(el.id)
  )
    return;
  stop();
  if (fieldStarted !== el) {
    if (mode === "motion") rememberAnimation();
    else remember();
    fieldStarted = el;
  }
  editorRevision++;
  switch (el.id) {
    case "scene-title":
      sc.title = el.value;
      break;
    case "clip-name":
      c.name = el.value;
      $("#environment-item").textContent = c.name;
      break;
    case "custom-color":
      sc.color = el.value;
      break;
    case "amplitude":
      sc.amplitude = n;
      label = Math.round(n * 100) + "%";
      break;
    case "speed":
      sc.speed = n;
      label = n + "×";
      break;
    case "entry":
      sc.entry = n;
      label = seconds(n);
      break;
    case "clip-volume":
      c.volume=n;
      label=Math.round(n*100)+"%";
      break;
    case "volume":
      project.sound.volume = n;
      label = Math.round(n * 100) + "%";
      break;
    case "trim":
      c.trim = n;
      label = seconds(n);
      break;
    case "clip-length":
      c.duration = n;
      label = seconds(n);
      break;
    case "key-y":
      sc.keys[keyIndex].y = n;
      label = n + " px";
      break;
    case "key-opacity":
      sc.keys[keyIndex].opacity = n;
      label = Math.round(n * 100) + "%";
      break;
    case "key-time":
      sc.keys[keyIndex].t = n;
      label = seconds(n);
      time = clamp(n, 0, currentDuration());
      break;
  }
  if (label) $("#" + el.id + "-out").textContent = label;
  normalize();
  timeUI();
  if (mode === "montage") timeline.update(project, time, selected, groupIds);
  else renderMotion();
  redraw();
}
$("#inspector").oninput = e => fieldInput(e.target);
$("#inspector").onchange = () => {
  fieldStarted = null;
  if (mode === "montage") {
    renderLibrary();
    timeline.update(project, time, selected, groupIds);
  }
};
$("#inspector").addEventListener("focusout", () => {
  fieldStarted = null;
});
$("#inspector").addEventListener("change", e => {
  if (["clip-length", "trim", "custom-color", "key-time"].includes(e.target.id))
    renderInspector();
});
$("#inspector").onclick = e => {
  const action = e.target.closest("button")?.id;
  if (action === "group-done") {
    groupIds = null;
    refresh();
    return;
  }
  if (action === "group-ask") return showProjectAssistant();
  if (action === "quick-transition") return editTransition(project.clips.indexOf(chosen()));
  if (action === "quick-hold") {
    try {
      const commands = holdFinalScene(chosen());
      if (!commands.length) throw Error("O encerramento mudou.");
      projectEditor.prepare(editorRevision, commands).apply();
      info("Cena final prolongada em 1 s.");
    } catch (error) { problem(error); }
    return;
  }
  if (action === "group-apply") {
    try { applyGroupDuration(Number($("#group-seconds").value)); } catch (err) { problem(err); }
    return;
  }
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.color) mutateAnimation(draft => (draft.scene.color = b.dataset.color));
  if (b.id === "split") editClip("split");
  if (b.id === "sound-toggle")
    manualCommand({id:"sound.set",enabled:!project.sound.enabled});
  if (b.id === "replace-audio") {
    const el = $("#media-file");
    el.accept = "audio/*";
    el.click();
  }
  if (b.id === "remove-key")
    mutateAnimation(draft => draft.scene.keys.splice(keyIndex, 1));
};
$("#motion-track").oninput = e => {
  if (e.target.id === "scene-cursor")
    seek(Number(e.target.value));
};
$("#motion-track").onclick = e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.key != null) {
    keyIndex = Number(b.dataset.key);
    const k = activeWave().keys[keyIndex];
    refresh();
    seek(k.t);
    setPanel("props");
  }
  if (b.id === "add-key") {
    const t = Math.round(time * 100) / 100;
    const existing = activeWave().keys.findIndex(
      k => Math.abs(k.t - t) < 0.01
    );
    if (existing >= 0) {
      keyIndex = existing;
      refresh();
      setPanel("props");
      return;
    }
    mutateAnimation(({scene}) => {
      const k = { t, y: 0, opacity: 1 };
      scene.keys.push(k);
      scene.keys.sort((a, b) => a.t - b.t);
      keyIndex = scene.keys.indexOf(k);
    });
    setPanel("props");
  }
};
let draggingKey = null;
const motionTrack = $("#motion-track");
motionTrack.addEventListener("pointerdown", event => {
  const handle = event.target.closest("[data-drag-key]");
  if (!handle) return;
  event.preventDefault();
  stop();
  keyIndex = Number(handle.dataset.dragKey);
  draggingKey = {
    id: event.pointerId,
    changed: false,
    origin: event.clientX,
    handle,
  };
  motionTrack.setPointerCapture(event.pointerId);
});
motionTrack.addEventListener("pointermove", event => {
  if (!draggingKey || event.pointerId !== draggingKey.id) return;
  if (!draggingKey.changed && Math.abs(event.clientX - draggingKey.origin) < 3)
    return;
  if (!draggingKey.changed) {
    rememberAnimation();
    draggingKey.changed = true;
  }
  const r = $(".motion-rail").getBoundingClientRect();
  const ofs = clamp((event.clientX - r.left) / r.width, 0, 1);
  const key = activeWave().keys[keyIndex];
  editorRevision++;
  key.t = Math.round(ofs * currentDuration() * 100) / 100;
  draggingKey.handle.style.left = ofs * 100 + "%";
  seek(ofs * currentDuration());
});
function endKeyDrag() {
  if (!draggingKey) return;
  draggingKey = null;
  const k = activeWave()?.keys[keyIndex];
  if (!k) return;
  refresh();
  seek(k.t);
  setPanel("props");
}
motionTrack.addEventListener("pointerup", endKeyDrag);
motionTrack.addEventListener("pointercancel", endKeyDrag);
motionTrack.addEventListener("keydown", event => {
  const b = event.target.closest("[data-drag-key]");
  if (!b || !["ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) return;
  event.preventDefault();
  keyIndex = Number(b.dataset.dragKey);
  const k = activeWave().keys[keyIndex];
  if (event.key !== "Enter")
    mutateAnimation(
      () =>
        (k.t = clamp(
          Math.round(
            (k.t + (event.key === "ArrowRight" ? 0.05 : -0.05)) * 100
          ) / 100,
          0,
          currentDuration()
        ))
    );
  seek(k.t);
  renderInspector();
  setPanel("props");
});
async function play() {
  if (playing) {
    stop();
    return;
  }
  const duration = currentDuration();
  if (!duration || $("#play").disabled) return;
  const p = liveScope();
  if (time >= duration - 0.015) time = 0;
  const v = ++playVersion;
  playing = true;
  playState();
  try {
    await engine.play(
      p,
      time,
      t => {
        if (v === playVersion) {
          time = t;
          timeUI();
        }
      },
      () => {
        if (v === playVersion) {
          playing = false;
          playState();
          time = duration;
          timeUI();
        }
      },
      err => {
        if (v === playVersion) {
          stop();
          problem(err);
        }
      }
    );
  } catch (e) {
    if (v === playVersion) {
      stop();
      throw e;
    }
  }
}
function stepHistory(redo) {
  const editing = mode === "motion" && animation;
  const previous = editing ? animation.undo : history;
  const next = editing ? animation.redo : future;
  const [from, to] = redo ? [next, previous] : [previous, next];
  if (!from.length) return;
  editorRevision++;
  stop();
  if (editing) {
    to.push(animation.draft);
    animation.draft = from.pop();
    animation.edited = JSON.stringify(animation.draft) !== JSON.stringify(findComposition(animation.draft.id));
  } else {
    to.push(structuredClone(project));
    project = from.pop();
    mark();
  }
  refresh();
  redraw();
}
async function save() {
  if (!applyAnimation()) return;
  const snapshot = structuredClone(project);
  if (account) {
    await saveAccountProject(snapshot, await packProject(snapshot));
  } else await saveProject(snapshot);
  if (JSON.stringify(project) === JSON.stringify(snapshot)) {
    dirty = false;
    projectStatus = account ? "Salvo no PostSpark" : "Salvo neste navegador";
    updateHistory();
  }
  info(account ? "Projeto salvo no PostSpark." : "Projeto salvo neste navegador.");
}
function showDialog(title, body, footer = "") {
  const d = $("#dialog");
  $("#dialog-content").innerHTML =
    '<div class="sheet-title"><h2 id="dialog-title">' +
    title +
    '</h2><button class="icon" id="close-dialog" aria-label="Fechar">' +
    icon("X") +
    "</button></div>" +
    body +
    '<div class="dialog-actions">' +
    footer +
    "</div>";
  if (!d.open) d.showModal();
  $("#close-dialog").onclick = () => d.close();
}
const slug = (name = project.name) =>
  String(name || "mare-alta")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .slice(0, 80);

function editSpeech(trigger) {
  const clip = chosen();
  if (mode !== "montage" || clip?.kind !== "video" || groupIds) return;
  const draftOwner = project;
  const {trim, duration} = clip;
  const at = startOf(clip);
  stop();
  openSpeechEditor({clip, project, at: time >= at && time < at + duration ? time - at : 0,
    dialog: $("#dialog"), showDialog, esc, icon, trigger,
    available: Boolean($('meta[name="mare-speech"]')),
    catalog: projectEditor.catalog(),
    insertExcerpt(talk, excerpt) {
      if (draftOwner !== project || chosen() !== clip || clip.trim !== trim || clip.duration !== duration)
        throw Error("O clipe mudou. Abra a edição novamente.");
      const id = crypto.randomUUID();
      projectEditor.prepare(editorRevision, [
        {id:"clip.duplicate",clipId:clip.id,newId:id},
        {id:"clip.set",clipId:id,fields:{trim:excerpt.start,duration:excerpt.end-excerpt.start}},
        {id:"speech.apply",clipId:id,talk,cuts:[],ripple:false},
      ]).apply();
      select(id,true);
      info("Trecho inserido após o clipe.");
    },
    apply(talk, plan, ripple) {
      if (draftOwner !== project || chosen() !== clip || clip.trim !== trim || clip.duration !== duration)
        throw Error("O clipe mudou. Abra a edição automática novamente.");
      manualCommand({id:"speech.apply",clipId:clip.id,talk,cuts:plan.cuts,ripple});
      if (plan.cuts.length) seek(at);
      info(plan.cuts.length ? "Cortes e ajustes aplicados." : "Ajustes de vídeo falado aplicados.");
    },
  });
}
let exportAbort;

async function exportNative(snapshot, cursor, isComposition, onError) {
  const duration = durationOf(snapshot);
  const ctl = new AbortController();
  exportAbort = ctl;
  busy = true;
  showDialog("Preparando o vídeo",
    '<p id="native-status">Preparando o projeto…</p><progress aria-label="Progresso da exportação"></progress>',
    '<button class="btn" id="cancel-export">Cancelar</button>');
  $("#cancel-export").onclick = () => $("#dialog").close();
  try {
    $("#native-status").textContent = isComposition ? "Preparando os quadros da animação…" : "Preparando o vídeo e o áudio…";
    const {base} = await serverExport(snapshot, cursor, ctl.signal);
    if (ctl.signal.aborted) return;
    showDialog("Vídeo pronto",
      '<video id="montage-result" controls playsinline preload="none" style="display:block;max-width:100%;max-height:45vh;margin:auto"></video>' +
      "<p>MP4 vertical · 540 × 960 · 30 fps · " + seconds(duration) + "</p>",
      '<a class="btn" id="montage-projects">Baixar pacote editável (ZIP)</a><a class="btn primary" id="montage-video">Baixar MP4</a>');
    $("#montage-result").poster = base + "preview.png";
    $("#montage-result").src = base + "final.mp4";
    $("#montage-projects").href = base + "projects.zip";
    $("#montage-projects").download = slug(snapshot.name) + (isComposition ? "-composicao.zip" : "-montagem.zip");
    $("#montage-video").href = base + "final.mp4";
    $("#montage-video").download = slug(snapshot.name) + ".mp4";
    $("#montage-video").focus();
  } catch (err) {
    if (!ctl.signal.aborted) onError(err.message);
  } finally {
    exportAbort = null;
    busy = false;
    redraw();
  }
}
$("#dialog").addEventListener("close", () => exportAbort?.abort());
async function exportVideo() {
  if (busy) return;
  stop();
  const isComposition = mode === "motion";
  const snapshot = structuredClone(liveScope());
  const cursor = time;
  if (!snapshot.clips.length) return;
  const compositionId=isComposition?animation?.draft.id:undefined;
  const size=account?.anchor?.sourceComposition || (compositionId && findComposition(compositionId)?.document?.sourceSize);
  const frame=size?{width:size.width,height:size.height}:undefined;
  const viewport=frame?selectionViewport(frame):undefined;
  const outputHeight=viewport?2*Math.round(540*viewport.height/viewport.width):1920;
  async function exportFromAccount(signal,progress){
    if(!applyAnimation())throw Error("Revise as alterações da animação.");
    const full=structuredClone(project);
    const receipt=await queueProjectRender(full,await packProject(full),{compositionId,format:"mp4",frame,signal,progress});
    return assetBytes(receipt.videoAssetId);
  }
  const processor = document.querySelector('meta[name="mare-processor"]');
  const nativeId = isComposition ? "native-render" : "native-montage";
  const subtitles = isComposition ? "" : montageSrt(snapshot.clips);

  function showOptions(message = "", expanded = Boolean(message)) {
    showDialog(
      "Baixar vídeo",
      "<p>" + esc(snapshot.name) + " · " + seconds(durationOf(snapshot)) + "</p>" +
      "<p>MP4 em 1080 × "+outputHeight+", quadro a quadro a 30 fps.</p>" +
      (message ? '<p role="alert">' + esc(message) + "</p>" : "") +
      '<details class="export-options"' + (expanded ? " open" : "") + '><summary>Mais opções</summary>' +
      '<div class="export-option-list"><button type="button" class="btn" id="export-project">Baixar projeto editável (.mare)</button>' +
      '<button type="button" class="btn" id="realtime-video">Gravar MP4 em tempo real</button><p>Mantenha a aba visível durante a gravação em tempo real.</p>' +
      (subtitles ? '<button type="button" class="btn" id="export-srt">Baixar legendas (.srt)</button>' : "") +
      (account?.projectRender ? '<button type="button" class="btn" id="account-render">Preparar MP4 no servidor do PostSpark</button>' : "") +
      (processor ? '<button type="button" class="btn" id="' + nativeId + '">Preparar MP4 no servidor</button>' +
        "<p>540 × 960 com pacote editável. Até 60 s, 48 clipes e 128 MiB por envio.</p>" : "") +
      "</div></details>",
      '<button type="button" class="btn primary" id="render-video">' + icon("Download") + "Preparar MP4</button>"
    );
    const copy = $("#export-project");
    copy.onclick = async () => {
      if (!applyAnimation()) return;
      const editable = structuredClone(project);
      copy.disabled = true;
      try {
        const file = await packProject(editable);
        if (copy.isConnected && $("#dialog").open) downloadBlob(file, slug(editable.name) + ".mare");
      } catch (err) {
        if (copy.isConnected && $("#dialog").open) showOptions(err.message);
      } finally {
        copy.disabled = false;
      }
    };
    if (subtitles) $("#export-srt").onclick = () => downloadBlob(new Blob([subtitles], {type: "application/x-subrip"}), slug(snapshot.name) + ".srt");
    if (processor) $("#" + nativeId).onclick = () => exportNative(snapshot, cursor, isComposition, showOptions);
    if(account?.projectRender)$("#account-render").onclick=()=>prepareMP4(false,true);
    $("#render-video").onclick = () => prepareMP4(false);
    $("#realtime-video").onclick = () => prepareMP4(true);
    $("#render-video").focus();
  }

  async function prepareMP4(realtime,onServer=false) {
    busy = true;
    const ctl = new AbortController();
    exportAbort = ctl;
    showDialog(
      "Preparando o vídeo",
      '<p id="progress-label">Preparando os quadros…</p><progress aria-label="Progresso da exportação" value="0" max="1"></progress>',
      '<button class="btn" id="cancel-export">Cancelar</button>'
    );
    $("#cancel-export").onclick = () => $("#dialog").close();
    try {
      const encode = realtime ? engine.exportMP4.bind(engine) : (await import("./precise-export.js")).exportPreciseMP4;
      const renderRemote=()=>exportFromAccount(ctl.signal,message=>{const label=$("#progress-label");if(label)label.textContent=message;});
      const local=()=>encode(snapshot, {
        signal: ctl.signal, width:1080,height:outputHeight,viewport,
        onProgress:n=>{
          const bar=$("progress");
          if(bar){bar.value=n;$("#progress-label").textContent="Preparando o MP4 · "+Math.round(n*100)+"%";}
        }
      });
      let blob;
      if(onServer)blob=await renderRemote();
      else{
        try{blob=await local();}
        catch(error){
          if(ctl.signal.aborted||!account?.projectRender)throw error;
          blob=await renderRemote();
        }
      }
      if (ctl.signal.aborted) return;
      showDialog(
        "Vídeo pronto",
        "<p>MP4 · 1080 × "+outputHeight+" · " +
          (blob.size / 1048576).toFixed(1) +
          " MB</p>",
        '<button class="btn primary" id="download-video">' +
          icon("Download") +
          "Baixar MP4</button>"
      );
      $("#download-video").onclick = () => downloadBlob(blob, slug(snapshot.name) + ".mp4");
      $("#download-video").focus();
    } catch (err) {
      if (!ctl.signal.aborted) showOptions(err.message);
    } finally {
      exportAbort = null;
      busy = false;
      redraw();
    }
  }

  showOptions();
}
function videoClip(asset) {
  return {
    ...asset,
    id: uid(),
    kind: "video",
    trim: 0,
    sourceDuration: asset.duration,
  };
}
function appendVideo(asset, visible) {
  const clip = videoClip(asset);
  project.clips.push(clip);
  if (visible) {
    selected = clip.id;
    time = startOf(clip);
  }
}

async function importMedia(files) {
  if (!files.length || mode === "motion") return;
  const destination = project;
  stop();
  for (const file of files) {
    const kind = file.type.startsWith("audio/")
      ? "audio"
      : file.type.startsWith("video/")
        ? "video"
        : null;
    if (!kind) {
      info("Escolha um arquivo de vídeo ou áudio.");
      continue;
    }
    const asset = await engine.importMedia(file, kind);
    if (project !== destination) return;
    const visible = mode === "montage";
    remember();
    if (visible) stop();
    if (kind === "audio") {
      project.sound = { ...project.sound, ...asset, enabled: true };
      if (visible) selected = "audio";
    } else {
      appendVideo(asset, visible);
    }
    if (visible) {
      refresh();
      redraw();
    }
  }
  if (mode === "montage") setPanel("preview");
  info("Mídia importada.");
}
function showStart(open) {
  const chooser = $("#studio-start");
  $("#studio-editor").hidden = false;
  $("#start-actions").hidden = false;
  $("#start-sources").hidden = true;
  $("#start-title").textContent = "Projetos";
  $("#start-continue").hidden = !hasOpenProject;
  $("#start-return").hidden = hasOpenProject || !account?.anchor;
  if (open && !chooser.open) chooser.showModal();
  if (!open && chooser.open) chooser.close();
  if (open) $("#start-blank").focus({preventScroll:true});
}
function showProject(p, at = Math.min(1.9, (p.clips[0]?.duration ?? 0) / 2)) {
  projectEditor.reset();
  editorRevision++;
  projectEpoch++;
  groupIds = null;
  stop();
  animation = montageView = lastCompositionId = null;
  project = typeof p.id === "string" && p.id ? p : {...p,id:uid()};
  selected = p.clips[0]?.id ?? null;
  mode = "montage";
  time = at;
  hasOpenProject = true;
  showStart(false);
  refresh();
  redraw();
}
function replaceProject(p, {panel = "props", cursor, status} = {}) {
  if (!applyAnimation()) return false;
  const restored = normalizeProject(p);
  if (hasOpenProject) remember();
  else if (restored.clips.length || restored.compositions.some(item => item.scene || item.document?.layers.length)) mark();
  if (status) projectStatus = status;
  showProject(restored);
  if (!restored.clips.length && restored.compositions.length)
    openAnimation(restored.compositions[0].id, {panel, cursor});
  else setPanel("preview");
  return true;
}
function startAnimationProject(name = "Nova animação", content = newComposition(), duration = 4, cursor = 0) {
  const composition = {id: uid(), name, kind: "composition", document: content, duration};
  const panel = content.layers.length ? "props" : "preview";
  if (replaceProject({name, clips: [], compositions: [composition], sound: {...silent}}, {panel, cursor, status: "Novo projeto"}))
    $(panel === "preview" ? "#starter-prompt" : "#project-menu").focus({preventScroll: true});
}
const projectMenuButton = $("#project-menu");
const projectMenu = $("#project-pop");
const projectMenuEntries = [...projectMenu.querySelectorAll('[role="menuitem"]')];
projectMenuEntries.forEach(item => (item.tabIndex = -1));
const projectMenuItems = () => projectMenuEntries.filter(item => !item.hidden && !item.disabled);
function pop(open, {last = false, restoreFocus = false} = {}) {
  projectMenu.hidden = !open;
  projectMenuButton.setAttribute("aria-expanded", open);
  if (open) projectMenuItems().at(last ? -1 : 0)?.focus();
  else if (restoreFocus) projectMenuButton.focus();
}
projectMenuButton.onclick = () => pop(projectMenu.hidden, {restoreFocus: true});
projectMenuButton.onkeydown = e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    pop(true, {last: e.key === "ArrowUp"});
  } else if (e.key === "Escape" && !projectMenu.hidden) {
    e.preventDefault();
    pop(false, {restoreFocus: true});
  }
};
projectMenu.onkeydown = e => {
  if (e.key === "Escape") {
    e.preventDefault();
    pop(false, {restoreFocus: true});
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const items = projectMenuItems();
  if (!items.length) return;
  const index = items.indexOf(document.activeElement);
  const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 :
    (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
  items[next].focus();
};
projectMenu.onfocusout = e => {
  if (e.relatedTarget && !projectMenu.contains(e.relatedTarget) && e.relatedTarget !== projectMenuButton)
    pop(false);
};
document.addEventListener("click", e => {
  if (!e.target.closest("#project-menu,#project-pop")) pop(false);
});
projectMenu.onclick = () => pop(false, {restoreFocus: projectMenu.contains(document.activeElement)});
$("#open-start").onclick = () => {
  stop();
  showStart(true);
};
$("#start-continue").onclick = () => {
  showStart(false);
  $("#open-start").focus({preventScroll: true});
  redraw();
};
$("#studio-start").oncancel = event => { if (!hasOpenProject) event.preventDefault(); };
$("#start-blank").onclick = $("#new-art").onclick = () => startAnimationProject();
$("#start-file").onclick = () => $("#project-file").click();
$("#start-return").onclick = () => $("#send-postspark").click();
$("#start-back").onclick = () => showStart(true);
$("#start-open").onclick = $("#unpack").onclick = async () => {
  showStart(true);
  $("#start-actions").hidden = true;
  $("#start-sources").hidden = false;
  $("#start-title").textContent = "Abrir projeto existente";
  $("#project-file-error").textContent = "";
  $("#start-file").focus();
  const status = $("#account-project-status"), list = $("#account-projects");
  list.hidden = true;
  status.textContent = account ? "Carregando projetos da conta…" : "Nesta prévia, abra um arquivo .mare do computador.";
  if (!account) return;
  try {
    const projects = await listAccountProjects();
    list.replaceChildren(new Option("Selecione um projeto salvo", ""));
    for (const item of projects) list.add(new Option(item.name, item.anchorId || item.id));
    list.hidden = !projects.length;
    status.textContent = projects.length ? "Projetos salvos na minha conta" : "Você ainda não salvou projetos nesta conta.";
  } catch {
    status.textContent = "Não foi possível carregar seus projetos. Volte e tente novamente.";
  }
};
$("#starter-template").onclick = () => showAnimationCatalog();
$("#starter-prompt").onclick = () => {
  if (!animation) createCompositionClip();
  showProjectAssistant();
};
$("#starter-text").onclick = () => {
  if (!animation) createCompositionClip();
  $('#library-items [data-cp-add="text"]')?.click();
  $('#inspector [data-cp-prop="text"]')?.focus();
};
$("#new-video").onclick = () => $("#first-video").click();
$("#first-video").onchange = safe(async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  await startVideoProject(file);
});
async function startVideoProject(file, check = () => {}) {
  const media = await engine.importMedia(file, "video");
  check();
  const p = sample();
  p.name = media.name.replace(/\.[^.]+$/, "") || "Nova montagem";
  p.clips = [videoClip(media)];
  p.sound.enabled = false;
  if (replaceProject(p, {status: "Novo projeto"})) $("#project-menu").focus({preventScroll: true});
}
function renameDocument(title, current, commit) {
  showDialog(
    title,
    input("new-name", "Nome", current),
    '<button id="apply-name" class="btn primary">Salvar nome</button>'
  );
  const apply = () => {
    const name = $("#new-name").value.trim();
    if (name) {
      if (name !== current) commit(name);
      $("#dialog").close();
    }
  };
  $("#apply-name").onclick = apply;
  $("#new-name").onkeydown = e => {
    if (e.key === "Enter") apply();
  };
  $("#new-name").select();
}
$("#rename").onclick = () => {
  renameDocument("Nome do projeto", project.name || "Projeto", name => mode==="motion" ? mutate(()=>{project.name=name;}) : manualCommand({id:"project.rename",name}));
};
$("#rename-animation").onclick = () => {
  const draft = animation?.draft;
  if (draft) renameDocument("Nome da animação", draft.name, name => manualCommand({id:"composition.rename",compositionId:draft.id,name}));
};
$("#pack").onclick = safe(async () => {
  if (applyAnimation()) downloadBlob(await packProject(project), slug() + ".mare");
});
async function readProjectFile(file) {
  if (!file?.name || !/\.mare$/i.test(file.name)) throw Error("Selecione um arquivo .mare.");
  const opened = await unpackProject(file);
  if (account && !account.anchor) opened.id = uid();
  return opened;
}
$("#project-file").onchange = safe(async e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) {
    let p;
    try { p = await readProjectFile(f); }
    catch (error) {
      if (!$("#studio-start").open) throw error;
      $("#project-file-error").textContent = error.message;
      return;
    }
    if (replaceProject(p, {status: "Projeto aberto"})) {
      $("#project-menu").focus({preventScroll: true});
      info("Projeto aberto.");
    }
  }
});
$("#reset").onclick = () => {
  showDialog(
    "Abrir projeto de exemplo",
    "<p>O projeto de exemplo vai ocupar o editor. Você pode voltar ao projeto atual com Desfazer na Montagem.</p>",
    '<button id="confirm-reset" class="btn primary">Abrir exemplo</button>'
  );
  $("#confirm-reset").onclick = () => {
    if (replaceProject(sample(), {status: "Projeto de exemplo"})) {
      $("#dialog").close();
      $("#project-menu").focus({preventScroll: true});
    }
  };
};
$("#create-composition").onclick = createCompositionClip;
$("#animation-catalog").onclick = () => showAnimationCatalog();
$("#menu-composition").onclick = createCompositionClip;
$("#edit-scene").onclick = () => {
  const clip = chosen();
  if (clip?.compositionId) openAnimation(clip.compositionId, {clip});
};
$("#generate-narration").onclick = () => editNarration();
function currentDocument() {
  if (!animation?.edited) return project;
  return {
    ...project,
    compositions: project.compositions.map(c => (c.id === animation.draft.id ? animation.draft : c)),
  };
}
function commitEditorDocument(candidate, compositionOnly) {
  if (animation) {
    if (compositionOnly === animation.draft.id) {
      mutateAnimation(() => {
        animation.draft = candidate.compositions.find(c => c.id === compositionOnly);
      });
      return;
    }
    // Preserve pending manual work as its own undo entry before a cross-environment edit.
    if (!applyAnimation()) throw Error("Confira a duração do rascunho aberto.");
    returnToMontage();
  }
  mutate(() => {
    project = candidate;
  });
}
function manualCommand(command) {
  projectEditor.prepare(editorRevision, [command]).apply();
}
const action = (manual, params, run) => ({ manual, params, run, kind: "session" });
export const projectEditor = createEditorSession({
  current: currentDocument,
  revision: () => editorRevision,
  commit: commitEditorDocument,
  context: () => ({
    mode,
    clipId: animation?.clipId ?? chosen()?.id,
    compositionId: animation?.draft.id ?? chosen()?.compositionId,
    layerId: animation ? compositionUI.selectedLayer() : null,
    time,
    group: [...(groupIds ?? [])],
    panel: $(".workspace").dataset.panel,
    filter,
    playing,
    fullscreen: Boolean(document.fullscreenElement || $("#stage").classList.contains("expanded")),
    soundSelected: selected === "audio",
    home: $("#studio-start").open,
    timeline: mode === "montage" ? timeline.getViewport() : activeWave() ? {keyTime:activeWave().keys[keyIndex]?.t} : compositionUI.timelineView(),
  }),
  services: {
    projectEpoch: () => projectEpoch,
    frame: previewFrame,
    import: (file, kind) => (kind === "image" ? imageLayerFromFile(file, 1) : engine.importMedia(file, kind)),
    operations: {
      ...mediaOperations(),
      "query.project": action(
        "Consultar estado e pose",
        {
          "compositionId?": "ID da composição",
          "layerId?": "ID da camada",
          "clipId?": "ID do clipe",
          "trackId?": "ID da pista",
          "time?": "segundos locais",
        },
        a => projectEditor.inspect(a)
      ),
      "query.options": action("Consultar tipos, modelos, vozes e presets", {}, () => projectEditor.options()),
      "query.templates": action("Buscar modelos de animação", {"query?":"termos da busca","group?":"all | new | scene | marketing"},
        a=>findTemplates(a.query,a.group).map(({id,name,duration,category})=>({id,name,duration,category}))),
      "query.controls": action("Consultar controles do modelo", { compositionId: "ID da composição" }, a =>
        projectEditor.controls(a.compositionId)
      ),
      "query.job": action("Consultar trabalho de mídia", { jobId: "ID do trabalho" }, a => {
        const { result, ...status } = projectEditor.job(a.jobId);
        return { ...status, hasResult: result !== undefined };
      }),
      "job.release": action("Cancelar ou descartar trabalho", { jobId: "ID do trabalho" }, a =>
        projectEditor.release(a.jobId)
      ),
      "history.undo": action("Desfazer", {}, () => stepHistory(false)),
      "history.redo": action("Refazer", {}, () => stepHistory(true)),
      "project.save": action(account ? "Salvar na minha conta" : "Salvar no navegador", {}, () => save()),
      "project.open": action("Abrir arquivo editável", { file: "File .mare" }, async ({ file }, p, check) => {
        const opened = await readProjectFile(file);
        check();
        replaceProject(opened, { status: "Projeto aberto" });
      }),
      "project.new": action("Criar projeto", { name: "nome do projeto" }, a => {
        if (typeof a.name !== "string" || !a.name.trim()) throw Error("Nome inválido.");
        replaceProject(
          { name: a.name, compositions: [], clips: [], sound: { ...silent } },
          { status: "Novo projeto" }
        );
      }),
      "project.fromVideo": action("Começar com vídeo do dispositivo",{file:"File de vídeo"}, (args, p, check)=>startVideoProject(args.file,check)),
      "project.animation": action("Começar animação em branco",{"name?":"nome da animação"}, a=>startAnimationProject(a.name)),
      "view.home": action("Abrir início ou continuar projeto",{open:"booleano"}, a=>{
        if(typeof a.open!=="boolean") throw Error("Opção inválida.");
        if(a.open) stop();
        showStart(a.open);
        if(!a.open) redraw();
      }),
      "project.example": action("Abrir projeto de exemplo", {}, () =>
        replaceProject(sample(), { status: "Projeto de exemplo" })
      ),
      "asset.import": action(
        "Importar mídia do dispositivo",
        { file: "File", kind: "audio | video | image" },
        a => projectEditor.attach(a.file, a.kind)
      ),
      "asset.stock": action("Importar da biblioteca", { stockId: "ID do catálogo" }, async (a, p, check) => {
        const entry = (await stockCatalog()).find(e => e.id === a.stockId);
        if (!entry) throw Error("Vídeo ausente na biblioteca.");
        const file = await stockFile(entry);
        check();
        return projectEditor.attach(file, "video");
      }),
      "view.panel": action("Abrir painel", { panel: "media | preview | props" }, a => {
        if (!["media", "preview", "props"].includes(a.panel)) throw Error("Painel desconhecido.");
        setPanel(a.panel);
      }),
      "view.library": action("Filtrar biblioteca da montagem", {filter:"all | video | audio"}, a=>{
        if (!["all","video","audio"].includes(a.filter)) throw Error("Filtro desconhecido.");
        filter=a.filter;
        renderLibrary();
      }),
      "view.sound": action("Selecionar trilha sonora", {}, ()=>{if(mode==="motion") returnToMontage(); select("audio"); setPanel("props");}),
      "view.fullscreen": action("Ampliar ou reduzir prévia", {"enabled?":"booleano, padrão true"}, a=>setStageFullscreen(a.enabled ?? true)),
      "view.timeline": action(
        "Zoom, rolagem, curvas e encaixe",
        {
          "zoom?": "1 a 4 na montagem",
          "scrollLeft?": "pixels na montagem",
          "snap?": "booleano",
          "curves?": "booleano na animação",
          "channel?": "canal na animação",
          "keyTime?": "tempo da chave na camada ou na onda",
        },
        a => {
          for (const key of ["snap","curves"])
            if(a[key] !== undefined && typeof a[key] !== "boolean") throw Error("Opção inválida: "+key);
          if (mode === "motion") {
            if (activeWave() && a.keyTime !== undefined) {
              const index=activeWave().keys.findIndex(k=>Math.abs(k.t-a.keyTime)<1e-6);
              if(index<0) throw Error("Keyframe ausente.");
              keyIndex=index; refresh(); seek(activeWave().keys[index].t);
              return;
            }
            compositionUI.setTimelineView(a);
            return;
          }
          if (
            (a.zoom !== undefined && !Number.isFinite(a.zoom)) ||
            (a.scrollLeft !== undefined && !Number.isFinite(a.scrollLeft))
          )
            throw Error("Posição ou zoom inválido.");
          timeline.restoreViewport({ ...timeline.getViewport(), ...a });
        }
      ),
      "view.group": action("Selecionar grupo de clipes", { clipIds: "IDs da pista principal" }, a => {
        if (
          mode !== "montage" ||
          !Array.isArray(a.clipIds) ||
          a.clipIds.some(id => !project.clips.some(c => c.id === id))
        )
          throw Error("Seleção de clipes inválida.");
        groupIds = a.clipIds.length ? new Set(a.clipIds) : null;
        refresh();
      }),
      "asset.search": action(
        "Consultar biblioteca de vídeos",
        { "query?": "nome, categoria ou tag", "category?": "categoria do catálogo", "format?": "Vertical | Horizontal | Quadrado" },
        async a => filterStock(await stockCatalog(), a)
      ),
      "view.seek": action("Ir ao quadro", { time: "segundos no ambiente atual" }, a => {
        if (!Number.isFinite(a.time)) throw Error("Tempo inválido.");
        seek(a.time);
      }),
      "view.play": action("Reproduzir ou pausar", {}, () => play()),
      "view.montage": action("Aplicar e voltar à montagem", {}, () => {
        if (mode === "motion") returnToMontage();
      }),
      "view.selectClip": action("Selecionar clipe", { clipId: "ID da pista principal" }, a => {
        if (!project.clips.some(c => c.id === a.clipId)) throw Error("Clipe ausente.");
        if (mode === "motion") returnToMontage();
        select(a.clipId, true);
      }),
      "view.animation": action(
        "Editar na Animação",
        { compositionId: "ID da composição", "clipId?": "ocorrência na montagem", "layerId?": "camada" },
        a => {
          const c = currentDocument().compositions.find(c => c.id === a.compositionId);
          const clip = project.clips.find(c => c.id === a.clipId);
          if (
            !c ||
            (a.clipId && clip?.compositionId !== c.id) ||
            (a.layerId && !c.document?.layers.some(l => l.id === a.layerId))
          )
            throw Error("Alvo ausente.");
          openAnimation(c.id, { clip });
          if (Object.hasOwn(a,"layerId")) compositionUI.selectLayer(a.layerId || null, true);
        }
      ),
    },
  },
});
let assistantHistory = [], historyEpoch;
function showProjectAssistant(initialRequest = "", useLayerScope = false) {
  stop();
  if (historyEpoch !== projectEpoch) { assistantHistory = []; historyEpoch = projectEpoch; }
  openProjectAssistant({ useLayerScope, history: assistantHistory, session: projectEditor, showDialog, dialog: $("#dialog"), esc, initialRequest });
}
$("#project-assistant").onclick = () => showProjectAssistant();
$("#edit-speech").onclick = event => editSpeech(event.currentTarget);
$("#apply-and-return").onclick = () => returnToMontage();
$("#duplicate-composition").onclick = safe(duplicateComposition);
$("#insert-composition").onclick = () => placeComposition(animation?.draft.id);
$("#composition-duration").onchange = e => {
  if (!animation) return;
  const field = e.target;
  const value = field.valueAsNumber;
  if (!field.value || !field.reportValidity()) {
    field.value = animation.draft.duration;
    return;
  }
  try {
    checkDurationForClips(animation.draft.id, value);
    if (animation.draft.duration !== value) manualCommand({id:"composition.duration",compositionId:animation.draft.id,duration:value});
  } catch (error) {
    problem(error);
    field.value = animation.draft.duration;
  }
};
$("#composition-library").onclick = e => {
  const button = e.target.closest("[data-open-comp]");
  if (button) openAnimation(button.dataset.openComp, {panel: "props"});
};
$("#library-items").onclick = e => {
  const place = e.target.closest("[data-place-comp]");
  if (place) {
    placeComposition(place.dataset.placeComp);
    return;
  }
  const b = e.target.closest("[data-add]");
  if (b) addAsset(b.dataset.add);
};
all("[data-filter]").forEach(
  b =>
    (b.onclick = () => {
      filter = b.dataset.filter;
      renderLibrary();
    })
);
all(".mobile-tabs button[data-panel]").forEach(b=>{b.onclick=()=>setPanel(b.dataset.panel);});
function setMobileView(contextual){
  document.body.dataset.mobileView=contextual?"contextual":"advanced";
  $("#context-view").setAttribute("aria-pressed",String(contextual));
  $("#advanced-view").setAttribute("aria-pressed",String(!contextual));
  try{sessionStorage.setItem("mare-mobile-view",document.body.dataset.mobileView);}catch{}
}
const offerContextual = !integrated || account?.mobileContextual === true;
$(".mobile-view").hidden = !offerContextual;
let initialContextual=false;
try{initialContextual=offerContextual && sessionStorage.getItem("mare-mobile-view")==="contextual";}catch{}
setMobileView(initialContextual);
$("#context-view").onclick=()=>{setMobileView(true);setPanel("props");};
$("#advanced-view").onclick=()=>setMobileView(false);
$("#mobile-fine").onclick=()=>{
  setMobileView(false);
  setPanel("props");
  const target=editingComposition()?$("#motion-track [data-cp-time]"):$(".inspector input");
  target?.focus();
};
$("#motion-mode").onclick = () => setMode("motion");
$("#montage-mode").onclick = () => setMode("montage");
$("#undo").onclick = () => stepHistory(false);
$("#redo").onclick = () => stepHistory(true);
$("#back").onclick = () => seek(0);
$("#end").onclick = () => seek(currentDuration());
$("#play").onclick = safe(play);
$("#save").onclick = safe(async () => {
  const button = $("#save");
  if (button.disabled) return;
  button.disabled = true;
  try { await save(); } finally { button.disabled = false; }
});
if (account) {
  $("#save").title = "Salvar no PostSpark";
  $("#save").setAttribute("aria-label", "Salvar no PostSpark");
  $("#save .save-long-label").textContent = "Salvar no PostSpark";
  const legacy=$("#start-legacy");
  legacyProjectPresent().then(available=>{legacy.hidden=!available;}).catch(()=>{});
  legacy.onclick=safe(async()=>{replaceProject(await importLegacyProject(),{status:"Importado do navegador"});});
  const list = $("#account-projects");
  list.onchange = safe(async () => {
    const item = account.projects.find(p => (p.anchorId || p.id) === list.value);
    if (!item) return;
    list.value = "";
    if (account.anchor) {
      const imported = await unpackProject(await assetBytes(item.revisionId));
      replaceProject(imported, {status:"Projeto aberto"});
    } else {
      const route = new URL(location.href);
      route.search = "";
      route.hash = "";
      route.searchParams.set(item.anchorId ? "anchor" : "project",item.anchorId || item.id);
      location.assign(route);
    }
  });
  const button = $("#send-postspark");
  button.hidden = !account.anchor;
  if (account.anchor) document.body.dataset.anchored = "";

  button.onclick = safe(async () => {
    if (button.disabled || !account.anchor) return;
    if (!hasOpenProject || account.anchor.canEdit===false) {
      location.assign((account.anchor.agencyProjectId?"/agency":"/thevoid")+"?mareReturn="+encodeURIComponent(account.anchor.id));
      return;
    }
    if (!applyAnimation()) return;
    const compositionId = mode === "motion" ? animation?.draft.id : undefined;
    const snapshot = structuredClone(project);
    const media = renderScope(snapshot, compositionId);
    if (!media.clips.length) throw Error("Adicione uma composição ou um vídeo antes de enviar.");
    button.disabled = true;
    document.body.inert = true;
    let navigating = false;
    const controller = new AbortController();
    try {
      const {exportPreciseMP4,exportTransparentWebM} = await import("./precise-export.js");
      const transparent=compositionId && findComposition(compositionId)?.document?.background==="transparent";
      const encode=transparent?exportTransparentWebM:exportPreciseMP4;
      const packed = await packProject(snapshot);
      const size=account.anchor.sourceComposition || (compositionId && findComposition(compositionId)?.document?.sourceSize);
      const viewport=size?selectionViewport(size):undefined;
      const height=viewport?Math.round(540*viewport.height/viewport.width)*2:1920;
      let video,url;
      try {
        video=await encode(media,{width:1080,height,viewport,signal:controller.signal,
          onProgress:p=>button.textContent="Preparando "+Math.round(100*p)+"%"});
      }catch(error){
        if(controller.signal.aborted||!account.projectRender)throw error;
        const receipt=await queueProjectRender(snapshot,packed,{compositionId,format:transparent?"webm":"mp4",
          frame:size?{width:size.width,height:size.height}:undefined,signal:controller.signal,progress:message=>button.textContent=message});
        url=await returnProjectVideo(receipt.revisionId,receipt.videoAssetId,compositionId);
      }
      if(video){
        button.textContent="Enviando…";
        url=await returnToPostSpark(packed,video,compositionId);
      }
      dirty = false;
      location.assign(url);
      navigating = true;
    } catch (error) {
      if ([403,404,410].includes(error.status)) button.hidden = true;
      throw error;
    } finally {
      if (!navigating) {
        document.body.inert = false;
        button.disabled = false;
        button.textContent = "Enviar ao PostSpark";
      }
    }
  });
}
$("#export").onclick = exportVideo;
function showStockLibrary({newProject = false} = {}) {
  const destination = project;
  const dialog = $("#dialog");
  stop();
  openStockLibrary({
    dialog, showDialog,
    async add(file, name, signal) {
      const asset = await engine.importMedia(file, "video");
      if (signal.aborted || !dialog.open || project !== destination) return;
      if (newProject) {
        const created = replaceProject({name, clips: [videoClip({...asset, name})], compositions: [], sound: {...silent}},
          {status: "Novo projeto"});
        if (created) dialog.addEventListener("close", () => $("#project-menu").focus({preventScroll: true}), {once: true});
        return;
      }
      if (mode !== "montage") return;
      stop();
      remember();
      groupIds = null;
      appendVideo({...asset, name}, true);
      refresh();
      redraw();
      info(name + " adicionado à montagem.");
    },
  });
}
$("#stock-library").onclick = () => showStockLibrary();

$("#import").onclick = () => {
  const el = $("#media-file");
  el.accept = "video/*,audio/*";
  el.click();
};
$("#media-file").onchange = safe(async e => {
  const files = [...e.target.files];
  e.target.value = "";
  await importMedia(files);
});
async function setStageFullscreen(enabled) {
  if (typeof enabled !== "boolean") throw Error("Opção de tela cheia inválida.");
  if (!enabled) {
    if (document.fullscreenElement) await document.exitFullscreen();
    $("#stage").classList.remove("expanded");
    return;
  }
  const s = $("#stage");
  if (s.requestFullscreen) {
    await s.requestFullscreen();
  } else {
    s.classList.add("expanded");
    info("Toque na prévia para fechar.");
  }
}
$("#full").onclick = safe(() => setStageFullscreen(true));
$("#stage").onclick = safe(() => setStageFullscreen(false));
document.addEventListener("keydown", e => {
  if (e.key !== "Delete" || e.repeat || e.isComposing || e.defaultPrevented ||
      e.ctrlKey || e.metaKey || e.altKey || e.shiftKey ||
      busy || !editingComposition() || $("#studio-editor").hidden ||
      $("#dialog").open || !$("#project-pop").hidden ||
      e.target.closest("input,textarea,select,[contenteditable]")) return;
  if (compositionUI.removeSelectedLayer()) e.preventDefault();
}, true);
// A pointer edit can leave focus on a button, including one focused by a redraw.
// Tab returns Space to the focused control for keyboard navigation.
let pointerEditing = false;
document.addEventListener("pointerdown", () => { pointerEditing = true; }, true);
document.addEventListener("keydown", e => {
  if (e.key === "Tab") pointerEditing = false;
  if (
    busy ||
    $("#studio-editor").hidden ||
    $("#dialog").open
  )
    return;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey ||
        !$("#project-pop").hidden || $("#play").disabled ||
        e.target.closest('input:not(#scene-cursor):not([data-cp-time]),textarea,select,[contenteditable],video[controls],audio[controls]'))
      return;
    e.preventDefault();
    stepFrame(e.key === "ArrowRight" ? 1 : -1);
    return;
  }
  if (e.target.closest("input,textarea,select,[contenteditable]")) return;
  if (e.code === "Space" || e.key === " ") {
    const playButton = $("#play");
    if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey ||
        !$("#project-pop").hidden || playButton.disabled ||
        e.target.closest("a[href],summary,video[controls],audio[controls]") ||
        (!pointerEditing && e.target.closest("button") && !playButton.contains(e.target))) return;
    e.preventDefault();
    if (!e.repeat) playButton.click();
    return;
  }
  if (e.target.closest("button")) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    safe(save)();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    stepHistory(e.shiftKey);
  }
  if (e.key === "Escape") pop(false);
});
window.addEventListener("beforeunload", e => {
  if (dirty || animation?.edited) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function init() {
  paintIcons();
  let restored = project;
  let at = time;
  let saved;
  try {
    if (account?.initialRevision) {
      saved = await unpackProject(await assetBytes(account.initialRevision));
      account.localProjectId=saved.id;
    } else if (account?.anchor?.sourceComposition) {
      const imported=await prepareSelection(account.anchor.sourceComposition);
      showStart(false);
      showDialog("Animar seleção do CanvasLab",
        '<canvas id="canvas-selection-preview" aria-label="Prévia da seleção"></canvas><p id="canvas-selection-description"></p>',
        '<button class="btn primary" id="use-canvas-selection">Abrir em Animação</button>');
      selectionPreview($("#canvas-selection-preview"),imported);
      $("#canvas-selection-description").textContent=imported.document.layers.length+" camada(s) editável(is). As camadas originais continuam no design. Escolha Enviar ao PostSpark para aplicar a animação."+
        (imported.unavailable.length?" A prévia usa uma fonte alternativa para "+imported.unavailable.join(", ")+".":"");
      $("#use-canvas-selection").onclick=()=>{
        $("#dialog").close();
        startAnimationProject(imported.name,imported.document,imported.duration);
      };
      return;
    } else if (account?.anchor?.sourceVideoAssetId) {
      const blob = await assetBytes(account.anchor.sourceVideoAssetId);
      await startVideoProject(new File([blob],"Vídeo do post",{type:blob.type}));
      return;
    } else if (account?.anchor?.sourceImageUrl) {
      const blob=await readCanvasImage(account.anchor.sourceImageUrl),composition=newComposition();
      composition.layers.push(await imageLayerFromFile(new File([blob],"Imagem do post",{type:blob.type}),4));
      startAnimationProject("Imagem do post",composition);
      return;
    } else if (!account) saved = await loadProject();
    if (saved) {
      restored = saved;
      at = Math.min(1.9, (saved.clips[0]?.duration ?? 0) / 2);
      projectStatus = account ? "Salvo no PostSpark" : "Salvo neste navegador";
    }
  } catch (err) {
    if (account) throw err;
    problem(err);
  }
  const route = account?.anchor ? "" : location.hash;
  if (!saved && !["#transicoes", "#montagem", "#cafe-360", "#compor"].includes(route)) {
    project = normalizeProject({id:uid(), name:"Novo projeto", clips:[], compositions:[], sound:{...silent}});
    projectStatus = "Novo projeto";
    refresh();
    showStart(true);
    if (["#modelos", "#novos-modelos"].includes(route)) {
      showAnimationCatalog(route === "#novos-modelos" ? "new" : "all", {newProject: true});
      window.history.replaceState(null, "", location.pathname + location.search);
    }
    return;
  }
  if (route === "#transicoes") {
    const response = await fetch("./assets/mare-transicoes.mare");
    if (!response.ok) throw new Error("A demonstração de transições está indisponível.");
    restored = await unpackProject(await response.blob());
    at = 0;
    projectStatus = "Exemplo de transições";
    window.history.replaceState(null, "", location.pathname + location.search);
  }
  if (route === "#montagem") {
    const response = await fetch("./assets/cafe-360.mare");
    if (!response.ok) throw new Error("O exemplo da montagem está indisponível.");
    const cafe = await unpackProject(await response.blob());
    restored = normalizeProject(sample());
    const [wave, coast, tide] = restored.clips;
    const [intro] = cafe.clips;
    const source = {...compositionForClip(cafe, intro), id: "cafe-360-abertura"};
    restored.compositions.unshift(source);
    const procedural = compositionForClip(restored, wave);
    wave.name = procedural.name = procedural.scene.title = "À beira-mar";
    restored.name = "Café 360 à beira-mar";
    restored.clips = [{...intro, compositionId: source.id}, {...coast, trim: 1}, wave, tide];
    at = 2.8;
    projectStatus = "Exemplo de montagem";
    window.history.replaceState(null, "", location.pathname + location.search);
  }
  if (route === "#cafe-360") {
    const response = await fetch("./assets/cafe-360.mare");
    if (!response.ok) throw new Error("O exemplo Café 360 está indisponível.");
    restored = await unpackProject(await response.blob());
    at = 3;
    projectStatus = "Exemplo Café 360";
    window.history.replaceState(null, "", "#compor");
  }
  showProject(restored, at);
  if (saved && !account && !route) showStart(true);
  if (account?.anchor?.scope === "composition" && account.anchor.compositionId) {
    openAnimation(account.anchor.compositionId,{panel:"props"});
    return;
  }
  if (["#compor", "#cafe-360"].includes(route)) {
    const existing = project.compositions.find(item => item.kind === "composition");
    if (existing) {
      const clip = project.clips.find(item => item.compositionId === existing.id);
      openAnimation(existing.id, {clip, panel: "props"});
    } else createCompositionClip();
    return;
  }
  if (["#modelos", "#novos-modelos"].includes(route)) {
    setMode("motion");
    showAnimationCatalog(route === "#novos-modelos" ? "new" : "all");
    window.history.replaceState(null, "", location.pathname + location.search);
  } else if (!project.clips.length && project.compositions.length) {
    openAnimation(project.compositions[0].id, {panel: "props"});
  }
}
safe(async () => {
  try {
    await init();
  } catch (error) {
    if (account) {
      $("#send-postspark").hidden = true;
      showStart(true);
    } else showProject(project);
    throw error;
  }
})();
