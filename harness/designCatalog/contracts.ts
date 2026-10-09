/** Offline contracts; native Canvas metrics, NOT browser/CanvasPostStage E2E. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { catalogBlueprintSchema, rankCatalog, type CatalogSelection, type CatalogEntry } from "../../shared/designCatalog";
import { manualCatalogDraft } from "../../client/src/pages/Admin2/catalogDraft";
import { INITIAL_POST, type CanvasPostModel } from "../../client/src/pages/CanvasLab/components/types";
import { compileCatalogPost } from "../../client/src/pages/CanvasLab/lib/catalogCompiler";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "../../client/src/pages/CanvasLab/lib/saveAdapter";
import { contentHash } from "../../server/designCatalog/store";

// Use actual 2D measurement instead of layoutRichText's server approximation.
// Generic fonts avoid network/FontFace; browser font loading is a separate check.
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { createElement: (tag: string) => { assert.equal(tag, "canvas"); return createCanvas(1, 1); } },
});
const checks: string[] = [];
const compiledCases: Array<{ style: string; format: string; status: string }> = [];
const check = (name: string, fn: () => void) => { fn(); checks.push(name); };
const selection = (style: "editorial" | "card" | "bottom"): CatalogSelection => {
  const definition = manualCatalogDraft(style);
  for (const p of definition.pieces) p.fontFamily = "sans-serif";
  return {
    traceId: randomUUID(), versionId: randomUUID(), blueprintId: randomUUID(), version: 1,
    contentHash: contentHash(definition), definition: catalogBlueprintSchema.parse(definition),
    selection: "llm", preserveBrandFonts: false,
  };
};
function post(format: CanvasPostModel["aspectRatio"]): CanvasPostModel {
  return {
    ...structuredClone(INITIAL_POST), id: "catalog-contract", aspectRatio: format,
    headline: "Uma ideia merece um bom design", subtext: "Hierarquia, contraste e espaço para respirar.",
    fontFamily: "sans-serif", subtextFontFamily: "sans-serif",
    slides: [{ id: "s1", step: "", headline: "Uma ideia merece um bom design", subtext: "Hierarquia, contraste e espaço para respirar." }],
    currentSlideIndex: 0,
  };
}
for (const style of ["editorial", "card", "bottom"] as const) {
  for (const format of ["1:1", "5:6", "9:16"] as const) {
    const s = selection(style);
    const base = post(format);
    const compiled = await compileCatalogPost(base, s);
    check(`${style}/${format}: compile`, () => {
      assert.ok(["applied", "adapted"].includes(compiled.catalogCompilation?.status ?? ""));
      assert.equal(compiled.familyId, "editorial-poster");
      assert.equal(compiled.slides[0].headline, base.slides[0].headline);
      assert.equal(compiled.slides[0].subtext, base.slides[0].subtext);
      assert.equal(compiled.palette.background, base.palette.background);
      assert.equal(compiled.palette.accent, base.palette.accent);
      assert.equal(compiled.slides[0].suppressFamilyDecorations, true);
    });
    const payload = canvasModelToSavePayload(compiled, { inputType: "text", inputContent: "Contrato local" });
    const reopened = savedPostToCanvasModel({ id: 1, canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)) });
    check(`${style}/${format}: reopen`, () => {
      for (const key of ["catalogCompilation", "fontFamily", "subtextFontFamily", "headlineFontWeight", "subtextFontWeight", "headlineSizeScale", "subtextSizeScale", "headlineEffect", "subtextEffect", "palette"] as const)
        assert.deepEqual(reopened[key], compiled[key], key);
      for (const key of ["headlinePos", "subtextPos", "headlineWidth", "subtextWidth", "headlineScale", "subtextScale", "suppressFamilyDecorations"] as const)
        assert.deepEqual(reopened.slides[0][key], compiled.slides[0][key], key);
    });
    compiledCases.push({ style, format, status: compiled.catalogCompilation!.status });
  }
}
const s = selection("editorial");
const base = post("1:1");
const long = structuredClone(base);
long.slides[0].headline = "X".repeat(101);
const overLength = await compileCatalogPost(long, s);
check("copy overflow preserves conventional model", () => {
  assert.deepEqual(overLength.catalogCompilation?.reasons, ["content_length"]);
  const { catalogCompilation: _, ...unchanged } = overLength;
  assert.deepEqual(unchanged, long);
});
const noFit = structuredClone(s);
noFit.definition.pieces[0].box.height = 0.03;
noFit.definition.pieces[0].minFontSize = 44;
const doesNotFit = await compileCatalogPost(base, noFit);
check("geometric overflow falls back", () => assert.deepEqual(doesNotFit.catalogCompilation?.reasons, ["text_does_not_fit"]));
const imageRequired = structuredClone(s);
imageRequired.definition.media = "required";
const withoutImage = await compileCatalogPost(base, imageRequired);
check("missing required media falls back", () => assert.deepEqual(withoutImage.catalogCompilation?.reasons, ["missing_image"]));
const invalid = structuredClone(s.definition);
invalid.pieces[0].constraints.requires = ["absent"];
check("missing dependency rejected", () => assert.equal(catalogBlueprintSchema.safeParse(invalid).success, false));
invalid.pieces[0].constraints.requires = [];
invalid.pieces[0].constraints.conflictsWith = ["body"];
check("conflicting pieces rejected", () => assert.equal(catalogBlueprintSchema.safeParse(invalid).success, false));
const entry: CatalogEntry = { id: s.versionId, blueprintId: s.blueprintId, version: 1, contentHash: s.contentHash, definition: s.definition, status: "approved", createdAt: new Date().toISOString() };
const query = { text: "informar com hierarquia editorial", postMode: "static", format: "1:1", hasImage: false };
check("compatible approved blueprint retrieved", () => assert.deepEqual(rankCatalog([entry], query)[0].rejected, []));
check("draft never retrieved", () => assert.ok(rankCatalog([{ ...entry, status: "draft" }], query)[0].rejected.includes("not_approved")));
check("carousel rejected", () => assert.ok(rankCatalog([entry], { ...query, postMode: "carousel" })[0].rejected.includes("post_mode")));
check("deterministic ranking", () => assert.deepEqual(rankCatalog([entry], query), rankCatalog([entry], query)));
const output = "artifacts/design-catalog/contracts.json";
await mkdir("artifacts/design-catalog", { recursive: true });
await writeFile(output, JSON.stringify({ at: new Date().toISOString(), checks, compiledCases, limitations: ["Native Canvas metrics with generic fonts; no browser or Google Fonts validation", "Save/reopen adapters only; no post saved to database", "No LLM calls or content approvals"] }, null, 2));
console.log(JSON.stringify({ passed: checks.length, cases: compiledCases, report: output }));
