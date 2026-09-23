import { describe, expect, it } from "vitest";
import { detectFormatIntent, hasFormatMismatch } from "./formatIntent";

describe("formatIntent", () => {
  it("detects carousel intent with high confidence", () => {
    const intent = detectFormatIntent("quero um carrossel com cinco slides sobre produtividade");
    expect(intent.detectedFormat).toBe("carousel");
    expect(intent.confidence).toBe("high");
    expect(intent.evidence.length).toBeGreaterThan(0);
  });

  it("detects static intent with high confidence", () => {
    const intent = detectFormatIntent("crie um post único e uma peça estática bem impactante");
    expect(intent.detectedFormat).toBe("static");
    expect(intent.confidence).toBe("high");
  });

  it("returns low confidence when no signal is present", () => {
    const intent = detectFormatIntent("fale sobre fotografia de rua");
    expect(intent.confidence).toBe("low");
  });

  it("flags a clear mismatch between carousel intent and static selector", () => {
    expect(hasFormatMismatch("crie um carrossel de cinco slides", "static")).toBe(true);
  });

  it("does not flag when selector matches intent", () => {
    expect(hasFormatMismatch("crie um carrossel de cinco slides", "carousel")).toBe(false);
  });

  it("does not flag a low-confidence signal", () => {
    expect(hasFormatMismatch("fotografia de rua é legal", "static")).toBe(false);
  });

  it("detects slide numbering evidence", () => {
    const intent = detectFormatIntent("slide 1/5 é o gancho, slide 5 é o cta");
    expect(intent.detectedFormat).toBe("carousel");
  });
});