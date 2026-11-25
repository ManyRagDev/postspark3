import { MediaEngine, packProject, storeMask, discardMasks } from "./engine.js";
import { drawFrame } from "./renderer.js";
import { durationOf } from "./montage-model.js";
import { sourceClip } from "./project-model.js";
import { analyzeSpeechMedia } from "./speech-ui.js";
import { synthesizeNarration } from "./narration.js";
import { montageSrt } from "./speech-model.js";

export function renderScope(project, compositionId) {
  if (!compositionId) return project;
  const c = project.compositions.find(x => x.id === compositionId);
  if (!c) throw Error("Composição ausente.");
  return {
    name: c.name,
    compositions: [c],
    clips: [sourceClip(c, c.id)],
    sound: { enabled: false, volume: 0 },
  };
}
export async function previewFrame(project, scope, sourceTime, signal) {
  let snapshot = renderScope(project, scope.compositionId),
    time = sourceTime;
  if (scope.clipId) {
    const index = project.clips.findIndex(c => c.id === scope.clipId);
    if (index < 0) throw Error("Clipe ausente.");
    const c = project.clips[index];
    if (sourceTime < c.trim || sourceTime >= c.trim + c.duration) throw Error("Quadro fora do recorte.");
    snapshot = project;
    time = project.clips.slice(0, index).reduce((n, item) => n + item.duration, 0) + sourceTime - c.trim;
  }
  if (!Number.isFinite(time) || time < 0 || time >= durationOf(snapshot))
    throw Error("Quadro fora da duração.");
  signal?.throwIfAborted();
  const canvas = document.createElement("canvas");
  canvas.width = 540;
  canvas.height = 960;
  const engine = new MediaEngine(canvas, drawFrame);
  try {
    await engine.seek(snapshot, time);
    signal?.throwIfAborted();
    return await new Promise((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(Error("Falha ao gerar quadro."))), "image/png")
    );
  } finally {
    engine.dispose();
  }
}
export async function serverExport(project, cursor, signal) {
  if (
    durationOf(project) > 60.000001 ||
    project.clips.length + (project.extraTracks ?? []).reduce((n, t) => n + t.clips.length, 0) > 48
  )
    throw Error("Esta opção aceita vídeos de até 60 segundos e 48 clipes.");
  const body = await packProject(project);
  if (body.size > 128 * 1024 * 1024) throw Error("O projeto ultrapassa o limite de envio de 128 MiB.");
  const response = await fetch("/api/montage", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-Mare-Cursor": String(cursor) },
    signal,
    body,
  });
  if (!response.ok)
    throw Error((await response.json().catch(() => ({}))).message || "Falha ao acessar o processador.");
  return response.json();
}
export function mediaOperations() {
  const job = (manual, params, run) => ({ manual, params, run, kind: "job" });
  const scope = { "compositionId?": "omitir para renderizar a montagem" };
  const services = {
    "preview.frame": job(
      "Inspecionar quadro",
      { ...scope, "clipId?": "ID da ocorrência", time: "segundos na fonte do clipe ou no ambiente" },
      (a, p, signal) => previewFrame(p, a, a.time, signal)
    ),
    "export.project": job("Baixar projeto editável", {}, (_, p) => packProject(p)),
    "export.subtitles": job(
      "Exportar legendas",
      {},
      (_, p) => new Blob([montageSrt(p.clips)], { type: "application/x-subrip" })
    ),
    "export.video": job(
      "Exportar MP4",
      { ...scope, "realtime?": "gravação em tempo real" },
      async (a, p, signal, progress) => {
        const snapshot = renderScope(p, a.compositionId),
          options = { signal, width: 1080, height: 1920, onProgress: progress };
        if (!snapshot.clips.length) throw Error("A montagem está vazia.");
        if (!a.realtime) return (await import("./precise-export.js")).exportPreciseMP4(snapshot, options);
        const canvas = document.createElement("canvas");
        const engine = new MediaEngine(canvas, drawFrame);
        try {
          return await engine.exportMP4(snapshot, options);
        } finally {
          engine.dispose();
        }
      }
    ),
  };
  if (document.querySelector('meta[name="mare-processor"]'))
    services["export.server"] = job(
      "Renderizar no processador",
      { ...scope, "time?": "quadro de prévia em segundos" },
      (a, p, signal) => serverExport(renderScope(p, a.compositionId), a.time ?? 0, signal)
    );
  if (document.querySelector('meta[name="mare-speech"]'))
    services["speech.analyze"] = job(
      "Analisar vídeo falado",
      {
        clipId: "ID do vídeo",
        language: "auto | pt | en | es",
        speech: "transcrever",
        mask: "recortar pessoa",
      },
      (a, p, signal, progress) => {
        const clip = p.clips.find(c => c.id === a.clipId && c.kind === "video");
        if (!clip) throw Error("Escolha um clipe de vídeo.");
        return analyzeSpeechMedia(clip, a, signal, (message, n) => progress(n, message)).then(
          async result => {
            if (!result.mask) return result;
            const { blob, ...metadata } = result.mask;
            const id = await storeMask(blob);
            if (signal.aborted) {
              await discardMasks([id]);
              signal.throwIfAborted();
            }
            return { speech: result.speech, matte: { ...metadata, id }, maskMessage: result.maskMessage };
          }
        );
      }
    );
  if (document.querySelector('meta[name="mare-narration"]'))
    services["narration.generate"] = job(
      "Gerar tomada de narração",
      { text: "roteiro", model: "modelo do catálogo", voice: "voz do catálogo" },
      (a, p, signal) => synthesizeNarration(a, signal)
    );
  return services;
}
