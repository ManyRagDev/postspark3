import { z } from "zod";
import {
  designExtractionSchema,
  reconcileDnaWithTokens,
  type DesignExtraction,
  type PageTokenEvidence,
} from "@shared/designExtraction";
import { invokeLLM } from "./_core/llm";
import { publicHtml } from "./publicUrl";
import { extractReadablePage } from "./siteContent";
import { extractColorsFromHTML } from "./styleExtractor";
import { captureScreenshot } from "./screenshotService";

/** Fontes declaradas via Google Fonts no <head> (ex.: family=Space+Grotesk:wght@400;700). */
export function detectGoogleFonts(html: string): string[] {
  const found: string[] = [];
  const re = /fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/gi;
  for (const match of Array.from(html.matchAll(re))) {
    const query = match[1].replace(/&amp;/g, "&");
    for (const part of query.split("&")) {
      if (!part.startsWith("family=")) continue;
      const name = decodeURIComponent(part.slice(7).split(":")[0].replace(/\+/g, " ")).trim();
      if (name && !found.includes(name)) found.push(name);
    }
  }
  return found.slice(0, 8);
}

export function collectTokenEvidence(url: string, html: string): PageTokenEvidence {
  const page = extractReadablePage(url, html);
  return {
    fonts: detectGoogleFonts(html),
    colors: extractColorsFromHTML(html).slice(0, 10),
    siteName: new URL(url).hostname.replace(/^www\./, ""),
    title: page.title || undefined,
    description: page.description || undefined,
  };
}

const SYSTEM_PROMPT = `Você é um Diretor de Arte sênior de redes sociais. Recebe o print de uma página web, evidências técnicas (fontes e cores reais do HTML/CSS) e textos da página.
Sua tarefa NÃO é copiar a página. É:
1) Extrair o DNA visual: movimento estético, paleta (6 cores com função), tipografia (use as fontes reais declaradas quando existirem), tratamento de superfícies (espessura e cor da borda, sombra dura, cantos, textura).
2) Imaginar de 3 a 5 POSTS DE REDE SOCIAL com intenções diferentes para promover o que a página oferece, no estilo dela. Intenções disponíveis (cada kind pode aparecer no máximo uma vez): value-pillars (proposta de valor com até 3 pilares), versus (dor vs alívio, itens com side left/right), steps (passo a passo, 3 itens), quote (citação/identificação com um item de solução), proof (quebra de objeção/prova, até 3 itens).
Regras: descarte menus, rodapés, links de login e textos de interface. Use apenas fatos presentes na página; não invente números, preços ou recursos. Copy curta, no idioma da página. Headline com até 90 caracteres; highlight é uma palavra ou trecho curto da headline para destaque (ou null). Para versus, preencha leftLabel e rightLabel e use side left/right; nos demais, side none. Cores no formato #RRGGBB exatas do que você vê. Retorne somente JSON.`;

export async function extractDesignFromScreenshot(input: {
  imageDataUrl: string;
  sourceUrl: string | null;
  evidence: PageTokenEvidence;
}): Promise<DesignExtraction> {
  const schema = z.toJSONSchema(designExtractionSchema);
  const { $schema: _dialect, ...jsonSchema } = schema as Record<string, unknown>;
  const evidenceText = [
    input.sourceUrl ? `URL: ${input.sourceUrl}` : "Fonte: imagem enviada pelo usuário",
    input.evidence.title ? `Título: ${input.evidence.title}` : "",
    input.evidence.description ? `Descrição: ${input.evidence.description}` : "",
    input.evidence.fonts.length ? `Fontes reais declaradas: ${input.evidence.fonts.join(", ")}` : "Fontes reais: não detectadas (infira pela imagem)",
    input.evidence.colors.length ? `Cores presentes no CSS: ${input.evidence.colors.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await invokeLLM({
    taskRoute: "vision_analysis",
    traceLabel: "design_dna_extraction",
    maxCompletionTokens: 8_000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: evidenceText },
          { type: "image_url", image_url: { url: input.imageDataUrl, detail: "high" } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "design_dna_extraction", strict: true, schema: jsonSchema as any },
    },
  });
  const content = result.choices[0]?.message.content;
  const text =
    typeof content === "string"
      ? content
      : (content
          ?.filter(part => part.type === "text")
          .map(part => (part as { text: string }).text)
          .join("") ?? "");
  const parsed = designExtractionSchema.parse(JSON.parse(text));
  return dedupeIntentKinds({
    ...parsed,
    dna: reconcileDnaWithTokens(parsed.dna, input.evidence),
  });
}

/** Cada intenção aparece uma vez: mantém a primeira de cada kind. */
export function dedupeIntentKinds(extraction: DesignExtraction): DesignExtraction {
  const seen = new Set<string>();
  const intents = extraction.intents.filter(intent => {
    if (seen.has(intent.kind)) return false;
    seen.add(intent.kind);
    return true;
  });
  return { ...extraction, intents };
}

export async function extractDesignFromUrl(url: string, viewport: "desktop" | "mobile" = "desktop") {
  const { url: finalUrl, html } = await publicHtml(url);
  const evidence = collectTokenEvidence(finalUrl, html);
  const shot = await captureScreenshot(finalUrl, viewport);
  if (!shot) {
    throw new Error(
      "O serviço de captura visual não conseguiu renderizar a página. Verifique se o site está online e público."
    );
  }
  const imageDataUrl = `data:image/png;base64,${Buffer.from(shot).toString("base64")}`;
  const extraction = await extractDesignFromScreenshot({ imageDataUrl, sourceUrl: finalUrl, evidence });
  return { extraction, evidence, previewDataUrl: imageDataUrl, sourceUrl: finalUrl };
}
