import { expect, test, describe } from 'vitest';
import { lighten, darken, mix, contrastRatio, isDark, effectiveBackgroundColor } from './color';

describe('color operations', () => {
  test('lighten-changes-hex', () => {
    const original = "#ff0000";
    const lightened = lighten(original, 20);
    expect(lightened).not.toBe(original);
    // Should never return unchanged input for pct > 0
    expect(lighten(original, 10)).not.toBe(original);
    // Should return original for 0
    expect(lighten(original, 0)).toBe(original);
  });

  test('darken-changes-hex', () => {
    const original = "#ff0000";
    const darkened = darken(original, 20);
    expect(darkened).not.toBe(original);
    expect(darken(original, 10)).not.toBe(original);
    expect(darken(original, 0)).toBe(original);
  });

  test('short-hex-supported', () => {
    expect(lighten("#f00", 0)).toBe("#ff0000");
    expect(darken("f00", 0)).toBe("#ff0000");
  });

  test('contrast-black-white-21', () => {
    const ratio = contrastRatio("#000000", "#ffffff");
    expect(ratio).toBeCloseTo(21, 1);
  });

  test('mix-midpoint', () => {
    const mixed = mix("#000000", "#ffffff", 0.5);
    // midpoint should be grey
    expect(mixed).toBe("#808080");
  });
  
  test('isDark-logic', () => {
    expect(isDark("#000000")).toBe(true);
    expect(isDark("#ffffff")).toBe(false);
    expect(isDark("#1a1a1a")).toBe(true);
    expect(isDark("#f0f0f0")).toBe(false);
  });

  test('invalid hex characters throw instead of silently producing NaN', () => {
    expect(() => contrastRatio("#zzzzzz", "#ffffff")).toThrow();
  });
});

describe('effectiveBackgroundColor (SPEC-002 passo 5)', () => {
  test('solid background: uses the solid color exactly, basis "solid"', () => {
    const result = effectiveBackgroundColor(
      { backgroundType: "solid", solidColor: "#112233" },
      "#000000",
    );
    expect(result).toEqual({ color: "#112233", basis: "solid" });
  });

  test('image background with opaque overlay: overlay dominates, basis "overlay-dominant"', () => {
    const result = effectiveBackgroundColor(
      { backgroundType: "ai", overlayColor: "#000000", overlayOpacity: 0.7 },
      "#ffffff",
    );
    expect(result).toEqual({ color: "#000000", basis: "overlay-dominant" });
  });

  test('image background with weak/no overlay: cannot prove contrast, basis "unproven"', () => {
    const result = effectiveBackgroundColor(
      { backgroundType: "gallery", overlayColor: "#000000", overlayOpacity: 0.1 },
      "#ffffff",
    );
    expect(result.basis).toBe("unproven");
  });

  test('image background with no overlay at all falls back to the fallback color, still "unproven"', () => {
    const result = effectiveBackgroundColor({ backgroundType: "upload" }, "#ffffff");
    expect(result).toEqual({ color: "#ffffff", basis: "unproven" });
  });
});
