import { describe, expect, it } from "vitest";
import { getCaretGeometry, getSelectionGeometry, hitTestRichText, layoutRichText } from "./richTextLayout";

describe("richTextLayout", () => {
  const config = {
    text: "Texto com quebra previsível",
    width: 110,
    fontSize: 20,
    fontFamily: "Inter",
    fill: "#ffffff",
    lineHeight: 1.2,
  } as const;

  it("reflows monotonically when width decreases", () => {
    const wide = layoutRichText({ ...config, width: 220 });
    const narrow = layoutRichText({ ...config, width: 90 });
    expect(narrow.lines.length).toBeGreaterThanOrEqual(wide.lines.length);
    expect(narrow.height).toBeGreaterThanOrEqual(wide.height);
  });

  it("uses the same geometry for hit testing, selection and caret", () => {
    const layout = layoutRichText(config);
    const first = layout.glyphs[0];
    expect(hitTestRichText(layout, first.x + first.width * 0.75, first.y + 2)).toBe(first.end);
    expect(getCaretGeometry(layout, first.end).x).toBeCloseTo(first.x + first.width);
    expect(getSelectionGeometry(layout, first.start, first.end)).toHaveLength(1);
  });

  it("preserves explicit line breaks and mixed formatting", () => {
    const layout = layoutRichText({
      ...config,
      text: "Um\nDois",
      richText: [
        { text: "Um\n", color: "#ff0000" },
        { text: "Dois", sizeScale: 1.5, bold: true },
      ],
    });
    expect(layout.lines).toHaveLength(2);
    expect(layout.runs.some(run => run.fill === "#ff0000")).toBe(true);
    expect(layout.runs.some(run => run.fontSize === 30 && run.fontStyle.includes("bold"))).toBe(true);
  });

  it("allows an explicit normal-weight range inside a bold base style", () => {
    const layout = layoutRichText({
      ...config,
      text: "Normal Bold",
      width: 240,
      fontStyle: "bold",
      richText: [
        { text: "Normal", bold: false },
        { text: " Bold" },
      ],
    });

    expect(layout.runs[0].fontStyle).toBe("normal");
    expect(layout.runs.some(run => run.text.includes("Bold") && run.fontStyle === "bold")).toBe(true);
  });

  it("keeps underlined text in its own render run without changing line geometry", () => {
    const plain = layoutRichText({ ...config, text: "Um Dois", width: 240 });
    const underlined = layoutRichText({
      ...config,
      text: "Um Dois",
      width: 240,
      richText: [{ text: "Um", underline: true }, { text: " Dois" }],
    });
    expect(underlined.runs[0].underline).toBe(true);
    expect(underlined.runs[1].underline).toBeUndefined();
    expect(underlined.lines).toEqual(plain.lines);
  });
});
