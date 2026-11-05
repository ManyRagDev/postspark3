import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createTRPCProxyClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";
import { readLocalEnvironment } from "../environment.mjs";
import { readCatalogDefinition } from "../../../server/designCatalog/versionedCatalog";
import {
  renderReviewScenes,
  closeReviewRenderer,
} from "../../../server/ai/workflows/proposalRenderer";
import { loadImage, createCanvas } from "@napi-rs/canvas";
const env = await readLocalEnvironment(process.cwd());
const account = JSON.parse(
  await fs.readFile(".acervo82-local/test-account.json", "utf8")
);
const config = JSON.parse(
  await fs.readFile(".acervo82-local/pilot.json", "utf8")
);
const requestId = process.argv[2];
assert(
  /^[a-f0-9-]{36}$/i.test(requestId),
  "Provide an existing owner-scoped request UUID; this verifier starts no paid generation."
);
const cases = JSON.parse(
  await fs.readFile("designs/acervo82/pilot/cases.json", "utf8")
);
const testCase = cases.find((c: any) => c.id === process.argv[3]);
assert(testCase, "Provide a pilot case ID: static, carousel or photo.");
const auth = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const signed = await auth.auth.signInWithPassword({
  email: account.email,
  password: account.password,
});
if (signed.error) throw signed.error;
const bridge = await fetch(
  `http://127.0.0.1:${env.PORT}/api/auth/supabase-session`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: signed.data.session.access_token }),
  }
);
assert(bridge.ok);
const cookie = bridge.headers.get("set-cookie")!.split(";")[0];
const api = createTRPCProxyClient<AppRouter>({
  links: [
    httpLink({
      url: `http://127.0.0.1:${env.PORT}/api/trpc`,
      transformer: superjson,
      headers: { Cookie: cookie },
    }),
  ],
});
const directory = `artifacts/acervo82/pilot/runs/${requestId}`;
await fs.mkdir(directory, { recursive: true });
try {
  let result;
  for (let attempt = 0; attempt < 120; attempt++) {
    result = await api.generation.get.query({ requestId });
    await fs.writeFile(
      path.join(directory, "snapshot.json"),
      JSON.stringify(result, null, 2)
    );
    console.log(
      JSON.stringify({
        requestId,
        status: result.snapshot.overallStatus,
        proposals: result.snapshot.proposals.map(p => ({
          slot: p.slot,
          status: p.status,
          family: p.status === "ready" ? p.bundle.family : undefined,
          error: p.errorReason,
        })),
      })
    );
    if (!["running"].includes(result.snapshot.overallStatus)) break;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  assert(result);
  assert.equal(result.snapshot.overallStatus, "completed");
  assert.equal(result.input.content, testCase.content);
  assert.equal(result.input.postMode, testCase.postMode);
  assert.equal(
    result.snapshot.proposals.filter(p => p.status === "ready").length,
    3
  );
  const pictures: Array<{ file: string; label: string }> = [];
  for (const p of result.snapshot.proposals) {
    if (p.status !== "ready") throw new Error("pilot_proposal_not_ready");
    assert(p.bundle.family.startsWith("acervo82-"));
    assert.equal(p.reviews?.at(-1)?.status, "passed");
    assert.equal(p.bundle.slides.length, testCase.slides);
    const media = p.bundle.slides
      .flatMap(s => Object.values(s.composition.media))
      .filter(m => m.url);
    if (testCase.media === "required")
      assert(
        media.length > 0,
        "The photo requirement must be fulfilled in every proposal."
      );
    if (testCase.media === "forbidden") assert.equal(media.length, 0);
    const compositions = p.bundle.slides.map(s => s.composition);
    const definitions = await Promise.all(
      compositions.map(c => {
        const o = c.origin.componentAssembly!;
        return readCatalogDefinition(
          config.revision,
          o.componentIds[0],
          o.componentHashes[0]
        );
      })
    );
    const scenes = await renderReviewScenes({
      compositions,
      definitions,
      actor: account.id,
      deadlineMs: Date.now() + 120000,
    });
    for (const [i, scene] of scenes.entries()) {
      const file = `slot-${p.slot}-slide-${i + 1}.png`;
      const bytes = Buffer.from(scene.dataUri.split(",")[1], "base64");
      const decoded = await loadImage(bytes);
      assert(decoded.width >= 600 && decoded.height >= 600);
      await fs.writeFile(path.join(directory, file), bytes);
      pictures.push({ file, label: `${p.bundle.family} · ${i + 1}` });
    }
  }
  const contact = createCanvas(1200, Math.ceil(pictures.length / 3) * 520),
    ctx = contact.getContext("2d");
  ctx.fillStyle = "#161923";
  ctx.fillRect(0, 0, contact.width, contact.height);
  for (const [i, p] of pictures.entries()) {
    const x = (i % 3) * 400,
      y = Math.floor(i / 3) * 520;
    ctx.drawImage(
      await loadImage(path.join(directory, p.file)),
      x + 8,
      y + 8,
      384,
      480
    );
    ctx.fillStyle = "white";
    ctx.font = "16px sans-serif";
    ctx.fillText(p.label.slice(0, 40), x + 8, y + 508);
  }
  await fs.writeFile(
    path.join(directory, "CONTACT.png"),
    contact.toBuffer("image/png")
  );
  await fs.writeFile(
    path.join(directory, "receipt.json"),
    JSON.stringify(
      {
        requestId,
        revision: config.revision,
        completed: true,
        proposals: 3,
        slides: pictures.length,
        providerReviewsPassed: true,
        realCanvasRenderer: true,
        paidCallsStartedByVerifier: 0,
      },
      null,
      2
    )
  );
} finally {
  await closeReviewRenderer();
  await auth.auth.signOut({ scope: "local" });
}
