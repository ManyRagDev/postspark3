import { discardMasks } from "./engine.js";
import { interpretSpeechRequest } from "./speech-commands.js";
import { commandCatalog, inspectProject, prepareBatch } from "./editor-commands.js";
import { loadArtwork } from "./animation-catalog.js";
import { planCompositionEdit } from "./composition-ai.js";
import { compositionCommands } from "./composition-commands.js";
import { planProjectRequest } from "./project-requests.js";
import { CHANNELS, EASINGS } from "./composition-model.js";
import { elementNames } from "./elements.js";
import narration from "./assets/narration.json" with { type: "json" };
import { animationTemplates, templateControls } from "./animation-templates.js";
import { transitionPack } from "./montage-model.js";

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function mediaLibrary(project, attached) {
  const items = new Map([
    ["builtin/coast", { kind: "video", name: "Costa ao sol", assetId: "coast", duration: 6 }],
    ["builtin/tide", { kind: "video", name: "Maré azul", assetId: "tide", duration: 6 }],
    ["builtin/sound", { kind: "audio", name: "Pulso oceânico", assetId: "sound", duration: 12 }],
    ...attached,
  ]);
  const add = (ref, kind, c) =>
    items.set(ref, {
      kind,
      name: c.name,
      assetId: c.assetId,
      duration: c.sourceDuration ?? items.get("builtin/" + c.assetId)?.duration ?? c.duration,
    });
  for (const c of project.clips) if (c.kind === "video") add("clip/" + c.id, "video", c);
  for (const t of project.extraTracks ?? [])
    for (const c of t.clips) add("track/" + t.id + "/" + c.id, t.kind, c);
  if (project.sound.assetId) add("sound", "audio", project.sound);
  for (const c of project.compositions)
    for (const l of c.document?.layers ?? []) {
      if (l.type === "image")
        items.set("image/" + c.id + "/" + l.id, {
          kind: "image",
          name: l.name,
          width: l.width,
          height: l.height,
          src: l.src,
        });
    }
  function get(ref, kind) {
    const item = items.get(ref);
    if (!item || item.kind !== kind) throw Error("Referência de mídia indisponível: " + ref);
    return item;
  }
  return {
    list: () => [...items].map(([ref, { kind, name, duration }]) => ({ ref, kind, name, duration })),
    media: get,
    image: ref => {
      const { src, width, height, name } = get(ref, "image");
      return { src, width, height, name };
    },
  };
}

// Each plan owns its candidate. Review, preview and commit all refer to this exact revision.
export function createEditorSession({ current, revision, commit, context, services }) {
  const attachments = new Map();
  const jobs = new Map();
  function check(expected) {
    if (expected !== revision()) throw Error("O projeto mudou. Prepare a edição novamente.");
  }
  async function prepareAssets(expected, commands) {
    const files = new Set();
    for (const c of commands) {
      if (c.id !== "composition.create" || !c.template) continue;
      for (const file of animationTemplates.find(t => t.id === c.template)?.sources ?? []) {
        if (!c.images?.[file] && !attachments.has("template/" + file)) files.add(file);
      }
    }
    const loaded = await Promise.all([...files].map(async file => [file, await loadArtwork(file)]));
    check(expected);
    for (const [name, { src, image }] of loaded)
      attachments.set("template/" + name, {
        kind: "image",
        src,
        name,
        width: image.width,
        height: image.height,
      });
  }
  function prepare(expected, commands) {
    check(expected);
    const before = current(),
      source = mediaLibrary(before, attachments);
    const usedJobs = new Set();
    source.analysis = (id, clip) => {
      const j = jobs.get(id);
      if (
        j?.state !== "ready" ||
        j.operation !== "speech.analyze" ||
        j.revision !== expected ||
        j.clipId !== clip.id
      )
        throw Error("A análise não pertence a esta revisão e a este clipe.");
      usedJobs.add(j);
      return j.result;
    };
    if (
      !services.operations["export.server"] &&
      commands.some(c => c.id === "transition.set" && transitionPack[c.type]?.overlay)
    )
      throw Error("Este preset de transição exige o laboratório privado.");
    // Draft gestures in Animação only touch one source. Avoid serializing unrelated footage
    // and images on each gesture. The same validator and operations run on that source.
    const compositionOnly =
      commands.length &&
      commands.every(
        c =>
          c.compositionId === commands[0].compositionId &&
          ["layer", "key", "template", "composition"].includes(c.id?.split(".")[0]) &&
          !["composition.insert", "composition.create", "composition.duplicate"].includes(c.id)
      ) &&
      commands[0].compositionId;
    const base = compositionOnly
      ? {
          ...before,
          compositions: before.compositions.filter(c => c.id === compositionOnly),
          clips: before.clips.filter(c => c.compositionId === compositionOnly),
          extraTracks: [],
        }
      : before;
    const edited = prepareBatch(base, commands, source);
    const candidate = compositionOnly
      ? {
          ...before,
          compositions: before.compositions.map(c => (c.id === compositionOnly ? edited.compositions[0] : c)),
        }
      : edited;
    if (same(base, edited)) throw Error("O projeto já corresponde ao pedido.");
    return proposalFor(candidate, compositionOnly);
    function proposalFor(document, scopeId) {
      let used = false;
      return {
        revision: expected,
        inspect: query => inspectProject(document, query),
        preview: (scope, time, signal) => services.frame(document, scope, time, signal),
        async exportCandidate(format, signal, progress) {
          check(expected);
          signal.throwIfAborted();
          if (!["video", "project"].includes(format)) throw Error("Formato desconhecido.");
          const result = await services.operations["export." + format].run({}, document, signal, progress);
          signal.throwIfAborted();
          check(expected);
          return result;
        },
        refine(commands) {
          check(expected);
          // Review only adjusts existing layers, shots and the mix of this exact cut.
          const allowed = [
            "key.set",
            "layer.set",
            "layer.pose",
            "composition.duration",
            "clip.set",
            "sound.set",
          ];
          if (!commands.every(c => allowed.includes(c.id))) throw Error("Correção editorial inválida.");
          return proposalFor(prepareBatch(document, commands, source), null);
        },
        apply() {
          check(expected);
          if (used) throw Error("Edição já aplicada.");
          for (const j of usedJobs)
            if (!jobs.has(j.id)) throw Error("A análise foi descartada. Prepare a edição novamente.");
          commit(document, scopeId);
          for (const job of usedJobs) job.applied = true;
          used = true;
          return revision();
        },
      };
    }
  }
  function release(id) {
    const job = jobs.get(id);
    if (!job) return;
    job.controller.abort();
    if (job.operation === "speech.analyze" && job.result?.matte && !job.applied)
      discardMasks([job.result.matte.id]).catch(console.error);
    jobs.delete(id);
  }
  const serviceCatalog = Object.entries(services.operations).map(([id, s]) => ({
    id,
    manual: s.manual,
    params: s.params,
    kind: s.kind,
  }));
  return {
    catalog: () => [
      ...commandCatalog().map(c => ({ ...c, kind: "edit" })),
      ...structuredClone(serviceCatalog),
    ],
    inspect(query = {}) {
      const p = current();
      return {
        projectId: p.id,
        revision: revision(),
        context: context(),
        ...inspectProject(p, query),
        jobs: [...jobs].map(([id, j]) => ({
          id,
          operation: j.operation,
          state: j.state,
          revision: j.revision,
          clipId: j.clipId,
        })),
        assets: mediaLibrary(p, attachments).list(),
      };
    },
    options: () => ({
      layerTypes: ["text", "image", "square", "circle", "triangle", "wave", ...Object.keys(elementNames)],
      channels: CHANNELS,
      easings: EASINGS,
      narration: structuredClone(narration),
      templates: animationTemplates.map(({ id, name, duration, sources }) => ({
        id,
        name,
        duration,
        sources: sources ? [...sources] : sources,
      })),
      transitions: Object.keys(transitionPack).filter(
        k => !transitionPack[k].overlay || services.operations["export.server"]
      ),
    }),
    controls(compositionId) {
      const doc = current().compositions.find(c => c.id === compositionId)?.document;
      if (!doc) throw Error("Composição ausente.");
      return templateControls(doc).map(({ index, label, type, min, max, step, choices, value }) => ({
        index,
        label,
        type,
        min,
        max,
        step,
        choices: structuredClone(choices),
        value: type === "file" ? undefined : value,
      }));
    },
    prepare,
    async prepareWithAssets(expected, commands) {
      await prepareAssets(expected, commands);
      return prepare(expected, commands);
    },
    async plan(request) {
      const expected = revision();
      const result = planProjectRequest(current(), request, context());
      if (result) return { ...result, proposal: prepare(expected, result.commands) };
      const scope = context(),
        c = current().compositions.find(c => c.id === scope.compositionId);
      if (!c?.document) {
        const clip = current().clips.find(x => x.id === scope.clipId && x.kind === "video");
        if (!clip) return null;
        try {
          interpretSpeechRequest(request);
        } catch {
          return null;
        }
        const analysisJob = [...jobs].find(
          ([, j]) =>
            j.operation === "speech.analyze" &&
            j.clipId === clip.id &&
            j.revision === expected &&
            j.state === "ready"
        )?.[0];
        const commands = [
          { id: "speech.edit", clipId: clip.id, request, ...(analysisJob ? { analysisJob } : {}) },
        ];
        return {
          commands,
          summary: "Editar vídeo falado · " + clip.name,
          proposal: prepare(expected, commands),
        };
      }
      let edit;
      try {
        edit = await planCompositionEdit({
          composition: c.document,
          selectedId: scope.layerId,
          duration: c.duration,
          prompt: request,
        });
      } catch {
        return null;
      }
      const commands = compositionCommands(c.id, c.document, edit.composition);
      return { summary: edit.summary, commands, proposal: prepare(expected, commands) };
    },
    attach(file, kind) {
      const epoch = services.projectEpoch();
      return services.import(file, kind).then(item => {
        if (epoch !== services.projectEpoch()) throw Error("O projeto aberto mudou durante a importação.");
        const ref = crypto.randomUUID();
        attachments.set(ref, { ...item, kind });
        return ref;
      });
    },
    releaseAttachment(ref) {
      attachments.delete(ref);
    },
    reset() {
      attachments.clear();
      for (const id of jobs.keys()) release(id);
    },
    async invoke(id, args, expected) {
      check(expected);
      const op = Object.hasOwn(services.operations, id) && services.operations[id];
      if (!op) throw Error("Ferramenta indisponível.");
      for (const k of Object.keys(args))
        if (k.endsWith("?") || (!Object.hasOwn(op.params, k) && !Object.hasOwn(op.params, k + "?")))
          throw Error("Opção desconhecida: " + k);
      for (const k of Object.keys(op.params))
        if (!k.endsWith("?") && !Object.hasOwn(args, k)) throw Error("Parâmetro obrigatório: " + k);
      const p = current();
      if (op.kind !== "job") return op.run(args, p, () => check(expected));
      const jobId = crypto.randomUUID(),
        controller = new AbortController();
      const job = {
        id: jobId,
        operation: id,
        clipId: args.clipId,
        state: "running",
        revision: expected,
        progress: 0,
        controller,
      };
      jobs.set(jobId, job);
      const snapshot = structuredClone(p);
      Promise.resolve()
        .then(() =>
          op.run(args, snapshot, controller.signal, (progress, message) => {
            Object.assign(job, { progress, message });
          })
        )
        .then(async result => {
          if (controller.signal.aborted && id === "speech.analyze" && result.matte)
            await discardMasks([result.matte.id]);
          controller.signal.throwIfAborted();
          Object.assign(job, { state: "ready", progress: 1, result });
        })
        .catch(e =>
          Object.assign(job, { state: controller.signal.aborted ? "cancelled" : "failed", error: e.message })
        );
      return jobId;
    },
    job(id) {
      const job = jobs.get(id);
      if (!job) throw Error("Trabalho ausente.");
      const { controller, ...status } = job;
      return structuredClone(status);
    },
    release,
  };
}
