// Integration test of the built application with an isolated RPC transport and disk-backed posts.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import superjson from "superjson";
import { runs, root, read, hash } from "./inputs.mjs";

const [n, arm, mode = "replay"] = process.argv.slice(2);
assert(
  ["2", "7", "10"].includes(n) &&
    ["A", "B"].includes(arm) &&
    ["live", "replay"].includes(mode)
);
const run = runs[Number(n) - 1],
  dir = join(root, "geracoes", n + "-" + arm);
mkdirSync(dir, { recursive: true });
const owner = "11111111-1111-4111-8111-111111111111";
const input = {
  ...run.r.input,
  ownerId: owner,
  idempotencyKey: "diagnostico-" + n + "-" + arm,
};
const info = join(dir, "admissao.json");
if (!existsSync(info))
  writeFileSync(
    info,
    JSON.stringify({ id: randomUUID(), source: run.r.id, n, arm }),
    { mode: 0o600 }
  );
const id = read(info).id;
const file = key => join(dir, key + ".json");
const journeyDir = mode === "replay" ? join(dir, "reabertura") : dir;
mkdirSync(journeyDir, { recursive: true });
const journeyFile = key => join(journeyDir, key + ".json");
const startedWithFinal = existsSync(file("final"));
const origin = "http://127.0.0.1:3194";
const build = resolve(process.env.DESIGN_FIT_UI_BUILD);
const user = {
  id: owner,
  role: "user",
  name: "Diagnóstico",
  studioPlan: "PRO",
  access: "personal",
};
const browser = await chromium.launch({
  executablePath: process.env.REVIEW_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const phases = [],
  errors = [],
  saved = [];
let child, admitted, workerExit;
const empty = {
  requestId: id,
  runId: id,
  overallStatus: "running",
  updatedAt: Date.now(),
  proposals: [0, 1, 2].map(slot => ({
    proposalId: "p-" + id + "-" + slot,
    runId: id,
    slot,
    status: "planned",
    revision: 1,
  })),
};
const snapshot = () =>
  existsSync(file("final"))
    ? read(file("final")).snapshot
    : existsSync(file("progresso"))
      ? read(file("progresso"))
      : empty;
const assets = new Map();
for (const folder of [join(root, "definicoes")]) {
  const { readdirSync } = await import("node:fs");
  for (const f of readdirSync(folder))
    for (const a of read(join(folder, f)).assets) assets.set(a.id, a);
}
const stamp = event => phases.push({ event, at: Date.now() });
async function rpc(name, arg) {
  switch (name) {
    case "auth.me":
      return user;
    case "billing.getProfile":
      return { plan: "PRO", sparks: 150 };
    case "generation.capabilities":
      return {
        ownerId: owner,
        enabled: true,
        selectable: true,
        contractVersion: 6,
        platforms: ["instagram"],
        inputTypes: ["text"],
        reason: "ready",
      };
    case "generation.start": {
      assert.equal(arg.content, run.r.input.content);
      assert.equal(arg.allowAiImages, false);
      assert.equal(arg.postMode, run.r.input.postMode);
      assert.equal(arg.idempotencyKey, input.idempotencyKey);
      if (!admitted) {
        admitted = Date.now();
        stamp("admission");
        if (!startedWithFinal) {
          assert.equal(mode, "live");
          child = spawn(
            process.execPath,
            [
              "--env-file=.env",
              "--import",
              "tsx",
              "scripts/diagnostics/designFit/generate.mjs",
              n,
              arm,
            ],
            { stdio: "inherit" }
          );
          workerExit = new Promise(done => child.once("exit", done));
        }
      }
      return { created: true, snapshot: snapshot() };
    }
    case "generation.get":
      return {
        snapshot: snapshot(),
        input,
        progressTransport: "poll",
        billingPending: false,
      };
    case "generation.progress": {
      const s = snapshot();
      return {
        requestId: id,
        status: s.overallStatus,
        deadlineAt: Date.now() + 360000,
        billingPending: false,
        error: null,
        proposals: s.proposals.map(({ proposalId, revision, status }) => ({
          proposalId,
          revision,
          status,
        })),
      };
    }
    case "designCatalog.resolveArsenalAssets":
      return arg.ids.map(id => {
        const a = assets.get(id);
        assert(a);
        return { id, url: origin + "/asset/" + a.sha256 };
      });
    case "post.save": {
      assert(arg.canvasModel?.slides?.length);
      const post = {
        id: saved.length + 1,
        revision: 1,
        platform: "instagram",
        createdAt: new Date().toISOString(),
        postMode: arg.postMode,
        input_type: arg.inputType,
        input_content: arg.inputContent,
        headline: arg.headline,
        gallery_preview: arg.galleryPreview,
        canvas_model: arg.canvasModel,
      };
      writeFileSync(journeyFile("salvo-" + post.id), JSON.stringify(post), {
        mode: 0o600,
      });
      saved.push(post.id);
      return { id: post.id, revision: 1 };
    }
    case "post.get":
      return read(journeyFile("salvo-" + arg.id));
    case "post.listSummary":
      return {
        total: saved.length,
        items: saved.map(i => {
          const { canvas_model, ...summary } = read(journeyFile("salvo-" + i));
          return summary;
        }),
      };
    case "designCatalog.generationReadiness":
      return {
        reason: "ready",
        candidateCount: 62,
        carouselCandidateCount: 20,
      };
    default:
      return [];
  }
}
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
};
await page.context().route("**/*", async route => {
  try {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith("/api/trpc/")) {
      const names = decodeURIComponent(url.pathname.slice(10)).split(",");
      const batch = url.searchParams.has("batch");
      const data =
        request.postDataJSON() ??
        JSON.parse(url.searchParams.get("input") ?? "null");
      const result = await Promise.all(
        names.map(async (name, i) => {
          const val = batch ? data?.[i] : data;
          const arg = val ? superjson.deserialize(val) : undefined;
          return {
            result: { data: superjson.serialize(await rpc(name, arg)) },
          };
        })
      );
      return route.fulfill({ json: batch ? result : result[0] });
    }
    if (url.pathname.startsWith("/asset/")) {
      const digest = url.pathname.slice(7);
      assert(/^[a-f0-9]{64}$/.test(digest));
      const local = join(
        "artifacts/acervo82/full/acervo82-fidelidade-20261119/assets",
        digest
      );
      return route.fulfill({
        body: readFileSync(
          existsSync(local) ? local : join(root, "assets", digest)
        ),
      });
    }
    const local = resolve(build, "." + url.pathname);
    assert(local.startsWith(build + "/"));
    if (url.pathname === "/thevoid" || url.pathname === "/saved-posts")
      return route.fulfill({
        path: join(build, "index.html"),
        contentType: "text/html",
      });
    if (existsSync(local))
      return route.fulfill({ path: local, contentType: mime[extname(local)] });
    return route.fulfill({ status: 404, body: "" });
  } catch (e) {
    errors.push(String(e));
    await route
      .fulfill({ status: 500, body: "diagnostic transport failed" })
      .catch(() => {});
  }
});
page.on("pageerror", e => errors.push(String(e)));
try {
  await page.addInitScript(
    ({ input }) => {
      if (!sessionStorage.getItem("experiment-seeded")) {
        localStorage.setItem(
          "postspark_consent_given",
          JSON.stringify({ given: true })
        );
        sessionStorage.setItem(
          "postspark.generation.pending_start",
          JSON.stringify({
            input,
            source: "create",
            promptText: input.content,
            mode: input.postMode,
            inputType: "text",
          })
        );
        sessionStorage.setItem("experiment-seeded", "1");
      }
    },
    { input }
  );
  await page.goto(origin + "/thevoid");
  await page
    .getByRole("button", { name: "Retomar solicitação" })
    .click({ timeout: 30000 });
  while (!existsSync(file("final"))) {
    if (child?.exitCode != null || Date.now() - admitted > 420000)
      throw Error("worker did not finish");
    await new Promise(r => setTimeout(r, 250));
  }
  if (workerExit) assert.equal(await workerExit, 0);
  const ready = snapshot().proposals.filter(p => p.status === "ready");
  const edit = page.getByRole("button", {
    name: "Personalizar Post",
    exact: true,
  });
  if (ready.length) {
    await edit.nth(ready.length - 1).waitFor({ timeout: 45000 });
    stamp("gallery");
    await page.screenshot({ path: join(journeyDir, "galeria.png") });
    for (let i = 0; i < ready.length; i++) {
      await edit.nth(i).click();
      await page
        .getByRole("button", { name: "Salvar post", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Salvar como novo post", exact: true })
        .click();
      await page.waitForFunction(
        () => !document.body.innerText.includes("Como você quer salvar"),
        null,
        { timeout: 20000 }
      );
      await page.getByRole("button", { name: "Voltar para a galeria" }).click();
    }
    assert.equal(saved.length, ready.length);
    for (let i = 0; i < saved.length; i++) {
      const post = read(journeyFile("salvo-" + (i + 1)));
      await page.goto(origin + "/saved-posts");
      await page
        .getByRole("button", { name: "Abrir", exact: true })
        .nth(i)
        .click();
      await page
        .getByRole("button", { name: "Salvar post", exact: true })
        .waitFor();
      const model = post.canvas_model;
      const source = ready.find(
        p => p.proposalId === model.provenance.journey.proposalId
      );
      assert.deepEqual(
        model.slides.map(s => s.composition.origin.definitionHash),
        source.bundle.slides.map(s => s.composition.origin.definitionHash)
      );
      if (model.slides.length > 1)
        assert.equal(
          await page
            .getByRole("button", { name: /Selecionar slide \d/ })
            .count(),
          model.slides.length
        );
      await page.locator("canvas").first().waitFor({ state: "attached" });
      await page.screenshot({
        path: join(journeyDir, "reaberto-" + (i + 1) + ".png"),
      });
      stamp("reopened:" + post.canvas_model.id);
    }
  }
  writeFileSync(
    journeyFile("jornada"),
    JSON.stringify(
      {
        id,
        startedWithFinal,
        phases,
        errors,
        saved,
        ready: ready.length,
        elapsedMs: ready.length
          ? phases.find(p => p.event === "gallery").at - admitted
          : null,
        storage: "isolated file adapter",
        modelHashes: saved.map(i =>
          hash(read(journeyFile("salvo-" + i)).canvas_model)
        ),
      },
      null,
      2
    )
  );
  assert.deepEqual(errors, []);
  console.log("Jornada", n, arm, ready.length, phases, errors);
} catch (error) {
  console.error(
    "Diagnóstico de interface",
    errors,
    (await page.locator("body").innerText()).slice(0, 1600)
  );
  throw error;
} finally {
  await browser.close();
  if (workerExit) await workerExit;
}
