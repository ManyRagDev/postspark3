import {
  CREATION_BRIEF_VERSION,
  type CreationBrief,
  creationBriefSchema,
} from "@shared/postspark";

export const BRIEF_DRAFT_STORAGE_KEY = "postspark.creation_brief.draft.v1";

export interface SavedBriefDraft {
  draftVersion: number;
  savedAt: string;
  brief: CreationBrief;
  declaredFamilyId: string | null;
  stage?: "create" | "gallery" | "editor";
}

/**
 * Salva duravelmente o rascunho do briefing e contexto do Studio no localStorage.
 */
export function saveBriefDraft(
  brief: CreationBrief,
  declaredFamilyId: string | null = null,
  stage: "create" | "gallery" | "editor" = "create"
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
    };
    window.localStorage.setItem(BRIEF_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("[briefDraftStorage] Falha ao persistir rascunho do briefing:", err);
  }
}

/**
 * Carrega o rascunho do briefing persistido, validando schema e tolerando migrações.
 */
export function loadBriefDraft(): SavedBriefDraft | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(BRIEF_DRAFT_STORAGE_KEY);
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
    };
  } catch (err) {
    console.warn("[briefDraftStorage] Erro ao carregar rascunho do briefing:", err);
    return null;
  }
}

/**
 * Limpa o rascunho salvo do briefing.
 */
export function clearBriefDraft(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(BRIEF_DRAFT_STORAGE_KEY);
  } catch {
    /* no-op */
  }
}

/**
 * Verifica se há um rascunho recuperável não vazio.
 */
export function hasRecoverableBriefDraft(): boolean {
  const draft = loadBriefDraft();
  return Boolean(draft && draft.brief && draft.brief.rawInput && draft.brief.rawInput.trim().length > 0);
}
