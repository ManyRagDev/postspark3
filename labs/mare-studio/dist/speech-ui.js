import { integrated, currentAnchorId,currentWorkspaceId } from "./postspark-session.js";
import { uploadStudioAsset } from "./studio-upload.js";
import { requestEdit } from "./edit-api.js";
import { speechSettings } from "./speech-plan.js";
import { MediaEngine, discardMasks, readVideoBlob, storeMask } from "./engine.js";
import { imageLayerFromFile } from "./composition-model.js";
import { drawFrame } from "./renderer.js";
import { speechCommands } from "./speech-commands.js";
import {
  TALK_DEFAULTS, HESITATIONS, applySpeechEdit, captionCues, coversClip, needsMatte,
  planSpeechCuts, rewriteCue,
} from "./speech-model.js";

const steps = {queued:"Preparando a análise…", audio:"Lendo a faixa de voz…",
  speech:"Transcrevendo a fala…", mask:"Acompanhando o contorno da pessoa…"};
const delay = (ms, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(signal.reason); return; }
  const timer = setTimeout(() => {
    signal.removeEventListener("abort", abort);
    resolve();
  }, ms);
  function abort() { clearTimeout(timer); reject(signal.reason); }
  signal.addEventListener("abort", abort, {once: true});
});

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || data.message || "Não foi possível acessar a análise na VPS.");
  return data;
}

export async function analyzeSpeechMedia(clip, options, signal, report) {
  report("Enviando o vídeo original…", 0);
  const body = await readVideoBlob(clip.assetId, signal);
  if (body.size > 128 * 1024 * 1024) throw Error("O vídeo excede o limite de 128 MiB para análise.");
  if (clip.duration > 60.000001) throw Error("Encurte o clipe para até 60 s antes de analisar.");
  const endpoint = integrated ? "/api/mare/speech" : "/api/speech";
  let path;
  try {
    if (integrated) {
      const {assetId} = await uploadStudioAsset(body, {kind:"video", anchorId:currentAnchorId(),workspaceId:currentWorkspaceId(), signal});
      const jobId = crypto.randomUUID();
      path = endpoint + "/" + jobId;
      await readResponse(await fetch(endpoint, {method:"POST",signal,headers:{"Content-Type":"application/json"},
        body:JSON.stringify({jobId,assetId,start:clip.trim,end:clip.trim+clip.duration,language:options.language,speech:!!options.speech,mask:!!options.mask})}));
    } else {
      const {job} = await readResponse(await fetch(endpoint, {method:"POST",signal,body,headers:{
        "Content-Type":"application/octet-stream","X-Mare-Start":String(clip.trim),"X-Mare-End":String(clip.trim+clip.duration),
        "X-Mare-Language":options.language,"X-Mare-Speech":options.speech?"1":"0","X-Mare-Mask":options.mask?"1":"0"}}));
      path = endpoint + "/" + job;
    }
    while (!signal.aborted) {
      const state = await readResponse(await fetch(path, {signal, cache:"no-store"}));
      if (state.state === "failed") throw Error(state.message);
      if (state.state === "ready") {
        const {speech, matte} = state.result;
        let mask;
        if (matte && !matte.message) {
          report("Preparando o recorte para a prévia…", .98);
          const response = await fetch(path + "/mask", {signal, cache:"no-store"});
          if (!response.ok) await readResponse(response);
          mask = {...matte, blob: await response.blob()};
        }
        return {speech, mask, maskMessage: matte?.message};
      }
      report(steps[state.phase] || steps.queued, state.progress);
      await delay(620, signal);
    }
    throw signal.reason;
  } finally {
    if (path) fetch(path, {method:"DELETE",keepalive:true}).catch(() => {});
  }
}

const checked = value => value ? " checked" : "";
const selected = value => value ? " selected" : "";
const rangeKey = ([a,b]) => a.toFixed(4) + "/" + b.toFixed(4);
const decimal = new Intl.NumberFormat("pt-BR", {maximumFractionDigits:2});
const seconds = value => decimal.format(Math.max(0, value)) + " s";
const bounded = (value, min, max) => Math.min(max, Math.max(min, value));

export function openSpeechEditor({clip, project, at, dialog, showDialog, esc, icon, available, apply, insertExcerpt, catalog, trigger}) {
  const initial = clip.talk ?? TALK_DEFAULTS;
  const draft = {...initial};
  const settings = {language:"auto", minimum:.8, margin:.15, fillerText:HESITATIONS, pauses:false,
    useFillers:false, manual:new Map(), omitted:new Set(), phrase:"", excerpt:null, ripple:true};
  const corrected = new Map();
  const newMasks = new Set();
  let panel = "captions", active = true, pending = null, previewTime = at, reviewing = false, playing = false;
  let excerpt = null;
  let status = "", progress = null, appliedMask;

  showDialog("Editar vídeo falado", `<div class="speech-layout">
    <div class="speech-preview"><canvas width="270" height="480" aria-label="Prévia da edição" role="img" id="speech-screen"></canvas>
      <div class="speech-player"><button type="button" class="icon" data-action="play" aria-label="Reproduzir prévia">${icon("Play")}</button>
      <input type="range" aria-label="Posição da prévia" min="0" max="${clip.duration}" step="0.033333" value="0" id="speech-scrub">
      <span id="speech-time">0 s</span></div><button type="button" class="btn speech-compare" data-action="review" hidden>Prévia dos cortes</button></div>
    <div class="speech-controls"><p class="speech-source">${esc(clip.name)} <span>· ${seconds(clip.duration)}</span></p>
      <form id="speech-request"><label for="speech-prompt">Pedir uma edição</label><div class="speech-inline">
      <input id="speech-prompt" class="text-input" maxlength="300" placeholder="Encurte as pausas e gere legendas">
      <button class="btn" type="submit" aria-label="Interpretar pedido">${icon("Sparkles")}<span>Preparar</span></button></div></form>
      <div class="speech-tabs" aria-label="Ajustes do vídeo falado">
      <button type="button" class="btn" data-pane="captions">Legendas</button><button type="button" class="btn" data-pane="cuts">Cortes</button>
      <button type="button" class="btn" data-pane="look">Visual</button></div>
      <div id="speech-status" role="status" aria-live="polite"></div>
      <progress id="speech-progress" max="1" hidden></progress><div id="speech-pane"></div>
    </div></div>`, `<button type="button" class="btn" data-action="close">Cancelar</button>
      <button type="button" class="btn primary" data-action="apply">${icon("Check")}Aplicar à montagem</button>`);
  dialog.classList.add("speech-dialog");
  const $ = selector => dialog.querySelector(selector);
  const content = $("#dialog-content");
  const player = new MediaEngine($("#speech-screen"), drawFrame);
  const previewBase = {clips:[{...clip, transitionIn:undefined}], sound:{enabled:false, volume:0}, extraTracks:[], compositions:[]};

  const originalCues = () => captionCues(draft.speech, clip.trim, clip.duration);
  function currentTalk() {
    if (!corrected.size) return {...draft};
    let speech = draft.speech;
    for (const {cue, text} of [...corrected.values()].sort((a,b) => b.cue.words[0].index - a.cue.words[0].index))
      speech = rewriteCue(speech, cue, text);
    return {...draft, speech};
  }
  function planned(talk = currentTalk()) {
    const plan = planSpeechCuts(clip, talk, {pauses:settings.pauses, minimum:settings.minimum, margin:settings.margin,
      fillers:settings.useFillers ? settings.fillerText.split(",") : [], manual:[...settings.manual.values()],
      phrase:settings.phrase, excerpt:settings.excerpt});
    const cuts = plan.cuts.filter(range => !settings.omitted.has(rangeKey(range)));
    return {...plan, proposals:plan.cuts, cuts, removed:cuts.reduce((n,[a,b]) => n + b - a, 0)};
  }
  function currentPreview() {
    const talk = currentTalk();
    if (needsMatte(talk) && !talk.matte) Object.assign(talk, {background:"original", title:"", exposure:0});
    if (talk.background === "image" && !talk.image) talk.background = "original";
    if (!talk.speech) talk.captions = "off";
    const {cuts, removed} = planned(talk);
    if (excerpt) return {...previewBase, clips:[{...previewBase.clips[0], talk, trim:excerpt.start, duration:excerpt.end-excerpt.start}]};
    if (reviewing && cuts.length && removed < clip.duration - .03) {
      return applySpeechEdit(previewBase, previewBase.clips[0], talk, cuts, false);
    }
    return {...previewBase, clips:[{...previewBase.clips[0], talk}]};
  }
  function setTransport(current, duration) {
    $("#speech-scrub").max = String(duration);
    $("#speech-scrub").value = String(current);
    $("#speech-time").textContent = seconds(current);
    const button = $("[data-action=play]");
    const label = playing ? "Pausar prévia" : "Reproduzir prévia";
    if (button.getAttribute("aria-label") !== label) {
      button.innerHTML = icon(playing ? "Pause" : "Play");
      button.setAttribute("aria-label", label);
    }
  }
  function preview() {
    if (!active) return;
    playing = false;
    try {
      const p = currentPreview();
      const duration = p.clips.reduce((n,c) => n + c.duration, 0);
      previewTime = bounded(previewTime, 0, duration);
      setTransport(previewTime, duration);
      player.seek(p, previewTime).catch(error => { if (active) report(error.message); });
    } catch (error) { report(error.message); }
  }
  function report(message, value = null) {
    if (!active) return;
    status = message;
    progress = value;
    $("#speech-status").textContent = status;
    const bar = $("#speech-progress");
    bar.hidden = progress === null;
    if (!bar.hidden) bar.value = progress;
  }

  function captionsPane() {
    const {speech} = draft;
    const cues = originalCues();
    const excerptOptions = excerpt ? cues.filter(c => c.end > excerpt.start && c.end <= clip.trim + clip.duration + 1e-6)
      .map(c => '<option value="' + c.end + '"' + selected(c.end === excerpt.end) + '>' + esc(c.text) + '</option>').join("") : "";
    return `<div class="speech-inline speech-run"><label>Idioma<select id="speech-language" class="text-input" aria-label="Idioma">
      ${[["auto","Detectar automaticamente"],["pt","Português"],["en","Inglês"],["es","Espanhol"]].map(([key,label]) =>
        `<option value="${key}"${selected(settings.language === key)}>${label}</option>`).join("")}</select></label>
      <button class="btn" type="button" data-action="captions">${icon("AudioLines")}${speech ? "Transcrever novamente" : "Gerar legendas"}</button></div>
      <div class="speech-inline"><label>Estilo<select class="text-input" data-look="captions" aria-label="Estilo das legendas"><option value="off"${selected(draft.captions === "off")}>Sem legendas</option>
      <option value="classic"${selected(draft.captions === "classic")}>Clássico</option>
      <option value="highlight"${selected(draft.captions === "highlight")}>Palavra em destaque</option></select></label>
      <label class="speech-color">Destaque<input type="color" data-look="accent" value="${esc(draft.accent)}"></label></div>
      ${speech ? (!coversClip(speech, clip) ? '<p class="speech-note">O trecho cresceu. Gere a transcrição novamente para cobrir toda a fala.</p>' : "") +
      (cues.length ? `<div class="speech-cues" aria-label="Legendas editáveis">${cues.map((cue, index) =>
        `<div><button type="button" class="btn" data-seek="${cue.start}">${seconds(cue.start - clip.trim)}</button>
        <input class="text-input" aria-label="Legenda ${index + 1}" maxlength="160" data-cue="${index}" value="${esc(corrected.get(cue.words[0].index)?.text ?? cue.text)}">
        <button type="button" class="btn" data-start-excerpt="${index}">Começar um clipe com esta frase</button></div>`).join("")}</div>` :
      '<p class="speech-note">Nenhuma palavra reconhecida neste trecho.</p>') : ""}
      ${excerpt ? `<div class="speech-planning"><label>Terminar após a frase<select id="excerpt-end">${excerptOptions}</select></label>
        <button class="btn" data-action="insert-excerpt">Inserir trecho após o clipe</button>
        <button class="btn" data-action="cancel-excerpt">Cancelar trecho</button></div>` : ""}`;
  }

  function cutsPane(plan) {
    const cues = originalCues();
    const summary = plan.cuts.length ? `${plan.cuts.length} ${plan.cuts.length === 1 ? "corte" : "cortes"} · –${seconds(plan.removed)}` : "Sem cortes selecionados";
    return `<div class="speech-inline speech-run"><button type="button" class="btn" data-action="pauses">${icon("Clapperboard")}Propor cortes de pausa</button>
      <button type="button" class="btn" data-action="excerpt">Sugerir trecho</button></div>
      <label class="speech-toggle"><input id="speech-pauses" type="checkbox"${checked(settings.pauses)}> Encurtar pausas</label>
      <div class="speech-inline"><label>Pausas a partir de (s)<input class="num-input" type="number" id="speech-minimum" min=".25" max="8" step=".05" value="${settings.minimum}"></label>
      <label>Margem junto à fala (s)<input class="num-input" type="number" id="speech-margin" min="0" max="1" step=".05" value="${settings.margin}"></label></div>
      <label class="speech-toggle"><input id="speech-fillers" type="checkbox"${checked(settings.useFillers)}> Remover hesitações</label>
      <label>Palavras ou expressões, separadas por vírgula<input class="text-input" id="speech-filler-text" maxlength="240" value="${esc(settings.fillerText)}"></label>
      ${settings.phrase ? `<p class="speech-note">Frase: ${esc(settings.phrase)} · ${plan.found} ocorrência(s) <button type="button" class="btn" data-action="clear-phrase">Limpar</button></p>` : ""}
      ${settings.excerpt ? `<p class="speech-note">Trecho sugerido · ${seconds(settings.excerpt.end - settings.excerpt.start)}
        <button type="button" class="btn" data-action="clear-excerpt">Limpar</button><br>${esc(settings.excerpt.text.slice(0, 180))}</p>` : ""}
      ${cues.length ? `<details class="speech-details" ${settings.manual.size ? "open" : ""}><summary>Cortar trechos pela transcrição</summary><div class="speech-cut-list">
        ${cues.map((cue,index) => `<label class="speech-toggle"><input type="checkbox" data-manual="${index}"${checked(settings.manual.has(cue.words[0].index))}>
          <span>${seconds(cue.start - clip.trim)} · ${esc(cue.text)}</span></label>`).join("")}</div></details>` : ""}
      <div class="speech-planning"><strong>${summary}</strong><p>Imagem e fala do clipe acompanham o corte. A trilha musical segue contínua.</p>
      ${project.extraTracks?.length ? `<label class="speech-toggle"><input id="speech-ripple" type="checkbox"${checked(settings.ripple)}> Acompanhar os cortes em ${project.extraTracks.length} pista(s) extra(s)</label>` : ""}
      ${plan.proposals.length ? `<div class="speech-cut-list" aria-label="Cortes sugeridos">${plan.proposals.map((range,index) =>
        `<div><label class="speech-toggle"><input type="checkbox" aria-label="Incluir corte ${index + 1}" data-proposal="${rangeKey(range)}"${checked(!settings.omitted.has(rangeKey(range)))}>
        <span>Corte ${index + 1} · ${seconds(range[1]-range[0])}</span></label><button type="button" class="btn" data-seek="${range[0]}">${seconds(range[0]-clip.trim)}</button></div>`).join("")}</div>` : ""}</div>`;
  }

  function lookPane() {
    const backgrounds = [["original","Original"],["blur","Desfocado"],["solid","Cor sólida"],["gradient","Degradê"],["image","Imagem"]];
    return `<div class="speech-inline speech-run"><label>Fundo<select class="text-input" data-look="background" aria-label="Fundo">
      ${backgrounds.map(([key,label]) => `<option value="${key}"${selected(draft.background === key)}>${label}</option>`).join("")}</select></label>
      <button class="btn" data-action="matte" type="button">${icon("Layers")}${coversClip(draft.matte, clip, .08) ? "Refazer recorte" : "Detectar pessoa"}</button></div>
      ${draft.background === "image" ? `<label>Imagem de fundo<input class="text-input" type="file" id="speech-background-file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label>
        ${draft.image ? '<p class="speech-note">Imagem carregada.</p>' : ""}` : ""}
      ${["solid","gradient"].includes(draft.background) ? `<label class="speech-color">Cor de fundo<input type="color" data-look="color" value="${esc(draft.color)}"></label>` : ""}
      <label>Título atrás da pessoa<input class="text-input" data-look="title" maxlength="80" value="${esc(draft.title)}" placeholder="Café 360"></label>
      <label>Altura do título<input class="slider" type="range" min=".12" max=".8" step=".01" value="${draft.titleY}" data-look="titleY"></label>
      <label>Luz na pessoa <output id="speech-light">${decimal.format(draft.exposure)} EV</output><input class="slider" type="range"
        min="-1" max="1" step=".05" value="${draft.exposure}" data-look="exposure"></label>
      ${needsMatte(draft) && !coversClip(draft.matte, clip, .08) ? '<p class="speech-note">Detecte a pessoa para ver o efeito neste trecho.</p>' : ""}
      ${needsMatte(draft) ? '<button class="btn speech-reset-look" type="button" data-action="reset-look">Restaurar visual original</button>' : ""}`;
  }

  function updateApply(plan = planned()) {
    const changed = corrected.size || [...new Set([...Object.keys(initial), ...Object.keys(draft)])]
      .some(key => draft[key] !== initial[key]);
    $("[data-action=apply]").disabled = Boolean(pending) || (!changed && !plan.cuts.length);
  }

  function render() {
    const plan = planned();
    for (const button of content.querySelectorAll("[data-pane]")) button.setAttribute("aria-pressed", button.dataset.pane === panel);
    $("#speech-pane").innerHTML = panel === "captions" ? captionsPane() : panel === "cuts" ? cutsPane(plan) : lookPane();
    const review = $("[data-action=review]");
    review.hidden = !plan.cuts.length || plan.removed >= clip.duration - .03;
    review.textContent = reviewing ? "Ver trecho original" : "Prévia dos cortes";
    review.setAttribute("aria-pressed", reviewing);
    updateApply(plan);
    for (const button of content.querySelectorAll("[data-action=captions], [data-action=matte], [data-action=pauses], [data-action=excerpt], #speech-request button"))
      button.disabled = Boolean(pending);
    report(status, progress);
  }

  async function ensure({speech, mask}) {
    if (!speech && !mask) return {};
    if (!available) throw Error("Abra o laboratório privado do Maré para analisar o vídeo.");
    if (pending) return {};
    const controller = new AbortController();
    pending = controller;
    render();
    try {
      const result = await analyzeSpeechMedia(clip, {language:settings.language, speech, mask}, controller.signal, report);
      if (!active) return {};
      if (result.speech) {
        draft.speech = result.speech;
        corrected.clear();
        settings.manual.clear();
        settings.omitted.clear();
        settings.excerpt = null;
      }
      if (result.mask) {
        const {blob, ...matte} = result.mask;
        const id = await storeMask(blob);
        if (!active) {
          await discardMasks([id]);
          return {};
        }
        newMasks.add(id);
        draft.matte = {...matte, id};
      }
      report(result.maskMessage || (result.speech && !result.speech.words.length
        ? "Nenhuma palavra reconhecida neste trecho." : "Análise pronta para revisar."));
      return result;
    } finally {
      pending = null;
      if (active) render();
    }
  }

  async function dispatch(commands, force = false) {
    if (pending) return;
    const last = commands.at(-1)?.id;
    panel = last === speechCommands.look ? "look" : last === speechCommands.captions ? "captions" : "cuts";
    const previous = {...draft};
    const look = commands.filter(({id}) => id === speechCommands.look);
    for (const {params} of look) Object.assign(draft, params);
    const {maskMessage} = await ensure({speech:commands.some(({id}) => id !== speechCommands.look) && (force || !coversClip(draft.speech,clip)),
      mask:commands.some(({id}) => id === speechCommands.look) && (force || needsMatte(draft) && !coversClip(draft.matte,clip,.08))});
    if (!active) return;
    if (maskMessage) {
      for (const {params} of look) for (const key of Object.keys(params)) draft[key] = previous[key];
    }
    const talk=currentTalk();
    speechSettings(commands,talk,clip,settings,report);
    draft.captions=talk.captions;
    const plan = planned();
    if (maskMessage) report(maskMessage);
    else if (commands.some(({id}) => id === speechCommands.phrase) && !plan.found) report("A frase não foi encontrada na transcrição.");
    else if (plan.cuts.length) report("Confira os cortes e aplique à montagem.");
    render();
    preview();
  }

  const safe = fn => (...args) => Promise.resolve().then(() => fn(...args)).catch(error => {
    if (active && error.name !== "AbortError") report(error.message);
  });
  $("#speech-request").onsubmit = event => {
    event.preventDefault();
    safe(async () => {
      if (pending) return;
      const ctl = new AbortController();
      pending = ctl;
      render();
      const allowed = catalog.filter(c => Object.values(speechCommands).includes(c.id)).map(c => ({
        id:c.id, manual:c.manual, params:Object.fromEntries(Object.entries(c.params).filter(([k]) =>
          !["clipId","analysisJob?","options?","image?"].includes(k)))
      }));
      let answer;
      try {
        report("Preparando edição com IA…");
        answer = await requestEdit($("#speech-prompt").value, {clip:clip.name, duration:clip.duration}, allowed, {}, ctl.signal);
      } finally { pending = null; if (active) render(); }
      if (active) await dispatch(answer.commands.map(({id,...params}) => ({id,params})));
    })();
  };
  content.onclick = safe(async event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.pane) { excerpt = null; panel = button.dataset.pane; render(); return; }
    if (button.dataset.startExcerpt !== undefined) {
      const cue = originalCues()[Number(button.dataset.startExcerpt)];
      if (!cue) return;
      excerpt = {start:Math.max(clip.trim,cue.start), end:Math.min(clip.trim+clip.duration,cue.end)};
      reviewing = false; previewTime = 0; render(); preview(); return;
    }
    if (button.dataset.action === "cancel-excerpt") { excerpt = null; previewTime = 0; render(); preview(); return; }
    if (button.dataset.action === "insert-excerpt" && excerpt && !pending) {
      const talk = currentTalk();
      await insertExcerpt(talk, excerpt);
      appliedMask = talk.matte?.id;
      dialog.close(); return;
    }
    if (button.dataset.seek) { excerpt = null; reviewing = false; previewTime = Number(button.dataset.seek) - clip.trim; render(); preview(); return; }
    const action = button.dataset.action;
    if (action === "close") dialog.close();
    if (action === "captions") return dispatch([{id:speechCommands.captions, params:{style:draft.captions === "classic" ? "classic" : "highlight"}}], Boolean(draft.speech));
    if (action === "pauses") return dispatch([{id:speechCommands.pauses, params:{}}]);
    if (action === "excerpt") return dispatch([{id:speechCommands.excerpt, params:{}}]);
    if (action === "matte") return dispatch([{id:speechCommands.look, params:{}}], true);
    if (action === "reset-look") {
      for (const key of ["background", "title", "titleY", "exposure", "color"]) draft[key] = TALK_DEFAULTS[key];
      delete draft.image;
      render(); preview();
    }
    if (action === "clear-phrase" || action === "clear-excerpt") {
      if (action === "clear-phrase") settings.phrase = "";
      else settings.excerpt = null;
      render(); preview();
    }
    if (action === "review") { reviewing = !reviewing; previewTime = 0; render(); preview(); }
    if (action === "play") {
      if (playing) { preview(); return; }
      const p = currentPreview(), duration = p.clips.reduce((n,c) => n + c.duration, 0);
      if (previewTime >= duration - .03) previewTime = 0;
      playing = true;
      setTransport(previewTime, duration);
      await player.play(p, previewTime, time => {previewTime = time; setTransport(time, duration);},
        () => {playing = false; setTransport(previewTime, duration);}, error => { playing = false; report(error.message); });
    }
    if (action === "apply" && !pending) {
      if (needsMatte(draft) && !coversClip(draft.matte, clip, .08)) {
        panel = "look";
        await ensure({mask:true});
        preview();
        return;
      }
      if (draft.captions !== "off" && !draft.speech) {
        await dispatch([{id:speechCommands.captions, params:{style:draft.captions}}]);
        return;
      }
      const talk = currentTalk(), plan = planned(talk);
      await apply(talk, plan, settings.ripple);
      appliedMask = talk.matte?.id;
      dialog.close();
    }
  });

  content.oninput = safe(event => {
    const el = event.target;
    if (el.id === "speech-scrub") { previewTime = Number(el.value); preview(); return; }
    if (el.dataset.cue !== undefined) {
      const cue = originalCues()[Number(el.dataset.cue)];
      if (el.value === cue.text) corrected.delete(cue.words[0].index);
      else corrected.set(cue.words[0].index, {cue, text:el.value});
      updateApply();
      preview();
    }
    if (el.dataset.look && el.tagName === "INPUT") {
      draft[el.dataset.look] = el.type === "range" ? el.valueAsNumber : el.value;
      if (el.dataset.look === "exposure") $("#speech-light").textContent = decimal.format(draft.exposure) + " EV";
      updateApply();
      preview();
    }
  });

  content.onchange = safe(async event => {
    const el = event.target;
    if (el.id === "excerpt-end" && excerpt) {
      excerpt.end = Number(el.value); previewTime = 0; render(); preview(); return;
    }
    if (el.dataset.look && el.tagName === "INPUT") return;
    if (el.dataset.look) draft[el.dataset.look] = el.value;
    else if (el.id === "speech-language") settings.language = el.value;
    else if (el.id === "speech-minimum") settings.minimum = bounded(el.valueAsNumber || .8,.25,8);
    else if (el.id === "speech-margin") settings.margin = bounded(el.valueAsNumber || 0,0,1);
    else if (el.id === "speech-filler-text") settings.fillerText = el.value;
    else if (el.id === "speech-ripple") settings.ripple = el.checked;
    else if (el.id === "speech-pauses") {
      settings.pauses = el.checked;
      if (el.checked) return dispatch([{id:speechCommands.pauses, params:{}}]);
    } else if (el.id === "speech-fillers") {
      settings.useFillers = el.checked;
      if (el.checked) return dispatch([{id:speechCommands.fillers, params:{}}]);
    } else if (el.id === "speech-background-file") {
      if (!el.files[0]) return;
      const {src} = await imageLayerFromFile(el.files[0], clip.duration);
      if (!active) return;
      draft.image = {src};
    } else if (el.dataset.manual !== undefined) {
      const cue = originalCues()[Number(el.dataset.manual)], key = cue.words[0].index;
      if (el.checked) settings.manual.set(key, [cue.words[0].start, cue.words.at(-1).end]);
      else settings.manual.delete(key);
    } else if (el.dataset.proposal) {
      if (el.checked) settings.omitted.delete(el.dataset.proposal);
      else settings.omitted.add(el.dataset.proposal);
    }
    render();
    preview();
  });
  dialog.addEventListener("close", () => {
    active = false;
    pending?.abort();
    player.dispose();
    discardMasks([...newMasks].filter(id => id !== appliedMask)).catch(() => {});
    content.onclick = content.oninput = content.onchange = null;
    dialog.classList.remove("speech-dialog");
    trigger?.focus({preventScroll:true});
  }, {once:true});
  render();
  preview();
}
