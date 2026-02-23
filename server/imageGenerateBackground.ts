/**
 * imageGenerateBackground.ts
 *
 * Dois providers para geração de imagem de fundo:
 *   • Pollinations — abstratos/gradientes, rápido
 *   • Gemini — realistas/detalhados, mais lento
 *
 * Retorna sempre uma data URI: data:image/...;base64,...
 */

import { GoogleGenAI } from "@google/genai";

// ── Prompt wrappers ────────────────────────────────────────────────────────────

function wrapSimplePrompt(userPrompt: string): string {
  return (
    `Abstract background art for a social media post. ` +
    `Style: ${userPrompt}. ` +
    `High quality, vibrant colors, visually striking. ` +
    `No text, no letters, no words, no typography, no UI elements, no people.`
  );
}

function wrapComplexPrompt(userPrompt: string): string {
  return (
    `Photorealistic background image for a social media post. ` +
    `Subject: ${userPrompt}. ` +
    `Professional photography, sharp focus, beautiful lighting. ` +
    `Absolutely no text, no letters, no words, no typography, no UI elements. ` +
    `No UI, no overlays, just clean visual background.`
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

export type ImageProvider = 'pollinations' | 'gemini';

/**
 * Generate a background image.
 * @param prompt  — user description (natural language)
 * @param provider — 'pollinations' (fast/abstract) or 'gemini' (realistic)
 * @returns data URI string
 */
export async function generateBackgroundImage(
  prompt: string,
  provider: ImageProvider = 'pollinations'
): Promise<string> {
  console.log(`[ImageGen] Request: provider=${provider}, prompt="${prompt.substring(0, 50)}..."`);

  try {
    if (provider === 'gemini') {
      return await generateWithGemini(prompt);
    }
    return await generateWithPollinations(prompt);
  } catch (error) {
    console.error(`[ImageGen] Critical Error (${provider}):`, error);
    throw error;
  }
}

// ── Pollinations ───────────────────────────────────────────────────────────────

async function generateWithPollinations(prompt: string): Promise<string> {
  // 1. Melhorar prompt para o modelo Flux (sempre usado no Pollinations agora)
  const enhancedPrompt = `Abstract background image for social media post. Theme: ${prompt}, high quality, vibrant colors. No text, no logos.`;
  const encodedPrompt = encodeURIComponent(enhancedPrompt);

  // 2. Construir URL com parâmetros corretos
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&nologo=true&width=1080&height=1080&enhance=true`;

  console.log(`[ImageGen] Pollinations URL: ${url}`);

  // 3. Headers com API Key opcional e User-Agent
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "image/jpeg, image/png, image/*",
  };

  if (process.env.POLLINATIONS_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.POLLINATIONS_API_KEY}`;
  }

  // 4. Fetch com tratamento de erro
  const response = await fetch(url, { method: 'GET', headers });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    console.error(`[ImageGen] Pollinations Error: ${response.status} ${response.statusText} - ${errorText}`);
    throw new Error(`Pollinations API failed: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');

  // A API image default retorna jpeg
  return `data:image/jpeg;base64,${base64}`;
}

// ── Gemini ─────────────────────────────────────────────────────────────────────

async function generateWithGemini(prompt: string): Promise<string> {
  console.log(`[ImageGen] Starting Gemini generation...`);
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key not configured");

  const ai = new GoogleGenAI({ apiKey });
  const wrapped = wrapComplexPrompt(prompt);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp-image-generation",
      contents: wrapped,
      config: {
        responseModalities: ["Text", "Image"],
      },
    });

    // Find image part in response
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || "image/png";
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }

    // Log unexpected structure
    console.warn("[ImageGen] Gemini response structure unexpected:", JSON.stringify(response, null, 2));
    throw new Error("Gemini: no image in response");

  } catch (err: any) {
    console.error("[ImageGen] Gemini Error Details:", err.message);
    if (err.response) {
      console.error("[ImageGen] Gemini API Response:", JSON.stringify(err.response, null, 2));
    }
    throw err;
  }
}
