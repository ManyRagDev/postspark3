import { durationOf, FPS, trackCount, TRACK_LIMIT, transitionFrames, transitionPack } from "./montage-model.js";
import { canSplitAt, compositionForClip } from "./project-model.js";
import { displayCues } from "./speech-visual.js";
import { nearestSnap } from "./timeline-snap.js";
const icons = {
  track:
    '<rect x="3" y="5" width="12" height="5" rx="1"/><rect x="9" y="14" width="12" height="5" rx="1"/>',
  cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.2 8.2 12 12m-12-4.4L20.2 3.8"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  trash: '<path d="M3 6h18M9 6V4h6v2m3 0-1 14H7L6 6m4 4v6m4-6v6"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14m-7-7v14"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16m10-16v16M3 9h4m-4 6h4m10-6h4m-4 6h4"/>',
  music:
    '<path d="M9 17V6l11-2v11M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  scene:
    '<path d="m12 2 2.1 7.9L22 12l-7.9 2.1L12 22l-2.1-7.9L2 12l7.9-2.1z"/>',
};
function icon(name) {
  return (
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' +
    icons[name] +
    "</svg>"
  );
}
function node(tag, cls, value) {
  const el = document.createElement(tag);
  el.className = cls;
  if (value !== undefined) el.textContent = value;
  return el;
}
function control(label, glyph, handler) {
  const button = node("button", "mlt-control");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon(glyph);
  button.addEventListener("click", handler);
  return button;
}

const samples = new Map();
async function wavePeaks(path) {
  if (!samples.has(path)) {
    const result = (async () => {
      const response = await fetch(path);
      if (!response.ok) return [];
      const ctx = new OfflineAudioContext(1, 1, 44100);
      const audio = await ctx.decodeAudioData(await response.arrayBuffer());
      const data = audio.getChannelData(0);
      const peaks = [];
      const step = Math.max(1, Math.floor(data.length / 850));
      for (let start = 0; start < data.length; start += step) {
        let power = 0;
        let count = 0;
        for (let i = start; i < Math.min(start + step, data.length); i += 4) {
          power += data[i] * data[i];
          count++;
        }
        peaks.push(Math.sqrt(power / Math.max(1, count)));
      }
      const max = Math.max(...peaks, 0.001);
      return peaks.map(x => x / max);
    })().catch(() => []);
    samples.set(path, result);
  }
  return samples.get(path);
}

function drawWave(canvas, peaks) {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(ratio, ratio);
  ctx.fillStyle = "#83b6a9";
  ctx.globalAlpha = 0.48;
  const mid = height / 2;
  for (let x = 0; x < width && peaks.length; x += 3) {
    const p =
      peaks[Math.min(peaks.length - 1, Math.floor((x / width) * peaks.length))];
    const bar = Math.max(
      1,
      Math.round(Math.max(0, Math.min(1, p)) * (height - 5))
    );
    ctx.fillRect(x, Math.round(mid - bar / 2), 1.5, bar);
  }
}

export function mountTimeline(
  root,
  { onSeek, onSelect, onChange, onAction, onToggleGroup, onNewTrack, onTrackEdit, onTransition, onOpenComposition, onOpenSpeech }
) {
  root.classList.add("mlt");
  let project = null;
  let clips = [];
  let selected = null;
  let groupIds = null;
  let duration = 0;
  let time = 0;
  let zoom = 1;
  let signature;
  let dragId = null;
  let peaks = [];
  let requestNumber = 0;
  let scrubPointer = null;
  let snapTimes = [];

  const header = node("div", "mlt-header");
  const title = node("h2", "mlt-heading", "Timeline do vídeo");
  const actions = node("div", "mlt-actions");
  const cut = control("Dividir no marcador", "cut", () => onAction("split"));
  const copy = control("Duplicar clipe", "copy", () => onAction("duplicate"));
  const remove = control("Excluir clipe", "trash", () => onAction("delete"));
  const previous = control("Mover clipe para antes", "left", () => moveBy(-1));
  const next = control("Mover clipe para depois", "right", () => moveBy(1));
  actions.append(cut, copy, remove, node("i", "mlt-divider"), previous, next);
  const zoomControls = node("div", "mlt-zoom");
  const zoomLabel = node("span", "mlt-zoom-label", "Zoom");
  const zoomOut = control("Reduzir zoom da timeline", "minus", () =>
    setZoom(zoom - 0.5)
  );
  const zoomIn = control("Ampliar zoom da timeline", "plus", () =>
    setZoom(zoom + 0.5)
  );
  const zoomValue = node("output", "mlt-zoom-value", "100%");
  const snap = node("button", "mlt-group", "Encaixe");
  snap.type = "button";
  snap.title = "Encaixar o marcador nas bordas dos clipes";
  snap.setAttribute("aria-label", snap.title);
  snap.setAttribute("aria-pressed", "false");
  snap.onclick = () => snap.setAttribute("aria-pressed", String(snap.getAttribute("aria-pressed") !== "true"));
  zoomControls.append(zoomLabel, zoomOut, zoomValue, zoomIn);
  const group = node("button", "mlt-group", "Selecionar clipes");
  group.type = "button";
  group.addEventListener("click", () => onToggleGroup());
  const addTrack = node("button", "mlt-group");
  addTrack.type = "button";
  addTrack.addEventListener("click", onNewTrack);
  header.append(title, actions, group, addTrack, snap, zoomControls);

  const layout = node("div", "mlt-layout");
  const labels = node("div", "mlt-labels");
  const videoLabel = node("div", "mlt-track-label");
  videoLabel.innerHTML = icon("film") + "<span>Vídeo</span>";
  const audioLabel = node("div", "mlt-track-label");
  audioLabel.innerHTML = icon("music") + "<span>Áudio</span>";
  const originalLabel = node("div", "mlt-track-label lane-label", "Som original");
  const originalTrack = node("div", "lane-row");
  const captionLabel = node("div", "mlt-track-label lane-label caption-label", "Legendas");
  const captionTrack = node("div", "lane-row caption-track");
  captionTrack.setAttribute("aria-label", "Legendas da montagem");
  audioLabel.classList.add("lane-label");
  audioLabel.querySelector("span").textContent = "Trilha";
  labels.append(node("div", "mlt-ruler-spacer"), videoLabel, originalLabel, audioLabel, captionLabel);
  const scroll = node("div", "mlt-scroll");
  const body = node("div", "mlt-body");
  const ruler = node("div", "mlt-ruler");
  ruler.tabIndex = 0;
  ruler.setAttribute("role", "slider");
  ruler.setAttribute("aria-label", "Posição na montagem");
  ruler.setAttribute("aria-valuemin", "0");
  const sceneTrack = node("div", "mlt-scene-track");
  const audioTrack = node("div", "mlt-audio-track");
  const playhead = node("i", "mlt-head");
  playhead.setAttribute("aria-hidden", "true");
  body.append(ruler, sceneTrack, originalTrack, audioTrack, captionTrack, playhead);
  scroll.append(body);
  layout.append(labels, scroll);
  root.replaceChildren(header, layout);

  function setZoom(value) {
    const fraction = duration ? time / duration : 0;
    const screenX = fraction * body.clientWidth - scroll.scrollLeft;
    const anchor = screenX >= 0 && screenX <= scroll.clientWidth ? screenX : scroll.clientWidth / 2;
    zoom = Math.max(1, Math.min(4, value));
    body.style.width = Math.round(zoom * 100) + "%";
    zoomValue.textContent = Math.round(zoom * 100) + "%";
    zoomOut.disabled = zoom === 1;
    zoomIn.disabled = zoom === 4;
    paintRuler();
    scroll.scrollLeft = fraction * body.clientWidth - anchor;
  }
  function moveBy(offset) {
    const index = clips.findIndex(c => c.id === selected);
    move(index, index + offset);
  }
  function move(index, target) {
    if (
      index < 0 ||
      target < 0 ||
      index >= clips.length ||
      target >= clips.length ||
      index === target
    )
      return;
    const reordered = clips.slice();
    reordered.splice(target, 0, reordered.splice(index, 1)[0]);
    onChange(reordered, clips[index].id, target);
  }
  function seek(event, force = false) {
    if (!duration) return;
    const box = body.getBoundingClientRect();
    if (!box.width) return;
    const at = ((event.clientX - box.left) * duration) / box.width;
    const nearest = snap.getAttribute("aria-pressed") === "true" ? nearestSnap(snapTimes, at, duration / box.width) : null;
    playhead.classList.toggle("is-snapped", scrubPointer !== null && nearest !== null);
    const frameTime = at >= duration ? duration : Math.round(at * FPS) / FPS;
    const target = nearest ?? Math.max(0, Math.min(duration, frameTime));
    if (force || target !== time) onSeek(target);
  }
  function paintRuler() {
    ruler.replaceChildren();
    if (!duration || !body.clientWidth) return;
    const required = (duration * 64) / body.clientWidth;
    const power = 10 ** Math.floor(Math.log10(Math.max(0.001, required)));
    const step = ([1, 2, 5, 10].find(x => x * power >= required) || 10) * power;
    for (let t = 0; t < duration; t += step) {
      const tick = node(
        "span",
        "mlt-tick",
        t < 60
          ? Number(t.toFixed(2)).toLocaleString("pt-BR") + "s"
          : Math.floor(t / 60) +
              ":" +
              String(Math.floor(t % 60)).padStart(2, "0")
      );
      tick.style.left = (100 * t) / duration + "%";
      ruler.append(tick);
      for (let j = 1; j < 4 && t + (j * step) / 4 < duration; j++) {
        const minor = node("i", "mlt-minor");
        minor.style.left = (100 * (t + (j * step) / 4)) / duration + "%";
        ruler.append(minor);
      }
    }
  }
  function paintTracks() {
    sceneTrack.replaceChildren();
    if (!clips.length) sceneTrack.append(node("span", "mlt-empty", "Adicione um clipe ou uma composição"));
    originalTrack.replaceChildren();
    captionTrack.replaceChildren();
    let start = 0;
    const usedTracks = trackCount(project);
    addTrack.textContent = "+ Pista · " + usedTracks + " de " + TRACK_LIMIT;
    addTrack.setAttribute("aria-label", `Adicionar pista. ${usedTracks} de ${TRACK_LIMIT} em uso`);
    addTrack.disabled = usedTracks >= TRACK_LIMIT;
    const position = (el, at, length) => {
      el.style.left = 100 * at / duration + "%";
      el.style.width = 100 * length / duration + "%";
    };
    for (const el of root.querySelectorAll("[data-lane]")) el.remove();
    const numbers = {video: 1, audio: 2};
    for (const track of project.extraTracks || []) {
      const video = track.kind === "video";
      const name = (video ? "Vídeo " : "Áudio ") + ++numbers[track.kind];
      const label = node("button", "mlt-track-label lane-label lane-add", name + " ＋");
      label.type = "button";
      label.title = "Editar pista · " + name;
      label.onclick = () => onTrackEdit(track.id);
      const row = node("div", "lane-row");
      label.dataset.lane = row.dataset.lane = track.id;
      if (video) {
        labels.insertBefore(label, labels.children[1]);
        body.insertBefore(row, ruler.nextSibling);
      } else { labels.append(label); body.insertBefore(row, playhead); }
      for (const c of track.clips) {
        const block = node("button", "lane-block " + track.kind, c.name);
        block.type = "button";
        block.onclick = () => onTrackEdit(track.id, c.id);
        position(block, c.start, c.duration);
        row.append(block);
      }
      row.ondblclick = event => { if (event.target === row) { seek(event); onTrackEdit(track.id); } };
    }
    clips.forEach((clip, index) => {
      const element = node("button", "mlt-clip");
      element.type = "button";
      element.dataset.clip = clip.id;
      element.style.width = duration
        ? (clip.duration / duration) * 100 + "%"
        : "0";
      element.title =
        clip.name +
        " · " +
        Number(clip.duration).toLocaleString("pt-BR") +
        " s";
      element.setAttribute("aria-label", element.title);
      const source = compositionForClip(project, clip);
      const hasLayers = source?.kind === "composition" || Boolean(clip.composition);
      const thumbnail = hasLayers
        ? null
        : clip.kind === "scene"
          ? "wave"
          : ["coast", "tide"].includes(clip.assetId)
            ? clip.assetId
            : null;
      if (thumbnail)
        element.style.setProperty(
          "--mlt-thumb",
          'url("./assets/' + thumbnail + '.jpg")'
        );
      else
        element.classList.add(
          hasLayers ? "mlt-composition" : "mlt-import"
        );
      const badge = node("span", "mlt-clip-name");
      badge.innerHTML = icon(clip.kind === "scene" ? "scene" : "film");
      badge.append(
        node(
          "span",
          "",
          clip.name || (clip.kind === "scene" ? "Animação" : "Vídeo")
        )
      );
      element.append(badge);
      element.addEventListener("click", e => {
        if (groupIds || e.shiftKey) {
          onToggleGroup(clip.id);
          return;
        }
        onSelect(clip.id);
        if (e.detail) seek(e);
        else onSeek(clips.slice(0, index).reduce((n, c) => n + c.duration, 0));
      });
      if (clip.compositionId) {
        element.addEventListener("dblclick", () => {
          if (!groupIds) onOpenComposition(clip.id);
        });
      }
      element.draggable = true;
      element.addEventListener("dragstart", e => {
        dragId = clip.id;
        e.dataTransfer.setData("text/plain", clip.id);
        e.dataTransfer.effectAllowed = "move";
      });
      element.addEventListener("dragover", e => {
        if (!dragId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        element.classList.add("is-target");
      });
      element.addEventListener("dragleave", () =>
        element.classList.remove("is-target")
      );
      element.addEventListener("dragend", () => {
        dragId = null;
      });
      element.addEventListener("drop", e => {
        e.preventDefault();
        element.classList.remove("is-target");
        if (dragId)
          move(
            clips.findIndex(c => c.id === dragId),
            index
          );
        dragId = null;
      });
      element.addEventListener("keydown", e => {
        if (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          move(index, index + (e.key === "ArrowLeft" ? -1 : 1));
          sceneTrack
            .querySelector('[data-clip="' + CSS.escape(clip.id) + '"]')
            ?.focus();
        }
      });
      sceneTrack.append(element);
      if (clip.kind === "video") {
        const source = node("span", "lane-block linked", clip.name);
        source.title = "Som vinculado ao clipe, quando presente na fonte";
        position(source, start, clip.duration);
        originalTrack.append(source);
        for (const cue of displayCues(clip)) {
          if (cue.end <= cue.start) continue;
          const block = node("button", "lane-block caption-block", cue.text);
          const at = start + cue.start - clip.trim;
          block.type = "button";
          block.title = "Editar legenda · " + cue.text;
          block.setAttribute("aria-label", block.title);
          position(block, at, cue.end - cue.start);
          block.onclick = () => onOpenSpeech?.(clip.id, at, block);
          captionTrack.append(block);
        }
      }
      if (index > 0) {
        const applied = transitionFrames(clips[index - 1], clip);
        const title = (applied ? transitionPack[clip.transitionIn.type].name : "Adicionar transição") + " · " +
          clips[index - 1].name + " → " + clip.name;
        const join = node("button", "lane-join", applied ? "◆" : "＋");
        join.type = "button";
        join.dataset.transitionTo = clip.id;
        join.title = title;
        join.setAttribute("aria-label", title);
        join.setAttribute("aria-haspopup", "dialog");
        join.setAttribute("aria-pressed", String(Boolean(applied)));
        join.style.left = 100 * start / duration + "%";
        join.onclick = () => onTransition(index);
        sceneTrack.append(join);
      }
      start += clip.duration;
    });
    captionLabel.hidden = captionTrack.hidden = !captionTrack.childElementCount;
    const ticket = ++requestNumber;
    peaks = project?.sound?.peaks || [];
    audioTrack.replaceChildren();
    if (project?.sound?.assetId) {
      const audio = node("button", "mlt-audio");
      audio.type = "button";
      audio.dataset.clip = "audio";
      const name =
        project.sound.name ||
        (project.sound.assetId === "sound"
          ? "Maré ambiente"
          : "Trilha de áudio");
      audio.title = name;
      audio.setAttribute("aria-label", "Selecionar trilha de áudio: " + name);
      if (!project.sound.enabled) audio.classList.add("is-muted");
      const wave = node("canvas", "mlt-wave");
      const caption = node("span", "mlt-audio-name");
      caption.innerHTML = icon("music");
      caption.append(
        node("span", "", name + (project.sound.enabled ? "" : " · Mudo"))
      );
      audio.append(wave, caption);
      audio.addEventListener("click", () => onSelect("audio"));
      audioTrack.append(audio);
      drawWave(wave, peaks);
      if (!peaks.length && project.sound.assetId === "sound")
        wavePeaks(new URL("./assets/sound.wav", import.meta.url).href).then(
          result => {
            if (ticket === requestNumber) {
              peaks = result;
              drawWave(wave, peaks);
            }
          }
        );
    }
    paintRuler();
  }
  function refreshControls() {
    if (groupIds) {
      for (const control of [cut, copy, remove, previous, next])
        control.disabled = true;
      return;
    }
    const index = clips.findIndex(c => c.id === selected);
    copy.disabled = remove.disabled = index < 0;
    previous.disabled = index < 1;
    next.disabled = index < 0 || index >= clips.length - 1;
    const start = clips
      .slice(0, Math.max(0, index))
      .reduce((n, c) => n + c.duration, 0);
    cut.disabled = index < 0 || !canSplitAt(clips[index], time - start);
  }
  function setTime(value) {
    time = Math.max(0, Math.min(duration, Number(value) || 0));
    playhead.style.left = (duration ? (100 * time) / duration : 0) + "%";
    ruler.setAttribute("aria-valuenow", time.toFixed(2));
    ruler.setAttribute(
      "aria-valuetext",
      time.toFixed(2).replace(".", ",") + " segundos"
    );
    refreshControls();
  }
  function update(nextProject, at, activeId, selectedGroup = null) {
    groupIds = selectedGroup;
    group.setAttribute("aria-pressed", String(Boolean(groupIds)));
    project = nextProject;
    clips = project?.clips || [];
    selected = activeId;
    duration = durationOf(project);
    const nextSignature = JSON.stringify([
      clips.map(c => [c.id, c.kind, c.name, c.assetId, c.compositionId, c.duration, c.trim, c.transitionIn,
        displayCues(c).map(cue => [cue.start, cue.end, cue.text])]),
      project.extraTracks,
      project?.sound?.assetId,
      project?.sound?.name,
      project?.sound?.enabled,
    ]);
    if (nextSignature !== signature) {
      signature = nextSignature;
      let end = 0;
      snapTimes = [0];
      for (const clip of clips) {
        end += clip.duration;
        snapTimes.push(end);
      }
      for (const track of project.extraTracks || []) {
        for (const clip of track.clips) snapTimes.push(clip.start, clip.start + clip.duration);
      }
      snapTimes.sort((a, b) => a - b);
      ruler.setAttribute("aria-valuemax", String(duration));
      paintTracks();
    }
    body.querySelectorAll("[data-clip]").forEach(el => {
      const active = groupIds
        ? groupIds.has(el.dataset.clip)
        : el.dataset.clip === activeId;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-pressed", String(active));
    });
    setTime(at);
  }
  function startScrub(e) {
    if (e.button !== 0 || !e.isPrimary || scrubPointer !== null) return;
    e.preventDefault();
    scrubPointer = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    seek(e, true);
  }
  for (const handle of [ruler, playhead]) {
    handle.addEventListener("pointerdown", startScrub);
    handle.addEventListener("pointermove", e => {
      if (e.pointerId === scrubPointer) seek(e);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      handle.addEventListener(type, e => {
        if (e.pointerId !== scrubPointer) return;
        if (type === "pointerup") seek(e);
        scrubPointer = null;
        playhead.classList.remove("is-snapped");
      });
    }
  }
  ruler.addEventListener("keydown", e => {
    // Plain arrows use the editor's frame step in both environments.
    const target = {
      ArrowLeft: e.shiftKey ? time - 1 : undefined,
      ArrowRight: e.shiftKey ? time + 1 : undefined,
      Home: 0,
      End: duration,
    }[e.key];
    if (target !== undefined) {
      e.preventDefault();
      onSeek(Math.min(duration, Math.max(0, target)));
    }
  });
  const observer = new ResizeObserver(() => {
    paintRuler();
    const wave = audioTrack.querySelector("canvas");
    if (wave) drawWave(wave, peaks);
  });
  observer.observe(body);
  setZoom(1);
  return {
    update,
    setTime,
    getViewport: () => ({zoom, scrollLeft: scroll.scrollLeft, snap:snap.getAttribute("aria-pressed")==="true"}),
    setSnap: enabled => snap.setAttribute("aria-pressed",String(enabled)),
    restoreViewport(view) {
      if (view.snap !== undefined) snap.setAttribute("aria-pressed",String(view.snap));
      setZoom(view.zoom);
      scroll.scrollLeft = view.scrollLeft;
    },
    destroy() {
      observer.disconnect();
      root.replaceChildren();
    },
  };
}
