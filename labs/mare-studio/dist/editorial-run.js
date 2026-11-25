import { collectMaterials } from "./editorial-materials.js";
import { compileDirection, restoreLiteralCta, validateScript } from "./editorial-plan.js";
import { FPS } from "./montage-model.js";

async function callDirector(payload, signal) {
  const response = await fetch("/api/director", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(result.message || "Processador editorial indisponível.");
  return result;
}

export async function createEditorialCut({
  session,
  brief,
  seconds,
  cta = "",
  files,
  signal,
  report = () => {},
  infer = callDirector,
}) {
  const state = session.inspect(),
    start = performance.now();
  if (state.clips.length || state.compositions.length || state.tracks.length || state.sound.assetId)
    throw Error("Comece em um projeto vazio para criar a peça.");
  if (
    typeof brief !== "string" ||
    !brief.trim() ||
    brief.length > 8000 ||
    cta.length > 256 ||
    !Number.isFinite(seconds) ||
    seconds < 1 ||
    seconds > 60
  )
    throw Error("Informe o briefing e uma duração de 1 a 60 segundos.");
  if (!globalThis.VideoEncoder)
    throw Error("Abra o Maré em um navegador com codificação de vídeo para gerar a prévia.");
  const trace = {
    steps: [],
    commands: 0,
    adjustments: [],
    preparedMs: null,
    firstCutMs: null,
    totalMs: null,
  };
  function check() {
    signal.throwIfAborted();
    if (session.inspect().revision !== state.revision) throw Error("O projeto mudou durante a criação.");
  }
  async function step(kind, name, work) {
    check();
    const entry = { kind, name, ms: null, status: "em andamento" };
    const time = performance.now();
    trace.steps.push(entry);
    report(name, trace);
    try {
      const value = await work(entry);
      check();
      entry.status = "concluído";
      return value;
    } catch (e) {
      entry.status = "falhou";
      throw e;
    } finally {
      entry.ms = Math.round(performance.now() - time);
      trace.totalMs = Math.round(performance.now() - start);
    }
  }
  async function ask(stage, label, context, previews) {
    return step("modelo", label, async entry => {
      const { output, model, usage } = await infer({ stage, context, previews }, signal);
      Object.assign(entry, { model, usage });
      return output;
    });
  }
  const imported = new Map();
  try {
    const materials = await step("mídia", "Ler materiais", () => collectMaterials(files, signal, check));
    const context = {
      brief,
      cta,
      targetFrames: Math.round(seconds * FPS),
      fps: FPS,
      assets: materials.assets,
    };
    const written = await ask("script", "Roteiro", context, materials.previews);
    const script = restoreLiteralCta(written, cta);
    if (script !== written)
      trace.adjustments.push({ reason: "Pontuação final alinhada ao CTA literal do briefing." });
    validateScript(script, context);
    const direction = await ask("direction", "Direção", { ...context, script }, []);
    const commands = compileDirection(script, direction, context, trace.adjustments);
    await step("mídia", "Importar fontes escolhidas", async () => {
      for (const cmd of commands) {
        const field = cmd.image ? "image" : cmd.asset ? "asset" : null;
        if (!field) continue;
        const id = cmd[field];
        if (!imported.has(id)) {
          check();
          const file = materials.originals.get(id);
          imported.set(id, await session.attach(file, file.type.split("/")[0]));
        }
        cmd[field] = imported.get(id);
      }
    });
    const proposal = await step("editor", "Preparar montagem", () => {
      trace.commands = commands.length;
      return session.prepare(state.revision, commands);
    });
    trace.preparedMs = Math.round(performance.now() - start);
    const movie = await step("mídia", "Renderizar prévia com áudio", () =>
      proposal.exportCandidate("video", signal, value =>
        report("Renderizar prévia · " + Math.round(value * 100) + "%", trace)
      )
    );
    trace.firstCutMs = Math.round(performance.now() - start);
    const portable = await step("mídia", "Empacotar projeto", () =>
      proposal.exportCandidate("project", signal)
    );
    check();
    return { script, proposal, movie, portable, trace };
  } catch (error) {
    report(error.message, trace);
    throw error;
  } finally {
    for (const ref of imported.values()) session.releaseAttachment(ref);
  }
}
