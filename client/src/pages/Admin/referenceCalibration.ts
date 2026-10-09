import { emptyReferenceLayer, type ReferenceReconstructionSpecV2, type ReferenceSceneLayer } from "@shared/referenceReconstruction";

/** Primeiro caso de aceitação; só aparece para o arquivo original estudado. */
export const FIRST_REFERENCE_SHA256 = "984850e43e1b939e2408e6d7a8c735fa27216565e31e710099824a30ffddfb12";

export function firstReferenceCalibration(scene: ReferenceReconstructionSpecV2): ReferenceReconstructionSpecV2 {
  const layer = (kind: ReferenceSceneLayer["kind"], id: string, patch: Partial<ReferenceSceneLayer>): ReferenceSceneLayer => ({
    ...emptyReferenceLayer(kind, id), ...patch, provenance: "curator", confidenceScore: 0.65,
  });
  const dark = "#242321";
  const ivory = "#f8f6f1";
  const yellow = "#ffc633";
  const headline = (id: string, text: string, y: number, size: number, fill: string): ReferenceSceneLayer => layer("text", id, {
    role: `headline ${text}`, zIndex: 10 + y, x: 77, y, width: 610, height: size + 30,
    text, fontFamily: "Anton", fontWeight: 400, fontSize: size,
    lineHeight: 1, letterSpacing: -2, fill, strokeColor: dark, strokeWidth: 5,
    extrusion: { color: dark, offsetX: 22, offsetY: 28, steps: 22 },
    uncertainty: "A fonte Anton é uma aproximação inicial; ajuste tamanho, largura e extrusão pela comparação.",
  });
  return {
    ...scene,
    artboard: { background: ivory },
    fonts: [],
    warnings: ["Inventário manual de calibração do primeiro caso; a correspondência visual ainda precisa ser conferida."],
    layers: [
      layer("polygon", "shadow-main", { role: "massa escura angular", zIndex: 1, x: 89, y: 55, width: 611, height: 719,
        points: [0, 4, 321, 4, 406, 168, 406, 202, 527, 321, 611, 445, 611, 590, 541, 590, 584, 719, 0, 719], fill: dark, strokeColor: null, strokeWidth: 0,
        uncertainty: "Silhueta escura aproximada por polígono; revisar vértices." }),
      headline("headline-no-1", "NO", 43, 211, ivory),
      headline("headline-skill", "SKILL,", 225, 171, yellow),
      headline("headline-no-2", "NO", 389, 211, ivory),
      headline("headline-seat", "SEAT.", 558, 183, yellow),
      layer("arcText", "arc-top", { role: "anotação superior curva", zIndex: 90, x: 465, y: 18, width: 190, height: 263,
        text: "SKILL OPENS DOORS. EXCELLENCE GET", fontFamily: "Montserrat", fontWeight: 700,
        fontSize: 17, letterSpacing: 0, fill: dark,
        arc: { centerX: 483, centerY: 141, radius: 154, startAngleDeg: -95, clockwise: true },
        uncertainty: "Transcrição/ângulo do arco precisam de conferência visual." }),
      layer("text", "side-reference", { role: "referência vertical", zIndex: 91, x: 57, y: 383, width: 135, height: 22,
        text: "1 KINGS 7:14", fontFamily: "Montserrat", fontWeight: 700, fontSize: 15,
        fill: dark, rotationDeg: -90 }),
      layer("line", "footer-rule", { role: "filete horizontal", zIndex: 100, x: 34, y: 790,
        width: 667, height: 1, points: [0, 0, 667, 0], fill: dark, strokeColor: dark, strokeWidth: 1 }),
      layer("text", "footer-quote-mark", { role: "aspas amarelas", zIndex: 101, x: 47, y: 804, width: 40, height: 36,
        text: "“", fontFamily: "Montserrat", fontWeight: 700, fontSize: 50, fill: yellow }),
      layer("text", "footer-quote", { role: "citação do rodapé", zIndex: 102, x: 89, y: 806, width: 608, height: 72,
        text: "He was the son of a widow from the tribe of Naphtali, and his father was a Tyrian.\nHe was skilled in working with bronze and was full of knowledge and understanding\nand of ability to do all kinds of bronze work.\nHe came to King Solomon and did all the work for him.",
        fontFamily: "Montserrat", fontWeight: 400, fontSize: 12, lineHeight: 1.05, fill: dark,
        uncertainty: "Conferir quebra exata, fonte e tamanho do texto pequeno." }),
      layer("text", "footer-citation", { role: "citação bíblica", zIndex: 103, x: 89, y: 881, width: 180, height: 20,
        text: "1 KINGS 7:14", fontFamily: "Montserrat", fontWeight: 700, fontSize: 14, fill: dark }),
      layer("polygon", "mark-left-a", { role: "marca do canto inferior esquerdo", zIndex: 95, x: 20, y: 725, width: 24, height: 28,
        points: [7, 0, 24, 20, 24, 28, 14, 28, 0, 9], fill: dark }),
      layer("polygon", "mark-left-b", { role: "segunda haste da marca", zIndex: 96, x: 19, y: 742, width: 25, height: 27,
        points: [0, 0, 12, 0, 25, 18, 25, 27, 16, 27, 0, 9], fill: dark }),
    ],
  };
}
