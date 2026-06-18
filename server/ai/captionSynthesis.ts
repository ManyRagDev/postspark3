import type { Platform, PostVariation } from "@shared/postspark";
import { PLATFORM_SPECS } from "@shared/postspark";
import type { ContentStrategy } from "./contentStrategy";
import { invokeLLM } from "../_core/llm";

/**
 * Caption Synthesis Pass
 *
 * Gera a legenda (caption) em um passo dedicado, posterior à geração e revisão
 * do conteúdo visual. A legenda é sintetizada a partir do conteúdo REAL dos
 * slides/seções/body, garantindo coerência estrutural — não inventa tópicos
 * ou números diferentes do que aparece no post visual.
 */

export interface CaptionSynthesisInput {
  variation: Partial<PostVariation>;
  platform: Platform;
  tone?: string;
  strategy?: ContentStrategy;
  isCarousel: boolean;
}

interface SlideLike {
  headline?: string;
  body?: string;
}

interface SectionLike {
  label?: string;
  description?: string;
}

/**
 * Extrai o conteúdo visual real do post (slides, seções ou headline+body)
 * para servir como fonte obrigatória na geração da legenda.
 */
function extractVisualContent(
  variation: Partial<PostVariation>,
): { text: string; source: "slides" | "sections" | "headline_body" } {
  const slides = (variation.slides ?? []) as SlideLike[];
  if (slides.length > 0) {
    const text = slides
      .map((slide, index) => {
        const headline = slide.headline?.trim() ?? "";
        const body = slide.body?.trim() ?? "";
        return `Slide ${index + 1}: ${headline}${body ? ` — ${body}` : ""}`;
      })
      .join("\n");
    return { text, source: "slides" };
  }

  const sections = (variation.sections ?? []) as SectionLike[];
  if (sections.length > 0) {
    const text = sections
      .map((section, index) => {
        const label = section.label?.trim() ?? "";
        const description = section.description?.trim() ?? "";
        return `Item ${index + 1}: ${label}${description ? ` — ${description}` : ""}`;
      })
      .join("\n");
    return { text, source: "sections" };
  }

  const headline = variation.headline?.trim() ?? "";
  const body = variation.body?.trim() ?? "";
  return {
    text: `${headline}${body ? ` — ${body}` : ""}`,
    source: "headline_body",
  };
}

function buildCaptionSystemPrompt(
  platform: Platform,
  source: "slides" | "sections" | "headline_body",
): string {
  const maxChars = PLATFORM_SPECS[platform].maxChars;
  const targetMin = Math.min(400, maxChars);
  const targetMax = Math.min(Math.max(800, targetMin), maxChars);

  const sourceDescription =
    source === "slides"
      ? "os SLIDES do carrossel"
      : source === "sections"
        ? "os ITENS/SEÇÕES estruturados do post"
        : "o HEADLINE e BODY do post";

  return `Voce e um copywriter especialista em legendas para redes sociais.

Sua tarefa: escrever a legenda (caption) que acompanha um post publicado.

FONTE OBRIGATORIA: A legenda DEVE ser coerente com ${sourceDescription}.
- Voce recebe o conteudo visual real do post como input.
- A legenda deve SINTETIZAR, EXPANDIR e DAR CONTEXTO ao que esta no post visual.
- NUNCA invente topicos, numeros ou informacoes que nao estao no post.
- Se o post tem ${source === "slides" ? "5 slides" : source === "sections" ? "3 itens" : "1 mensagem central"}, a legenda deve referenciar esse mesmo conteudo.
- Se o post lista dicas ou passos, a legenda deve mencionar o MESMO numero de dicas/passos ou fazer referencia geral sem contradizer.

ESTRUTURA DA LEGENDA:
1. GANCHO (1-2 frases): abertura que desperta curiosidade e conecta com a dor/desejo do publico.
2. CONTEXTO/VALOR (2-4 frases): expande o tema do post, explica por que importa, agrega valor real.
3. SÍNTESE DO CONTEÚDO (2-4 frases): referencia os topicos do post de forma fluida (nao copie literalmente, mas reflita o conteudo).
4. CTA/PERGUNTA (1 frase): convite ao engajamento ou proximo passo.

REGRAS:
- Tamanho: entre ${targetMin} e ${targetMax} caracteres (limite da plataforma: ${maxChars}).
- Tom: alinhado ao tom informado pela marca/estrategia.
- Pode usar emojis moderados (3-5 no total, bem distribuidos).
- Pode usar quebras de linha para legibilidade.
- NUNCA use hashtags na legenda (elas ficam em campo separado).
- NUNCA repita literalmente o headline — adicione perspectiva nova.
- Escreva em portugues natural e envolvente.

Responda APENAS com JSON valido no formato: {"caption": "texto da legenda aqui"}`;
}

function buildCaptionUserPrompt(input: {
  contentText: string;
  source: "slides" | "sections" | "headline_body";
  platform: Platform;
  tone?: string;
  strategy?: ContentStrategy;
  existingCaption?: string;
}): string {
  const toneLine = input.tone
    ? `Tom desejado: ${input.tone}`
    : "Tom desejado: natural e envolvente";

  const strategyLine = input.strategy
    ? `Angulo estrategico: ${input.strategy.angle} — ${input.strategy.hook}. Promessa: ${input.strategy.promise}`
    : "Angulo estrategico: nenhum especifico";

  const existingHint = input.existingCaption?.trim()
    ? `\n\nLegenda anterior (use apenas como referencia de tom, NAO copie):\n"${input.existingCaption.trim()}"`
    : "";

  return `CONTEUDO VISUAL DO POST (${input.source.toUpperCase()}):
${input.contentText}

PLATAFORMA: ${PLATFORM_SPECS[input.platform].label}
${toneLine}
${strategyLine}${existingHint}

Escreva a legenda coerente com o conteudo acima.`;
}

function safeParseCaption(content: unknown): string | null {
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter(
              (part): part is { type: "text"; text: string } =>
                Boolean(part) &&
                typeof part === "object" &&
                "type" in part &&
                part.type === "text" &&
                "text" in part,
            )
            .map((part) => part.text)
            .join("\n")
        : "";

  if (!text.trim()) return null;

  // Tenta JSON parse
  try {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as { caption?: unknown };
    if (typeof parsed.caption === "string" && parsed.caption.trim()) {
      return parsed.caption.trim();
    }
  } catch {
    // Se nao for JSON, tenta extrair de bloco JSON
    const startIdx = text.indexOf("{");
    const endIdx = text.lastIndexOf("}");
    if (startIdx !== -1 && endIdx > startIdx) {
      try {
        const jsonSub = text.substring(startIdx, endIdx + 1);
        const parsed = JSON.parse(jsonSub) as { caption?: unknown };
        if (typeof parsed.caption === "string" && parsed.caption.trim()) {
          return parsed.caption.trim();
        }
      } catch {
        // Ignora — fallback
      }
    }
  }

  return null;
}

/**
 * Sintetiza uma legenda coerente a partir do conteúdo visual final do post.
 *
 * Retorna a legenda sintetizada ou, em caso de falha, a caption original
 * (fallback resiliente).
 */
export async function synthesizeCaption(
  input: CaptionSynthesisInput,
): Promise<string> {
  const { variation, platform } = input;

  const { text: contentText, source } = extractVisualContent(variation);

  if (!contentText.trim()) {
    return variation.caption ?? "";
  }

  const systemPrompt = buildCaptionSystemPrompt(platform, source);
  const userPrompt = buildCaptionUserPrompt({
    contentText,
    source,
    platform,
    tone: input.tone,
    strategy: input.strategy,
    existingCaption: variation.caption,
  });

  try {
    const response = await invokeLLM({
      traceLabel: "caption_synthesis",
      taskRoute: "caption_synthesis",
      maxCompletionTokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "caption_synthesis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              caption: {
                type: "string",
                description:
                  "Legenda coerente com o conteudo visual do post",
              },
            },
            required: ["caption"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const caption = safeParseCaption(content);

    if (caption && caption.length >= 100) {
      const maxChars = PLATFORM_SPECS[platform].maxChars;
      return caption.slice(0, maxChars).trim();
    }

    // Fallback: caption original
    return variation.caption ?? "";
  } catch (error) {
    console.warn(
      "[captionSynthesis] Failed, using original caption:",
      error,
    );
    return variation.caption ?? "";
  }
}

/**
 * Sintetiza legendas para múltiplas variações em paralelo.
 *
 * Substitui a caption de cada variação pela versão sintetizada, preservando
 * o resto do objeto. Se a síntese falhar para uma variação, mantém a caption
 * original.
 */
export async function synthesizeCaptionsForVariations(
  variations: Partial<PostVariation>[],
  options: {
    platform: Platform;
    tone?: string;
    strategies?: ContentStrategy[];
    isCarousel: boolean;
  },
): Promise<Partial<PostVariation>[]> {
  return Promise.all(
    variations.map(async (variation, index) => {
      try {
        const caption = await synthesizeCaption({
          variation,
          platform: options.platform,
          tone: options.tone,
          strategy: options.strategies?.[index],
          isCarousel: options.isCarousel,
        });
        return { ...variation, caption };
      } catch {
        return variation;
      }
    }),
  );
}