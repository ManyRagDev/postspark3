/** Actual exported recipes -> Admin2 draft -> compiler, with embedded fonts and native metrics. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { recreationRecipeSchema } from "../../shared/designRecreation";
import { catalogBlueprintSchema } from "../../shared/designCatalog";
import {
  draftFromRecipe,
  manualCatalogDraft,
  suggestRecipeGroups,
} from "../../client/src/pages/Admin2/catalogDraft";
import { compileCatalogPost } from "../../client/src/pages/CanvasLab/lib/catalogCompiler";
import { INITIAL_POST } from "../../client/src/pages/CanvasLab/components/types";
import { contentHash } from "../../server/designCatalog/store";

const source = "artifacts/design-recreation/2026-09-30T02-19-47-618Z";
const output = "artifacts/design-catalog/grouped-references";
const manifest = JSON.parse(
  await readFile("artifacts/design-recreation/next-selection.json", "utf8")
);
const cases: Array<{
  id: string;
  headline: string;
  body: string;
  recipePath?: string;
  originalPath?: string;
}> = [
  { id: "typography", headline: "headline-line-2", body: "body-2-line-1" },
  {
    id: "photo-ribbons",
    headline: "linha_criar_conteudo",
    body: "linha_seria_esse_aqui",
  },
  { id: "paper-surface", headline: "title_questions", body: "subtitle" },
  { id: "layered-cards", headline: "texto-challenge", body: "texto-elearning" },
  {
    id: "brutalism",
    headline: "titulo-brutal",
    body: "subtitulo-graphic-design",
    recipePath: "/home/many/Downloads/postspark-admin2-306b5602.json",
    originalPath:
      "/home/many/Downloads/sources postspark/14516d3436422c5c9d3a85e85b95b22a.jpg",
  },
  {
    id: "creative-people",
    headline: "creative_text",
    body: "this_is_the_text",
    recipePath: "/home/many/Downloads/postspark-admin2-41a9ed0a.json",
    originalPath:
      "/home/many/Downloads/sources postspark/0ee1f7691aaa5e28cfd0eb2c8a36cb23.jpg",
  },
  {
    id: "torn-paper",
    headline: "headline",
    body: "paper_subtitle",
    recipePath: "/home/many/Downloads/postspark-admin2-d160ef79.json",
    originalPath:
      "/home/many/Downloads/sources postspark/ed6e7942b198ca4ef238d0818c913535.jpg",
  },
];
const fonts = new Map<string, Buffer>();
// Network is replaced by the bytes embedded in the real exported recipes.
// This checks layout with actual font files, NOT browser FontFace or Google availability.
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: {
    createElement: (tag: string) => {
      assert.equal(tag, "canvas");
      return createCanvas(1, 1);
    },
    fonts: { add: () => {} },
  },
});
Object.defineProperty(globalThis, "FontFace", {
  configurable: true,
  value: class {
    constructor(
      private family: string,
      private data: ArrayBuffer
    ) {}
    async load() {
      assert.ok(
        GlobalFonts.register(Buffer.from(this.data), this.family),
        `Font registration: ${this.family}`
      );
      return this;
    }
  },
});
globalThis.fetch = async input => {
  const url = new URL(String(input));
  if (url.hostname === "fonts.googleapis.com") {
    const [family, weight] = (url.searchParams.get("family") ?? "").split(
      ":wght@"
    );
    const key = `${family}:${weight}`;
    if (!fonts.has(key))
      return new Response("Embedded font missing", { status: 404 });
    return new Response(
      `@font-face {src: url(https://fonts.gstatic.com/probe/${encodeURIComponent(key)});}`
    );
  }
  if (
    url.hostname === "fonts.gstatic.com" &&
    url.pathname.startsWith("/probe/")
  ) {
    const bytes = fonts.get(decodeURIComponent(url.pathname.slice(7)));
    return bytes
      ? new Response(new Uint8Array(bytes))
      : new Response("Missing", { status: 404 });
  }
  throw new Error("Unexpected network request in offline probe");
};
await mkdir(output, { recursive: true });
const results = [];
const checks: string[] = [];
const check = (label: string, action: () => void) => {
  action();
  checks.push(label);
};
check(
  "old blueprint parsing preserves its content hash and omits extraction",
  () => {
    const original = manualCatalogDraft();
    const parsed = catalogBlueprintSchema.parse(original);
    assert.equal(contentHash(parsed), contentHash(original));
    assert.equal(Object.hasOwn(parsed, "extraction"), false);
  }
);
for (const item of cases) {
  const original = item.originalPath
    ? { sourcePath: item.originalPath }
    : manifest.cases.find((entry: any) => entry.id === item.id);
  const originalHash = createHash("sha256")
    .update(await readFile(original.sourcePath))
    .digest("hex");
  if (original.sha256)
    assert.equal(originalHash, original.sha256, "Original image changed");
  const recipe = recreationRecipeSchema.parse(
    JSON.parse(
      await readFile(
        item.recipePath ?? `${source}/${item.id}-baseline.json`,
        "utf8"
      )
    )
  );
  assert.equal(recipe.scene.source.originalHash, originalHash);
  for (const font of recipe.scene.fonts) {
    if (!font.dataUrl) continue;
    const bytes = Buffer.from(font.dataUrl.split(",")[1], "base64");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), font.sha256);
    fonts.set(`${font.family}:${font.weight}`, bytes);
  }
  const before = JSON.stringify(recipe);
  const groups = suggestRecipeGroups(recipe);
  const draft = draftFromRecipe(recipe, groups.headlineIds, groups.bodyIds);
  check(
    `${item.id}: original recipe unchanged; groups saved without literal text`,
    () => {
      assert.equal(JSON.stringify(recipe), before);
      assert.deepEqual(draft.extraction?.headlineLayerIds, groups.headlineIds);
      assert.deepEqual(draft.extraction?.bodyLayerIds, groups.bodyIds);
      assert.ok(draft.pieces.every(p => !Object.hasOwn(p, "text")));
      assert.equal(draft.formats.length, 1);
      const [a, b] = draft.pieces.map(p => p.box);
      const overlap =
        Math.max(
          0,
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        ) *
        Math.max(
          0,
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        );
      assert.equal(overlap, 0);
    }
  );
  if (item.id === "creative-people")
    check(
      "Creative People: complete title, ABOUT preserved, scene reserved, texture not a card",
      () => {
        assert.deepEqual(groups.headlineIds, ["creative_text", "people_text"]);
        assert.ok(groups.bodyIds.includes("about_text"));
        assert.ok(groups.ignored.some(l => l.id === "next_slide_text"));
        assert.equal(draft.pieces[0].effect, "outline");
        assert.equal(draft.pieces[1].effect, "strip-line");
        assert.equal(draft.extraction?.mediaAreas[0].placement, "reserved");
      }
    );
  if (item.id === "brutalism")
    check(
      "Brutalism: both title lines, new body area, illustrations retained as guides",
      () => {
        assert.deepEqual(groups.headlineIds, ["titulo-brutal", "titulo-ism"]);
        assert.equal(draft.extraction?.inferredBodyArea, true);
        assert.equal(draft.extraction?.mediaAreas.length, 2);
        assert.equal(draft.pieces[0].effect, "none");
      }
    );
  if (item.id === "torn-paper")
    check(
      "Torn paper: footer ignored, local paper associated, manual restoration works",
      () => {
        assert.ok(groups.ignored.some(l => l.id === "bottom_line"));
        assert.equal(draft.pieces[1].effect, "box-card");
        const restored = draftFromRecipe(recipe, groups.headlineIds, [
          "paper_subtitle",
          "bottom_line",
        ]);
        assert.ok(restored.extraction?.bodyLayerIds.includes("bottom_line"));
        assert.ok(
          !restored.extraction?.ignoredLayerIds.includes("bottom_line")
        );
        assert.throws(() =>
          draftFromRecipe(recipe, ["headline"], ["headline"])
        );
      }
    );
  await writeFile(
    `${output}/${item.id}-draft.json`,
    JSON.stringify(draft, null, 2)
  );
  const parsed = catalogBlueprintSchema.safeParse(draft);
  const samples = [];
  if (parsed.success) {
    for (const format of draft.formats) {
      for (const copy of [
        {
          id: "short",
          headline: "Crie com intenção",
          subtext: "Dê clareza à mensagem.",
        },
        {
          id: "medium",
          headline: "Uma ideia merece um bom design",
          subtext:
            "Organize sua mensagem com hierarquia, contraste e espaço para respirar.",
        },
      ]) {
        const compiled = await compileCatalogPost(
          {
            ...structuredClone(INITIAL_POST),
            aspectRatio: format,
            headline: copy.headline,
            subtext: copy.subtext,
            slides: [
              {
                id: "s1",
                step: "",
                headline: copy.headline,
                subtext: copy.subtext,
              },
            ],
            currentSlideIndex: 0,
          },
          {
            traceId: randomUUID(),
            versionId: randomUUID(),
            blueprintId: randomUUID(),
            version: 1,
            contentHash: contentHash(parsed.data),
            definition: parsed.data,
            selection: "llm",
            preserveBrandFonts: false,
          }
        );
        check(`${item.id}/${copy.id}: explicit compilation outcome`, () => {
          assert.ok(
            ["applied", "adapted", "fallback"].includes(
              compiled.catalogCompilation?.status ?? ""
            )
          );
          if (copy.id === "short")
            assert.notEqual(compiled.catalogCompilation?.status, "fallback");
          assert.equal(compiled.slides[0].headline, copy.headline);
          assert.equal(compiled.slides[0].subtext, copy.subtext);
        });
        samples.push({
          format,
          copy: copy.id,
          status: compiled.catalogCompilation?.status,
          reasons: compiled.catalogCompilation?.reasons,
        });
      }
    }
  }
  results.push({
    id: item.id,
    original: original.sourcePath,
    originalHash,
    layers: groups,
    formats: draft.formats,
    mediaAreas: draft.extraction?.mediaAreas,
    schemaValid: parsed.success,
    issues: parsed.success
      ? []
      : parsed.error.issues.map(issue => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
    pieces: draft.pieces.map(p => ({
      role: p.role,
      box: p.box,
      font: p.fontFamily,
      size: p.fontSize,
      effect: p.effect,
    })),
    samples,
    limitations: draft.limitations,
  });
}
await writeFile(
  `${output}/report.json`,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      checks,
      results,
      method:
        "Existing LLM recipes, original hashes, embedded font hashes, production draftFromRecipe/compileCatalogPost; native Canvas measurement with offline font transport.",
      limitations: [
        "Automatically suggested groups; curator review still required",
        "No fresh decoding, browser, real generation, database save or approval",
        "Native surface approximations, empty media areas, no internal mixed typography",
        "Only the declared nearest format; not comparable to the old 36-case denominator",
      ],
    },
    null,
    2
  )
);
console.log(
  JSON.stringify(
    results.map(r => ({
      id: r.id,
      schemaValid: r.schemaValid,
      issues: r.issues,
      samples: r.samples,
    })),
    null,
    2
  )
);
