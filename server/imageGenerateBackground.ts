/**
 * imageGenerateBackground.ts
 *
 * Provider exclusivo: Pollinations.ai via GET nativo
 *   • pollinations_fast — nanobanana (Gemini 2.5 Flash), extremo custo benefício e velocidade
 *   • pollinations_hd — nanobanana-pro (Gemini 3 Pro), alta qualidade 4K e complexidade textual
 *
 * Retorna sempre uma data URI: data:image/jpeg;base64,...
 */

// ── Prompt wrappers ────────────────────────────────────────────────────────────

function wrapPrompt(userPrompt: string): string {
  // Otimização agressiva para abstração e não tipografia nas imagens
  return (
    `Photorealistic or abstract background art for a social media post. Theme: ${userPrompt}. ` +
    `High quality, vibrant colors. Absolutely no text, no letters, no words, no logos, no typography, no UI elements.`
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

export type ImageProvider = 'pollinations_fast' | 'pollinations_hd';

/**
 * Generate a background image using Pollinations.ai
 * @param prompt  — user description (natural language)
 * @param provider — 'pollinations_fast' ou 'pollinations_hd'
 * @returns data URI string
 */
export async function generateBackgroundImage(
  prompt: string,
  provider: ImageProvider = 'pollinations_fast'
): Promise<string> {
  console.log(`[ImageGen] Request: provider=${provider}, prompt="${prompt.substring(0, 50)}..."`);

  // Extrair o modelo específico de acordo com o nível de qualidade solicitado
  const modelId = provider === 'pollinations_hd' ? 'nanobanana-pro' : 'nanobanana';

  // Formatamos o prompt para garantir abstração
  const enhancedPrompt = wrapPrompt(prompt);
  const encodedPrompt = encodeURIComponent(enhancedPrompt);

  // Construir a URL do Pollinations.ai (GET)
  const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${modelId}&nologo=true&width=1080&height=1080&enhance=true`;

  console.log(`[ImageGen] Pollinations Model Select: ${modelId}`);

  // Preparar os Headers (Injetando Autenticação)
  const headers: Record<string, string> = {
    "User-Agent": "PostSpark/1.0",
    "Accept": "image/jpeg, image/png, image/*",
  };

  const apiKey = process.env.POLLINATIONS_API_KEY;
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    console.warn("[ImageGen] WARNING: POLLINATIONS_API_KEY is missing. Using unauthenticated public endpoint (Rate Limits may apply).");
  }

  // Realizar o Fetch nativo
  try {
    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "No error body");
      console.error(`[ImageGen] Pollinations Error: ${response.status} ${response.statusText} - ${errorText}`);
      throw new Error(`Pollinations API failed: ${response.status} ${response.statusText}`);
    }

    // Converter ArrayBuffer de resposta para uma string Base64 compatível com Data URI do FabricJS
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');

    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error(`[ImageGen] Critical Request Error:`, error);
    throw error;
  }
}
