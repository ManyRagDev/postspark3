import { expect, it, vi } from "vitest";
import { identityFixture } from "@shared/visualIdentity.fixture";
import { arsenalHash } from "@shared/arsenalContent";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { readArsenalComposition } from "@shared/designArsenal";
import { INITIAL_POST } from "../../../client/src/pages/CanvasLab/components/types";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "../../../client/src/pages/CanvasLab/lib/saveAdapter";
import {
  editArsenalContent,
  putArsenalComposition,
} from "../../../client/src/pages/CanvasLab/lib/arsenalComposition";
import { generateIdentityCanvas } from "./identityCanvas";
import { isPaidGenerationOperation } from "./generationJournalTrace";

const owner = "11111111-1111-4111-8111-111111111111";
export const identityPlanFixture = {
  background: "#FFFFFF",
  text: "#111111",
  accent: "#226633",
  headingFont: "Inter",
  bodyFont: "Inter",
  margin: 64,
  gap: 32,
  align: "left",
  pages: [
    { layout: "stacked", decoration: "line" },
    { layout: "centered", decoration: "none" },
  ],
};
export function identityRequestFixture() {
  const pages = [
    "Uma ideia pronta\nTexto com acentuação, números 123 e pontuação!",
    "Segundo slide\nO conteúdo vem exatamente como foi escrito.",
  ];
  const input = orchestratedGenerationInputSchema.parse({
    ownerId: owner,
    inputType: "text",
    content: "Slide 1: " + pages[0] + "\nSlide 2: " + pages[1],
    postMode: "carousel",
    platform: "instagram",
    slideCount: 2,
    aspectRatio: "4:5",
    projectId: owner,
    fixedDesign: { kind: "identity", id: owner },
    idempotencyKey: "identity-test",
    creationMode: "execution",
    executionBrief: {
      creationMode: "execution",
      format: "carousel",
      platform: "instagram",
      rawInput: pages.join("\n"),
      interventionLevel: "visual_only",
      contentSourceType: "carousel_slides",
      slides: pages.map((rawText, index) => ({
        slideNumber: index + 1,
        rawText,
      })),
    },
  });
  const canvas = structuredClone(INITIAL_POST);
  const pin = {
    sourceId: "identity-test",
    canvas,
    revision: arsenalHash(canvas),
    identity: identityFixture({
      accent: "#E85D04",
      headingFont: "Fonte ausente",
      margin: 72,
    }),
  };
  return { input, pin, pages };
}

it("composes literal slides with actual font metrics, preserves identity and survives editing/save/reopen", async () => {
  const { input, pin, pages } = identityRequestFixture();
  const generate = vi.fn(async () => ({
    choices: [{ message: { content: JSON.stringify(identityPlanFixture) } }],
  }));
  const render = vi.fn(async args =>
    args.compositions.map((_: unknown, i: number) => ({
      slideIndex: i,
      renderer: "CanvasPostStage",
      width: 864,
      height: 1080,
      dataUri: "data:image/png;base64,test",
    }))
  );
  const post = await generateIdentityCanvas({
    input,
    pin,
    owner,
    runId: "request-test",
    source: input.content,
    signal: new AbortController().signal,
    deadline: Date.now() + 60000,
    operation: async (_key, work) => work(),
    generate: generate as any,
    render: render as any,
  });
  expect(generate).toHaveBeenCalledTimes(1); // layout only; literal content never passes through a writer
  expect(render).toHaveBeenCalledTimes(1);
  expect(
    post.slides.map(s =>
      s
        .composition!.elements.filter(e => e.kind === "text")
        .map(e => e.text)
        .join("")
    )
  ).toEqual(pages);
  expect(post.palette.accent).toBe("#E85D04");
  expect(post.visualIdentityUsage!.appearance.margin).toBe(72);
  expect(post.visualIdentityUsage!.appearance.warnings.join()).toContain(
    "Foi ajustado para Inter"
  );
  expect(pin.identity.rules.background).toBeNull();
  post.slides.forEach(s =>
    expect(readArsenalComposition(s.composition).issues).toEqual([])
  );
  const scene = post.slides[0].composition!;
  const edited = putArsenalComposition(
    post,
    editArsenalContent(scene, { ...scene.content, headline: "Título editado" })
  );
  const saved = canvasModelToSavePayload(edited, {
    inputType: "text",
    inputContent: input.content,
  });
  const reopened = savedPostToCanvasModel({
    id: 42,
    canvas_model: saved.canvasModel,
  });
  expect(reopened.visualIdentityUsage).toEqual(post.visualIdentityUsage);
  expect(reopened.slides.map(s => s.composition)).toEqual(
    edited.slides.map(s => s.composition)
  );
  expect(reopened.slides[0].headline).toBe("Título editado");
  expect(post.slides[0].headline).toBe("Uma ideia pronta");
});

it("refuses page count changes and overflow rather than rewriting literal content", async () => {
  const { input, pin } = identityRequestFixture();
  input.slideCount = 3;
  const generate = vi.fn();
  await expect(
    generateIdentityCanvas({
      input,
      pin,
      owner,
      runId: "bad",
      source: "",
      signal: new AbortController().signal,
      deadline: Date.now() + 60000,
      operation: async (_key, work) => work(),
      generate,
    })
  ).rejects.toThrow("quantidade de slides");
  expect(generate).not.toHaveBeenCalled();
  input.slideCount = 2;
  input.executionBrief!.slides![0].rawText = "Texto longo demais. ".repeat(350);
  generate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(identityPlanFixture) } }],
  });
  const render = vi.fn();
  await expect(
    generateIdentityCanvas({
      input,
      pin,
      owner,
      runId: "overflow",
      source: "",
      signal: new AbortController().signal,
      deadline: Date.now() + 60000,
      operation: async (_key, work) => work(),
      generate,
      render,
    })
  ).rejects.toThrow("não cabe com legibilidade");
  expect(render).not.toHaveBeenCalled();
});

it("marks identity inference operations as paid journal effects", () => {
  for (const key of ["identity_plan", "identity_copy", "identity_review"])
    expect(isPaidGenerationOperation(`proposal:${key}`)).toBe(true);
});
