import { describe, it, expect } from "vitest";
import {
  ensureDistinctFamilies,
  resolveLegibleTextColor,
  isDarkColor,
  OFFICIAL_FAMILIES_META,
  ALL_OFFICIAL_FAMILY_IDS,
  TEXT_EFFECTS_META,
  normalizeHexColor,
  type VisualFamilyId,
} from "./types";
import { normalizeCanvasModel } from "../lib/saveAdapter";

describe("Visual Families & Contrast Safeguard (CR-008)", () => {
  it("contém exatamente 14 famílias visuais oficiais catalogadas", () => {
    expect(ALL_OFFICIAL_FAMILY_IDS.length).toBe(14);
    ALL_OFFICIAL_FAMILY_IDS.forEach((id) => {
      const meta = OFFICIAL_FAMILIES_META[id];
      expect(meta).toBeDefined();
      expect(meta.id).toBe(id);
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.defaultFont.length).toBeGreaterThan(0);
      expect(meta.defaultPalette.background).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(meta.defaultPalette.text).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(meta.defaultPalette.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it("isDarkColor & resolveLegibleTextColor: garante contraste absoluto WCAG", () => {
    // Fundo escuro -> Texto branco
    expect(isDarkColor("#090D18")).toBe(true);
    expect(resolveLegibleTextColor("#090D18", "#1A1A1A")).toBe("#FFFFFF");
    expect(resolveLegibleTextColor("#000000", "#121214")).toBe("#FFFFFF");

    // Fundo claro -> Texto escuro
    expect(isDarkColor("#F8F9FA")).toBe(false);
    expect(resolveLegibleTextColor("#F8F9FA", "#FFFFFF")).toBe("#121214");
    expect(resolveLegibleTextColor("#FFFFFF", "#F8F4EE")).toBe("#121214");
  });

  it("ensureDistinctFamilies: preserva 3 famílias distintas escolhidas pela IA", () => {
    const input = [
      { id: "1", familyId: "cyber-glitch" as VisualFamilyId },
      { id: "2", familyId: "brutal-split" as VisualFamilyId },
      { id: "3", familyId: "stroke-impact" as VisualFamilyId },
    ];

    const result = ensureDistinctFamilies(input);
    expect(result.map((r) => r.familyId)).toEqual([
      "cyber-glitch",
      "brutal-split",
      "stroke-impact",
    ]);
  });

  it("ensureDistinctFamilies: diversifica automaticamente quando a IA repete a mesma família", () => {
    const input = [
      { id: "1", familyId: "glass-veil" as VisualFamilyId },
      { id: "2", familyId: "glass-veil" as VisualFamilyId },
      { id: "3", familyId: "glass-veil" as VisualFamilyId },
    ];

    const result = ensureDistinctFamilies(input);
    const familyIds = result.map((r) => r.familyId);

    const uniqueIds = new Set(familyIds);
    expect(uniqueIds.size).toBe(3);
    expect(familyIds[0]).toBe("glass-veil");
    expect(ALL_OFFICIAL_FAMILY_IDS).toContain(familyIds[1]);
    expect(ALL_OFFICIAL_FAMILY_IDS).toContain(familyIds[2]);
  });

  it("TEXT_EFFECTS_META: cataloga exatamente os 10 estilos oficiais de legibilidade", () => {
    const effectIds = Object.keys(TEXT_EFFECTS_META);
    expect(effectIds.length).toBe(10);
    expect(effectIds).toContain("none");
    expect(effectIds).toContain("shadow");
    expect(effectIds).toContain("outline");
    expect(effectIds).toContain("box-card");
    expect(effectIds).toContain("box-pill");
    expect(effectIds).toContain("box-glass");
    expect(effectIds).toContain("box-accent");
    expect(effectIds).toContain("box-brutal");
    expect(effectIds).toContain("scrim");
    expect(effectIds).toContain("strip-line");

    effectIds.forEach((id) => {
      const eff = TEXT_EFFECTS_META[id as keyof typeof TEXT_EFFECTS_META];
      expect(eff.id).toBe(id);
      expect(eff.name.length).toBeGreaterThan(0);
      expect(eff.icon.length).toBeGreaterThan(0);
      expect(eff.description.length).toBeGreaterThan(0);
    });
  });

  it("ensureDistinctFamilies: lê creativeDirection.familyId quando familyId não está na raiz", () => {
    const input = [
      { id: "1", creativeDirection: { familyId: "editorial-poster" } },
      { id: "2", creativeDirection: { familyId: "quote-authority" } },
      { id: "3", creativeDirection: { familyId: "minimal-air" } },
    ];

    const result = ensureDistinctFamilies(input);
    expect(result.map((r) => r.familyId)).toEqual([
      "editorial-poster",
      "quote-authority",
      "minimal-air",
    ]);
  });

  it("ensureDistinctFamilies: mapeia alias glitch-signal para cyber-glitch a partir de creativeDirection", () => {
    const input = [
      { id: "1", creativeDirection: { familyId: "glitch-signal" } },
      { id: "2", creativeDirection: { familyId: "chromatic-block" } },
      { id: "3", creativeDirection: { familyId: "duotone-wash" } },
    ];

    const result = ensureDistinctFamilies(input);
    expect(result[0].familyId).toBe("cyber-glitch");
  });

  it("ensureDistinctFamilies: rotaciona dinamicamente o fallback com base no seed", () => {
    const emptyInput = [{}, {}, {}];
    const resultA = ensureDistinctFamilies(emptyInput, 0);
    const resultB = ensureDistinctFamilies(emptyInput, 4);

    expect(resultA.map((r) => r.familyId)).not.toEqual(resultB.map((r) => r.familyId));
    expect(new Set(resultA.map((r) => r.familyId)).size).toBe(3);
    expect(new Set(resultB.map((r) => r.familyId)).size).toBe(3);
  });

  it("normalizeCanvasModel: sanitiza e preserva headlineEffectColor e subtextEffectColor", () => {
    const normalized = normalizeCanvasModel({
      headlineEffect: "shadow",
      headlineEffectColor: "#FF0000",
      subtextEffect: "box-card",
      subtextEffectColor: "#00FF00",
    });
    expect(normalized.headlineEffectColor).toBe("#FF0000");
    expect(normalized.subtextEffectColor).toBe("#00FF00");

    const withInvalid = normalizeCanvasModel({
      headlineEffectColor: 123 as any,
    });
    expect(withInvalid.headlineEffectColor).toBeUndefined();
  });

  it("normalizeHexColor: normaliza 3 dígitos, 6 dígitos e fallbacks", () => {
    expect(normalizeHexColor("#fff")).toBe("#FFFFFF");
    expect(normalizeHexColor("#000")).toBe("#000000");
    expect(normalizeHexColor("#0F172A")).toBe("#0F172A");
    expect(normalizeHexColor(undefined, "#000000")).toBe("#000000");
    expect(normalizeHexColor("invalid", "#123456")).toBe("#123456");
  });

  it("normalizeCanvasModel: preserva e sanitiza overlayColor e overlayMode", () => {
    const postWithOverlay = normalizeCanvasModel({
      overlayOpacity: 0.75,
      overlayColor: "#0F172A",
      overlayMode: "radial",
    });
    expect(postWithOverlay.overlayOpacity).toBe(0.75);
    expect(postWithOverlay.overlayColor).toBe("#0F172A");
    expect(postWithOverlay.overlayMode).toBe("radial");

    const postWithDefaults = normalizeCanvasModel({
      overlayColor: "   ",
      overlayMode: "modo-inexistente" as any,
    });
    expect(postWithDefaults.overlayColor).toBeUndefined();
    expect(postWithDefaults.overlayMode).toBe("gradient-bottom");
  });
});

