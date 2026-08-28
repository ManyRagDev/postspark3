import { describe, it, expect } from "vitest";
import {
  ensureDistinctFamilies,
  resolveLegibleTextColor,
  isDarkColor,
  OFFICIAL_FAMILIES_META,
  ALL_OFFICIAL_FAMILY_IDS,
  type VisualFamilyId,
} from "./types";

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
});
