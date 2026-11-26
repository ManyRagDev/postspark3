import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { creativeDesignExtractionSchema, designExtractionResponseSchema, designExtractionSchema, type ArtworkProposal, type DesignDna, type PostIntent, type ReferenceComposition } from "@shared/designExtraction";
import { layoutRichText } from "@shared/arsenalTextLayout";
import { fitFont, intentToCanvasModel } from "./intentToCanvasModel";
import { artworkToCanvasModel } from "./artworkToCanvasModel";
import { customTextFontStyle } from "../CanvasLab/components/types";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "../CanvasLab/lib/saveAdapter";

export const REUNE_DNA: DesignDna = {
  styleName: "Neubrutalismo Pop Creme",
  movement: "neubrutalism",
  summary: "Superfícies brancas com borda preta, sombra dura e stickers amarelos sobre fundo creme.",
  brandName: "ReUNE",
  palette: { background: "#FDFBF7", surface: "#FFFFFF", text: "#1A1A1A", accent: "#FF5E24", accent2: "#FFD93D", accent3: "#25D366" },
  typography: { headingFont: "Space Grotesk", bodyFont: "Space Grotesk", labelFont: "Space Mono", headingWeight: 700, uppercaseLabels: true, tracking: "normal" },
  surfaces: { borderWidth: 4, borderColor: "#1A1A1A", hardShadow: true, shadowOffset: 8, corners: "square", texture: "dots" },
};

export const REUNE_DIRECTION: ReferenceComposition = {
  orientation: "stacked", primaryPosition: "first", alignment: "center", verticalAlignment: "center",
  margin: .07, spacing: .042, leadWidth: .9, splitShare: .5, headingSize: 36, headingStyle: "normal",
  details: "grid", detailStyle: "panel", actionStyle: "filled", actionPosition: "lead",
  background: { kind: "spotlight", tint: "accent2", strength: .4, x: .5, y: .2 },
};

export const REUNE_ARTWORKS: ArtworkProposal[] = Array.from({ length: 5 }, (_, index) => ({
  name: `ReUNE ${index + 1}`,
  rationale: "Tipografia em destaque com uma forma gráfica deslocada.",
  caption: "Amigo secreto no WhatsApp.",
  background: { color: "#FDFBF7", kind: "spotlight", tint: "#FFD93D", x: 0.8, y: 0.15, texture: "dots" },
  texts: [
    {
      text: "Descubra um jeito diferente de fazer o sorteio.",
      role: "headline", color: "#1A1A1A", box: { x: 0.08, y: 0.12 + 0.1 * index, width: 0.35, height: 0.26 },
      fontFamily: "Fraunces", fontSize: 48, fontWeight: 700, italic: true,
    },
    {
      text: "Direto no WhatsApp", role: "support", color: "#1A1A1A",
      box: { x: 0.1, y: 0.86, width: 0.7, height: 0.08 }, fontSize: 16,
    },
  ],
  shapes: [{ box: { x: 0.64, y: 0.24, width: 0.45, height: 0.3 }, fill: null, stroke: "#FF5E24", cornerRadius: 80 }],
}));

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

  it("exige composição em análises novas e aceita extrações anteriores", () => {
    const legacy = { dna: REUNE_DNA, intents: REUNE_INTENTS };
    expect(designExtractionResponseSchema.safeParse(legacy).success).toBe(false);
    expect(designExtractionResponseSchema.safeParse({ ...legacy, dna: { ...REUNE_DNA, composition: REUNE_DIRECTION } }).success).toBe(true);
    expect(designExtractionSchema.safeParse(legacy).success).toBe(true);
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

    it(`mantém o conteúdo e o encaixe das composições de referência em ${aspect}`, () => {
      const heights = { "1:1": 360, "4:5": 450, "9:16": 640 } as const;
      for (const intent of REUNE_INTENTS) {
        const { slides: [slide] } = intentToCanvasModel({ ...REUNE_DNA, composition: REUNE_DIRECTION }, intent, { aspectRatio: aspect });
        const texts = slide.extraTexts!;
        expect(texts.find(text => text.contentRole === "headline")?.text).toBe(intent.headline);
        expect(texts.some(text => text.text === intent.ctaLabel.toUpperCase())).toBe(true);
        expect(texts.filter(text => text.contentRole === "marker")).toHaveLength(intent.kind === "steps" ? intent.items.length : 0);
        for (const item of intent.items) {
          expect(texts.some(text => text.text === item.text)).toBe(true);
        }
        const boxes = texts.map(text => ({
          x: text.x!, y: text.y!, width: text.width!,
          height: layoutRichText({
            text: text.text, width: text.width!, fontSize: text.fontSize!, fontFamily: text.fontFamily!,
            fontStyle: customTextFontStyle(text), lineHeight: text.lineHeight, letterSpacing: text.letterSpacing,
            richText: text.textRich, fill: text.color!,
          }).height,
        }));
        for (const [index, box] of boxes.entries()) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(360.01);
          expect(box.y + box.height).toBeLessThanOrEqual(heights[aspect] + .01);
          expect(boxes.slice(index + 1).some(next => (
            Math.min(box.x + box.width, next.x + next.width) - Math.max(box.x, next.x) > .01 &&
            Math.min(box.y + box.height, next.y + next.height) - Math.max(box.y, next.y) > .01
          ))).toBe(false);
        }
      }
    });
  }

  it("muda geometria e superfícies mesmo com a mesma paleta e a mesma intenção", () => {
    const intent = REUNE_INTENTS[0];
    const first = intentToCanvasModel({ ...REUNE_DNA, composition: REUNE_DIRECTION }, intent);
    const second = intentToCanvasModel({ ...REUNE_DNA, composition: {
      ...REUNE_DIRECTION, orientation: "split", primaryPosition: "last", alignment: "right",
      verticalAlignment: "top", headingSize: 28, details: "list", detailStyle: "rule", actionStyle: "text",
      actionPosition: "end", background: { ...REUNE_DIRECTION.background, kind: "solid" },
    } }, intent);
    expect(first.palette).toEqual(second.palette);
    const title = (post: typeof first) => post.slides[0].extraTexts!.find(t => t.contentRole === "headline")!;
    expect(title(first).align).toBe("center");
    expect(title(second).align).toBe("right");
    expect(title(second).x).toBeGreaterThan(title(first).x! + 85);
    expect(title(second).width).toBeLessThan(title(first).width! * .7);
    expect(first.slides[0].extraShapes!.some(shape => shape.height > 40)).toBe(true);
    expect(second.slides[0].extraShapes!.every(shape => shape.height === 1)).toBe(true);
  });

  it("mantém as palavras do título inteiras na coluna estreita", () => {
    const model = intentToCanvasModel({ ...REUNE_DNA, composition: {
      ...REUNE_DIRECTION, orientation: "split", splitShare: .48, headingSize: 42, headingStyle: "italic",
    } }, { ...REUNE_INTENTS[0], headline: "Menos procura. Mais descobertas úteis.", highlight: "descobertas" });
    const title = model.slides[0].extraTexts!.find(text => text.contentRole === "headline")!;
    const metrics = layoutRichText({
      text: title.text, width: title.width!, fontFamily: title.fontFamily!, fontSize: title.fontSize!,
      fill: title.color!, fontStyle: customTextFontStyle(title), lineHeight: title.lineHeight,
      letterSpacing: title.letterSpacing, richText: title.textRich,
    });
    const lines = metrics.lines.map(line => title.text.slice(line.start, line.end).trim());
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(title.text);
    expect(title.fontSize).toBeLessThan(42);
  });

  it("preserva fundo, formas e texto da referência ao salvar e reabrir", () => {
    const model = intentToCanvasModel({ ...REUNE_DNA,
      surfaces: { ...REUNE_DNA.surfaces, corners: "pill" }, composition: REUNE_DIRECTION,
    }, REUNE_INTENTS[2]);
    const payload = canvasModelToSavePayload(model, { inputType: "url", inputContent: "Referência" });
    const reopened = savedPostToCanvasModel({ id: 42, canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)) });
    expect(reopened.slides[0].backgroundTreatment).toMatchObject({ kind: "spotlight", texture: "dots" });
    expect(reopened.slides[0].extraShapes).toEqual(model.slides[0].extraShapes);
    expect(JSON.parse(JSON.stringify(reopened.slides[0].extraTexts))).toEqual(JSON.parse(JSON.stringify(model.slides[0].extraTexts)));
    expect(reopened.slides[0].extraShapes!.some(shape => (shape.cornerRadius ?? 0) > 8)).toBe(true);
  });
});

describe("artworkToCanvasModel", () => {
  it("exige cinco composições independentes e detecta cópias com outra paleta", () => {
    const extraction = { dna: REUNE_DNA, proposals: REUNE_ARTWORKS };
    expect(creativeDesignExtractionSchema.safeParse(extraction).success).toBe(true);
    expect(creativeDesignExtractionSchema.safeParse({ ...extraction, proposals: REUNE_ARTWORKS.slice(0, 4) }).success).toBe(false);
    const recolored = { ...REUNE_ARTWORKS[0], background: { ...REUNE_ARTWORKS[0].background, color: "#000000" } };
    expect(creativeDesignExtractionSchema.safeParse({
      ...extraction, proposals: [...REUNE_ARTWORKS.slice(0, 4), recolored],
    }).success).toBe(false);
  });

  it("respeita a tipografia, enquadra a arte nos formatos e reabre as camadas salvas", () => {
    for (const [aspectRatio, height] of [["1:1", 360], ["4:5", 450], ["9:16", 640]] as const) {
      const proposal = REUNE_ARTWORKS[4];
      const model = artworkToCanvasModel(REUNE_DNA, proposal, aspectRatio);
      const slide = model.slides[0];
      const headline = slide.extraTexts![0];
      const layout = layoutRichText({
        text: headline.text, width: headline.width!, fontSize: headline.fontSize!, fontFamily: headline.fontFamily!,
        fontStyle: customTextFontStyle(headline), fill: headline.color!, lineHeight: headline.lineHeight,
      });
      expect(headline.fontFamily).toBe("Fraunces");
      expect(headline.y).toBeCloseTo(proposal.texts[0].box.y * height);
      expect(layout.height).toBeLessThanOrEqual(proposal.texts[0].box.height * height);
      expect(layout.lines.map(line => headline.text.slice(line.start, line.end).trim()).join(" ")).toBe(headline.text);
      expect(slide.extraShapes![0]).toMatchObject({ color: "transparent", strokeColor: "#FF5E24" });
      const payload = canvasModelToSavePayload(model, { inputType: "url", inputContent: "Referência" });
      const reopened = savedPostToCanvasModel({ id: 42, canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)) });
      expect(reopened.slides[0].backgroundTreatment).toEqual(slide.backgroundTreatment);
      expect(reopened.slides[0].extraShapes).toEqual(JSON.parse(JSON.stringify(slide.extraShapes)));
      expect(JSON.parse(JSON.stringify(reopened.slides[0].extraTexts))).toEqual(JSON.parse(JSON.stringify(slide.extraTexts)));
    }
  });
});
