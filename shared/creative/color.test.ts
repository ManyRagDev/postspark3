import { expect, test, describe } from 'vitest';
import { lighten, darken, mix, contrastRatio, isDark } from './color';

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
});
