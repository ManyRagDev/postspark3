import { previewSolidBackground } from "./guidedRefinements";
import { captureInitialVisuals } from "./guidedComposition";
import { applyCompositionAppearancePatch, applyCompositionBackgroundImage, reparentArsenalElement, shouldDeleteCanvasSelection } from "./compositionEditing";
import { applySlideVisualPatch } from "./slideVisualScope";
import { orderedArsenalNodes, arsenalWorldGeometry } from "./arsenalComposition";
import { compileArsenalGeneration } from "./arsenalGenerationCompiler";
import {
  deriveVariableContentContract,
  type VariableContent,
} from "@shared/variableContent";
import { contentListItems } from "@shared/arsenalContent";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import fixture from "../arsenal/windowFixture.json";
import assets from "@shared/arsenalBundledAssets.json";
import {
  arsenalCanonicalJson,
  arsenalHash,
  designContentGenerationSchema,
  designContentDocumentSchema,
} from "@shared/arsenalContent";
import {
  arsenalVariantSchema,
  catalogBundleV2Schema,
  readArsenalComposition,
} from "@shared/designArsenal";
import {
  compositionToRecipeV4,
  compositionToRecipeV5,
  compositionToPortableRecipe,
  readPortableArsenalRecipe,
  fixedV3ToV4,
} from "@shared/arsenalRecipe";
import {
  describe as describeDesign,
  distance,
} from "@shared/designDescriptors";
import {
  projectStructuralL1,
  projectedL1Distance,
} from "@shared/designDescriptorMetric";
import { validateArsenalSaveModel } from "../../../../../server/designCatalog/arsenalSave";
import {
  readArsenalMode,
  canSelectArsenalV2,
} from "../../../../../server/designCatalog/arsenalMode";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import {
  resolveArsenalComposition,
  editArsenalContent,
  editArsenalElementText,
  overrideArsenalElement,
  disableArsenalRelation,
  putArsenalComposition,
  projectArsenalFormat,
  arsenalTextLayout,
  upgradeCompositionToV3,
  addArsenalAuthorialLayer,
  updateArsenalAuthorialLayer,
  removeArsenalAuthorialLayer,
  duplicateArsenalAuthorialLayer,
  reorderArsenalLayer,
  hideArsenalInstance,
  setArsenalCustomBackground,
  setArsenalLogo,
  setArsenalElementEffect,
  addArsenalUserFont,
  releaseArsenalPropertyRelation,
} from "./arsenalComposition";
import { INITIAL_POST } from "../components/types";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "./saveAdapter";
import { duplicateSlide } from "./documentCommands";
import {
  createHistory,
  pushHistory,
  undoHistory,
  redoHistory,
} from "./canvasHistory";

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document"
);
beforeAll(() => {
  for (const a of Object.values(assets)) {
    const bytes = readFileSync(`client/public${a.path}`);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(a.sha256);
    expect(GlobalFonts.register(bytes, a.family)).toBeTruthy();
  }
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => createCanvas(20, 20) },
  });
});
afterAll(() => {
  if (originalDocument)
    Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
});
const get = (
  c: ReturnType<typeof createArsenalFixtureComposition>,
  id: string
) => c.elements.find(e => e.id === id)!;
const makePost = (c = createArsenalFixtureComposition()) =>
  putArsenalComposition(
    { ...structuredClone(INITIAL_POST), aspectRatio: "5:6" },
    c
  );

describe("arsenal M1 contracts and real native measurement", () => {
  it("hashes match standard SHA-256 including accents, astral characters and full fixture", () => {
    for (const value of [
      "",
      "Ação\n👩🏽‍💻",
      { z: null, a: [true, 3.864, "Verificar"] },
      fixture,
      fixture.variant,
    ])
      expect(arsenalHash(value)).toBe(
        createHash("sha256").update(arsenalCanonicalJson(value)).digest("hex")
      );
  });
  it("parses content, bundle, composition and model with pinned identity", () => {
    const c = createArsenalFixtureComposition();
    const bundle = catalogBundleV2Schema.parse({
      schemaVersion: 2,
      traceId: "m1",
      runId: "local",
      slot: 0,
      content: c.content,
      userContentHash: c.userContentHash,
      targetAspectRatio: "5:6",
      selection: "llm",
      candidates: [{ ...c.origin, variant: c.base }],
      pieces: c.pieces,
      assets: c.assets,
    });
    expect(bundle.candidates[0].candidateId).toBe(c.origin.candidateId);
    expect(readArsenalComposition(c).elements.length).toBe(69);
    validateArsenalSaveModel(makePost(c));
    expect(makePost(c).modelVersion).toBe(2);
  });
  it("preserves long/short/accents/breaks without cuts or automatic font reduction", () => {
    const c = createArsenalFixtureComposition(),
      original = get(c, "titulo-principal");
    for (const headline of [
      "Oi",
      "Verificar todos os dias",
      "Ação e criação\nTodos os dias",
      "Texto longo completo ".repeat(70),
    ]) {
      const next = editArsenalContent(c, { ...c.content, headline });
      expect(next.content.headline).toBe(headline);
      expect(get(next, "titulo-principal").text).toBe(headline);
      expect(get(next, "titulo-principal").fontSize).toBe(original.fontSize);
      expect(next.generatedContentHash).toBe(c.generatedContentHash);
      expect(next.contentRevision).toBe(1);
      expect(next.userContentHash).toBe(arsenalHash(next.content));
      expect(resolveArsenalComposition(next)).toEqual(next);
    }
    const long = editArsenalContent(c, {
      ...c.content,
      headline: "Texto muito longo ".repeat(80),
    });
    expect(long.issues.some(s => s.startsWith("overflow"))).toBe(true);
  });
  it("expands title surface and dependent flow; recreation never adds offsets", () => {
    const c = createArsenalFixtureComposition();
    const next = editArsenalContent(c, {
      ...c.content,
      headline: "Verificar todos os dias",
    });
    expect(get(next, "titulo-principal").height).toBeGreaterThan(
      get(c, "titulo-principal").height
    );
    expect(get(next, "titulo-janela").height).toBeGreaterThanOrEqual(
      get(c, "titulo-janela").height
    );
    expect(
      next.groups.find(g => g.id === "conteudo")!.y
    ).toBeGreaterThanOrEqual(c.groups.find(g => g.id === "conteudo")!.y);
    expect(resolveArsenalComposition(resolveArsenalComposition(next))).toEqual(
      next
    );
  });
  it("keeps a wide indivisible token intact and reports overflow", () => {
    const c = createArsenalFixtureComposition();
    const headline = "https://example.com/" + "segmento".repeat(30);
    const next = editArsenalContent(c, { ...c.content, headline });
    const element = get(next, "titulo-principal");
    const layout = arsenalTextLayout(element);
    expect(layout.lines).toHaveLength(1);
    expect(layout.lines[0].width).toBeGreaterThan(element.width);
    expect(next.issues).toContain("overflow:token:titulo-principal");
    expect(next.content.headline).toBe(headline);
  });
  it.each([4, 6, 7])(
    "keeps all %i list items, stable IDs and warns only on exceeded cardinality",
    count => {
      const c = createArsenalFixtureComposition();
      const items = Array.from({ length: count }, (_, i) => ({
        id: `item-${i + 1}`,
        text: `Item completo ${i + 1}`,
      }));
      const next = editArsenalContent(c, { ...c.content, items });
      const rows = next.elements.filter(e => e.bindingId === "binding-items");
      expect(rows.map(e => e.text)).toEqual(items.map(i => i.text));
      expect(next.issues.includes("cardinality:binding-items")).toBe(
        count === 7
      );
      expect(rows.map(e => e.itemId)).toEqual(items.map(i => i.id));
      expect(rows[0].id).toBe(c.elements.find(e => e.itemId === "item-1")!.id);
    }
  );
  it("supports editing beyond generation safety limits without losing saved text", () => {
    const content = {
      ...fixture.content,
      headline: "x".repeat(4001),
      items: Array.from({ length: 13 }, (_, i) => ({
        id: String(i),
        text: "x",
      })),
    };
    expect(designContentGenerationSchema.safeParse(content).success).toBe(
      false
    );
    expect(designContentDocumentSchema.parse(content).headline.length).toBe(
      4001
    );
    const c = editArsenalContent(createArsenalFixtureComposition(), content);
    expect(
      readArsenalComposition(JSON.parse(JSON.stringify(c))).content
    ).toEqual(content);
    const limit = {
      ...fixture.content,
      headline: "x".repeat(4000),
      body: "y".repeat(4000),
      caption: "z".repeat(4000),
      eyebrow: null,
      sectionLabel: null,
      callToAction: null,
      label: null,
      items: [],
    };
    expect(designContentGenerationSchema.safeParse(limit).success).toBe(true);
    expect(
      designContentGenerationSchema.safeParse({ ...limit, hashtags: ["x"] })
        .success
    ).toBe(false);
  });
  it("rejects partial snapshots or bound copy changed independently of canonical content", () => {
    const c = createArsenalFixtureComposition();
    const partial = structuredClone(c);
    partial.elements.pop();
    expect(() => readArsenalComposition(partial)).toThrow("incompleto");
    const altered = structuredClone(c);
    get(altered, "titulo-principal").text = "Copy cortada";
    expect(() => readArsenalComposition(altered)).toThrow("diverge");
  });
  it("rejects group/relationship cycles, invalid binding and shared ownership", () => {
    const v = structuredClone(fixture.variant);
    v.groups[0].parentId = v.groups[0].id as never;
    expect(arsenalVariantSchema.safeParse(v).success).toBe(false);
    const conflict = structuredClone(fixture.variant);
    conflict.relations.push({
      ...conflict.relations[0],
      id: "duplicate-writer",
    });
    expect(arsenalVariantSchema.safeParse(conflict).success).toBe(false);
    const cycle = structuredClone(fixture.variant);
    cycle.relations.find(r => r.id === "fit-titulo-principal")!.inputs = [
      "titulo",
    ] as never;
    expect(arsenalVariantSchema.safeParse(cycle).success).toBe(false);
    const bad = structuredClone(fixture.variant);
    bad.bindings[0].targetIds = ["absent"];
    expect(arsenalVariantSchema.safeParse(bad).success).toBe(false);
  });
  it("manual x disables only x; independent height and group padding still follow text", () => {
    const c = createArsenalFixtureComposition();
    const manual = overrideArsenalElement(c, "titulo-principal", { x: 92 });
    const fit = manual.relations.find(r => r.id === "fit-titulo-principal")!;
    expect(fit.enabled).toBe(true);
    expect(fit.outputs[0].properties).not.toContain("x");
    expect(fit.outputs[0].properties).toContain("height");
    const moved = overrideArsenalElement(manual, "titulo", {
      rotation: 11,
      x: 200,
    });
    const next = editArsenalContent(moved, {
      ...moved.content,
      headline: "Verificar todos os dias",
    });
    expect(get(next, "titulo-principal").x).toBe(92);
    expect(next.groups.find(g => g.id === "titulo")!.rotation).toBe(11);
    expect(get(next, "titulo-principal").height).toBeGreaterThan(
      get(c, "titulo-principal").height
    );
  });
  it("disabling list flow freezes every repeated item and does not lose other bindings", () => {
    const c = createArsenalFixtureComposition(),
      free = disableArsenalRelation(c, "list-flow");
    for (const e of c.elements.filter(e => e.itemId))
      expect(get(free, e.id).y).toBe(e.y);
    const row = free.elements.find(e => e.itemId === "item-1")!;
    const next = editArsenalElementText(
      free,
      row.id,
      "Item longo\ncom duas linhas"
    );
    expect(next.content.items[0].text).toBe("Item longo\ncom duas linhas");
    expect(
      get(next, free.elements.find(e => e.itemId === "item-2")!.id).y
    ).toBe(free.elements.find(e => e.itemId === "item-2")!.y);
  });
  it("format projection, save/reopen, undo/redo and duplication preserve full composition", () => {
    let c = overrideArsenalElement(createArsenalFixtureComposition(), "foto", {
      x: 480,
      rotation: 7,
    });
    c = {
      ...c,
      media: {
        "area-foto": {
          kind: "user",
          url: "data:image/png;base64,aA==",
          focalX: 0.2,
          focalY: 0.8,
        },
      },
    };
    const square = projectArsenalFormat(c, "1:1");
    expect(square.layoutOrigin).toBe("manual-projection");
    expect(square.origin).toEqual(c.origin);
    expect(square.overrides).toEqual(c.overrides);
    expect(square.media).toEqual(c.media);
    expect(projectArsenalFormat(square, "1:1")).toEqual(square);
    const p = { ...makePost(square), aspectRatio: "1:1" as const },
      payload = canvasModelToSavePayload(p, {
        inputType: "text",
        inputContent: "Test",
      });
    const reopened = savedPostToCanvasModel({
      id: 1,
      canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)),
    })!;
    expect(reopened.slides[0].composition).toEqual(square);
    const duplicate = duplicateSlide(p, 0);
    expect(duplicate.slides[1].composition).toEqual(square);
    expect(duplicate.slides[1].composition).not.toBe(square);
    const history = pushHistory(createHistory(makePost(c)), p);
    expect(undoHistory(history).present.slides[0].composition).toEqual(c);
    expect(
      redoHistory(undoHistory(history)).present.slides[0].composition
    ).toEqual(square);
  });
  it("portable V4 retains bindings, overrides and disabled relations; V3 has only fixed geometry", () => {
    const c = disableArsenalRelation(
      overrideArsenalElement(createArsenalFixtureComposition(), "foto", {
        rotation: 20,
      }),
      "list-flow"
    );
    expect(
      readPortableArsenalRecipe(
        JSON.parse(JSON.stringify(compositionToRecipeV4(c)))
      )
    ).toEqual(compositionToRecipeV4(c));
    const source = JSON.parse(
      readFileSync("harness/arsenalM1/testdata/fixed-v3.json", "utf8")
    );
    const v4 = fixedV3ToV4(source);
    expect(v4.representation).toBe("fixed-v3");
    if (v4.representation === "fixed-v3") {
      expect(v4.source).toEqual(readPortableArsenalRecipe(source));
      expect(v4.relations).toEqual([]);
    }
  });
  it("detects tampering and disallows asset paths supplied by client while flag off keeps save valid", () => {
    const c = createArsenalFixtureComposition();
    const broken = structuredClone(c);
    broken.content.headline = "Tampered";
    expect(() => readArsenalComposition(broken)).toThrow(/Hash/);
    const malicious = structuredClone(c);
    malicious.assets[0].id = "arbitrary-client-id";
    expect(() => validateArsenalSaveModel(makePost(malicious))).toThrow();
    expect(readArsenalMode(undefined)).toBe("off");
    expect(canSelectArsenalV2("user", "admin")).toBe(false);
    expect(canSelectArsenalV2("admin", "admin")).toBe(true);
    validateArsenalSaveModel(makePost(c));
  });
  it("preserves all historical structural-v1 descriptors and weighted L1 within 1e-5", () => {
    const index = JSON.parse(
      readFileSync("harness/arsenalM1/testdata/descriptor-corpus.json", "utf8")
    );
    const rows = index.entries.map((entry: any) => {
      const d = describeDesign(entry.input);
      expect(d.structure).toEqual(entry.structure);
      expect(d.style).toEqual(entry.style);
      expect(JSON.parse(JSON.stringify(d.components))).toEqual(
        entry.components
      );
      return d;
    });
    for (const a of rows)
      for (const b of rows)
        expect(
          Math.abs(
            projectedL1Distance(
              projectStructuralL1(a.structure),
              projectStructuralL1(b.structure)
            ) - distance(a, b).structural
          )
        ).toBeLessThanOrEqual(1e-5);
  });
});

describe("Conteúdo variável V3 no editor oficial", () => {
  const variable = (n: number) => ({
    schemaVersion: 3 as const,
    blocks: Array.from({ length: n }, (_, i) => ({
      id: `b${i}`,
      type: "text" as const,
      role: "body" as const,
      text: `Conselho ${i + 1} para o café`,
    })),
    caption: "Legenda",
    hashtags: ["#cafe"],
  });
  const compile = async (content: VariableContent, request: string) =>
    compileArsenalGeneration(
      {
        schemaVersion: 2,
        traceId: "00000000-0000-4000-8000-000000000010",
        runId: "00000000-0000-4000-8000-000000000010",
        slot: 0,
        content,
        contentContract: deriveVariableContentContract(request),
        userContentHash: arsenalHash(content),
        targetAspectRatio: "1:1",
        selection: "none",
        candidates: [],
        pieces: {},
        assets: [],
      },
      {
        deadline: performance.now() + 5000,
        assetDeadline: performance.now() + 1000,
      }
    );
  it("lista livre com 20 itens preserva edição, salvar/reabrir e arquivo portátil", async () => {
    const content: VariableContent = {
      ...variable(0),
      blocks: [
        {
          id: "free-list",
          type: "list",
          items: Array.from({ length: 20 }, (_, i) => ({
            id: `i${i}`,
            text: `Dica ${i}`,
          })),
        },
      ],
    };
    const post = await compile(content, "lista de dicas");
    const composition = post.slides[0].composition!;
    expect(composition.elements).toHaveLength(20);
    const edited = editArsenalElementText(
      composition,
      composition.elements[19].id,
      "Última dica editada"
    );
    const payload = canvasModelToSavePayload(
      putArsenalComposition(post, edited),
      { inputType: "text", inputContent: "lista de dicas" }
    );
    validateArsenalSaveModel(payload.canvasModel);
    const reopened = savedPostToCanvasModel({
      id: 1,
      canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)),
    })!;
    expect(reopened.slides[0].composition?.content).toEqual(edited.content);
    expect(reopened.slides[0].composition?.userContentHash).toBe(
      arsenalHash(edited.content)
    );
    const portable = readPortableArsenalRecipe(compositionToRecipeV4(edited));
    expect(portable.version).toBe(4);
    expect(
      contentListItems(edited.content, "content:free-list:items")
    ).toHaveLength(20);
  });
  it("1 e 15 blocos são renderizados e reabrem com os mesmos hashes", async () => {
    for (const n of [1, 15]) {
      const post = await compile(variable(n), `${n} elementos`);
      const c = post.slides[0].composition!;
      expect(c.elements.filter(e => e.kind === "text")).toHaveLength(n);
      expect(c.issues).toEqual([]);
      expect(c.content).toEqual(variable(n));
      const portable = readPortableArsenalRecipe(compositionToRecipeV4(c));
      expect(portable.version).toBe(4);
      expect(
        readArsenalComposition(JSON.parse(JSON.stringify(c))).userContentHash
      ).toBe(arsenalHash(variable(n)));
      const payload = canvasModelToSavePayload(post, {
        inputType: "text",
        inputContent: "Teste V3",
      });
      validateArsenalSaveModel(payload.canvasModel);
    }
  });
  it("lista de 15 itens vira 15 textos estáveis e edição direta atualiza só o item", async () => {
    const content: VariableContent = {
      ...variable(0),
      blocks: [
        {
          id: "list",
          type: "list",
          items: Array.from({ length: 15 }, (_, i) => ({
            id: `item${i}`,
            text: `Conselho ${i + 1}`,
          })),
        },
      ],
    };
    const post = await compile(content, "15 itens");
    const c = post.slides[0].composition!;
    expect(c.elements).toHaveLength(15);
    const first = c.elements[0];
    const next = editArsenalElementText(c, first.id, "Novo conselho");
    expect(contentListItems(next.content, "content:list:items")[0].text).toBe(
      "Novo conselho"
    );
    expect(next.elements[0].id).toBe(first.id);
    expect(next.elements).toHaveLength(15);
  });
  it("adicionar, excluir e reordenar recompõe bindings preservando overrides e fontes", async () => {
    const post = await compile(variable(1), "1 elemento");
    let c = post.slides[0].composition!;
    const first = c.elements[0];
    c = overrideArsenalElement(c, first.id, { fill: "#222222", fontSize: 30 });
    const content = variable(3);
    c = editArsenalContent(c, content);
    expect(c.elements).toHaveLength(3);
    expect(c.elements.find(e => e.id === first.id)).toMatchObject({
      fill: "#222222",
      fontSize: 30,
    });
    c = editArsenalContent(c, {
      ...content,
      blocks: [content.blocks[2], content.blocks[0]],
    });
    expect(c.elements.map(e => e.text)).toEqual([
      content.blocks[2].text,
      content.blocks[0].text,
    ]);
    expect(c.elements.find(e => e.id === first.id)).toMatchObject({
      fill: "#222222",
      fontSize: 30,
    });
    expect(
      readArsenalComposition(JSON.parse(JSON.stringify(c))).content
    ).toEqual(c.content);
  });
  it("texto extenso não desaparece: sinaliza ajuste e preserva integralmente", async () => {
    const content = {
      ...variable(1),
      blocks: [
        { ...variable(1).blocks[0], text: "Mensagem completa ".repeat(200) },
      ],
    };
    const post = await compile(content, "1 elemento");
    const c = post.slides[0].composition!;
    expect(c.state).toBe("needs_adjustment");
    expect(c.elements[0].text).toBe(content.blocks[0].text);
    expect(c.userContentHash).toBe(arsenalHash(content));
  });
  it("editar após projetar formato mantém identidade e geometria reabríveis", async () => {
    const post = await compile(variable(1), "1 elemento");
    const c = projectArsenalFormat(post.slides[0].composition!, "9:16");
    const next = editArsenalContent(c, variable(2));
    expect(next.effectiveAspectRatio).toBe("9:16");
    expect(next.projection).toEqual(c.projection);
    expect(
      readArsenalComposition(JSON.parse(JSON.stringify(next))).content
    ).toEqual(variable(2));
  });
  it("4:5 usa 1080×1350, projeta 5:6 sem distorcer e reabre com o mesmo hash", async () => {
    const post = await compile(variable(1), "1 elemento");
    const original = createArsenalFixtureComposition();
    const portrait = projectArsenalFormat(original, "4:5");
    expect(portrait.artboard).toMatchObject({ width: 1080, height: 1350 });
    expect(portrait.projection).toMatchObject({ scale: 1, x: 0, y: 27 });
    expect(portrait.origin).toEqual(original.origin);
    expect(portrait.userContentHash).toBe(original.userContentHash);
    const model = putArsenalComposition(
      { ...post, aspectRatio: "4:5" },
      portrait
    );
    const payload = canvasModelToSavePayload(model, {
      inputType: "text",
      inputContent: "4:5",
    });
    validateArsenalSaveModel(payload.canvasModel);
    const reopened = savedPostToCanvasModel({
      id: 1,
      canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)),
    })!;
    expect(reopened.aspectRatio).toBe("4:5");
    expect(reopened.slides[0].composition).toEqual(portrait);
    expect(original.artboard.height).toBe(1296);
    expect(
      readPortableArsenalRecipe(compositionToRecipeV4(portrait)).version
    ).toBe(4);
  });
});

describe("Composição V3, camadas autorais e comandos comuns (F2 / R09, R10, R12-R16, R20)", () => {
  it("upgradeCompositionToV3 eleva V2 para V3 preservando integridade e leitura canônica", () => {
    const v2 = createArsenalFixtureComposition();
    expect(v2.version).toBe(2);
    const v3 = upgradeCompositionToV3(v2);
    expect(v3.version).toBe(3);
    expect(v3.authorialLayers).toEqual([]);
    expect(v3.hiddenInstanceIds).toEqual([]);
    expect(readArsenalComposition(v3).version).toBe(3);
  });

  it("adiciona camada autoral de texto e imagem: resolve elementos, reabre e gera receita portátil V5", () => {
    const v2 = createArsenalFixtureComposition();
    const withText = addArsenalAuthorialLayer(v2, {
      id: "auth-text-1",
      kind: "text",
      zIndex: 100,
      parentId: null,
      x: 120,
      y: 200,
      width: 400,
      height: 60,
      rotation: 0,
      opacity: 1,
      text: "Camada autoral manual",
      fontSize: 28,
      fill: "#E5A93C",
    });
    expect(withText.version).toBe(3);
    expect(withText.authorialLayers.length).toBe(1);
    expect(withText.elements.some(e => e.id === "auth-text-1")).toBe(true);
    const read = readArsenalComposition(withText);
    expect(read.elements.find(e => e.id === "auth-text-1")?.text).toBe(
      "Camada autoral manual"
    );

    // Adiciona camada de imagem autoral
    const withImage = addArsenalAuthorialLayer(withText, {
      id: "auth-img-1",
      kind: "image",
      zIndex: 101,
      parentId: null,
      x: 120,
      y: 300,
      width: 200,
      height: 200,
      url: "https://example.com/authorial.png",
      opacity: 0.9,
    });
    expect(withImage.authorialLayers.length).toBe(2);
    expect(withImage.media["auth-img-1"]?.url).toBe(
      "https://example.com/authorial.png"
    );
    const readImg = readArsenalComposition(withImage);
    expect(readImg.elements.find(e => e.id === "auth-img-1")?.kind).toBe("media");

    // Receita portátil V5
    const recipeV5 = compositionToRecipeV5(withImage);
    expect(recipeV5.version).toBe(5);
    expect(recipeV5.representation).toBe("composition-v3");
    const portableRead = readPortableArsenalRecipe(recipeV5);
    expect(portableRead.version).toBe(5);
  });

  it("edição direta de texto e override em camada autoral preserva o documento", () => {
    const v2 = createArsenalFixtureComposition();
    const v3 = addArsenalAuthorialLayer(v2, {
      id: "auth-text-edit",
      kind: "text",
      zIndex: 90,
      parentId: null,
      x: 50,
      y: 50,
      width: 300,
      height: 50,
      text: "Antes da edição",
      fontSize: 24,
      fill: "#FFFFFF",
    });
    const edited = editArsenalElementText(v3, "auth-text-edit", "Depois da edição");
    expect(edited.elements.find(e => e.id === "auth-text-edit")?.text).toBe(
      "Depois da edição"
    );
    expect(readArsenalComposition(edited).elements.find(e => e.id === "auth-text-edit")?.text).toBe(
      "Depois da edição"
    );

    const overridden = overrideArsenalElement(edited, "auth-text-edit", {
      x: 80,
      fill: "#FF3366",
    });
    const readOverridden = readArsenalComposition(overridden);
    const el = readOverridden.elements.find(e => e.id === "auth-text-edit")!;
    expect(el.x).toBe(80);
    expect(el.fill).toBe("#FF3366");
  });

  it("duplica e remove camadas autorais gerando IDs únicos e preservando zIndex", () => {
    const v2 = createArsenalFixtureComposition();
    const v3 = addArsenalAuthorialLayer(v2, {
      id: "auth-card",
      kind: "rect",
      zIndex: 80,
      parentId: null,
      x: 100,
      y: 100,
      width: 250,
      height: 150,
      fill: "#221914",
    });
    const { composition: duplicated, newId } = duplicateArsenalAuthorialLayer(v3, "auth-card");
    expect(newId).not.toBe("auth-card");
    expect(duplicated.authorialLayers.length).toBe(2);
    expect(readArsenalComposition(duplicated).elements.some(e => e.id === newId)).toBe(true);

    const removed = removeArsenalAuthorialLayer(duplicated, "auth-card");
    expect(removed.authorialLayers.length).toBe(1);
    expect(removed.elements.some(e => e.id === "auth-card")).toBe(false);
    expect(readArsenalComposition(removed).elements.some(e => e.id === newId)).toBe(true);
  });

  it("oculta instância base: remove dos elementos, desativa relações dependentes e mantém hash base", () => {
    const v2 = createArsenalFixtureComposition();
    const baseInstanceId = v2.base.instances[0].id;
    const hidden = hideArsenalInstance(v2, baseInstanceId);
    expect(hidden.version).toBe(3);
    expect(hidden.hiddenInstanceIds).toContain(baseInstanceId);
    expect(hidden.elements.some(e => e.id === baseInstanceId)).toBe(false);
    // Base e hashes permanecem imutáveis
    expect(hidden.origin.variantHash).toBe(v2.origin.variantHash);
    expect(readArsenalComposition(hidden).elements.some(e => e.id === baseInstanceId)).toBe(false);
  });

  it("configura fundo customizado, logo, fontes do usuário e efeitos de legibilidade", () => {
    const v2 = createArsenalFixtureComposition();
    let c = setArsenalCustomBackground(v2, {
      fill: "#0A0D14",
      imageUrl: "https://example.com/bg.jpg",
      overlayOpacity: 0.6,
      overlayMode: "gradient-bottom",
    });
    expect(c.artboard.background).toBe("#0A0D14");
    expect(c.customBackground?.imageUrl).toBe("https://example.com/bg.jpg");

    c = setArsenalLogo(c, {
      url: "https://example.com/logo.png",
      position: "top-right",
      width: 80,
      height: 40,
    });
    expect(c.logo?.position).toBe("top-right");

    c = addArsenalUserFont(c, {
      family: "CustomBrandFont",
      url: "https://example.com/font.woff2",
      weight: 700,
    });
    expect(c.userFonts.some(f => f.family === "CustomBrandFont")).toBe(true);

    c = setArsenalElementEffect(c, v2.base.instances[0].id, {
      effect: "shadow",
      color: "#000000",
      blur: 8,
    });
    expect(c.effects[v2.base.instances[0].id]?.effect).toBe("shadow");

    expect(readArsenalComposition(c).version).toBe(3);
  });

  it("libera relação específica de propriedade (releaseArsenalPropertyRelation) sem perder geometria", () => {
    const v2 = createArsenalFixtureComposition();
    const relationWithOutputs = v2.relations.find(r => r.enabled && r.outputs.length > 0)!;
    const targetId = relationWithOutputs.outputs[0].targetId;
    const property = relationWithOutputs.outputs[0].properties[0];
    const initialElement = v2.elements.find(e => e.id === targetId)!;
    const initialVal = (initialElement as any)[property];

    const released = releaseArsenalPropertyRelation(v2, targetId, property);
    const updatedElement = released.elements.find(e => e.id === targetId)!;
    expect((updatedElement as any)[property]).toBe(initialVal);
    expect(readArsenalComposition(released).elements.find(e => e.id === targetId)![property as keyof typeof initialElement]).toBe(initialVal);
  });
});


describe("editor composition image and layer commands", () => {
  const addImage = (c = createArsenalFixtureComposition()) => addArsenalAuthorialLayer(c, {
    id: "editor-photo", kind: "image", url: "https://example.com/photo.png", parentId: null,
    zIndex: 100, x: 100, y: 140, width: 400, height: 300, rotation: 0, opacity: 1,
  });
  it("applies slide-scoped generated/uploaded background, preserves filters and clears on removal", () => {
    let post = makePost();
    const patch = applySlideVisualPatch(post, {bgImage: "/generated.png"}, false);
    let c = applyCompositionAppearancePatch(post, patch)!;
    expect(c.version === 3 && c.customBackground?.imageUrl).toBe("/generated.png");
    c = setArsenalCustomBackground(c, {focalX: 0.8, overlayOpacity: 0.3});
    c = setArsenalCustomBackground(c, {fill: "#123456"});
    expect(c.version === 3 && c.customBackground?.imageUrl).toBe("/generated.png");
    post = putArsenalComposition(post, c);
    c = applyCompositionAppearancePatch(post, applySlideVisualPatch(post, {bgImage: undefined}, false))!;
    post = putArsenalComposition(post, c);
    expect(c.version === 3 && c.customBackground?.imageUrl).toBeUndefined();
    expect(post.bgImage).toBe("");
    expect(post.slides[0].bgImage).toBe("");
    expect(c.version === 3 && c.customBackground?.focalX).toBe(0.8);
    expect(c.artboard.background).toBe("#123456");
  });
  it("orders root photos relative to groups and keeps child order independent", () => {
    const c = addImage();
    const group = c.groups.find(g => g.parentId === null)!;
    const first = reorderArsenalLayer(c, "editor-photo", "back");
    expect(orderedArsenalNodes(first, null)[0].id).toBe("editor-photo");
    const front = reorderArsenalLayer(first, "editor-photo", "front");
    expect(orderedArsenalNodes(front, null).at(-1)?.id).toBe("editor-photo");
    const raised = reorderArsenalLayer(front, group.id, "front");
    expect(orderedArsenalNodes(raised, null).at(-1)?.id).toBe(group.id);
    expect(orderedArsenalNodes(raised, group.id).map(e => e.id)).toEqual(orderedArsenalNodes(c, group.id).map(e => e.id));
    expect(readArsenalComposition(raised).version).toBe(3);
  });
  it("reparents a photo into a rotated group without changing its visible position", () => {
    let c = addImage();
    const group = c.groups[0];
    c = overrideArsenalElement(c, group.id, {rotation: 17, scale: 1.2});
    const before = arsenalWorldGeometry(c.elements.find(e => e.id === "editor-photo")!, c.groups);
    c = reparentArsenalElement(c, "editor-photo", group.id);
    const after = arsenalWorldGeometry(c.elements.find(e => e.id === "editor-photo")!, c.groups);
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y); expect(after.rotation).toBeCloseTo(before.rotation);
    c = reorderArsenalLayer(c, "editor-photo", "backward");
    expect(c.elements.find(e => e.id === "editor-photo")?.parentId).toBe(group.id);
    expect(readArsenalComposition(c).version).toBe(3);
  });
  it("removes the last image from canonical and projected data, supports undo and roundtrip", () => {
    const c = addImage();
    const initial = makePost(c);
    const changed = putArsenalComposition(initial, hideArsenalInstance(c, "editor-photo"));
    expect(changed.extraImages ?? []).toEqual([]); expect(changed.slides[0].extraImages).toEqual([]);
    expect(changed.slides[0].composition?.media["editor-photo"]).toBeUndefined();
    const history = pushHistory(createHistory(initial), changed);
    expect(undoHistory(history).present.slides[0].composition?.media["editor-photo"]?.url).toBe("https://example.com/photo.png");
    expect(readArsenalComposition(changed.slides[0].composition).elements.some(e => e.id === "editor-photo")).toBe(false);
  });
  it("updates image URL and geometry after inspector/drag overrides", () => {
    let c = overrideArsenalElement(addImage(), "editor-photo", {x: 222});
    c = updateArsenalAuthorialLayer(c, "editor-photo", {x: 300, url: "https://example.com/new-photo.png"});
    expect(c.elements.find(e => e.id === "editor-photo")?.x).toBe(300);
    expect(c.media["editor-photo"].url).toBe("https://example.com/new-photo.png");
  });
  it("does not delete an element while typing or interacting with a dialog", () => {
    const key = {key: "Delete", ctrlKey: false, metaKey: false, altKey: false, isComposing: false};
    const field = {closest: () => ({})} as HTMLElement;
    expect(shouldDeleteCanvasSelection(key, field)).toBe(false);
    expect(shouldDeleteCanvasSelection({...key, isComposing: true}, null)).toBe(false);
    expect(shouldDeleteCanvasSelection(key, null)).toBe(true);
  });
});

it("guided image/color preview preserves the composition and recovers former slide-only backgrounds", () => {
  const initial = makePost();
  const next = applyCompositionBackgroundImage(initial, "https://example.com/generated.png");
  expect(next.slides[0].composition?.base).toEqual(initial.slides[0].composition?.base);
  const c = next.slides[0].composition!;
  expect(c.version === 3 && c.customBackground?.imageUrl).toBe("https://example.com/generated.png");
  const colored = previewSolidBackground(next, "#123456", "#FFFFFF");
  expect(colored.slides[0].composition?.artboard.background).toBe("#123456");
  expect(colored.bgImage).toBe("");
  const legacy = structuredClone(initial);
  legacy.slides[0].bgImage = "https://example.com/previous-generation.png";
  const restored = captureInitialVisuals(legacy).slides[0].composition!;
  expect(restored.version === 3 && restored.customBackground?.imageUrl).toBe(legacy.slides[0].bgImage);
});

it("AC-04 (BUG-CL-008): putArsenalComposition preserves explicit root caption and hashtags", () => {
  const initial = makePost();
  // Usuário alterou a legenda global do documento
  const postWithCustomCaption: CanvasPostModel = {
    ...initial,
    caption: "Legenda customizada pelo usuário no Inspector",
    hashtags: ["#exclusivo", "#customizado"],
  };

  const comp = createArsenalFixtureComposition();
  // A composição possui caption default na chave content diferente da do post
  expect(comp.content.caption).toBe("Uma sequência para organizar seu próximo conteúdo.");
  expect(comp.content.caption).not.toBe(postWithCustomCaption.caption);

  // Ao realizar uma operação visual que passa por putArsenalComposition (ex: drag, color, slide secundário)
  const projected = putArsenalComposition(postWithCustomCaption, comp);

  // A legenda e hashtags do documento raiz NÃO são sobrescritas pela cópia da composição
  expect(projected.caption).toBe("Legenda customizada pelo usuário no Inspector");
  expect(projected.hashtags).toEqual(["#exclusivo", "#customizado"]);
});

it("BUG-CL-003: putArsenalComposition preserves root extras on multi-slide posts to prevent cross-slide leakage", () => {
  const initial = makePost();
  const multiSlidePost: CanvasPostModel = {
    ...initial,
    slides: [
      { ...initial.slides[0] },
      { ...initial.slides[0], id: "slide-2", extraTexts: undefined, extraImages: undefined },
    ],
    extraTexts: [{ id: "legacy-root-text", text: "Legacy Root", x: 10, y: 10, fontSize: 16, fill: "#000", fontFamily: "Inter" }],
  };

  const comp = createArsenalFixtureComposition();
  const compWithAuthorial = addArsenalAuthorialLayer(comp, {
    id: "cover-extra-text",
    kind: "text",
    text: "Cover Extra",
    x: 50,
    y: 50,
    width: 200,
    height: 40,
    rotation: 0,
    opacity: 1,
    zIndex: 10,
    fontFamily: "Inter",
    fontSize: 20,
    fontWeight: "normal",
    color: "#ff0000",
    textAlign: "left",
  });

  const projected = putArsenalComposition(multiSlidePost, compWithAuthorial);

  // O slide 0 recebe os extras autorais
  expect(projected.slides[0].extraTexts?.some(t => t.id === "cover-extra-text")).toBe(true);
  // O root extraTexts NÃO é sobrescrito pelos extras da capa no multi-slide, preservando isolamento e herança do slide 2
  expect(projected.extraTexts?.some(t => t.id === "legacy-root-text")).toBe(true);
  expect(projected.extraTexts?.some(t => t.id === "cover-extra-text")).toBe(false);
});

it("BUG-CL-017: putArsenalComposition adopts generated caption when root has INITIAL_POST template caption", () => {
  // Simula compileArsenalGeneration onde o post inicial ainda não possui composition no slide
  const postFromGeneration: CanvasPostModel = {
    ...structuredClone(INITIAL_POST),
    slides: [{ id: "s1", step: "", headline: "", subtext: "" }],
    caption: INITIAL_POST.caption,
  };

  const compWithGeneratedCaption = createArsenalFixtureComposition();
  compWithGeneratedCaption.content.caption = "CAPTION FROM GENERATED CONTENT";

  const projected = putArsenalComposition(postFromGeneration, compWithGeneratedCaption);

  // A caption gerada da composição deve ser adotada em vez de reter a caption de template do INITIAL_POST
  expect(projected.caption).toBe("CAPTION FROM GENERATED CONTENT");
});

it("BUG-CL-018: putArsenalComposition preserves explicit INITIAL_POST caption on existing composition across visual mutation", () => {
  const initial = makePost();
  // Post com composição existente e legenda explicitamente igual a INITIAL_POST.caption
  const postWithInitialCaption: CanvasPostModel = {
    ...initial,
    caption: INITIAL_POST.caption,
  };

  const compWithDifferentCaption = createArsenalFixtureComposition();
  compWithDifferentCaption.content.caption = "STALE COMPOSITION CAPTION";

  const projected = putArsenalComposition(postWithInitialCaption, compWithDifferentCaption);

  // A legenda deve permanecer INITIAL_POST.caption e NÃO ser substituída pela caption da composição
  expect(projected.caption).toBe(INITIAL_POST.caption);
});

it("BUG-CL-019: putArsenalComposition projects cover subtext to root instead of retaining INITIAL_POST.subtext", () => {
  const postWithoutSubtext: CanvasPostModel = {
    ...structuredClone(INITIAL_POST),
    slides: [{ id: "s1", step: "", headline: "", subtext: "" }],
    subtext: INITIAL_POST.subtext,
  };

  const compWithoutBody = createArsenalFixtureComposition();
  compWithoutBody.content = {
    schemaVersion: 3 as const,
    blocks: [{ id: "h", type: "text" as const, role: "headline" as const, text: "Café artesanal" }],
    caption: "",
    hashtags: [],
  };

  const projected = putArsenalComposition(postWithoutSubtext, compWithoutBody);

  expect(projected.slides[0].subtext).toBe("");
  expect(projected.subtext).toBe("");
});

it("BUG-CL-019: title-only Arsenal compilation does not retain demo subtext in post root", async () => {
  const content = {
    schemaVersion: 3 as const,
    blocks: [{ id: "title", type: "text" as const, role: "headline" as const, text: "Café da manhã" }],
    caption: "CAFÉ CAPTION",
    hashtags: ["cafe"],
  };
  const post = await compileArsenalGeneration(
    {
      schemaVersion: 2,
      traceId: "00000000-0000-4000-8000-000000000010",
      runId: "00000000-0000-4000-8000-000000000010",
      slot: 0,
      content,
      contentContract: deriveVariableContentContract("Um título"),
      userContentHash: arsenalHash(content),
      targetAspectRatio: "1:1",
      selection: "none",
      candidates: [],
      pieces: {},
      assets: [],
    },
    { deadline: performance.now() + 5000, assetDeadline: performance.now() + 1000 }
  );
  expect(post.slides[0].subtext).toBe("");
  expect(post.subtext).toBe("");
});

it("BUG-CL-020: putArsenalComposition initializes hashtags from composition when undefined and preserves defined hashtags", () => {
  const fixture = createArsenalFixtureComposition();
  const composition = editArsenalContent(fixture, {
    ...fixture.content,
    hashtags: ["#cafe", "#artesanal"],
  });

  // Caso 1: hashtags undefined na raiz -> adota da composição
  const postUndefinedHashtags: CanvasPostModel = {
    ...structuredClone(INITIAL_POST),
    hashtags: undefined,
    currentSlideIndex: 0,
    slides: [{ id: "s", step: "", headline: "", subtext: "" }],
  };
  const projectedInitialized = putArsenalComposition(postUndefinedHashtags, composition);
  expect(projectedInitialized.hashtags).toEqual(["#cafe", "#artesanal"]);

  // Caso 2: hashtags já definidas na raiz (inclusive []) -> preserva autoridade da raiz
  const postEmptyHashtags: CanvasPostModel = {
    ...postUndefinedHashtags,
    hashtags: [],
  };
  const projectedEmpty = putArsenalComposition(postEmptyHashtags, composition);
  expect(projectedEmpty.hashtags).toEqual([]);

  const postExistingHashtags: CanvasPostModel = {
    ...postUndefinedHashtags,
    hashtags: ["#global"],
  };
  const projectedExisting = putArsenalComposition(postExistingHashtags, composition);
  expect(projectedExisting.hashtags).toEqual(["#global"]);
});




