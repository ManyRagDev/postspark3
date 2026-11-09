import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { designExtractionSchema, type DesignDna, type PostIntent } from "@shared/designExtraction";
import { fitFont, intentToCanvasModel } from "./intentToCanvasModel";

export const REUNE_DNA: DesignDna = {
  styleName: "Neubrutalismo Pop Creme",
  movement: "neubrutalism",
  summary: "Superfícies brancas com borda preta, sombra dura e stickers amarelos sobre fundo creme.",
  brandName: "ReUNE",
  palette: { background: "#FDFBF7", surface: "#FFFFFF", text: "#1A1A1A", accent: "#FF5E24", accent2: "#FFD93D", accent3: "#25D366" },
  typography: { headingFont: "Space Grotesk", bodyFont: "Space Grotesk", labelFont: "Space Mono", headingWeight: 700, uppercaseLabels: true, tracking: "normal" },
  surfaces: { borderWidth: 4, borderColor: "#1A1A1A", hardShadow: true, shadowOffset: 8, corners: "square", texture: "dots" },
};

export const REUNE_INTENTS: PostIntent[] = [
  { kind: "value-pillars", name: "Proposta de valor", rationale: "Apresenta a promessa central.", eyebrow: "Direto no WhatsApp", headline: "Amigo Secreto sem papelzinho. Sorteie em minutos.", highlight: "2 minutos", leftLabel: null, rightLabel: null,
    items: [{ title: "Zero apps", text: "Ninguém precisa baixar nada ou criar login.", side: "none" }, { title: "100% sigilo", text: "Envelopes digitais lacrados com PIN.", side: "none" }, { title: "No WhatsApp", text: "Convide e envie o resultado no grupo.", side: "none" }],
    ctaLabel: "Criar meu amigo secreto", footerNote: "reuneapp.com.br/amigo-secreto", caption: "Sorteio em 2 minutos, direto no WhatsApp." },
  { kind: "versus", name: "Antes e depois", rationale: "Contraste de dor.", eyebrow: "Comparativo sincero", headline: "Amigo Secreto ainda em papelzinho?", highlight: null, leftLabel: "O jeito chato", rightLabel: "Com o ReUNE",
    items: [{ title: "", text: "Alguém tira o próprio nome", side: "left" }, { title: "", text: "Papelzinho perdido no bolso", side: "left" }, { title: "", text: "Baixar app e criar senha", side: "left" }, { title: "", text: "Sorteio à prova de falha", side: "right" }, { title: "", text: "Cada um abre do seu celular", side: "right" }, { title: "", text: "Direto no navegador", side: "right" }],
    ctaLabel: "Resolver no zap em 2 minutos", footerNote: "Salve antes de recortar papel de novo", caption: "" },
  { kind: "steps", name: "Passo a passo", rationale: "Reduz atrito.", eyebrow: "Tutorial relâmpago", headline: "Como sortear em 3 passos simples", highlight: null, leftLabel: null, rightLabel: null,
    items: [{ title: "Crie a sala", text: "Cole os nomes ou mande o link.", side: "none" }, { title: "Sorteio em 1 clique", text: "Ninguém tira o próprio nome.", side: "none" }, { title: "Dispare no zap", text: "Cada amigo recebe seu envelope.", side: "none" }],
    ctaLabel: "Testar agora sem cadastro", footerNote: "", caption: "" },
  { kind: "quote", name: "Drama da firma", rationale: "Identificação.", eyebrow: "Drama de fim de ano", headline: "Todo ano é igual: alguém tira o próprio nome e sobra pra você sortear de novo.", highlight: "Nunca mais!", leftLabel: null, rightLabel: null,
    items: [{ title: "A solução", text: "Crie o sorteio no navegador em 2 minutos e dispare pelo WhatsApp.", side: "none" }],
    ctaLabel: "Fazer o sorteio da paz", footerNote: "Marque quem sempre complica o amigo secreto", caption: "" },
  { kind: "proof", name: "Envelope lacrado", rationale: "Quebra a objeção de sigilo.", eyebrow: "Zero espiadinha", headline: "Como funciona o envelope lacrado?", highlight: null, leftLabel: null, rightLabel: null,
    items: [{ title: "PIN individual", text: "Só você abre o seu envelope.", side: "none" }, { title: "Sem duplicidade", text: "Ninguém tira a si mesmo.", side: "none" }, { title: "Link no zap", text: "Revelação direto no grupo.", side: "none" }],
    ctaLabel: "Experimentar com meu grupo", footerNote: "100% gratuito", caption: "" },
];

describe("intentToCanvasModel", () => {
  it("fixture respeita o contrato estrito da extração", () => {
    expect(designExtractionSchema.safeParse({ dna: REUNE_DNA, intents: REUNE_INTENTS }).success).toBe(true);
  });

  it("fitFont reduz a fonte até caber na altura", () => {
    const big = fitFont("Uma headline bastante longa para forçar várias linhas no post", 320, 60, 40, 12);
    expect(big.height).toBeLessThanOrEqual(60 + big.fontSize);
    expect(big.fontSize).toBeLessThan(40);
  });

  for (const aspect of ["1:1", "4:5", "9:16"] as const) {
    it(`compõe as 5 intenções em ${aspect} dentro dos limites e sem sobreposição de textos`, () => {
      const heights = { "1:1": 360, "4:5": 450, "9:16": 640 } as const;
      for (const intent of REUNE_INTENTS) {
        const post = intentToCanvasModel(REUNE_DNA, intent, { aspectRatio: aspect });
        const slide = post.slides[0];
        const shapes = slide.extraShapes ?? [];
        const texts = slide.extraTexts ?? [];
        expect(texts.length).toBeGreaterThan(2);
        for (const s of shapes) {
          expect(s.x).toBeGreaterThanOrEqual(0);
          expect(s.y).toBeGreaterThanOrEqual(0);
          expect(s.x + s.width).toBeLessThanOrEqual(360 + 0.01);
          expect(s.y + s.height).toBeLessThanOrEqual(heights[aspect] + 0.01);
        }
        for (const t of texts) {
          expect(t.y!).toBeLessThan(heights[aspect]);
          expect((t.x ?? 0) + (t.width ?? 0)).toBeLessThanOrEqual(360 + 0.01);
        }
        expect(post.headline).toBe("");
        expect(post.caption).toBe(intent.caption);
        if (process.env.DUMP_INTENT_PREVIEW) {
          const dir = process.env.DUMP_INTENT_PREVIEW;
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, `${intent.kind}-${aspect.replace(":", "x")}.json`), JSON.stringify({ aspect, H: heights[aspect], bg: post.palette.background, shapes, texts }));
        }
      }
    });
  }
});
