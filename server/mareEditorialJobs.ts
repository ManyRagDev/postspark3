import { resolve, sep, join } from "node:path";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { chromium } from "playwright-core";
import { z } from "zod";
import { getSupabase } from "./billing";
import { resolveReviewBrowser } from "./ai/workflows/proposalRenderer";

export const firstCut = z
  .object({
    projectId: z.string().uuid(),
    brief: z.string().trim().min(1).max(8000),
    cta: z.string().max(256),
    seconds: z.number().min(1).max(60),
    materials: z
      .array(
        z.object({ id: z.string().uuid(), name: z.string().min(1).max(240) })
      )
      .max(16),
  })
  .strict();
export const review = z
  .object({ projectId: z.string().uuid(), firstCutId: z.string().uuid() })
  .strict();
type Operation = "firstCut" | "review";
type Job = {
  id: string;
  actor: string;
  workspace_id: string | null;
  operation: Operation;
  payload: Record<string, unknown>;
};
const bucket = "postspark-mare";
const privateKey = (actor: string, id: string, file: string) =>
  `jobs/${actor}/${id}/${file}`;
export async function editorialInputs(
  operation: Operation,
  payload: Record<string, unknown>,
  actor: string,
  workspace: string | null
) {
  const db = getSupabase();
  const inputs = new Map<string, string>();
  if (operation === "review") {
    const request = review.parse(payload);
    const previous = await db
      .from("mare_jobs")
      .select("payload,workspace_id")
      .eq("actor", actor)
      .eq("id", request.firstCutId)
      .eq("operation", "firstCut")
      .eq("status", "ready")
      .maybeSingle();
    if (previous.error) throw previous.error;
    if (
      !previous.data ||
      previous.data.workspace_id !== workspace ||
      previous.data.payload.projectId !== request.projectId
    )
      return null;
    for (const file of ["movie", "project"])
      inputs.set(file, privateKey(actor, request.firstCutId, file));
    const { brief, cta } = firstCut.parse(previous.data.payload);
    return { inputs, input: { operation, brief, cta } };
  }
  const request = firstCut.parse(payload),
    ids = Array.from(new Set(request.materials.map(m => m.id)));
  if (ids.length) {
    const rows = await db
      .from("mare_assets")
      .select("id,kind,actor,workspace_id,object_key,playback_key,size_bytes")
      .in("id", ids);
    if (rows.error) throw rows.error;
    if (
      rows.data.length !== ids.length ||
      rows.data.some(
        a =>
          a.workspace_id !== workspace ||
          (!workspace && a.actor !== actor) ||
          !["image", "audio", "video"].includes(a.kind)
      )
    )
      return null;
    const assets = new Map(rows.data.map(a => [a.id, a]));
    if (
      request.materials.reduce(
        (sum, m) => sum + Number(assets.get(m.id)!.size_bytes),
        0
      ) >
      128 * 1024 * 1024
    )
      return null;
    request.materials.forEach((m, index) => {
      const a = assets.get(m.id)!;
      inputs.set(String(index), a.playback_key || a.object_key);
    });
  }
  return { inputs, input: { operation, ...request } };
}
async function modelStep(
  job: Job,
  stage: string,
  body: Buffer,
  contentType: string
) {
  const db = getSupabase(),
    table = "mare_editorial_steps";
  const stored = await db
    .from(table)
    .select("response")
    .eq("job_id", job.id)
    .eq("stage", stage)
    .maybeSingle();
  if (stored.error) throw stored.error;
  if (stored.data?.response) return stored.data.response;
  if (stored.data) throw Error("Uma chamada ao provedor aguarda conciliação.");
  const marker = await db.from(table).insert({ job_id: job.id, stage });
  if (marker.error) throw marker.error;
  const origin = new URL(
    process.env.MARE_PROCESSOR_ORIGIN || "http://127.0.0.1:18745"
  ).origin;
  const result = await fetch(
    origin + (stage === "review" ? "/api/director/review" : "/api/director"),
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": contentType },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(160000),
      redirect: "error",
    }
  );
  if (!result.ok) throw Error("O provedor não concluiu a etapa editorial.");
  const output = await result.json();
  const saved = await db
    .from(table)
    .update({ response: output })
    .eq("job_id", job.id)
    .eq("stage", stage);
  if (saved.error) throw saved.error;
  return output;
}
async function encodeWorkerMp4(bytes: Buffer) {
  const directory = await mkdtemp(join(tmpdir(), "mare-encode-"));
  const input = join(directory, "frames.webm");
  const output = join(directory, "delivery.mp4");
  try {
    await writeFile(input, bytes);
    await promisify(execFile)(process.env.MARE_FFMPEG || "ffmpeg", [
      "-nostdin", "-loglevel", "error", "-threads", "2", "-f", "webm", "-i", input,
      "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1",
      "-vf", "scale=out_range=tv,format=yuv420p", "-filter_threads", "2",
      "-c:v", "libx264", "-threads", "2", "-profile:v", "baseline", "-level:v", "4.0",
      "-preset", "veryfast", "-crf", "18", "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", output,
    ], { timeout: 120000 });
    if ((await stat(output)).size > 128 * 1024 * 1024) throw Error("MP4 fora do limite.");
    return await readFile(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function renderEditorial(
  input: Record<string, unknown>,
  read: (key: string) => Promise<Blob>,
  write: (name: string, bytes: Buffer) => Promise<void>,
  infer: (stage: string, body: Buffer, type: string) => Promise<unknown>,
  progress?: (percent: number) => Promise<void>
) {
  const root = resolve("labs/mare-studio/dist");
  const browser = await chromium.launch({
    executablePath: await resolveReviewBrowser(),
    headless: true,
  });
  const timer = setTimeout(
    () => {
      void browser.close();
    },
    8 * 60 * 1000
  );
  try {
    const page = await browser.newPage({ serviceWorkers: "block" });
    await page.route("**/*", async route => {
      const req = route.request(),
        url = new URL(req.url()),
        p = url.pathname;
      try {
        if (url.origin !== "http://localhost") return await route.abort();
        if (p === "/encode-mp4" && req.method() === "POST") {
          const bytes = req.postDataBuffer();
          if (!bytes?.length || bytes.length > 128 * 1024 * 1024)
            throw Error("Vídeo intermediário fora do limite.");
          return await route.fulfill({ contentType: "video/mp4", body: await encodeWorkerMp4(bytes) });
        }
        if (
          input.operation === "packageRender" &&
          req.method() === "POST" &&
          p === "/progress"
        ) {
          const percent = Number(req.postData());
          if (!Number.isInteger(percent) || percent < 0 || percent > 99)
            return await route.abort();
          await progress?.(percent);
          return await route.fulfill({ status: 200, body: "ok" });
        }
        if (
          req.method() === "GET" &&
          /^\/input\/(?:\d+|project|movie)$/.test(p)
        ) {
          const file = await read(p.slice(7));
          return await route.fulfill({
            contentType: file.type,
            body: Buffer.from(await file.arrayBuffer()),
          });
        }
        if (req.method() === "PUT" && /^\/delivery\/(project|movie)$/.test(p)) {
          const bytes = req.postDataBuffer();
          if (!bytes?.length || bytes.length > 128 * 1024 * 1024)
            throw Error("Entrega fora do limite.");
          await write(p.slice(10), bytes);
          return await route.fulfill({ status: 200, body: "ok" });
        }
        if (
          input.operation !== "packageRender" &&
          req.method() === "POST" &&
          (p === "/api/director" || p === "/api/director/review")
        ) {
          const body = req.postDataBuffer();
          if (!body) throw Error("Pedido sem conteúdo.");
          const stage = p.endsWith("/review")
            ? "review"
            : JSON.parse(body.toString()).stage;
          if (
            !(input.operation === "review"
              ? stage === "review"
              : ["script", "direction"].includes(stage))
          )
            throw Error("Etapa inválida.");
          return await route.fulfill({
            json: await infer(stage, body, req.headers()["content-type"]),
          });
        }
        if (req.method() === "GET" && /^\/fonts\/[a-z-]+\.ttf$/.test(p))
          return await route.fulfill({
            path: resolve("shared/typography/fonts/files", p.slice(7)),
          });
        if (
          req.method() === "GET" &&
          /^\/transition-media\/[\w./-]+$/.test(p)
        ) {
          const base = resolve("labs/mare-studio/processor/transition-media"),
            file = resolve(base, p.slice(18));
          if (file.startsWith(base + sep))
            return await route.fulfill({ path: file });
        }
        const file = resolve(
          root,
          "." + decodeURIComponent(p === "/" ? "/index.html" : p)
        );
        if (req.method() === "GET" && file.startsWith(root + sep))
          return await route.fulfill({ path: file });
        await route.abort();
      } catch {
        await route
          .fulfill({ status: 503, body: "Recurso editorial indisponível" })
          .catch(() => {});
      }
    });
    await page.goto("http://localhost/");
    await page.evaluate(
      "import('/editorial-worker.js').then(m => {window.runMareEditorial=m.runEditorial})"
    );
    return await page.evaluate(
      args =>
        (
          window as unknown as {
            runMareEditorial: (input: unknown) => Promise<any>;
          }
        ).runMareEditorial(args),
      input
    );
  } finally {
    clearTimeout(timer);
    await browser.close();
  }
}
export async function executeEditorial(job: Job) {
  const source = await editorialInputs(
    job.operation,
    job.payload,
    job.actor,
    job.workspace_id
  );
  if (!source) throw Error("Fontes do trabalho indisponíveis.");
  const storage = getSupabase().storage.from(bucket);
  const manifest = await renderEditorial(
    source.input,
    async name => {
      const key = source.inputs.get(name);
      if (!key) throw Error("Fonte inválida.");
      const result = await storage.download(key);
      if (result.error) throw result.error;
      return result.data;
    },
    async (name, bytes) => {
      const up = await storage.upload(
        privateKey(job.actor, job.id, name),
        bytes,
        {
          upsert: true,
          contentType:
            name === "movie" ? "video/mp4" : "application/octet-stream",
        }
      );
      if (up.error) throw up.error;
    },
    (stage, body, type) => modelStep(job, stage, body, type)
  );
  const final = await storage.upload(
    privateKey(job.actor, job.id, "result"),
    Buffer.from(JSON.stringify({ ...manifest, jobId: job.id })),
    { upsert: true, contentType: "application/json" }
  );
  if (final.error) throw final.error;
  return manifest.trace;
}
