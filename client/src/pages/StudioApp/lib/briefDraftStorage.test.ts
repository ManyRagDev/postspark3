// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import {
  saveBriefDraft,
  loadBriefDraft,
  clearBriefDraft,
  hasRecoverableBriefDraft,
  BRIEF_DRAFT_STORAGE_KEY,
} from "./briefDraftStorage";
import { interpretRawBriefing } from "@shared/postspark";

describe("briefDraftStorage - Etapa 4", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("salva duravelmente e recupera o rascunho de briefing no localStorage", () => {
    const brief = interpretRawBriefing("Carrossel de 5 slides com link https://site.com", {
      selectedFormat: "carousel",
    });

    saveBriefDraft(brief, "editorial-bold", "create");

    expect(hasRecoverableBriefDraft()).toBe(true);

    const loaded = loadBriefDraft();
    expect(loaded).not.toBeNull();
    expect(loaded?.brief.rawInput).toBe("Carrossel de 5 slides com link https://site.com");
    expect(loaded?.brief.format).toBe("carousel");
    expect(loaded?.declaredFamilyId).toBe("editorial-bold");
    expect(loaded?.stage).toBe("create");
  });

  it("limpa o rascunho com clearBriefDraft", () => {
    const brief = interpretRawBriefing("Teste de post");
    saveBriefDraft(brief);
    expect(hasRecoverableBriefDraft()).toBe(true);

    clearBriefDraft();
    expect(hasRecoverableBriefDraft()).toBe(false);
    expect(loadBriefDraft()).toBeNull();
  });

  it("retorna null de forma resiliente caso o conteúdo esteja corrompido", () => {
    localStorage.setItem(BRIEF_DRAFT_STORAGE_KEY, "invalid-json{{{");
    expect(loadBriefDraft()).toBeNull();
    expect(hasRecoverableBriefDraft()).toBe(false);
  });

  it("rejeita rascunhos com campos inválidos que violem o schema", () => {
    localStorage.setItem(
      BRIEF_DRAFT_STORAGE_KEY,
      JSON.stringify({
        draftVersion: 1,
        savedAt: new Date().toISOString(),
        brief: {
          // sem rawInput e sem format
          version: 1,
        },
      })
    );
    expect(loadBriefDraft()).toBeNull();
  });
});
