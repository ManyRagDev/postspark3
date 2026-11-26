import { integrated, processorResult } from "./postspark-session.js";
import catalog from "./assets/narration.json" with {type: "json"};
import { FPS, TRACK_LIMIT, trackCount } from "./montage-model.js";

// A take must fit in full. A null target means the caller can add one audio lane.
export function narrationPlacement(project, start, duration, originalTrack, originalClip) {
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration < 1 / FPS)
    throw Error("Confira a posição e a duração da narração.");
  if (start + duration > 60.000001)
    throw Error("A fala ultrapassa 60 s. Antecipe a entrada ou encurte o roteiro.");
  const tracks = project.extraTracks || [];
  const count = project.clips.length + tracks.reduce((n, track) => n + track.clips.length, 0);
  if (!originalClip && count >= 48) throw Error("A montagem já usa os 48 clipes disponíveis.");
  const fits = track => track.kind === "audio" && track.clips.every(c => c === originalClip ||
    start + duration <= c.start + 1e-8 || start >= c.start + c.duration - 1e-8);
  if (originalTrack && fits(originalTrack)) return originalTrack;
  if (!originalTrack) {
    const available = tracks.find(fits);
    if (available) return available;
    if (trackCount(project) < TRACK_LIMIT) return null;
  }
  throw Error("A fala precisa de um intervalo livre na pista. Ajuste a posição ou encurte o roteiro.");
}

export async function synthesizeNarration({text, model, voice}, signal) {
  const response = integrated ? await processorResult("narration",{text,model,voice},signal) : await fetch("/api/narration", {method: "POST", signal,
    headers: {"Content-Type": "application/json"}, body: JSON.stringify({text, model, voice})});
  if (!response.ok) throw Error((await response.json()).message || "Falha ao gerar a narração.");
  return new File([await response.blob()], "Narração.mp3", {type: "audio/mpeg"});
}

export function openNarrationEditor({dialog, showDialog, clip, start, checkPlacement, apply}) {
  const options = entries => Object.entries(entries).map(([id, name]) =>
    '<option value="' + id + '">' + name + '</option>').join("");
  showDialog(clip ? "Editar narração" : "Gerar narração",
    '<div class="lane-fields narration-fields">' +
    '<label>Roteiro em português<textarea id="narration-text" rows="4" maxlength="' +
    catalog.maxCharacters + '"></textarea></label><div class="narration-options">' +
    '<label>Modelo<select id="narration-model">' + options(catalog.models) + '</select></label>' +
    '<label>Voz<select id="narration-voice">' + options(catalog.voices) + '</select></label></div>' +
    '<label>Posição na montagem (s)<input id="narration-start" type="number" min="0" max="60" step="any"></label>' +
    '<audio id="narration-preview" controls hidden></audio>' +
    '<div role="status" aria-live="polite" id="narration-status"></div></div>',
    '<button class="btn" id="narration-generate">Gerar prévia</button>' +
    '<button class="btn primary" id="narration-apply" disabled>' +
    (clip ? 'Substituir narração' : 'Inserir narração') + '</button>');
  const get = id => dialog.querySelector("#narration-" + id);
  const text = get("text"), model = get("model"), voice = get("voice"), position = get("start");
  const player = get("preview"), status = get("status"), generate = get("generate"), accept = get("apply");
  text.value = clip?.narration.text ?? "";
  if (clip) {
    model.value = clip.narration.model;
    voice.value = clip.narration.voice;
  }
  position.value = start;
  const controller = new AbortController();
  let file, url, busy = false;
  const current = () => dialog.open && player.isConnected && !controller.signal.aborted;
  const draft = () => ({text: text.value.trim(), model: model.value, voice: voice.value});
  function discard() {
    player.pause();
    player.removeAttribute("src");
    player.hidden = true;
    if (url) URL.revokeObjectURL(url);
    url = null;
    file = null;
    accept.disabled = true;
  }
  function refresh() {
    generate.disabled = busy || !text.value.trim() || !model.value || !voice.value;
    text.disabled = model.disabled = voice.disabled = position.disabled = busy;
    accept.disabled = true;
    if (!busy && file && Number.isFinite(player.duration)) {
      try {
        checkPlacement(position.valueAsNumber, player.duration);
        status.textContent = "Duração da fala · " + player.duration.toLocaleString("pt-BR", {maximumFractionDigits: 2}) + " s";
        accept.disabled = false;
      } catch (error) { status.textContent = error.message; }
    }
  }
  const reset = () => { discard(); status.textContent = ""; refresh(); };
  text.oninput = model.onchange = voice.onchange = reset;
  position.oninput = refresh;
  player.onloadedmetadata = refresh;
  player.onerror = () => {
    if (file && current()) { discard(); status.textContent = "O navegador não conseguiu abrir esta prévia."; refresh(); }
  };
  generate.onclick = async () => {
    try {
      checkPlacement(position.valueAsNumber, 1 / FPS);
    } catch (error) { status.textContent = error.message; return; }
    discard();
    busy = true;
    refresh();
    status.textContent = "Gerando narração…";
    try {
      file = await synthesizeNarration(draft(), controller.signal);
      if (!current()) return;
      url = URL.createObjectURL(file);
      player.preload = "metadata";
      player.src = url;
      player.hidden = false;
      status.textContent = "Carregando prévia…";
    } catch (error) { if (current()) status.textContent = error.message; }
    finally { busy = false; if (current()) refresh(); }
  };
  accept.onclick = async () => {
    if (busy || accept.disabled) return;
    busy = true;
    refresh();
    try {
      await apply(file, draft(), position.valueAsNumber, current);
      if (current()) dialog.close();
    } catch (error) {
      busy = false;
      if (current()) { refresh(); status.textContent = error.message; }
    }
  };
  dialog.addEventListener("close", () => { controller.abort(); discard(); }, {once: true});
  refresh();
  text.focus();
}
