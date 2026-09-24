import { describe, expect, it } from "vitest";
import { applyRichTextFormat, isRichTextRangeBold, isRichTextRangeItalic, isRichTextRangeUnderline, reconcileRichTextChange } from "./richText";

describe("applyRichTextFormat", () => {
  it("applies a color only to the selected range", () => {
    expect(
      applyRichTextFormat(
        "uma palavra aqui",
        undefined,
        { color: "#ff0000" },
        4,
        11
      )
    ).toEqual([
      { text: "uma " },
      { text: "palavra", color: "#ff0000" },
      { text: " aqui" },
    ]);
  });

  it("keeps formatting aligned while the edited text grows", () => {
    const existing = [{ text: "cor", color: "#00ff00" }, { text: " normal" }];
    expect(applyRichTextFormat("cor normal!", existing, {}, 0, 0)).toEqual([
      { text: "cor", color: "#00ff00" },
      { text: " normal!" },
    ]);
  });

  it("clears color and size from the selected range", () => {
    const existing = [
      { text: "destaque", color: "#ff0000", sizeScale: 1.5, bold: true },
    ];
    expect(
      applyRichTextFormat(
        "destaque",
        existing,
        { color: null, sizeScale: 1, bold: null, italic: null },
        0,
        8
      )
    ).toEqual([{ text: "destaque" }]);
  });

  it("inherits the surrounding style while typing", () => {
    expect(
      reconcileRichTextChange("cor", "cor!", [{ text: "cor", color: "#00ff00", bold: true }])
    ).toEqual([{ text: "cor!", color: "#00ff00", bold: true }]);
  });

  it("keeps suffix styles aligned after deleting a range", () => {
    expect(
      reconcileRichTextChange("abcDEF", "aDEF", [
        { text: "abc" },
        { text: "DEF", color: "#ff0000" },
      ])
    ).toEqual([
      { text: "a" },
      { text: "DEF", color: "#ff0000" },
    ]);
  });

  it("preserves an explicit normal-weight override over a bold base", () => {
    expect(
      applyRichTextFormat("Headline", undefined, { bold: false }, 0, 8)
    ).toEqual([{ text: "Headline", bold: false }]);
  });

  it("resolves the effective bold state for toggle behavior", () => {
    const chunks = [
      { text: "forte", bold: true },
      { text: " normal", bold: false },
    ];

    expect(isRichTextRangeBold(chunks, 0, 5)).toBe(true);
    expect(isRichTextRangeBold(chunks, 0, 12)).toBe(false);
    expect(isRichTextRangeBold(undefined, 0, 8, true)).toBe(true);
    expect(isRichTextRangeBold([{ text: "Headline", bold: false }], 0, 8, true)).toBe(false);
  });

  it("toggles italic and underline on a selected range", () => {
    const italic = applyRichTextFormat("texto", undefined, { italic: true }, 0, 5);
    expect(isRichTextRangeItalic(italic, 0, 5)).toBe(true);
    const underlined = applyRichTextFormat("texto", italic, { underline: true }, 0, 5);
    expect(isRichTextRangeUnderline(underlined, 0, 5)).toBe(true);
    expect(underlined).toEqual([{ text: "texto", italic: true, underline: true }]);
    const plain = applyRichTextFormat("texto", underlined, { italic: false, underline: false }, 0, 5);
    expect(isRichTextRangeItalic(plain, 0, 5)).toBe(false);
    expect(isRichTextRangeUnderline(plain, 0, 5)).toBe(false);
  });

  it("keeps underline while typing and removes it with clear formatting", () => {
    const typed = reconcileRichTextChange("sublinha", "sublinhado", [{ text: "sublinha", underline: true }]);
    expect(typed).toEqual([{ text: "sublinhado", underline: true }]);
    expect(applyRichTextFormat("sublinhado", typed, { color: null, sizeScale: 1, bold: null, italic: null, underline: null }, 0, 10))
      .toEqual([{ text: "sublinhado" }]);
  });
});
