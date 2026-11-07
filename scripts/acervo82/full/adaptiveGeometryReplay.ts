/** Explicit offline captured-fixture test. No provider or DB access. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { instantiateCompleteDesign } from "../../../shared/completeDesignGeneration";
import { readArsenalComposition } from "../../../shared/designArsenal";
import {
  arsenalTextLayoutBox,
  measureArsenalElement,
  resolveArsenalGeometry,
} from "../../../shared/arsenalGeometry";
import { createComponentTextMeasurer } from "../../../server/ai/componentTextMeasurer";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const base = "artifacts/acervo82/full/sessions/automatic-focused-20261106";
const observed = new Map<string, string>();
const hash = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const bytes = async (file: string) => {
  const data = await readFile(path.join(root, file));
  observed.set(file, hash(data));
  return data;
};
const json = async (file: string) =>
  JSON.parse((await bytes(file)).toString("utf8"));
const stage = await json("artifacts/acervo82/full/staged.json");
globalThis.fetch = async () => {
  throw new Error("offline_network_blocked");
};
const cases: any[] = [];
for (const spec of [
  { kind: "static", slot: 2, id: "bce0f360-6a25-4f34-8884-11614f0bc7ce" },
  { kind: "carousel", slot: 0, id: "f6001566-01d8-44c6-bc81-1e9b1c44dead" },
]) {
  const ops = await json(`${base}/${spec.kind}/operations.json`);
  const recovery = ops.find(
    (o: any) =>
      o.operation_key ===
      `p-${spec.id}-${spec.slot}:delivery_recovery:candidate`
  ).result;
  const definitions = ops.find(
    (o: any) => o.operation_key === "prepare:definitions"
  ).result;
  const scenes: any[] = [];
  for (const page of recovery.plan.pages) {
    const definition = definitions.find((d: any) => d.id === page.componentId);
    const measureText = await createComponentTextMeasurer(
      definition.assets,
      async asset => {
        const data = await bytes(`${stage.build}/assets/${asset.sha256}`);
        assert.equal(hash(data), asset.sha256);
        return data;
      }
    );
    const source = instantiateCompleteDesign({
      definition,
      ...recovery.copy.slides[page.slideIndex],
      runId: spec.id,
      slot: spec.slot,
      slide: page.slideIndex,
      planHash: "a".repeat(64),
      experimental: true,
    });
    const options = {
      measureText,
      allowReduction: true,
      elasticReduction: true,
      allowSubpixelTextOverflow: true,
    };
    const before = resolveArsenalGeometry(source, options);
    const adaptive = resolveArsenalGeometry(source, {
      ...options,
      adaptiveTextFit: true,
    });
    const changed = adaptive.elements.filter(
      e => adaptive.overrides[e.id]?.adaptiveTextFitVersion === 2
    );
    assert.deepEqual(adaptive.content, source.content);
    const beforeGeometry = new Map(
      before.elements.map(e => [
        e.id,
        {
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          fontSize: e.fontSize,
          text: e.text,
        },
      ])
    );
    // Production persists all reductions. Save the complete resolved geometry,
    // then use the editor's no-reduction resolve mode with the same verified fonts.
    for (const e of adaptive.elements) {
      const instance = adaptive.base.instances.find(i => i.id === e.id);
      const piece = instance && adaptive.pieces[instance.pieceHash];
      if (e.kind === "text" && piece && e.fontSize < piece.fontSize)
        adaptive.overrides[e.id] = {
          ...adaptive.overrides[e.id],
          fontSize: e.fontSize,
        };
    }
    const saved = readArsenalComposition(JSON.parse(JSON.stringify(adaptive)));
    const reopened = resolveArsenalGeometry(saved, {
      ...options,
      allowReduction: false,
      elasticReduction: false,
      adaptiveTextFit: false,
    });
    const again = resolveArsenalGeometry(reopened, {
      ...options,
      adaptiveTextFit: true,
    });
    const geometry = (scene: any) =>
      scene.elements.map((e: any) => ({
        id: e.id,
        x: e.x,
        y: e.y,
        width: e.width,
        height: e.height,
        fontSize: e.fontSize,
        text: e.text,
      }));
    assert.deepEqual(
      geometry(reopened),
      geometry(adaptive),
      "editor_reopen_geometry"
    );
    assert.deepEqual(
      geometry(again),
      geometry(reopened),
      "repeated_resolve_geometry"
    );
    assert.deepEqual(
      again.overrides,
      reopened.overrides,
      "repeated_resolve_overrides"
    );
    const measuredIssues = adaptive.elements
      .filter(e => e.kind === "text")
      .flatMap(e => {
        const box = arsenalTextLayoutBox(adaptive, e),
          m = measureArsenalElement(box, measureText);
        return m.height > box.height + 0.5 ||
          m.lines.some(l => l.width > box.width + 0.5)
          ? [e.id]
          : [];
      });
    if (spec.kind === "static")
      assert.equal(changed.length, 0, "ambiguous_highlight_must_not_move");
    else {
      assert.deepEqual(measuredIssues, []);
      assert.deepEqual(adaptive.issues, []);
      if (page.slideIndex !== 1) assert(changed.some(e => e.id === "text-7-0"));
    }
    scenes.push({
      slide: page.slideIndex,
      originalIssues: before.issues,
      adaptiveIssues: adaptive.issues,
      measuredIssues,
      changed: changed.map(e => ({
        id: e.id,
        before: beforeGeometry.get(e.id),
        after: {
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          fontSize: e.fontSize,
        },
        override: adaptive.overrides[e.id],
      })),
      contentUnchanged: true,
      editorReopenIdentical: true,
      repeatedResolveIdentical: true,
    });
  }
  cases.push({ ...spec, scenes });
}
for (const [file, digest] of observed)
  assert.equal(hash(await readFile(path.join(root, file))), digest);
const output = "/tmp/adaptive-geometry-replay.json";
await writeFile(
  output,
  JSON.stringify(
    {
      externalCalls: 0,
      dbWrites: 0,
      inputsUnchanged: true,
      inputs: Array.from(observed, ([file, sha256]) => ({ file, sha256 })),
      cases,
    },
    null,
    2
  )
);
console.log(JSON.stringify({ output, cases }, null, 2));
