import { readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { ENV } from "../../_core/env";
import { loadComponentFontBytes } from "../componentTextMeasurer";
import { loadOwnedMediaReference } from "../../mediaAssets";
import { verifyArsenalAsset } from "../../designCatalog/arsenalAssets";
import { arsenalHash } from "@shared/arsenalContent";
import type { ArsenalComposition } from "@shared/designArsenal";
import type { RenderReviewInput, ReviewScene } from "./proposalReview";

let browserTask: Promise<Browser> | undefined;
const origin = "http://localhost";
export async function resolveReviewBrowser(){
 let executablePath=ENV.reviewChromiumExecutablePath;
 if(!executablePath){for(const candidate of [chromium.executablePath(),'/usr/bin/chromium','/usr/bin/google-chrome']){try{await access(candidate);executablePath=candidate;break;}catch{}}}
 if(!executablePath)throw new Error('proposal_review_browser_unavailable');
 await access(executablePath);return executablePath;
}
/** Filesystem-only check; admission must not launch Chromium. */
export async function assertReviewRendererConfigured(){await access(resolve(ENV.reviewRendererBundle));await resolveReviewBrowser();}
async function browser() {
  if (!browserTask) {
    browserTask = (async () => {
      const executablePath = await resolveReviewBrowser();
      const instance = await chromium.launch({
        executablePath,
        headless: true,
        timeout: 15_000,
      });
      instance.on("disconnected", () => {
        browserTask = undefined;
      });
      return instance;
    })();
    void browserTask.catch(() => {
      browserTask = undefined;
    });
  }
  return browserTask;
}

export async function closeReviewRenderer() {
  const active = browserTask;
  browserTask = undefined;
  if (active) await (await active).close();
}

export async function assertReviewRendererAvailable() {
  await access(resolve(ENV.reviewRendererBundle));
  await browser();
}

function checkStopped(input: RenderReviewInput) {
  if (input.signal?.aborted)
    throw input.signal.reason ?? new Error("proposal_review_cancelled");
  if (input.deadlineMs !== undefined && Date.now() >= input.deadlineMs)
    throw new Error("proposal_review_timeout");
}

/** Resolve only verified bytes or same-owner private storage. Chromium never fetches a URL
 * from a prompt, scene, model response or asset; its route blocks every external request. */
export async function hydrateReviewComposition(
  composition: ArsenalComposition,
  input: Pick<RenderReviewInput, "actor" | "signal" | "deadlineMs" | "loadAssetBytes">
): Promise<ArsenalComposition> {
  const copy = structuredClone(composition);
  const urls = new Map<string, Promise<string>>();
  const hydrate = (url: string): Promise<string> => {
    if (!url) return Promise.resolve("");
    let task = urls.get(url);
    if (!task) {
      task = (async () => {
        checkStopped({ ...input, compositions: [], definitions: [] });
        if (url.startsWith("/api/post-media/"))
          return (await loadOwnedMediaReference(url, input.actor, input.signal))
            .dataUri;
        const match =
          /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
            url
          );
        if (!match || url.length > 12 * 1024 * 1024)
          throw new Error("proposal_review_unsafe_media");
        const bytes = Buffer.from(match[2], "base64");
        const checked = await verifyArsenalAsset(bytes, {});
        if (checked.manifest.mimeType !== `image/${match[1]}`)
          throw new Error("proposal_review_invalid_media");
        return url;
      })();
      urls.set(url, task);
    }
    return task;
  };
  await Promise.all(
    Object.values(copy.media).map(async media => {
      media.url = await hydrate(media.url);
    })
  );
  await Promise.all(copy.elements.filter(e => e.imageAssetId && !copy.media[e.id]).map(async element => {
    checkStopped({ ...input, compositions: [], definitions: [] });
    const asset = copy.assets.find(a => a.id === element.imageAssetId);
    if (!asset || !/^image\/(png|jpeg|webp)$/.test(asset.mimeType)) throw new Error("proposal_review_image_manifest_missing");
    const bytes = await (input.loadAssetBytes ?? loadComponentFontBytes)(asset, input.signal);
    if (bytes.length !== asset.bytes || createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
      throw new Error("proposal_review_image_hash_mismatch");
    const verified = await verifyArsenalAsset(bytes, {});
    if (verified.manifest.mimeType !== asset.mimeType) throw new Error("proposal_review_image_signature_mismatch");
    copy.media[element.id] = {kind:"user",url:`data:${asset.mimeType};base64,${bytes.toString("base64")}`,focalX:0.5,focalY:0.5};
  }));
  if (copy.version === 3) {
    await Promise.all(
      copy.authorialLayers
        .filter(layer => layer.kind === "image" && layer.url)
        .map(async layer => {
          layer.url = await hydrate(layer.url!);
        })
    );
    if (copy.customBackground?.imageUrl)
      copy.customBackground.imageUrl = await hydrate(
        copy.customBackground.imageUrl
      );
    if (copy.logo?.url) copy.logo.url = await hydrate(copy.logo.url);
  }
  return copy;
}

export async function renderReviewScenes(
  input: RenderReviewInput
): Promise<ReviewScene[]> {
  checkStopped(input);
  if (!input.compositions.length || input.compositions.length > 10)
    throw new Error("proposal_review_invalid_sequence");
  const assets = Array.from(
    new Map(
      input.compositions
        .flatMap(c => c.assets.filter(a => a.family))
        .map(a => [arsenalHash(a), a])
    ).values()
  );
  const fonts = await Promise.all(
    assets.map(async asset => {
      const bytes = await (input.loadAssetBytes ?? loadComponentFontBytes)(asset, input.signal);
      if (
        bytes.length !== asset.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== asset.sha256
      )
        throw new Error("proposal_review_font_mismatch");
      return { asset, base64: bytes.toString("base64") };
    })
  );
  const compositions = await Promise.all(
    input.compositions.map(scene => hydrateReviewComposition(scene, input))
  );
  checkStopped(input);
  const bundle = await readFile(resolve(ENV.reviewRendererBundle), {
    encoding: "utf8",
    signal: input.signal,
  });
  checkStopped(input);
  const context = await (
    await browser()
  ).newContext({
    viewport: { width: 800, height: 1100 },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  });
  const stop = () => {
    void context.close().catch(() => undefined);
  };
  const timer = setTimeout(
    stop,
    Math.max(
      1,
      Math.min(30_000, (input.deadlineMs ?? Date.now() + 30_000) - Date.now())
    )
  );
  input.signal?.addEventListener("abort", stop, { once: true });
  try {
    checkStopped(input);
    await context.route("**/*", route => {
      const url = route.request().url();
      if (url === `${origin}/`)
        return route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:0"><div id="root"></div><script src="/renderer.js"></script></body></html>',
        });
      if (url === `${origin}/renderer.js`)
        return route.fulfill({
          contentType: "application/javascript",
          body: bundle,
        });
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: "load", timeout: 10_000 });
    const results: ReviewScene[] = [];
    for (let slideIndex = 0; slideIndex < compositions.length; slideIndex++) {
      const composition = compositions[slideIndex];
      checkStopped(input);
      const image = await page.evaluate(
        async payload => {
          const render = (
            window as unknown as {
              renderPostSparkReview: (
                value: typeof payload
              ) => Promise<{ dataUri: string; width: number; height: number }>;
            }
          ).renderPostSparkReview;
          return render(payload);
        },
        { composition, fonts }
      );
      results.push({ ...image, slideIndex, renderer: "CanvasPostStage" });
    }
    return results;
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", stop);
    await context.close().catch(() => undefined);
  }
}
