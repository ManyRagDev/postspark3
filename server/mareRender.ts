import { chromium } from "playwright-core";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, extname } from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import type { CanvasPostModel } from "../client/src/pages/CanvasLab/components/types";
import { temporalInterval } from "../shared/canvasTemporalMedia";
import { activeTemporalSlots } from "../client/src/pages/CanvasLab/lib/activeTemporalSlots";
import { loadComponentFontBytes } from "./ai/componentTextMeasurer";
import { authorizeArsenalSaveModel } from "./designCatalog/arsenalSave";
import { activeArsenalMedia } from "../shared/designArsenal";
import { createHash } from "node:crypto";
import { resolveReviewBrowser } from "./ai/workflows/proposalRenderer";

export interface VideoInput {
  bytes: Buffer;
  mime: string;
  duration: number;
}
const run = promisify(execFile);
async function resolveSlideAssets(
  post: CanvasPostModel,
  actor: string | undefined,
  signal: AbortSignal
) {
  const slide = post.slides[post.currentSlideIndex];
  const composition = slide.composition;
  if (!composition) return [];
  if (!actor)
    throw Error("O render do Arsenal precisa de um usuário autenticado.");
  await authorizeArsenalSaveModel({ ...post, slides: [slide] }, actor);
  const required = new Set<string>();
  for (const element of composition.elements) {
    if (element.fontAssetId) required.add(element.fontAssetId);
    if (element.imageAssetId && !activeArsenalMedia(composition, element))
      required.add(element.imageAssetId);
  }
  return Promise.all(
    Array.from(required, async id => {
      const asset = composition.assets.find(item => item.id === id);
      if (!asset) throw Error("Recurso ausente no manifesto do Arsenal.");
      const bytes = await loadComponentFontBytes(asset, signal);
      if (
        bytes.length !== asset.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== asset.sha256
      )
        throw Error("Recurso do Arsenal divergente do manifesto.");
      return { asset, base64: bytes.toString("base64") };
    })
  );
}

export async function renderMareSlide(
  post: CanvasPostModel,
  sources: Map<string, VideoInput>,
  readImage: (url: string) => Promise<Buffer>,
  actor?: string,
  reportProgress?: (percent: number) => Promise<void>
) {
  const slide = post.slides[post.currentSlideIndex];
  const slots = activeTemporalSlots(post, post.currentSlideIndex);
  const layers = slots.map(slot => slide.temporalMedia![slot]);
  const duration = Math.max(
    ...layers.map(
      layer =>
        temporalInterval(layer, sources.get(layer.assetId)?.duration ?? 0).end
    )
  );
  if (!Number.isFinite(duration) || duration <= 0 || duration > 60.001)
    throw Error("O slide deve ter até 60 segundos.");
  const directory = await mkdtemp(join(tmpdir(), "mare-render-"));
  const browser = await chromium
    .launch({ executablePath: await resolveReviewBrowser(), headless: true })
    .catch(async error => {
      await rm(directory, { recursive: true, force: true });
      throw error;
    });
  let ffmpeg: ReturnType<typeof spawn> | undefined;
  const deadline = AbortSignal.timeout(8 * 60 * 1000);
  deadline.addEventListener(
    "abort",
    () => {
      ffmpeg?.kill();
      void browser.close();
    },
    { once: true }
  );
  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 1100 },
      serviceWorkers: "block",
    });
    let pageError = "";
    page.on("pageerror", error => {
      pageError = error.message;
    });
    const bundle = await readFile(resolve("dist/review-renderer/video.js"));
    const origin = "http://localhost";
    await page.route("**/*", async route => {
      const url = new URL(route.request().url()),
        path = url.pathname;
      try {
        if (url.origin !== origin) return await route.abort();
        if (path === "/")
          return await route.fulfill({
            contentType: "text/html",
            body: '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script>',
          });
        if (path === "/app.js")
          return await route.fulfill({
            contentType: "text/javascript",
            body: bundle,
          });
        if (path.startsWith("/api/studio-media/")) {
          const source = sources.get(path.slice("/api/studio-media/".length));
          if (!source) return await route.abort();
          const match = /^bytes=(\d+)-(\d*)$/.exec(
            route.request().headers().range || ""
          );
          if (!match)
            return await route.fulfill({
              contentType: source.mime,
              body: source.bytes,
            });
          const start = Number(match[1]),
            end = Math.min(
              match[2] ? Number(match[2]) : source.bytes.length - 1,
              source.bytes.length - 1
            );
          if (end < start) return await route.fulfill({ status: 416 });
          return await route.fulfill({
            status: 206,
            headers: {
              "Content-Type": source.mime,
              "Content-Range": `bytes ${start}-${end}/${source.bytes.length}`,
              "Accept-Ranges": "bytes",
            },
            body: source.bytes.subarray(start, end + 1),
          });
        }
        if (path.startsWith("/api/post-media/"))
          return await route.fulfill({ body: await readImage(path) });
        if (/^\/(arsenal|fonts|designs|assets)\//.test(path)) {
          const base = resolve("client/public"),
            file = resolve(base, "." + decodeURIComponent(path));
          if (
            file.startsWith(base + sep) &&
            [
              ".woff2",
              ".woff",
              ".ttf",
              ".png",
              ".jpg",
              ".jpeg",
              ".webp",
              ".svg",
            ].includes(extname(file))
          )
            return await route.fulfill({ path: file });
        }
        await route.abort();
      } catch {
        await route.abort().catch(() => {});
      }
    });
    await page.goto(origin);
    if (pageError) throw Error("Falha no palco de exportação: " + pageError);
    const assets = await resolveSlideAssets(post, actor, deadline);
    await page.evaluate(
      async ({ post, assets }) => {
        await (window as any).mareOpenSlide(post, assets);
      },
      { post, assets }
    );
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-framerate",
      "30",
      "-i",
      "pipe:0",
    ];
    let audio = 0;
    const filters: string[] = [];
    for (const layer of layers.filter(s => !s.muted)) {
      const input = join(directory, "audio-" + audio + "-" + layer.assetId);
      await writeFile(input, sources.get(layer.assetId)!.bytes);
      const probe = await run(
        "ffprobe",
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file",
          "-select_streams",
          "a:0",
          "-show_entries",
          "stream=index",
          "-of",
          "csv=p=0",
          input,
        ],
        { timeout: 15000 }
      );
      if (probe.stdout.trim()) {
        args.push("-protocol_whitelist", "file", "-i", input);
        audio++;
        const timing = temporalInterval(
          layer,
          sources.get(layer.assetId)!.duration
        );
        filters.push(
          `[${audio}:a:0]atrim=start=${timing.from}:end=${timing.to},asetpts=PTS-${timing.from}/TB,aresample=async=1:first_pts=0,volume=${layer.volume ?? 1},adelay=${Math.round(timing.start * 1000)}:all=1[a${audio}]`
        );
      }
    }
    args.push(
      "-map",
      "0:v",
      "-vf",
      "pad=ceil(iw/2)*2:ceil(ih/2)*2",
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-level:v",
      "4.0",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast"
    );
    if (audio) {
      const mix =
        Array.from({ length: audio }, (_, i) => `[a${i + 1}]`).join("") +
        `amix=inputs=${audio}:normalize=0:duration=longest[a]`;
      args.push(
        "-filter_complex",
        [...filters, mix].join(";"),
        "-map",
        "[a]",
        "-c:a",
        "aac"
      );
    }
    const output = join(directory, "final.mp4");
    args.push("-t", String(duration), "-movflags", "+faststart", output);
    ffmpeg = spawn(process.env.MARE_FFMPEG || "ffmpeg", args, {
      stdio: ["pipe", "ignore", "ignore"],
    });
    const close = once(ffmpeg, "close");
    void close.catch(() => {});
    const input = ffmpeg.stdin!;
    input.on("error", () => {});
    const [w, h] = post.aspectRatio.split(":").map(Number);
    const maxDimension = Math.round(1080 * Math.max(1, h / w));
    const frames = Math.ceil(duration * 30);
    for (let i = 0; i < frames; i++) {
      if (reportProgress && i % 30 === 0)
        await reportProgress(Math.floor((i * 100) / frames));
      deadline.throwIfAborted();
      const encoded = await page.evaluate(
        async ({ time, maxDimension }) =>
          await (window as any).mareRenderFrame(time, maxDimension),
        { time: i / 30, maxDimension }
      );
      await new Promise<void>((done, reject) =>
        input.write(Buffer.from(encoded, "base64"), err =>
          err ? reject(err) : done()
        )
      );
    }
    input.end();
    const [status] = await close;
    if (status !== 0) throw Error("Codificação do slide falhou.");
    return await readFile(output);
  } finally {
    ffmpeg?.kill();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
}
