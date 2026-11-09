import { describe, expect, it, vi, beforeEach } from "vitest";
import { templateIngestionRouter } from "./templateIngestion";
import * as db from "../db";
import * as designExtractionModule from "../designExtraction";
import * as publicUrlModule from "../publicUrl";
import { designExtractionSchema, type DesignExtraction } from "@shared/designExtraction";
import { REUNE_DNA, REUNE_INTENTS } from "../../client/src/pages/TemplateIngestion/intentToCanvasModel.test";

const extraction: DesignExtraction = designExtractionSchema.parse({ dna: REUNE_DNA, intents: REUNE_INTENTS });
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

const callerFor = (role: "user" | "admin", id = "user-A") =>
  templateIngestionRouter.createCaller({
    user: { id, email: `${id}@example.com`, role } as any,
    req: {} as any,
    res: {} as any,
  });

describe("templateIngestion: extração de design com destinos separados", () => {
  beforeEach(() => vi.restoreAllMocks());

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
    vi.spyOn(designExtractionModule, "extractDesignFromUrl").mockResolvedValueOnce({
      extraction,
      evidence: { fonts: ["Space Grotesk"], colors: [] },
      previewDataUrl: "data:image/png;base64,AAAA",
      sourceUrl: "https://example.com/",
    });
    const result = await callerFor("user", "user-A").extractDesign({ projectId: PROJECT_ID, url: "https://example.com" });
    expect(getProject).toHaveBeenCalledWith(PROJECT_ID, "user-A");
    expect(result.extraction.intents).toHaveLength(5);
    expect(result.fontsDetected).toEqual(["Space Grotesk"]);
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
    expect(sanitized.intents.every(i => i.headline === "{{headline}}")).toBe(true);
    expect(sanitized.dna.palette.accent).toBe(REUNE_DNA.palette.accent);
  });
});
