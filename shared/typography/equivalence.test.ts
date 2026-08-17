/**
 * CR-002 — Equivalência "fonte medida" (fontkit, servidor) × "fonte carregada"
 * (canvas, browser).
 *
 * Carrega o MESMO arquivo .ttf do registro em um canvas real
 * (@napi-rs/canvas — o mesmo contrato de medida que o browser usa) e compara
 * larguras com o `fontkitMeasurer` dentro da margem do harness
 * (`maxMeasurerDivergence` = 3%). Também prova que o wrap guloso compartilhado
 * produz as MESMAS linhas quando as larguras coincidem.
 */
import { describe, expect, it } from "vitest";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { fontkitMeasurer } from "./fontkitMeasurer";
import { greedyWrap } from "./wrap";
import { pathFor } from "./fonts/registry";
import type { TextStyle } from "./types";

const TEXTS = [
  "Cafe artesanal: o ponto exato da torra",
  "Transforme processo em resultado",
  "A maioria dos times corrige o sintoma e ignora a causa",
  "WWWWWWWWWWWWWWWWWWWWWWWW",
  "Anticonstitucionalissimamente",
  "Operação, estratégia e conversão antes de qualquer método",
  "Previsível, consistente, escalável — diagnóstico silencioso",
  "Responsabilidade socioambiental corporativa",
];

const SIZES = [16, 20, 24, 28, 36, 44];
const FAMILIES = ["Inter", "Space Grotesk", "Anton", "Space Mono"];

function canvasMeasurer(family: string): (text: string, px: number) => number {
  return (text: string, px: number): number => {
    const canvas = createCanvas(2000, 200);
    const ctx = canvas.getContext("2d");
    ctx.font = `400 ${px}px "${family}"`;
    return ctx.measureText(text).width;
  };
}

describe("equivalência fonte medida × fonte carregada (CR-002)", () => {
  it("usa o mesmo arquivo .ttf do registro no canvas", () => {
    for (const family of FAMILIES) {
      const file = pathFor(family);
      expect(file, `arquivo de fonte ${family} deve existir`).toBeTruthy();
      const registered = GlobalFonts.registerFromPath(file!, family);
      expect(registered, `registro da fonte ${family} no canvas`).toBeTruthy();
    }
  });

  it("larguras divergem < 3% entre fontkit e canvas (mesma fonte)", () => {
    const divergences: number[] = [];
    for (const family of FAMILIES) {
      const file = pathFor(family)!;
      GlobalFonts.registerFromPath(file, family);
      const measure = canvasMeasurer(family);
      for (const text of TEXTS) {
        for (const px of SIZES) {
          const style: TextStyle = { fontFamily: family, fontSize: px, lineHeight: 1.15, textTransform: "none" };
          const fontkitWidth = fontkitMeasurer.measureWidth(text, style);
          const canvasWidth = measure(text, px);
          const divergence = Math.abs(fontkitWidth - canvasWidth) / Math.max(1, canvasWidth);
          divergences.push(divergence);
          expect(
            divergence,
            `${family} ${px}px "${text.slice(0, 24)}…": fontkit ${fontkitWidth.toFixed(1)}px × canvas ${canvasWidth.toFixed(1)}px`,
          ).toBeLessThan(0.03);
        }
      }
    }
    const worst = Math.max(...divergences);
    expect(worst).toBeLessThan(0.03);
  });

  it("o wrap guloso compartilhado produz as MESMAS linhas com larguras iguais", () => {
    const style: TextStyle = { fontFamily: "Inter", fontSize: 24, lineHeight: 1.15, textTransform: "none" };
    const text = "Cafe artesanal: o ponto exato da torra";
    const fromFontkit = fontkitMeasurer.wrapText(text, style, 302);
    // A quebra é uma função pura da largura: delegar para greedyWrap com as
    // larguras do fontkit reproduz exatamente as linhas do medidor.
    const fromShared = greedyWrap(text, (t, s) => fontkitMeasurer.measureWidth(t, s), style, 302);
    expect(fromShared.lines).toEqual(fromFontkit.lines);
    expect(fromShared.overflowingWords).toEqual(fromFontkit.overflowingWords);
  });
});
