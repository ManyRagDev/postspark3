import { describe, expect, it } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { INITIAL_POST, type CanvasPostModel } from "../../../client/src/pages/CanvasLab/components/types";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "../../../client/src/pages/CanvasLab/lib/saveAdapter";
import { generateArtworkCarousel } from "./artworkCarousel";

const projectId = "22222222-2222-4222-8222-222222222222";
const runId = "33333333-3333-4333-8333-333333333333";
const owner = "11111111-1111-4111-8111-111111111111";
const canvas: CanvasPostModel = {
  ...structuredClone(INITIAL_POST),
  id: "original-art",
  familyName: "Cartaz da oficina",
  aspectRatio: "4:5",
  fontFamily: "Space Grotesk",
  slides: [{
    id: "cover", headline: "", subtext: "", step: "", suppressFamilyDecorations: true,
    extraShapes: [{ id: "cover-box", x: 20, y: 20, width: 320, height: 310, color: "#151515" }],
    extraTexts: [
      { id: "brand", text: "Oficina", contentRole: "brand", x: 26, y: 28, width: 160, fontSize: 13 },
      { id: "title", text: "Capa antiga", contentRole: "headline", x: 26, y: 112, width: 300, fontSize: 27 },
    ],
  }],
};
const rawInput = "Crie um carrossel de 3 slides sobre uma oficina de desenho de pássaros.";
const input = orchestratedGenerationInputSchema.parse({
  ownerId: owner, projectId, idempotencyKey: runId, inputType: "text", platform: "instagram",
  fixedDesign: { kind: "project", id: projectId, postId: 31 },
  artworkCarousel: { confirmedSparks: 0 }, aspectRatio: "4:5", postMode: "carousel", slideCount: 3,
  creationMode: "execution", executionBrief: {
    creationMode: "execution", format: "carousel", platform: "instagram", contentSourceType: "carousel_topics",
    interventionLevel: "light_optimize", rawInput,
  },
  content: rawInput,
});
const proposal = (text: string, x: number, y: number, color: string) => ({
  name: text, rationale: "Papel e grafismos", caption: "",
  background: { color, kind: "solid" },
  texts: [{ role: "headline", text, color: "#111111", fontSize: 25, box: { x, y, width: 0.60, height: 0.30 } }],
  shapes: [{ fill: "#FFAA33", box: { x: 0.03, y: 0.10, width: 0.22, height: 0.12 } }],
});

describe("carousel from a saved design", () => {
  it("replaces duplicate layouts, retains the cover geometry and reopens all editable pages", async () => {
    const keys: string[] = [];
    const modelCalls: string[] = [];
    const journal = new Map<string, unknown>();
    const first = proposal("Observe o pássaro", 0.08, 0.35, "#FFFFFF");
    const last = proposal("Comece o desenho", 0.29, 0.58, "#F2CF87");
    const revision = arsenalHash(canvas);
    const runArgs: Parameters<typeof generateArtworkCarousel>[0] = {
      pin: { canvas, revision, sourceId: `project:${projectId}:31` },
      input, runId, source: "Oficina de desenho para iniciantes.",
      signal: new AbortController().signal, deadline: Date.now() + 30_000,
      operation: async <T>(key: string, work: () => Promise<T>) => {
        if (journal.has(key)) return structuredClone(journal.get(key)) as T;
        keys.push(key);
        const result = await work();
        journal.set(key, structuredClone(result));
        return result;
      },
      generate: async options => {
        const name = options.response_format?.json_schema?.name!;
        modelCalls.push(name);
        const replies: Record<string, unknown> = {
          artwork_carousel_plan: { visualDirection: "Grafismos discretos e tipografia marcante.", pages: [
            { purpose: "Convite", content: "Desenhe pássaros", composition: "Use a capa." },
            { purpose: "Observação", content: "Veja a silhueta", composition: "Formato aberto." },
            { purpose: "Ação", content: "Comece o desenho", composition: "Aproxime o título do rodapé." },
          ] },
          fixed_design_copy: { values: [{ id: "0:title", text: "Desenhe pássaros" }], caption: "" },
          fixed_design_review: { issues: [] },
          artwork_carousel_compose: { slides: [first, { ...first, name: "Repete o layout" }], caption: "Desenhe pássaros em três etapas." },
          artwork_carousel_repair: { slides: [first, last], caption: "Desenhe pássaros em três etapas." },
          artwork_carousel_review_repair: { issues: [] },
        };
        return { choices: [{ message: { content: JSON.stringify(replies[name]) } }] } as Awaited<ReturnType<NonNullable<typeof runArgs.generate>>>;
      },
    };
    const result = await generateArtworkCarousel(runArgs);
    expect(keys).toEqual(["artwork_carousel_plan", "copy", "review", "artwork_carousel_compose", "artwork_carousel_repair", "artwork_carousel_review_repair"]);
    expect(result).toMatchObject({ id: `design-${runId}-0`, familyName: canvas.familyName, aspectRatio: canvas.aspectRatio });
    expect(result.slides[0].extraShapes).toEqual(canvas.slides[0].extraShapes);
    expect(result.slides[0].extraTexts?.[1]).toMatchObject({ text: "Desenhe pássaros", x: 26, y: 112, width: 300 });
    expect(result.slides.slice(1).map(slide => slide.extraTexts?.[0].text)).toEqual(["Observe o pássaro", "Comece o desenho"]);
    expect(result.slides[2].visualStyle?.palette?.background).toBe("#F2CF87");
    const saved = canvasModelToSavePayload(result, { inputType: "text", inputContent: rawInput });
    expect(saved.postMode).toBe("carousel");
    const reopened = savedPostToCanvasModel({ ...saved, id: 41, canvas_model: saved.canvasModel });
    const authoredSlides = (model: CanvasPostModel) => model.slides.map(({ step: _defaultLabel, ...slide }) =>
      JSON.parse(JSON.stringify(slide)));
    expect(authoredSlides(reopened)).toEqual(authoredSlides(result));
    expect(arsenalHash(canvas)).toBe(revision);
    expect(await generateArtworkCarousel(runArgs)).toEqual(result);
    expect(modelCalls).toHaveLength(6);
  });
});
