import { beforeEach, describe, expect, it, vi } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { INITIAL_POST } from "../../../client/src/pages/CanvasLab/components/types";
import { pinFixedDesign } from "./fixedDesignSource";

const db = vi.hoisted(() => ({
  getBrandProjectById: vi.fn(),
  getPostById: vi.fn(),
  getDb: vi.fn(),
}));
vi.mock("../../db", () => db);
vi.mock("../../mediaAssets", () => ({ loadOwnedMediaReference: vi.fn() }));
vi.mock("../../designCatalog/arsenalSave", () => ({ authorizeArsenalSaveModel: vi.fn() }));

const owner = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const artwork = {
  ...structuredClone(INITIAL_POST),
  aspectRatio: "9:16" as const,
  slides: [{ id: "cover", headline: "", subtext: "", step: "" }],
};

function request(postId: number, aspectRatio: "9:16" | "1:1" = "9:16") {
  return orchestratedGenerationInputSchema.parse({
    ownerId: owner,
    idempotencyKey: "artwork-briefing",
    inputType: "text",
    content: "Conteúdo novo para uma arte salva",
    platform: "instagram",
    aspectRatio,
    projectId,
    fixedDesign: { kind: "project", id: projectId, postId },
  });
}

describe("choosing a specific saved artwork", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.getBrandProjectById.mockResolvedValue({
      visual_preferences: { composition: '{"source":"design-extraction","postIds":[31,32]}' },
    });
    db.getPostById.mockResolvedValue({ id: 31, canvas_model: artwork });
  });

  it("pins only the chosen artwork and its saved revision", async () => {
    expect(await pinFixedDesign(request(31), owner)).toEqual({
      sourceId: `project:${projectId}:31`,
      revision: arsenalHash(artwork),
      canvas: artwork,
    });
    expect(db.getBrandProjectById).toHaveBeenCalledWith(projectId, owner);
    expect(db.getPostById.mock.calls).toEqual([[31, owner]]);
  });

  it("pins the untouched single-page source as the cover of a reviewed expansion", async () => {
    const carousel = orchestratedGenerationInputSchema.parse({
      ...request(31), postMode: "carousel", slideCount: 4, creationMode: "execution",
      artworkCarousel: { confirmedSparks: 0 },
      executionBrief: {
        creationMode: "execution", format: "carousel", platform: "instagram", rawInput: "Quatro slides de design.",
        interventionLevel: "light_optimize", contentSourceType: "carousel_topics",
      },
    });
    expect(await pinFixedDesign(carousel, owner)).toEqual({
      sourceId: `project:${projectId}:31`, revision: arsenalHash(artwork), canvas: artwork,
    });
    expect(db.getPostById.mock.calls).toEqual([[31, owner]]);
  });

  it("rejects an artwork outside the selected project's kit", async () => {
    await expect(pinFixedDesign(request(99), owner)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.getPostById).not.toHaveBeenCalled();
  });

  it("rejects a different format without substituting another artwork", async () => {
    await expect(pinFixedDesign(request(31, "1:1"), owner)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.getPostById.mock.calls).toEqual([[31, owner]]);
  });
});
