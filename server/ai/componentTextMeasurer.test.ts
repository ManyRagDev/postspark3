import { describe, expect, it } from "vitest";
import { create as createFont } from "fontkit";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import bundled from "../../shared/arsenalBundledAssets.json";
import { arsenalAssetSchema } from "../../shared/designArsenal";
import {
  createComponentTextMeasurer,
  loadComponentFontBytes,
} from "./componentTextMeasurer";
const entry = Object.values(bundled).find(
  a => a.sourceFamily === "Inter" && a.weight === 400
)!;
const { path, sourceUrl, ...manifest } = entry;
const asset = arsenalAssetSchema.parse(manifest);
const request = {
  text: "Composição editorial",
  width: 900,
  fontSize: 40,
  fontFamily: asset.family!,
  fontStyle: "400",
  fill: "#111111",
  align: "left" as const,
  lineHeight: 1.2,
  letterSpacing: 0,
};
describe("verified server font measurement", () => {
  it("measures verified bundled font bytes without a font fallback", async () => {
    const bytes = await loadComponentFontBytes(asset);
    const parsed = createFont(bytes) as unknown as {
      variationAxes?: Record<string, { min: number; max: number }>;
    };
    const range = parsed.variationAxes?.wght;
    const declared = range
      ? { ...asset, weightRange: { min: range.min, max: range.max } }
      : asset;
    const measure = await createComponentTextMeasurer([declared]);
    const regular = measure(request),
      larger = measure({ ...request, fontSize: 80 });
    expect(regular.lines[0].width).toBeGreaterThan(100);
    expect(larger.lines[0].width).toBeCloseTo(regular.lines[0].width * 2, 4);
    if (range)
      expect(
        measure({ ...request, fontStyle: "700" }).lines[0].width
      ).toBeGreaterThan(100);
    if (range) {
      const sample = {
        ...request,
        text: "MMMMWWWW",
        fontSize: 80,
        width: 2000,
      };
      const normal = measure(sample).lines[0].width;
      expect(measure({ ...sample, fontStyle: "450" }).lines[0].width).not.toBe(
        normal
      );
      expect(measure({ ...sample, fontStyle: "850" }).lines[0].width).not.toBe(
        normal
      );
    }
    expect(() => measure({ ...request, fontFamily: "Unknown font" })).toThrow(
      "component_font_weight_unavailable"
    );
  });
  it("measures every declared variable weight including 450 and 850 from real VF bytes", async () => {
    const bytes = await readFile("harness/fonts/files/inter.ttf");
    const parsed = createFont(bytes) as unknown as {
      variationAxes: Record<string, { min: number; max: number }>;
    };
    expect(parsed.variationAxes.wght).toBeDefined();
    const range = parsed.variationAxes.wght,
      sha = createHash("sha256").update(bytes).digest("hex");
    const variable = arsenalAssetSchema.parse({
      ...asset,
      id: `font-${sha}`,
      kind: "catalog",
      sha256: sha,
      bytes: bytes.length,
      mimeType: "font/ttf",
      family: `Arsenal_${sha.slice(0, 16)}`,
      sourceFamily: "Inter",
      weightRange: { min: range.min, max: range.max },
    });
    const measure = await createComponentTextMeasurer(
      [variable],
      async () => bytes
    );
    const sample = {
      ...request,
      text: "MMMMWWWW",
      fontSize: 80,
      width: 2000,
      fontFamily: variable.family!,
    };
    const regular = measure({ ...sample, fontStyle: "400" }).lines[0].width;
    expect(measure({ ...sample, fontStyle: "450" }).lines[0].width).not.toBe(
      regular
    );
    expect(measure({ ...sample, fontStyle: "850" }).lines[0].width).not.toBe(
      regular
    );
  });
  it("refuses altered font bytes and invented variable ranges", async () => {
    await expect(
      createComponentTextMeasurer([{ ...asset, bytes: asset.bytes + 1 }])
    ).rejects.toThrow("component_font_hash_mismatch");
    await expect(
      createComponentTextMeasurer([
        { ...asset, weightRange: { min: 200, max: 800 } },
      ])
    ).rejects.toThrow("component_font_weight_range_mismatch");
  });
});
