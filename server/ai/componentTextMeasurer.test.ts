import { describe, expect, it, vi } from "vitest";
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
  it("does not treat the last separator of an automatically wrapped line as overflow", async () => {
    const measure = await createComponentTextMeasurer([asset]);
    const text = "Basta escanear a nota fiscal do mercado, ditar os ingredientes ou digitar sua lista. A IA identifica tudo o que você adquiriu sem esforço manual.";
    const layout = measure({ ...request, text, width: 559.36, fontSize: 23.8464, lineHeight: 1.3, wordBreak: "word" });
    expect(layout.lines.every(line => line.width <= 559.36)).toBe(true);
    expect(layout.height).toBeLessThan(335.8);
    const unbreakable = measure({ ...request, text: "INSTANTANEAMENTEINSTANTANEAMENTEINSTANTANEAMENTE", width: 100, wordBreak: "word" });
    expect(unbreakable.lines[0].width).toBeGreaterThan(100);
  });
  it("ignores only line-end separators for overflow without changing canonical copy or internal spacing", async () => {
    const measure = await createComponentTextMeasurer([asset]);
    const source = {
      ...request,
      text: "BIZUMINER \t",
      width: 2000,
      letterSpacing: 3,
    };
    const clean = measure({ ...source, text: "BIZUMINER" });
    expect(measure(source).lines[0].width).toBeCloseTo(clean.lines[0].width, 8);
    expect(source.text).toBe("BIZUMINER \t");
    expect(
      measure({ ...source, text: "BIZU MINER" }).lines[0].width
    ).toBeGreaterThan(clean.lines[0].width);
    expect(
      measure({ ...source, wordBreak: "word", width: clean.lines[0].width - 1 })
        .lines[0].width
    ).toBeGreaterThan(clean.lines[0].width - 1);
    const multiline = {
      ...request,
      text: "Café \ncom calma \n",
      width: 2000,
      richText: [
        { text: "Café \n", fill: "#123456" },
        { text: "com calma \n", italic: false },
      ],
    };
    const trimmed = {
      ...multiline,
      text: "Café\ncom calma\n",
      richText: [
        { text: "Café\n", fill: "#123456" },
        { text: "com calma\n", italic: false },
      ],
    };
    expect(measure(multiline)).toEqual(measure(trimmed));
    expect(multiline.text).toBe("Café \ncom calma \n");
  });
  it("propagates cancellation to bytes without cancelling another request's shared font", async () => {
    const bytes = await loadComponentFontBytes(asset);
    const fresh = { ...asset, id: "font-cancellation-isolation" };
    const first = new AbortController(),
      second = new AbortController();
    const loader = vi.fn(async (_asset, signal?: AbortSignal) => {
      if (signal === first.signal)
        return await new Promise<Buffer>((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          })
        );
      return bytes;
    });
    const cancelled = createComponentTextMeasurer(
      [fresh],
      loader,
      first.signal
    );
    const rejected = expect(cancelled).rejects.toThrow("generation_cancelled");
    const independent = createComponentTextMeasurer(
      [fresh],
      loader,
      second.signal
    );
    first.abort(new Error("generation_cancelled"));
    await rejected;
    expect(await independent).toBeTypeOf("function");
    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader.mock.calls.map(call => call[1])).toEqual([
      first.signal,
      second.signal,
    ]);
  });
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
