import { describe, it, expect } from "vitest";
import { getKonvaTextMetrics } from "./textMetrics";

describe("getKonvaTextMetrics (SPEC / CanvasLab Text Engine)", () => {
  it("retorna métricas zeradas para texto vazio ou whitespace", () => {
    const emptyResult = getKonvaTextMetrics({
      text: "",
      width: 300,
      fontSize: 24,
      fontFamily: "Inter",
    });
    expect(emptyResult.lines).toEqual([]);
    expect(emptyResult.height).toBe(0);
    expect(emptyResult.lineCount).toBe(0);

    const wsResult = getKonvaTextMetrics({
      text: "    ",
      width: 300,
      fontSize: 24,
      fontFamily: "Inter",
    });
    expect(wsResult.lines).toEqual([]);
    expect(wsResult.height).toBe(0);
    expect(wsResult.lineCount).toBe(0);
  });

  it("mantém texto curto em exatamente 1 linha sem quebra fantasma", () => {
    const result = getKonvaTextMetrics({
      text: "POST DE LUXO",
      width: 312,
      fontSize: 28,
      fontFamily: "Anton",
      lineHeight: 1.1,
    });
    expect(result.lineCount).toBe(1);
    expect(result.lines.length).toBe(1);
    expect(result.lines[0].text).toBe("POST DE LUXO");
    expect(result.height).toBeCloseTo(28 * 1.1, 1);
  });

  it("quebra texto longo em múltiplas linhas respeitando largura do container", () => {
    const longText = "Este é um texto muito longo especialmente preparado para testar a quebra automática de palavras em múltiplas linhas";
    const result = getKonvaTextMetrics({
      text: longText,
      width: 200,
      fontSize: 16,
      fontFamily: "Inter",
      lineHeight: 1.4,
    });
    expect(result.lineCount).toBeGreaterThan(1);
    expect(result.lines.length).toBe(result.lineCount);
    expect(result.height).toBeCloseTo(result.lineCount * 16 * 1.4, 1);
  });

  it("preserva quebras explícitas de parágrafo por quebra de linha (\\n)", () => {
    const multiLine = "Linha 1\nLinha 2\nLinha 3";
    const result = getKonvaTextMetrics({
      text: multiLine,
      width: 300,
      fontSize: 20,
      fontFamily: "Inter",
      lineHeight: 1.25,
    });
    expect(result.lineCount).toBe(3);
    expect(result.lines.map((l) => l.text)).toEqual(["Linha 1", "Linha 2", "Linha 3"]);
  });
});
