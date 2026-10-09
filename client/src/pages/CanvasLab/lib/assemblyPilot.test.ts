import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assets from "@shared/arsenalBundledAssets.json";
import kit from "@shared/assemblyPilotKit.json";
import {
  retrieveAssemblyPlans,
  assembleOffer,
  assemblyCandidateId,
  chooseAssemblyPlans,
} from "@shared/assemblyPilot";
import { arsenalOfferSchema } from "@shared/arsenalGeneration";
import { arsenalHash } from "@shared/arsenalContent";
import { setContentSource } from "@shared/arsenalContent";
import {
  fitAssistedContentEdit,
  fitAssistedEdit,
  guidedContentFields,
} from "./guidedComposition";
import {
  deriveVariableContentContract,
  type VariableContent,
} from "@shared/variableContent";
import {
  previewArsenalOffer,
  compileArsenalGeneration,
} from "./arsenalGenerationCompiler";
import {
  editArsenalElementText,
  putArsenalComposition,
} from "./arsenalComposition";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "./saveAdapter";
import { validateArsenalSaveModel } from "../../../../../server/designCatalog/arsenalSave";

vi.mock("./arsenalAssets", () => ({ ensureArsenalFont: async () => {} }));
const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document"
);
beforeAll(() => {
  for (const a of Object.values(assets)) {
    const bytes = readFileSync(`client/public${a.path}`);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(a.sha256);
    GlobalFonts.register(bytes, a.family);
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
const brief =
  "Desconto de 50%: acompanhe o histórico de preços e salve favoritos no BizuMiner.";
const content: VariableContent = {
  schemaVersion: 3,
  blocks: [
    {
      id: "h",
      type: "text",
      role: "headline",
      text: "50% de desconto. Sobre qual preço?",
    },
    {
      id: "b",
      type: "text",
      role: "body",
      text: "Compare o histórico real com o BizuMiner.",
    },
    {
      id: "c",
      type: "text",
      role: "callToAction",
      text: "Salve seus favoritos.",
    },
  ],
  caption:
    "Monitoramos os preços diariamente para você acompanhar os produtos que quiser.",
  hashtags: [],
};
describe("bounded assembly pilot", () => {
  it("edits individual fields without duplicating eyebrow/CTA or flattening supporting blocks", async () => {
    const source: VariableContent = {
      ...content,
      blocks: [
        { id: "e", type: "text", role: "eyebrow", text: "COMPRAS CONSCIENTES" },
        ...content.blocks,
      ],
    };
    const post = await previewArsenalOffer(
      assembleOffer(retrieveAssemblyPlans(brief).plans[0], source),
      source
    );
    const fields = guidedContentFields(source);
    expect(fields.find(f => f.label === "Texto de apoio")?.text).toBe(
      "Compare o histórico real com o BizuMiner."
    );
    const draft = structuredClone(source);
    setContentSource(
      draft,
      "content:h:text",
      "Antes dos 50%, confira o histórico."
    );
    const updated = fitAssistedContentEdit(post, draft).post!;
    expect(updated.slides[0].composition?.content).toEqual(draft);
    expect(draft.blocks.filter(b => b.id !== "h")).toEqual(
      source.blocks.filter(b => b.id !== "h")
    );
    const compatible = fitAssistedEdit(post, {
      headline: "Outro título",
      subtext: post.slides[0].subtext,
      caption: post.caption,
    }).post!;
    expect(
      (
        compatible.slides[0].composition!.content as VariableContent
      ).blocks.filter(b => b.id !== "h")
    ).toEqual(source.blocks.filter(b => b.id !== "h"));
  });
  it("preserves source recipes, searches 27 combinations and retrieves diverse modules", () => {
    for (const s of Object.values(kit.sources))
      expect(
        createHash("sha256").update(readFileSync(s.path)).digest("hex")
      ).toBe(s.sha256);
    const r = retrieveAssemblyPlans(brief);
    expect(r.searched).toBe(27);
    expect(r.plans).toHaveLength(5);
    expect(new Set(r.plans.map(p => p.module)).size).toBe(3);
    const used: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = chooseAssemblyPlans(
        r,
        assemblyCandidateId(r.plans[0]),
        used
      )[0];
      expect(used).not.toContain(p.module);
      used.push(p.module);
    }
    expect(chooseAssemblyPlans(r, "none", [])).toEqual([]);
    expect(
      retrieveAssemblyPlans("Arte e criatividade: ideias em movimento")
        .queryVector
    ).not.toEqual(r.queryVector);
  });
  it("compiles all shortlisted combinations using real font measurement and preserves edits/reopening", async () => {
    for (const plan of retrieveAssemblyPlans(brief).plans) {
      const offer = arsenalOfferSchema.parse(assembleOffer(plan, content));
      const post = await previewArsenalOffer(offer, content);
      const c = post.slides[0].composition!;
      expect(c.issues, plan.id).toEqual([]);
      expect(c.content).toEqual(content);
      const edited = editArsenalElementText(
        c,
        "text-0",
        "Verificar todos os dias"
      );
      const updated = putArsenalComposition(post, edited);
      validateArsenalSaveModel(updated);
      const payload = canvasModelToSavePayload(updated, {
        inputType: "text",
        inputContent: brief,
      });
      const reopened = savedPostToCanvasModel({
        id: 123,
        canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)),
      });
      expect(reopened.slides[0].composition).toEqual(edited);
      expect(reopened.slides[0].composition?.origin.assembly?.planId).toBe(
        plan.id
      );
    }
  });
  it("applies bundles through the real generation compiler without generic fallback", async () => {
    const r = retrieveAssemblyPlans(brief),
      used: string[] = [];
    for (let slot = 0; slot < 3; slot++) {
      const p = chooseAssemblyPlans(
        r,
        assemblyCandidateId(r.plans[0]),
        used
      )[0];
      used.push(p.module);
      const offer = assembleOffer(p, content);
      const post = await compileArsenalGeneration(
        {
          schemaVersion: 2,
          runId: "00000000-0000-4000-8000-000000000001",
          traceId: "00000000-0000-4000-8000-000000000001",
          slot,
          content,
          contentContract: deriveVariableContentContract(brief),
          userContentHash: arsenalHash(content),
          targetAspectRatio: "4:5",
          selection: "llm",
          candidates: [offer.candidate],
          pieces: offer.pieces,
          assets: offer.assets,
        },
        {
          deadline: performance.now() + 10000,
          assetDeadline: performance.now() + 5000,
        }
      );
      expect(post.slides[0].composition?.origin.assembly?.planId).toBe(p.id);
      expect(post.slides[0].composition?.issues).toEqual([]);
    }
  });
});
