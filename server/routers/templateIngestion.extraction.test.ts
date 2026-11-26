import { describe, expect, it, vi, beforeEach } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { templateIngestionRouter } from "./templateIngestion";
import * as db from "../db";
import * as designExtractionModule from "../designExtraction";
import * as publicUrlModule from "../publicUrl";
import * as studioAccess from "../studioAccess";
import { CREATIVE_DESIGN_EXTRACTION_VERSION, designExtractionSchema, type DesignExtraction } from "@shared/designExtraction";
import { REUNE_ARTWORKS, REUNE_DNA, REUNE_INTENTS } from "../../client/src/pages/TemplateIngestion/intentToCanvasModel.test";

const extraction: DesignExtraction = designExtractionSchema.parse({ dna: REUNE_DNA, intents: REUNE_INTENTS });
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

const callerFor = (role: "user" | "admin", id = "user-A") =>
  templateIngestionRouter.createCaller({
    user: { id, email: `${id}@example.com`, role } as any,
    req: {} as any,
    res: {} as any,
  });

describe("templateIngestion: extração de design com destinos separados", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(studioAccess, "requireProfessionalStudio").mockResolvedValue(undefined);
  });

  it("bloqueia extração em projeto que não pertence ao usuário", async () => {
    vi.spyOn(db, "getBrandProjectById").mockResolvedValueOnce(undefined);
    const spy = vi.spyOn(designExtractionModule, "extractDesignFromUrl");
    await expect(
      callerFor("user", "user-B").extractDesign({ projectId: PROJECT_ID, url: "https://example.com" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("consulta o projeto sempre com o dono vindo da sessão", async () => {
    const getProject = vi.spyOn(db, "getBrandProjectById").mockResolvedValueOnce({ id: PROJECT_ID } as any);
    vi.spyOn(publicUrlModule, "publicUrl").mockResolvedValueOnce(undefined as any);
    const extract = vi.spyOn(designExtractionModule, "extractDesignFromUrl").mockResolvedValueOnce({
      extraction,
      evidence: { fonts: ["Space Grotesk"], colors: [] },
      previewDataUrl: "data:image/png;base64,AAAA",
      sourceUrl: "https://example.com/",
    });
    const result = await callerFor("user", "user-A").extractDesign({
      projectId: PROJECT_ID, url: "https://example.com", model: "openai/gpt-6.2-sol",
    });
    expect(getProject).toHaveBeenCalledWith(PROJECT_ID, "user-A");
    expect(extract).toHaveBeenCalledWith("https://example.com", "desktop", "openai/gpt-6.2-sol", undefined);
    expect(result.extraction).toMatchObject({ intents: REUNE_INTENTS });
    expect(result.fontsDetected).toEqual(["Space Grotesk"]);
  });

  it("encaminha o modelo escolhido para a análise de uma imagem", async () => {
    vi.spyOn(db, "getBrandProjectById").mockResolvedValueOnce({ id: PROJECT_ID } as any);
    const artwork = { dna: REUNE_DNA, proposals: REUNE_ARTWORKS };
    const extract = vi.spyOn(designExtractionModule, "extractDesignFromScreenshot").mockResolvedValueOnce(artwork);
    const imageDataUrl = createCanvas(64, 64).toDataURL("image/png");

    const result = await callerFor("user").extractDesign({
      projectId: PROJECT_ID, imageDataUrl, model: "google/gemini-4-neon", version: CREATIVE_DESIGN_EXTRACTION_VERSION,
    });

    expect(extract).toHaveBeenCalledWith(expect.objectContaining({
      imageDataUrl, model: "google/gemini-4-neon", version: CREATIVE_DESIGN_EXTRACTION_VERSION,
    }));
    expect(result.extraction).toEqual(artwork);
  });

  it("rejeita modelos fora do seletor antes de iniciar a extração", async () => {
    const getProject = vi.spyOn(db, "getBrandProjectById");
    await expect(callerFor("user").extractDesign({
      projectId: PROJECT_ID,
      url: "https://example.com/",
      // @ts-expect-error Exercita a validação de uma entrada externa.
      model: "openrouter/auto",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getProject).not.toHaveBeenCalled();
  });

  it("não permite gravar a extração no projeto de outro usuário", async () => {
    vi.spyOn(db, "getBrandProjectById").mockResolvedValueOnce(undefined);
    const upsert = vi.spyOn(db, "upsertBrandProject");
    await expect(
      callerFor("user", "user-B").saveExtractionToProject({ projectId: PROJECT_ID, extraction, posts: [] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("grava o DNA só no projeto do dono, preservando os demais campos do projeto", async () => {
    vi.spyOn(db, "getBrandProjectById").mockResolvedValueOnce({
      id: PROJECT_ID, name: "Meu Projeto", niche: "Eventos", source_type: "form",
      structured_data: { offerAndTransformation: "x" }, compiled_document: "doc", is_default: false,
    } as any);
    const upsert = vi.spyOn(db, "upsertBrandProject").mockResolvedValueOnce({} as any);
    const out = await callerFor("user", "user-A").saveExtractionToProject({ projectId: PROJECT_ID, extraction, posts: [] });
    expect(out.projectId).toBe(PROJECT_ID);
    const arg = upsert.mock.calls[0][0];
    expect(arg.userUuid).toBe("user-A");
    expect(arg.name).toBe("Meu Projeto");
    expect(arg.structuredData).toEqual({ offerAndTransformation: "x" });
    expect(arg.visualPreferences?.fonts).toContain("Space Grotesk");
    expect(arg.visualPreferences?.colors).toHaveLength(6);
  });

  it("usuário comum não acessa a pré-visualização de família original", async () => {
    await expect(callerFor("user").previewOriginalFamilyDraft({ extraction })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin vê a versão sanitizada, sem marca nem textos da origem", async () => {
    const { sanitized } = await callerFor("admin", "admin-1").previewOriginalFamilyDraft({ extraction });
    const json = JSON.stringify(sanitized);
    expect(sanitized.dna.brandName).toBeNull();
    expect(json).not.toMatch(/ReUNE|reune|papelzinho|WhatsApp|amigo secreto/i);
    expect("intents" in sanitized && sanitized.intents.every(i => i.headline === "{{headline}}")).toBe(true);
    expect(sanitized.dna.palette.accent).toBe(REUNE_DNA.palette.accent);
  });

  it("sanitiza nomes, legendas e textos das propostas de arte para revisão de família", async () => {
    const { sanitized } = await callerFor("admin", "admin-1").previewOriginalFamilyDraft({
      extraction: { dna: REUNE_DNA, proposals: REUNE_ARTWORKS },
    });
    expect("proposals" in sanitized && sanitized.proposals).toHaveLength(5);
    expect(JSON.stringify(sanitized)).not.toMatch(/ReUNE|WhatsApp|sorteio/i);
    expect("proposals" in sanitized && sanitized.proposals[0].texts[0].text).toBe("{{headline}}");
  });
});
