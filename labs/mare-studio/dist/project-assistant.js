import {integrated,cloudFirstCut,cloudReview,editorialHistory,readEditorial} from "./postspark-session.js";
import { editState, requestEdit } from "./edit-api.js";

// Native project-level entry point. The draft belongs to the editor, including when a
// composition is open from the montage. A declined proposal never touches that draft.
export function openProjectAssistant({ session, showDialog, dialog, esc, initialRequest = "", history = [], useLayerScope = false }) {
  const recipes = [
    {id:"text.replaceAndHold",manual:"Substituir texto literal e opcionalmente prolongar sua leitura e o encerramento",params:{before:"texto original exato",after:"texto novo exato","extraSeconds?":"segundos adicionais de leitura"}},
    {id:"cards.centerLast",manual:"Sequenciar as entradas de três cards com o central por último",params:{}}
  ];
  const catalog = session.catalog();
  const selected = session.inspect().context;
  const layerScope = useLayerScope && selected.layerId &&
    session.inspect({compositionId:selected.compositionId,layerId:selected.layerId}).layers[0];
  showDialog(
    "Assistente do projeto",
    (layerScope ? '<label class="field">Editar<select id="assistant-scope"><option value="layer">' + esc(layerScope.name) +
      '</option><option value="project">Projeto inteiro</option></select></label>' : '') +
    '<label class="field">O que deseja editar?<textarea maxlength="4000" id="project-request" class="text-input" rows="3" placeholder="Descreva a mudança no vídeo"></textarea></label>' +
      (document.querySelector('meta[name="mare-director"]')
        ? '<details><summary>Criar vídeo a partir do briefing</summary><label class="field">Materiais <input id="director-files" type="file" multiple accept="image/*,video/*,audio/*"></label>' +
          '<label>Duração em segundos <input id="director-seconds" type="number" min="1" max="60" value="26"></label>' +
          '<label class="field">Chamada final obrigatória (opcional)<input id="director-cta" maxlength="256"></label>' +
          "<p>O OpenRouter recebe o briefing, miniaturas e três quadros de cada vídeo. A duração e o nome da trilha entram no inventário.</p>" +
          '<button class="btn" id="director-create">Criar com duas chamadas</button></details>'
        : "") +
      '<details><summary>Comandos e estado do projeto</summary><select id="assistant-operation" aria-label="Comando"></select>' +
      '<pre id="assistant-options"></pre><label id="assistant-file-label" hidden>Arquivo <input type="file" id="assistant-file"></label><button class="btn" id="assistant-inspect">Consultar projeto</button><pre id="assistant-state"></pre></details>' +

      '<details id="assistant-history"><summary>Histórico de pedidos</summary><div></div></details>' +
      '<div role="status" aria-live="polite" id="assistant-report"></div><img id="assistant-frame" hidden alt="Quadro da edição proposta">' +
      '<div id="assistant-detail"></div>',
    '<button class="btn" id="assistant-plan">Preparar edição</button><button class="btn primary" id="assistant-apply" disabled>Aplicar edição</button>'
  );
  const get = id => dialog.querySelector("#" + id);
  const prompt = get("project-request"),
    report = get("assistant-report"),
    apply = get("assistant-apply");
  const frame = get("assistant-frame"),
    select = get("assistant-operation"),
    detail = get("assistant-detail");
  const controller = new AbortController();
  let editorialController;
  const downloads = [];
  let plan,
    generation = 0,
    objectURL,
    activeJob;
  const historyBox = get("assistant-history");
  function showHistory() {
    historyBox.hidden = !history.length;
    const container = historyBox.querySelector("div");
    container.replaceChildren();
    for (const entry of history.slice(-10).reverse()) {
      const p = document.createElement("p");
      p.textContent = entry.request + " — " + entry.result;
      container.append(p);
    }
  }
  function record(request,result) {
    history.push({request,result});
    if (history.length > 30) history.shift();
    showHistory();
  }
  showHistory();
  let editController;
  function clear() {
    generation++;
    editController?.abort();
    editorialController?.abort();
    editorialController = null;
    for (const url of downloads.splice(0)) URL.revokeObjectURL(url);
    if (activeJob) {
      const summary = session.inspect().jobs.find(j => j.id === activeJob);
      if (summary && !(summary.state === "ready" && summary.operation === "speech.analyze"))
        session.release(activeJob);
    }
    activeJob = null;
    plan = null;
    apply.disabled = true;
    frame.hidden = true;
    frame.removeAttribute("src");
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = null;
    detail.replaceChildren();
  }
  function showParams() {
    const { params } = catalog[select.selectedIndex];
    get("assistant-file-label").hidden = !Object.hasOwn(params, "file");
    get("assistant-file").accept =
      select.value === "project.open"
        ? ".mare"
        : select.value === "project.fromVideo"
          ? "video/*"
          : "image/*,audio/*,video/*";
    get("assistant-options").textContent = Object.entries(params)
      .map(([name, desc]) => name + " · " + desc)
      .join("\n");
    get("assistant-options").textContent +=
      "\n" +
      JSON.stringify({
        id: select.value,
        ...Object.fromEntries(
          Object.keys(params)
            .filter(k => !k.endsWith("?"))
            .map(k => [k, "…"])
        ),
      });
  }
  select.innerHTML = catalog
    .map(c => '<option value="' + esc(c.id) + '">' + esc(c.manual) + "</option>")
    .join("");
  select.onchange = showParams;
  showParams();
  get("assistant-inspect").onclick = () => {
    get("assistant-state").textContent = JSON.stringify(session.inspect(), null, 2);
  };
  prompt.oninput = () => {
    clear();
    report.textContent = "";
  };
  if (get("assistant-scope")) get("assistant-scope").onchange = prompt.oninput;
  async function structured(commands, state) {
    const specs = commands.map(c => catalog.find(x => x.id === c.id));
    if (specs.some(x => !x)) throw Error("Comando desconhecido. Consulte o catálogo.");
    if (specs.every(x => x.kind === "edit")) {
      return {
        commands,
        summary: specs.map(c => c.manual).join(" · "),
        proposal: await session.prepareWithAssets(state.revision, commands),
      };
    }
    if (commands.length !== 1)
      throw Error("Execute a operação de sessão ou de mídia separadamente do lote de edição.");
    const [{ id, ...params }] = commands;
    if (Object.hasOwn(specs[0].params, "file")) {
      const file = get("assistant-file").files[0];
      if (!file) throw Error("Escolha o arquivo no catálogo de comandos.");
      params.file = file;
    }
    return {
      commands,
      summary: specs[0].manual,
      proposal: { apply: () => session.invoke(id, params, state.revision) },
      kind: specs[0].kind,
    };
  }
  async function prepare() {
    clear();
    const run = generation;
    try {
      const text = prompt.value.trim();
      if (!text) throw Error("Escreva o pedido.");
      const state = session.inspect();
      let next;
      if (text.startsWith("[") || text.startsWith("{")) {
        const data = JSON.parse(text);
        next = await structured(Array.isArray(data) ? data : [data], state);
      } else {
        editController = new AbortController();
        report.textContent = "Preparando edição com IA…";
        const onlyLayer = get("assistant-scope")?.value === "layer";
        const allowed = onlyLayer
          ? catalog.filter(c => c.kind === "edit" && Object.hasOwn(c.params,"layerId") && c.id !== "layer.add")
          : [...recipes, ...catalog.filter(c => !Object.hasOwn(c.params,"file") &&
              !["speech.edit","speech.apply","composition.apply"].includes(c.id))];
        const context = editState(session,state);
        if (onlyLayer) context.scope = {compositionId:selected.compositionId,layerId:selected.layerId};
        const answer = await requestEdit(text, context, allowed, session.options(), editController.signal);
        if (generation !== run) return;
        if (onlyLayer && answer.commands.some(c => c.layerId !== selected.layerId || c.compositionId !== selected.compositionId))
          throw Error("A proposta alteraria outra camada. Escolha Projeto inteiro para editar várias camadas.");
        if (answer.commands.some(c => recipes.some(r => r.id === c.id))) {
          if (answer.commands.length !== 1) throw Error("A ação composta precisa ser preparada sozinha.");
          next = session.prepareRecipe(state.revision,answer.commands[0]);
        } else next = await structured(answer.commands, state);
        next.summary = answer.summary || next.summary;
        const target = answer.commands.find(c => c.compositionId)?.compositionId;
        if (target && !next.kind && !next.preview) {
          const source = next.proposal.inspect({compositionId:target});
          next.preview = {compositionId:target, time:Math.min(state.context.time || 0, Math.max(0,source.duration - 1/30))};
        }
      }
      if (generation !== run || controller.signal.aborted) return;
      report.textContent = next.summary;
      if (next.preview) {
        const pic = await next.proposal.preview(
          next.preview.clipId
            ? { clipId: next.preview.clipId }
            : { compositionId: next.preview.compositionId },
          next.preview.time,
          controller.signal
        );
        if (generation !== run || controller.signal.aborted) return;
        objectURL = URL.createObjectURL(pic);
        frame.src = objectURL;
        frame.hidden = false;
      }
      if (generation !== run || controller.signal.aborted) return;
      const details = document.createElement("details"),
        summary = document.createElement("summary"),
        data = document.createElement("pre");
      summary.textContent = next.kind
        ? "Parâmetros da operação"
        : next.commands.length + " comando(s) · um passo de desfazer";
      data.textContent = JSON.stringify(next.commands, null, 2);
      details.append(summary, data);
      detail.append(details);
      plan = next;
      if (!text.startsWith("[") && !text.startsWith("{")) record(text, "Proposta · " + next.summary);
      apply.disabled = false;
      apply.focus();
    } catch (error) {
      if (run === generation && !controller.signal.aborted) {
        report.textContent = error.message;
        if (prompt.value.trim()) record(prompt.value.trim(),error.message);
      }
    }
  }
  if (get("director-create")) {
    if(integrated){
      const historySelect=document.createElement("select");
      historySelect.ariaLabel="Reabrir entrega editorial";
      historySelect.add(new Option("Reabrir entrega editorial",""));
      historySelect.hidden=true;
      get("director-create").after(historySelect);
      editorialHistory(controller.signal).then(({jobs})=>{
        for(const job of jobs){
          const option=new Option((job.operation==="review"?"Revisão":"Primeiro corte")+" · "+new Date(job.createdAt).toLocaleString("pt-BR")+(job.status==="ready"?"":" · processando"),job.id);
          option.dataset.project=job.projectId;
          option.disabled=job.status!=="ready";
          historySelect.add(option);
        }
        historySelect.hidden=!jobs.length;
      }).catch(()=>{});
      historySelect.onchange=async()=>{
        const option=historySelect.selectedOptions[0];
        if(!option?.value)return;
        clear();
        const rev=session.inspect().revision,run=generation;
        const active=new AbortController();editorialController=active;
        try {
          const recovered=await readEditorial(option.value,session,rev,active.signal);
          if(run!==generation)return;
          const video=document.createElement("video");
          video.controls=true;
          video.style.cssText="display:block;max-height:36vh;max-width:100%";
          video.src=URL.createObjectURL(recovered.movie);
          downloads.push(video.src);detail.append(video);
          report.textContent=recovered.review?.assessment||recovered.script?.title||"Entrega editorial recuperada";
          plan={proposal:recovered.proposal};apply.disabled=false;
          if(recovered.script){
            const button=document.createElement("button");button.className="btn";button.textContent="Revisar este primeiro corte";detail.append(button);
            button.onclick=async()=>{
              button.disabled=true;apply.disabled=true;
              try{
                const updated=await cloudReview(session,recovered.jobId,rev,active.signal,option.dataset.project);
                if(run!==generation)return;
                report.textContent=updated.review.assessment;
                video.src=URL.createObjectURL(updated.movie);downloads.push(video.src);plan={proposal:updated.proposal};
              }catch(error){report.textContent=error.message;button.disabled=false;}
              finally{if(run===generation)apply.disabled=false;}
            };
          }
        }catch(error){if(run===generation)report.textContent=error.message;}
      };
    }
    for (const id of ["director-files", "director-seconds", "director-cta"])
      get(id).oninput = () => {
        clear();
        report.textContent = "";
      };
    get("director-create").onclick = async () => {
      clear();
      const run = generation;
      const active = new AbortController();
      editorialController = active;
      const button = get("director-create");
      button.disabled = true;
      const measurements = document.createElement("pre");
      const metrics = document.createElement("details"),
        metricsTitle = document.createElement("summary");
      measurements.id = "editorial-measurements";
      metricsTitle.textContent = "Tempos e custos por etapa";
      metrics.append(metricsTitle, measurements);
      detail.append(metrics);
      function progress(message, trace) {
        if (generation !== run) return;
        report.textContent = message;
        measurements.textContent = JSON.stringify(trace, null, 2);
      }
      try {
        const { createEditorialCut } = await import("./editorial-run.js");
        const result = await (integrated?cloudFirstCut:createEditorialCut)({
          session,
          signal: active.signal,
          brief: prompt.value,
          seconds: get("director-seconds").valueAsNumber,
          cta: get("director-cta").value.trim(),
          files: Array.from(get("director-files").files),
          report: progress,
        });
        if (generation !== run) return;
        progress(result.script.title + " · Confira a montagem antes de aplicar.", result.trace);
        const modelSteps = result.trace.steps.filter(step => step.kind === "modelo");
        const costs = modelSteps.map(step => step.usage?.cost);
        const cost = costs.every(Number.isFinite)
          ? new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 5,
            }).format(costs.reduce((a, b) => a + b, 0))
          : "custo indisponível";
        metricsTitle.textContent =
          modelSteps.length +
          " chamadas · " +
          result.trace.commands +
          " comandos · " +
          cost +
          " · " +
          (result.trace.totalMs / 1000).toFixed(1) +
          " s";
        const video = document.createElement("video");
        video.controls = true;
        video.style.cssText = "display:block;max-height:42vh;max-width:100%";
        function showCut(cut, suffix) {
          for (const [file, label, ext] of [
            [cut.movie, "Baixar MP4", "mp4"],
            [cut.portable, "Baixar projeto", "mare"],
          ]) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(file);
            downloads.push(a.href);
            if (ext === "mp4") video.src = a.href;
            a.textContent = label + suffix;
            a.className = "btn";
            a.download = result.script.title + suffix + "." + ext;
            detail.prepend(a);
          }
        }
        showCut(result, "");
        const script = document.createElement("details"),
          heading = document.createElement("summary"),
          copy = document.createElement("pre");
        copy.id = "editorial-script";
        heading.textContent = "Roteiro e materiais escolhidos";
        copy.textContent = JSON.stringify(result.script, null, 2);
        script.append(heading, copy);
        detail.prepend(video, script);
        const reviewButton = document.createElement("button");
        reviewButton.className = "btn";
        reviewButton.textContent = "Enviar prévia com áudio ao OpenRouter para revisão · 1 chamada";
        detail.append(reviewButton);
        reviewButton.onclick = async () => {
          reviewButton.disabled = true;
          apply.disabled = true;
          report.textContent = "Revisando a prévia renderizada…";
          try {
            const { reviewEditorialCut } = await import("./editorial-review.js");
            const review = integrated ? await cloudReview(session,result.jobId,result.proposal.revision,active.signal) : await reviewEditorialCut({
              target: result.proposal,
              brief: prompt.value,
              cta: get("director-cta").value.trim(),
              movie: result.movie,
              signal: active.signal,
              check: () => {
                if (session.inspect().revision !== result.proposal.revision) throw Error("O projeto mudou.");
              },
            });
            if (run !== generation) return;
            if (review.changed) {
              showCut(review, " revisado");
              plan = { proposal: review.proposal };
            }
            report.textContent =
              review.review.assessment + (review.changed ? " · Prévia revisada." : " · Corte mantido.");
            const info = document.createElement("details"),
              label = document.createElement("summary"),
              data = document.createElement("pre");
            label.textContent = "Revisão audiovisual · " + (review.trace.totalMs / 1000).toFixed(1) + " s";
            data.textContent = JSON.stringify({ parecer: review.review, medidas: review.trace }, null, 2);
            info.append(label, data);
            detail.append(info);
          } catch (error) {
            if (run === generation) report.textContent = error.message;
          } finally {
            if (run === generation) apply.disabled = false;
          }
        };
        plan = { proposal: result.proposal };
        apply.disabled = false;
      } catch (e) {
        if (generation === run) report.textContent = e.message;
      } finally {
        button.disabled = false;
      }
    };
  }
  get("assistant-plan").onclick = () => prepare();
  apply.onclick = async () => {
    if (!plan) return;
    const current = plan,
      run = generation;
    apply.disabled = true;
    plan = null;
    try {
      const result = await current.proposal.apply();
      if (current.kind !== "job") {
        if (
          result !== undefined &&
          current.kind === "session" &&
          (current.commands[0].id.startsWith("asset.") || current.commands[0].id.startsWith("query."))
        ) {
          report.textContent =
            typeof result === "string" ? "Mídia disponível · " + result : JSON.stringify(result, null, 2);
        } else dialog.close();
        return;
      }
      activeJob = result;
      while (generation === run && !controller.signal.aborted) {
        const status = session.job(result);
        if (status.state === "failed" || status.state === "cancelled")
          throw Error(status.error || "Trabalho cancelado.");
        if (status.state === "ready") {
          report.textContent = "Pronto · revisão " + status.revision + " · " + result;
          const output = status.result;
          if (output instanceof Blob) {
            objectURL = URL.createObjectURL(output);
            const link = document.createElement("a");
            const ext =
              {
                "export.project": "mare",
                "export.subtitles": "srt",
                "preview.frame": "png",
                "narration.generate": "mp3",
              }[current.commands[0].id] ?? "mp4";
            link.href = objectURL;
            link.textContent = "Baixar resultado";
            link.download = "Projeto." + ext;
            link.className = "btn";
            detail.append(link);
            if (ext === "png") {
              frame.src = objectURL;
              frame.hidden = false;
            }
            if (current.commands[0].id === "narration.generate") {
              const ref = await session.attach(output, "audio");
              report.textContent += " · referência para inserir a narração: " + ref;
            }
          } else if (output?.base) {
            for (const [file, label] of [
              ["final.mp4", "Baixar MP4"],
              ["projects.zip", "Baixar pacote editável"],
              ["preview.png", "Ver quadro"],
            ]) {
              const link = document.createElement("a");
              link.href = output.base + file;
              link.textContent = label;
              detail.append(link);
            }
          } else {
            const out = document.createElement("pre");
            out.textContent = JSON.stringify(output, null, 2);
            detail.append(out);
          }
          break;
        }
        report.textContent = status.message || "Processando · " + Math.round(status.progress * 100) + "%";
        await new Promise(done => setTimeout(done, 150));
      }
    } catch (e) {
      if (generation === run) {
        clear();
        report.textContent = e.message;
      }
    }
  };
  dialog.addEventListener(
    "close",
    () => {
      controller.abort();
      clear();
    },
    { once: true }
  );
  prompt.value = initialRequest;
  prompt.focus();
  if (initialRequest) prepare();
}
