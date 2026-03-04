/**
 * ChameleonVision: Direct image → CSS tokens + copy extraction pipeline.
 *
 * Inspired by the exemplo.html approach: a single Vision LLM call that returns
 * CSS-ready values (borderRadius, boxShadow, border, fontFamily, colors) and
 * structured copywriting angles — zero abstraction layers between image and render.
 *
 * Uses screenshots already captured by the Railway service.
 */

import { invokeLLM } from "./_core/llm";
import type { ChameleonVisionResult, CopyAngleType } from "@shared/postspark";

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildChameleonPrompt(siteContent?: string): string {
  const contextBlock = siteContent
    ? `\nContexto textual extraído do site:\n${siteContent.slice(0, 2000)}\n`
    : '';

  return `Você é um Desenvolvedor Front-end Senior, Diretor de Arte e Copywriter de elite.
Analise a imagem desta Landing Page / Website anexa e clone a essência do design dela para posts de rede social.

Sua missão:

1. EXTRAIR A IDENTIDADE VISUAL (Cores HEX exatas):
   - background: cor predominante de fundo da página
   - card: cor de fundo dos blocos/cards/seções de conteúdo
   - primary: cor de destaque principal (botões, CTAs, links)
   - secondary: cor de suporte (badges, ícones secundários)
   - text: cor do texto principal

2. EXTRAIR DESIGN TOKENS (valores CSS exatos):
   - borderRadius: avalie o site e retorne EXATAMENTE um destes valores:
     "0px" = quinas totalmente retas/secas
     "8px" = cantos levemente arredondados
     "16px" = arredondamento médio
     "24px" = bem arredondado
   - boxShadow: qual estilo de sombra o site usa?
     "none" = sem sombra
     "0 10px 25px rgba(0,0,0,0.1)" = sombra suave elegante
     "0 20px 40px rgba(0,0,0,0.2)" = sombra suave forte
     "8px 8px 0px 0px #000000" = sombra neo-brutalista (offset duro)
   - border: qual estilo de borda nos cards/elementos?
     "none" = sem borda
     "1px solid rgba(0,0,0,0.1)" = borda fina sutil
     "2px solid #000000" = borda marcada
     "4px solid #000000" = borda grossa brutalista
   - textAlign: títulos e textos principais são alinhados à esquerda ("left") ou centralizados ("center")?
   - textTransform: títulos estão em CAIXA ALTA ("uppercase") ou normal ("none")?
   - decorations: o design é limpo/minimalista ("minimal") ou usa elementos decorativos soltos como confetes, selos, formas geométricas ("playful")?

3. DETECTAR TIPOGRAFIA:
   - originalFont: qual é a fonte que o site aparenta usar? (seu melhor palpite)
   - fontFamily: escolha a fonte GRATUITA equivalente mais próxima do Google Fonts.
     Opções comuns: Inter, Roboto, Montserrat, Poppins, Lato, Open Sans, Raleway, Work Sans,
     Quicksand, Space Grotesk, Playfair Display, Merriweather, Lora, PT Serif, Crimson Text,
     Oswald, Bebas Neue, Syne, Anton, Righteous, Space Mono, JetBrains Mono

4. CRIAR 7 OPÇÕES DE COPYWRITING baseadas no produto/serviço do site:
   - Opção 1 (dor): Foque no PROBLEMA que o produto resolve. Gancho provocativo.
   - Opção 2 (beneficio): Foque no RESULTADO DESEJADO. Gancho aspiracional.
   - Opção 3 (objecao): Quebre uma OBJEÇÃO comum. Gancho desmistificador.
   - Opção 4 (autoridade): Use PROVA SOCIAL ou dados. Gancho de credibilidade.
   - Opção 5 (escassez): Crie URGÊNCIA ou exclusividade. Gancho de escassez.
   - Opção 6 (storytelling): Conte uma pequena história de jornada ou transformação. Gancho narrativo.
   - Opção 7 (mito_vs_verdade): Desminta um mito de mercado e mostre a verdade do produto. Gancho de revelação.

   Para CADA opção:
   - badge: nome curto da marca/produto (máx 15 caracteres)
   - headline: gancho de IMPACTO (máximo 5 palavras, sem ponto final)
   - subheadline: explicação clara (máximo 12 palavras)
   - stickerText: UMA palavra decorativa de impacto (ex: "Magia", "Prático", "Fácil", "Novo", "Top")
${contextBlock}
Retorne ESTRITAMENTE um JSON válido no formato especificado. Sem markdown, sem explicações.`;
}

// ─── JSON Schema ──────────────────────────────────────────────────────────────

const CHAMELEON_SCHEMA = {
  type: 'object' as const,
  properties: {
    colors: {
      type: 'object' as const,
      properties: {
        background: { type: 'string' as const, description: 'Background color HEX' },
        primary: { type: 'string' as const, description: 'Primary/CTA color HEX' },
        secondary: { type: 'string' as const, description: 'Secondary color HEX' },
        text: { type: 'string' as const, description: 'Text color HEX' },
        card: { type: 'string' as const, description: 'Card/surface background HEX' },
      },
      required: ['background', 'primary', 'secondary', 'text', 'card'] as const,
      additionalProperties: false,
    },
    designTokens: {
      type: 'object' as const,
      properties: {
        borderRadius: { type: 'string' as const },
        boxShadow: { type: 'string' as const },
        border: { type: 'string' as const },
        textAlign: { type: 'string' as const, enum: ['left', 'center'] as const },
        originalFont: { type: 'string' as const },
        fontFamily: { type: 'string' as const },
        textTransform: { type: 'string' as const, enum: ['none', 'uppercase'] as const },
        decorations: { type: 'string' as const, enum: ['minimal', 'playful'] as const },
      },
      required: ['borderRadius', 'boxShadow', 'border', 'textAlign', 'originalFont', 'fontFamily', 'textTransform', 'decorations'] as const,
      additionalProperties: false,
    },
    posts: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          label: { type: 'string' as const },
          angle: { type: 'string' as const, enum: ['dor', 'beneficio', 'objecao', 'autoridade', 'escassez', 'storytelling', 'mito_vs_verdade'] as const },
          badge: { type: 'string' as const },
          headline: { type: 'string' as const },
          subheadline: { type: 'string' as const },
          stickerText: { type: 'string' as const },
        },
        required: ['label', 'angle', 'badge', 'headline', 'subheadline', 'stickerText'] as const,
        additionalProperties: false,
      },
    },
  },
  required: ['colors', 'designTokens', 'posts'] as const,
  additionalProperties: false,
};

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Extract visual identity + copywriting from a website screenshot using Vision LLM.
 * Single-call approach: 1 image → CSS tokens + 5 copy angles.
 *
 * @param screenshot — PNG screenshot as ArrayBuffer (from Railway service)
 * @param siteContent — Optional scraped text content for richer copy context
 * @returns ChameleonVisionResult with colors, tokens, and 5 copy variations
 */
export async function chameleonVision(
  screenshot: ArrayBuffer,
  siteContent?: string,
): Promise<ChameleonVisionResult | null> {
  console.log('[chameleonVision] Starting direct extraction...');

  const base64 = Buffer.from(screenshot).toString('base64');
  const promptText = buildChameleonPrompt(siteContent);

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: 'Você é um assistente criativo que só responde em JSON válido. Nunca inclua markdown, explicações ou texto fora do JSON.',
        },
        {
          role: 'user',
          content: [
            { type: 'text' as const, text: promptText },
            {
              type: 'image_url' as const,
              image_url: {
                url: `data:image/png;base64,${base64}`,
                detail: 'low' as const,
              },
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'chameleon_vision_result',
          strict: true,
          schema: CHAMELEON_SCHEMA,
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from Vision LLM');

    const str = typeof content === 'string' ? content : JSON.stringify(content);
    let cleaned = str.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    const parsed = JSON.parse(cleaned) as ChameleonVisionResult;

    // Validate minimum structure
    if (!parsed.colors?.background || !parsed.designTokens || !Array.isArray(parsed.posts)) {
      console.warn('[chameleonVision] Invalid response structure, returning null');
      return null;
    }

    // Ensure all 5 angles exist, fill missing ones with defaults
    const requiredAngles: CopyAngleType[] = ['dor', 'beneficio', 'objecao', 'autoridade', 'escassez'];
    const existingAngles = new Set(parsed.posts.map(p => p.angle));
    for (const angle of requiredAngles) {
      if (!existingAngles.has(angle)) {
        parsed.posts.push({
          label: angle.charAt(0).toUpperCase() + angle.slice(1),
          angle,
          badge: parsed.posts[0]?.badge || 'Marca',
          headline: 'Headline pendente',
          subheadline: 'Subheadline pendente',
          stickerText: 'Novo',
        });
      }
    }

    console.log(`[chameleonVision] Extraction complete: ${parsed.posts.length} copy angles, font: ${parsed.designTokens.fontFamily}`);
    return parsed;
  } catch (err) {
    console.error('[chameleonVision] Extraction failed:', err);
    return null;
  }
}
