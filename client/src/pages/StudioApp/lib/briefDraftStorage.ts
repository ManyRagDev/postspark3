import {
  CREATION_BRIEF_VERSION,
  type CreationBrief,
  creationBriefSchema,
} from "@shared/postspark";
import { generationModelSchema, type GenerationModel } from "@shared/generationModel";
import { storedAspectRatios } from "@shared/aspectRatios";
import { z } from "zod";

export const BRIEF_DRAFT_STORAGE_KEY = "postspark.creation_brief.draft.v1";

export const projectArtworkSchema = z.object({
  projectId: z.string().uuid(),
  postId: z.number().int().positive(),
  name: z.string().min(1),
  aspectRatio: z.enum(storedAspectRatios),
  slideCount: z.number().int().min(1).max(10),
});
export type ProjectArtworkSelection = z.infer<typeof projectArtworkSchema>;

export interface SavedBriefDraft {
  draftVersion: number;
  savedAt: string;
  brief: CreationBrief;
  declaredFamilyId: string | null;
  stage?: "create" | "gallery" | "editor";
  generationModel?: GenerationModel;
  projectArtwork?: ProjectArtworkSelection;
}

/**
 * Salva duravelmente o rascunho do briefing e contexto do Studio no localStorage.
 */
export function saveBriefDraft(
  brief: CreationBrief,
  declaredFamilyId: string | null = null,
  stage: "create" | "gallery" | "editor" = "create",
  generationModel?: GenerationModel,
  storageKey = BRIEF_DRAFT_STORAGE_KEY,
  projectArtwork?: ProjectArtworkSelection,
): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const validatedBrief = creationBriefSchema.parse(brief);
    const payload: SavedBriefDraft = {
      draftVersion: CREATION_BRIEF_VERSION,
      savedAt: new Date().toISOString(),
      brief: validatedBrief,
      declaredFamilyId,
      stage,
      ...(generationModel ? { generationModel } : {}),
      ...(projectArtwork && projectArtwork.projectId === brief.projectId ? { projectArtwork } : {}),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch (err) {
    console.warn("[briefDraftStorage] Falha ao persistir rascunho do briefing:", err);
  }
}

/**
 * Carrega o rascunho do briefing persistido, validando schema e tolerando migrações.
 */
export function loadBriefDraft(storageKey = BRIEF_DRAFT_STORAGE_KEY): SavedBriefDraft | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedBriefDraft>;
    if (!parsed || typeof parsed !== "object" || !parsed.brief) {
      return null;
    }

    const validatedBrief = creationBriefSchema.safeParse(parsed.brief);
    if (!validatedBrief.success) {
      console.warn("[briefDraftStorage] Rascunho com schema inválido:", validatedBrief.error);
      return null;
    }

    return {
      draftVersion: parsed.draftVersion ?? CREATION_BRIEF_VERSION,
      savedAt: parsed.savedAt ?? new Date().toISOString(),
      brief: validatedBrief.data,
      declaredFamilyId: parsed.declaredFamilyId ?? null,
      stage: parsed.stage ?? "create",
      generationModel: generationModelSchema.safeParse(parsed.generationModel).data ?? "gemini",
      projectArtwork: projectArtworkSchema.safeParse(parsed.projectArtwork).data,
    };
  } catch (err) {
    console.warn("[briefDraftStorage] Erro ao carregar rascunho do briefing:", err);
    return null;
  }
}

/**
 * Limpa o rascunho salvo do briefing.
 */
export function clearBriefDraft(storageKey = BRIEF_DRAFT_STORAGE_KEY): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    /* no-op */
  }
}

/**
 * Verifica se há um rascunho recuperável não vazio.
 */
export function hasRecoverableBriefDraft(storageKey = BRIEF_DRAFT_STORAGE_KEY): boolean {
  const draft = loadBriefDraft(storageKey);
  return Boolean(draft && draft.brief && draft.brief.rawInput && draft.brief.rawInput.trim().length > 0);
}
