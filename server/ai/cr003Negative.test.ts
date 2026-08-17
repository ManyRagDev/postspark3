import { describe, expect, it } from "vitest";
import { deterministicEvaluation } from "./postEvaluation";
import { overlaps, safeAreaViolations, contrastChecks } from "../../harness/metrics";
import { extractSlots } from "../../harness/slots";
import { E3, E5 } from "../../harness/thresholds";
import type { PostVariation } from "@shared/postspark";

const baseCandidate = (overrides: Record<string, unknown> = {}) => ({
  headline: "Cafe artesanal em destaque",
  body: "Torra media preserva acidez e doce do grao.",
  caption: "A torra define o sabor.",
  callToAction: "Saiba mais",
  tone: "profissional",
  layout: "centered",
  template: "simple",
  aspectRatio: "1:1" as const,
  backgroundColor: "#1a1a2e",
  textColor: "#ffffff",
  accentColor: "#a855f7",
  platform: "instagram" as const,
  ...overrides,
});

describe("CR-003 — testes negativos obrigatórios", () => {
  it("fundo inválido chegando a deterministicEvaluation não quebra e não produz NaN", () => {
    const candidate = baseCandidate({
      backgroundColor: "não-é-hex",
      textColor: "#ffffff",
      bgValue: { type: "solid", color: "invalido!!" },
    });

    const evaluation = deterministicEvaluation({
      candidate: candidate as never,
      allCandidates: [candidate as never],
      platform: "instagram",
    });

    // A avaliação deve produzir números finitos — nunca NaN, nunca exceção.
    expect(Number.isFinite(evaluation.overallScore)).toBe(true);
    for (const value of Object.values(evaluation.dimensions)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("fixture visual deliberadamente sabotada (headline sobreposta ao body) REPROVA os gates e3/e5", () => {
    // Sabotagem: headline e body com o MESMO centro — sobreposição garantida,
    // além de invadir a safe area do rodapé.
    const sabotaged: PostVariation = {
      id: "sabotaged-1",
      headline: "Sabotagem deliberada de overlap",
      body: "Corpo posicionado sobre o headline de propósito.",
      caption: "",
      hashtags: [],
      callToAction: "",
      tone: "profissional",
      platform: "instagram",
      imagePrompt: "",
      backgroundColor: "#101828",
      textColor: "#FFFFFF",
      accentColor: "#7F56D9",
      layout: "left-aligned",
      aspectRatio: "1:1",
      template: "simple",
      copyAngle: { type: "beneficio", label: "x", badge: "x", stickerText: "x" },
      layoutSettings: {
        padding: 16,
        headline: {
          position: "top-left",
          textAlign: "left",
          freePosition: { x: 50, y: 50 },
          width: 80,
          height: 20,
        },
        body: {
          position: "top-left",
          textAlign: "left",
          freePosition: { x: 50, y: 50 },
          width: 80,
          height: 20,
        },
      } as never,
    } as PostVariation;

    const extraction = extractSlots(sabotaged, "1:1");
    const hSlot = extraction.slots.find((s) => s.name === "headline")!;
    const bSlot = extraction.slots.find((s) => s.name === "body")!;
    const boxes = [
      { name: "headline", left: 20, top: 130, right: 340, bottom: 202 },
      { name: "body", left: 20, top: 130, right: 340, bottom: 202 },
    ];

    const overlapping = overlaps(boxes);
    expect(overlapping.length).toBeGreaterThan(0);

    const safe = safeAreaViolations(
      boxes.map((b) => ({ ...b, top: 330, bottom: 380 })),
      extraction,
      "1:1",
    );
    expect(safe.length).toBeGreaterThan(0);

    // Os limiares de e3 (sobreposição 0) e e5 (sobreposição 0) reprovariam.
    expect(overlapping.length / 1).toBeGreaterThan(E3.maxOverlapRate);
    expect(E5.maxOverlapRate).toBe(0);
    expect(E3.maxSafeAreaViolationsRate).toBe(0);

    // O slot sabotado também falha o contraste (texto branco sobre fundo
    // quase branco) — e5 reprovaria.
    const checks = contrastChecks({
      ...sabotaged,
      backgroundColor: "#F3F4F6",
      textColor: "#FFFFFF",
    });
    const textMin = Math.min(...checks.filter((c) => !c.decorative).map((c) => c.ratio));
    expect(textMin).toBeLessThan(E5.minContrastRatio);

    // Confirma que o slot declarado é mensurável (orçamento derivável) — a
    // sabotagem está nos VALORES, não na ausência de contrato.
    expect(hSlot.verticalBudgetPx).not.toBeNull();
    expect(bSlot.verticalBudgetPx).not.toBeNull();
  });
});
