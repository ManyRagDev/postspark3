/** Opt-in replay of the REF-19 failure: fixture and font bytes remain local.
 * Manual short copy is a capacity control, never a new semantic approval. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { instantiateCompleteDesign } from "../../../shared/completeDesignGeneration";
import {
  arsenalTextLayoutBox,
  measureArsenalElement,
  resolveArsenalGeometry,
} from "../../../shared/arsenalGeometry";
import { readArsenalComposition } from "../../../shared/designArsenal";
import { createComponentTextMeasurer } from "../../../server/ai/componentTextMeasurer";
import { inspectProposalScenes } from "../../../server/ai/workflows/proposalGraph";
import {
  renderReviewScenes,
  closeReviewRenderer,
} from "../../../server/ai/workflows/proposalRenderer";
import { ENV } from "../../../server/_core/env";
const args = process.argv.slice(2),
  fixture = args[args.indexOf("--fixture") + 1],
  out = args[args.indexOf("--output") + 1];
assert(
  args.includes("--fixture") && args.includes("--output"),
  "explicit --fixture and --output required"
);
const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const digests = new Map<string, string>();
const read = async (file: string) => {
  const data = await fs.readFile(file);
  digests.set(file, hash(data));
  return data;
};
const data = JSON.parse((await read(fixture)).toString());
assert.equal(data.request.id, "278a1539-446a-42b1-abb8-927b1c9852fe");
const ops = data.operations,
  prefix = `p-${data.request.id}-1`,
  get = (key: string) => ops.find((o: any) => o.operation_key === key).result;
const recovery = get(`${prefix}:delivery_recovery:candidate`),
  d = get("prepare:definitions").find(
    (d: any) => d.id === recovery.plan.pages[0].componentId
  );
const raw = get(`${prefix}-fb1:copy_recovery`),
  patch = JSON.parse(raw.choices[0].message.content).patches[0];
const stage = JSON.parse(
  (await read("artifacts/acervo82/full/staged.json")).toString()
);
const loadAsset = async (a: any) => {
  const bytes = await read(path.join(stage.build, "assets", a.sha256));
  assert.equal(hash(bytes), a.sha256);
  return bytes;
};
const measure = await createComponentTextMeasurer(d.assets, loadAsset);
globalThis.fetch = async () => {
  throw new Error("offline_replay_network_forbidden");
};
const control = "Café artesanal e bolo caseiro.";
const variants = [
  {
    label: "original",
    text: recovery.copy.slides[0].values.find(
      (v: any) => v.fieldId === "field-1"
    ).value,
  },
  { label: "repair", text: patch.value },
  ...patch.alternatives.map((text: string, i: number) => ({
    label: `repair-alternative-${i}`,
    text,
  })),
  { label: "short-control", text: control },
];
const proofs: any[] = [],
  renders: any[] = [];
for (const variant of variants) {
  const copy = structuredClone(recovery.copy);
  copy.slides[0].values.find((v: any) => v.fieldId === "field-1").value =
    variant.text;
  const source = instantiateCompleteDesign({
    definition: d,
    ...copy.slides[0],
    runId: data.request.id,
    slot: 1,
    slide: 0,
    planHash: "a".repeat(64),
    experimental: true,
  });
  const inspect = (adaptive: boolean) =>
    inspectProposalScenes([source], [d], measure, true, adaptive);
  const before = inspect(false),
    after = inspect(true),
    scene = after.slides[0].composition;
  const describe = (checked: typeof after) => {
    const scene = checked.slides[0].composition,
      e = scene.elements.find(e => e.id === "reveal-text")!,
      m = measureArsenalElement(e, measure);
    return {
      findings: checked.findings,
      fontSize: e.fontSize,
      resolvedHeight: e.height,
      auditedHeight: arsenalTextLayoutBox(scene, e).height,
      lineCount: m.lines.length,
      lineWidths: m.lines.map(l => l.width),
    };
  };
  assert.deepEqual(scene.base, source.base);
  assert.deepEqual(scene.pieces, source.pieces);
  assert.deepEqual(scene.content, source.content);
  if (variant.label === "short-control") {
    assert(
      before.findings.some(
        f => f.rule === "overflow" && f.target.endsWith(":reveal-text")
      ),
      "old_control_must_reproduce_conflicting_bounds"
    );
    assert.deepEqual(
      after.findings,
      [],
      "new_control_must_pass_full_preflight"
    );
    const restored = readArsenalComposition(JSON.parse(JSON.stringify(scene)));
    const reopened = resolveArsenalGeometry(restored, {
      measureText: measure,
      allowReduction: false,
      allowSubpixelTextOverflow: true,
    });
    assert.deepEqual(
      reopened.elements,
      scene.elements,
      "reopen_font_geometry_changed"
    );
    renders.push(
      { name: "short-control-before", scene: before.slides[0].composition },
      { name: "short-control-after", scene }
    );
  } else
    assert(
      after.findings.some(f => f.rule === "overflow"),
      "captured_oversized_copy_must_remain_rejected"
    );
  if (variant.label === "original") renders.push({ name: "original", scene });
  proofs.push({
    ...variant,
    length: variant.text.length,
    before: describe(before),
    after: describe(after),
    geometryAndContentUnchanged: true,
  });
}
await fs.mkdir(out, { recursive: true });
if (args.includes("--render")) {
  ENV.reviewRendererBundle = "/tmp/postspark-278a-renderer.js";
  ENV.reviewChromiumExecutablePath =
    "/home/emanuel/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
  try {
    const images = await renderReviewScenes({
      actor: "offline-layout-control",
      compositions: renders.map(r => r.scene),
      definitions: [d],
      loadAssetBytes: loadAsset,
    });
    for (let i = 0; i < images.length; i++)
      await fs.writeFile(
        path.join(out, `${renders[i].name}.png`),
        Buffer.from(images[i].dataUri.split(",")[1], "base64")
      );
  } finally {
    await closeReviewRenderer();
  }
}
for (const [file, digest] of digests)
  assert.equal(hash(await fs.readFile(file)), digest);
const report = {
  requestId: data.request.id,
  definition: d.label,
  definitionHash: d.hash,
  providerCalls: 0,
  dbWrites: 0,
  capturedInputsUnchanged: true,
  proofs,
  inputs: Array.from(digests, ([file, sha256]) => ({ file, sha256 })),
  limitation:
    "Short copy is a manually authored physical-fit control, not provider output or factual-review approval.",
};
await fs.writeFile(
  path.join(out, "results.json"),
  JSON.stringify(report, null, 2)
);
console.log(
  JSON.stringify({
    output: out,
    capturedInputsUnchanged: true,
    proofs: proofs.map(p => ({
      label: p.label,
      before: p.before.findings.length,
      after: p.after.findings.length,
      font: p.after.fontSize,
      lines: p.after.lineCount,
    })),
  })
);
