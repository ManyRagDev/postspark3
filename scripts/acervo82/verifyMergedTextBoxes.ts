// Replay both catalogs through TheVoid's local geometry check using identical field values.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { arsenalHash, readContentSource } from "../../shared/arsenalContent";
import { componentDefinitionV1Schema } from "../../shared/componentAssembly";
import { completeDesignFields, instantiateCompleteDesign } from "../../shared/completeDesignGeneration";
import { readArsenalComposition } from "../../shared/designArsenal";
import type { VariableContent } from "../../shared/variableContent";
import { createComponentTextMeasurer } from "../../server/ai/componentTextMeasurer";
import { inspectProposalScenes } from "../../server/ai/workflows/proposalGraph";
import { INITIAL_POST } from "../../client/src/pages/CanvasLab/components/types";
import { putArsenalComposition } from "../../client/src/pages/CanvasLab/lib/arsenalComposition";
import { canvasModelToUpdatePayload, savedPostToCanvasModel } from "../../client/src/pages/CanvasLab/lib/saveAdapter";

const [snapshot, candidate, samples, assets] = process.argv.slice(2);
assert(snapshot && candidate && samples && assets, "Informe a revisão de origem, a pasta da mesclagem, as amostras e os assets.");
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const archive = await json(snapshot);
const manifest = await json(join(candidate, "migration.json"));
assert.equal(manifest.sourceRevision, archive.revision);
assert.equal(manifest.rows.length, archive.definitions.length);
const result = [];
for (const row of manifest.rows) {
  const old = componentDefinitionV1Schema.parse(archive.definitions.find((d: { id: string }) => d.id === row.oldId));
  const next = componentDefinitionV1Schema.parse(await json(join(candidate, "definitions", row.id + ".json")));
  const sample = await json(join(samples, old.id + ".json"));
  assert.equal(sample.hash, old.hash);
  assert.equal(row.oldHash, old.hash);
  assert.equal(row.hash, next.hash);
  const measure = await createComponentTextMeasurer(next.assets, a => readFile(join(assets, a.sha256)));
  for (const mode of ["original", "short", "long"]) {
    const content: VariableContent = JSON.parse(sample.brief);
    for (const b of content.blocks) {
      if (b.type !== "text" || !["headline", "body"].includes(b.role)) continue;
      if (mode === "short") {
        const words = b.text.trim().split(/\s+/);
        b.text = words.slice(0, Math.max(1, Math.floor(words.length / 2))).join(" ");
      }
      if (mode === "long") b.text += b.role === "headline" ? " em detalhes" : " para entender o que muda na prática";
    }
    const issues: string[][] = [];
    for (const definition of [old, next]) {
      const values = completeDesignFields(definition).map(f => {
        const v = readContentSource(content, f.source);
        return { fieldId: f.id, value: Array.isArray(v) ? v.map(i => i.text) : v };
      });
      const source = instantiateCompleteDesign({
        definition, values, mediaPrompts: [], runId: "2063f073-cbdc-421a-a970-3ccad74e21ec",
        slot: 0, slide: 0, planHash: arsenalHash(values), experimental: true,
      });
      const inspected = inspectProposalScenes([source], [definition], measure, true, true, true, 1, true, true).slides[0];
      issues.push(inspected.findings.map(f => f.rule + " " + f.target));
      if (definition !== next) continue;
      const composition = readArsenalComposition(inspected.composition);
      assert.deepEqual(composition.content, source.content);
      const post = putArsenalComposition({
        ...structuredClone(INITIAL_POST), aspectRatio: "4:5", currentSlideIndex: 0,
        slides: [{ id: "test", step: "", headline: "", subtext: "" }],
      }, composition);
      const { canvasModel } = canvasModelToUpdatePayload(post);
      const reopened = savedPostToCanvasModel({ id: 1, canvas_model: JSON.parse(JSON.stringify(canvasModel)) });
      assert.equal(arsenalHash(reopened.slides![0].composition), arsenalHash(composition));
      for (const group of row.groups) {
        const id = group.targets[0];
        const box = composition.elements.find(e => e.id === id);
        assert(box?.kind === "text" && !box.contentFragment);
        const binding = composition.base.bindings.find(b => b.targetIds.includes(id))!;
        assert.deepEqual(binding.targetIds, [id]);
        assert.equal(box.text, binding.prefix + readContentSource(source.content, binding.source));
      }
    }
    result.push({ family: row.family, id: old.id, mode, before: issues[0], after: issues[1] });
  }
}
await writeFile(join(candidate, "worker-verification.json"), JSON.stringify(result) + "\n");
