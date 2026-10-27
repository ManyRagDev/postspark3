import { describe, it, expect } from "vitest";
import {
  editorialContextV8,
  resolvedEditorialContext,
  sourceRangeText,
  validatedEditorialContextV8,
} from "./editorialContextV8";
import { reviewContractHashV7 } from "./reviewExecutionConfigV7";
import {
  resolveReviewExecutionConfigV8,
  assertReviewExecutionConfigV8,
} from "./reviewExecutionConfigV8";
import { arsenalHash } from "@shared/arsenalContent";

describe("reference editorial context", () => {
  const dossier =
    "# DOSSIÊ DE MARCA: BizuMiner\n## DIFERENCIAIS FACTUAIS\nMenor preço verificado (`lowest_verified`) no período observado.\n## POSTURA E TOM DE VOZ\nNatural e acessível 🧑🏽‍💻\n## TERMOS E ABORDAGENS PROIBIDAS\nPreço insano; Oferta absurda\n## CHAMADA PARA AÇÃO (CTA PADRÃO)\nConsulte o canal.";
  const input = {
    prompt: "Como saber se uma oferta vale a pena?",
    platform: "instagram",
    postMode: "carousel" as const,
    contextContent: dossier,
    projectDossier: dossier,
    projectSnapshot: {
      version: 1 as const,
      name: "BizuMiner",
      niche: "Ofertas",
      structuredData: {
        factualDifferentials:
          "Menor preço verificado (`lowest_verified`) no período observado.",
        voiceTone: "Natural e acessível 🧑🏽‍💻",
        forbiddenTerms: "Preço insano; Oferta absurda",
        defaultCta: "Consulte o canal.",
      },
    },
  };
  it("keeps the full dossier once and shares references across project, instructions and requirements", () => {
    const c = editorialContextV8(input),
      payload = JSON.stringify(c),
      resolved = resolvedEditorialContext(c);
    expect(c.version).toBe(2);
    expect(payload.split("lowest_verified")).toHaveLength(2);
    expect(payload.split("Preço insano")).toHaveLength(2);
    expect(c.sources.filter(s => s.text === dossier)).toHaveLength(1);
    expect(resolved.instructions.tone).toBe("Natural e acessível 🧑🏽‍💻");
    expect(resolved.requirements.map(r => r.value)).toEqual([
      "Preço insano",
      "Oferta absurda",
    ]);
    expect(sourceRangeText(c, c.project!.structuredData.voiceTone)).toBe(
      "Natural e acessível 🧑🏽‍💻"
    );
    expect(
      validatedEditorialContextV8({
        ...input,
        editorialContext: c,
        editorialContextHash: c.hash,
      })
    ).toEqual(c);
  });
  it("retains structured values that differ from the document and long unrecognized sections", () => {
    const long = "Detalhe adicional ç🙂 ".repeat(1000);
    const c = editorialContextV8({
      ...input,
      projectDossier: dossier + "\n## OUTRA SEÇÃO\n" + long,
      projectSnapshot: {
        ...input.projectSnapshot,
        structuredData: {
          ...input.projectSnapshot.structuredData,
          voiceTone: "Outra voz",
        },
      },
    });
    expect(c.sources.some(s => s.text.includes(long))).toBe(true);
    expect(resolvedEditorialContext(c).instructions.tone).toBe("Outra voz");
    expect(c.sources.some(s => s.text.includes("Natural e acessível"))).toBe(
      true
    );
  });
  it("does not infer a project from an unrelated reference", () => {
    const c = editorialContextV8({
      prompt: "Pedido",
      platform: "instagram",
      contextContent: dossier,
    });
    expect(c.project).toBeNull();
    expect(resolvedEditorialContext(c).instructions.tone).toBeUndefined();
    expect(c.sources.some(s => s.text === dossier)).toBe(true);
  });
  it("extracts legacy document defaults and rejects tampered or out-of-range references", () => {
    const c = editorialContextV8({ ...input, projectSnapshot: undefined });
    expect(resolvedEditorialContext(c).instructions.callToAction).toBe(
      "Consulte o canal."
    );
    expect(() =>
      sourceRangeText(c, { sourceId: "s1", start: 0, end: 9999999 })
    ).toThrow();
    const altered = {
      ...c,
      request: { ...c.request, prompt: { sourceId: "s1", start: 0, end: 1 } },
    };
    expect(() =>
      validatedEditorialContextV8({
        ...input,
        projectSnapshot: undefined,
        editorialContext: altered,
        editorialContextHash: c.hash,
      })
    ).toThrow("preparation_contract_incompatible");
  });
  it("pins the new configuration without changing historical contract hashes", () => {
    expect(reviewContractHashV7(1)).toBe(
      "caaa057fcc28a0e6c34408bcf946afd1ccd9f7a0695aea490458c01f183c05d8"
    );
    const c = resolveReviewExecutionConfigV8("controlled-model");
    expect(assertReviewExecutionConfigV8(c)).toEqual(c);
    expect(c).toMatchObject({
      version: 3,
      policyVersion: 8,
      editorialGuidanceVersion: 7,
      textModel: "controlled-model",
    });
    const { configurationHash, ...data } = c;
    expect(() =>
      assertReviewExecutionConfigV8({
        ...data,
        contractHash: "a".repeat(64),
        configurationHash: arsenalHash({
          ...data,
          contractHash: "a".repeat(64),
        }),
      })
    ).toThrow();
  });
});
