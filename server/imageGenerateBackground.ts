/**
 * Background image generation.
 *
 * Primary provider: OpenRouter image model (Nano Banana 2 by default).
 * Legacy fallback: Pollinations.ai.
 *
 * Public contract: always returns a data URI: data:image/...;base64,...
 */
import { ENV } from "./_core/env";
import { appendOperationalLog } from "./_core/operationalLog";

export type ImageProvider = "pollinations_fast" | "pollinations_hd";

function wrapPrompt(userPrompt: string): string {
  return (
    `Photorealistic or abstract background art for a social media post. Theme: ${userPrompt}. ` +
    "High quality, vibrant colors. Absolutely no text, no letters, no words, no logos, no typography, no watermarks, no fake app UI elements. " +
    "Leave clean visual breathing room for editable foreground copy."
  );
}

function collectImageCandidates(value: unknown, output: string[] = []): string[] {
  if (!value) return output;

  if (typeof value === "string") {
    if (
      value.startsWith("data:image/") ||
      /^https?:\/\//i.test(value) ||
      (value.length > 500 && /^[A-Za-z0-9+/=\s]+$/.test(value))
    ) {
      output.push(value.trim());
    }
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectImageCandidates(item, output));
    return output;
  }

  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectImageCandidates(item, output),
    );
  }

  return output;
}

async function toDataUri(candidate: string): Promise<string> {
  if (candidate.startsWith("data:image/")) return candidate;

  if (/^https?:\/\//i.test(candidate)) {
    const response = await fetch(candidate);
    if (!response.ok) {
      throw new Error(`Image URL fetch failed: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  }

  return `data:image/png;base64,${candidate.replace(/\s/g, "")}`;
}

async function generateWithOpenRouter(
  prompt: string,
  provider: ImageProvider,
): Promise<string> {
  if (!ENV.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured for image generation");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.openRouterApiKey}`,
      "HTTP-Referer": ENV.openRouterSiteUrl,
      "X-Title": ENV.openRouterAppName,
    },
    body: JSON.stringify({
      model: ENV.openRouterImageModel,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${wrapPrompt(prompt)}

Output requirements:
- Generate one square 1080x1080 social media background image.
- Quality level: ${provider === "pollinations_hd" ? "high detail" : "fast production quality"}.
- Return the image result; do not return explanatory text.`,
            },
          ],
        },
      ],
      modalities: ["image", "text"],
      provider: {
        allow_fallbacks: true,
        data_collection: "deny",
      },
    }),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    void appendOperationalLog("IMAGE_PROVIDER_NON_200", {
      provider: "openrouter",
      model: ENV.openRouterImageModel,
      statusCode: response.status,
      statusText: response.statusText,
      body,
    });
    throw new Error(`OpenRouter image generation failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  console.log('[ImageGen] OpenRouter response structure:', JSON.stringify(json, null, 2).slice(0, 1000));
  const candidates = collectImageCandidates(json);
  console.log('[ImageGen] Collected image candidates:', candidates.length, candidates.map(c => c.slice(0, 100)));
  const candidate = candidates[0];
  if (!candidate) {
    throw new Error("OpenRouter image response did not contain an image payload");
  }

  return toDataUri(candidate);
}

async function generateWithPollinations(
  prompt: string,
  provider: ImageProvider,
): Promise<string> {
  const modelId = provider === "pollinations_hd" ? "nanobanana-pro" : "nanobanana";
  const encodedPrompt = encodeURIComponent(wrapPrompt(prompt));
  const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${modelId}&nologo=true&width=1080&height=1080&enhance=true`;

  const headers: Record<string, string> = {
    "User-Agent": "PostSpark/1.0",
    Accept: "image/jpeg, image/png, image/*",
  };

  if (process.env.POLLINATIONS_API_KEY) {
    headers.Authorization = `Bearer ${process.env.POLLINATIONS_API_KEY}`;
  }

  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    void appendOperationalLog("IMAGE_PROVIDER_NON_200", {
      provider: "pollinations",
      model: modelId,
      statusCode: response.status,
      statusText: response.statusText,
      body: errorText.slice(0, 500),
    });
    throw new Error(`Pollinations API failed: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const dataUri = `data:image/jpeg;base64,${buffer.toString("base64")}`;
  console.log('[ImageGen] Pollinations data URI length:', dataUri.length, 'first 100 chars:', dataUri.slice(0, 100));
  return dataUri;
}

export async function generateBackgroundImage(
  prompt: string,
  provider: ImageProvider = "pollinations_fast",
): Promise<string> {
  console.log(`[ImageGen] Request: provider=${provider}, prompt="${prompt.substring(0, 50)}..."`);

  try {
    const image = await generateWithOpenRouter(prompt, provider);
    void appendOperationalLog("IMAGE_PROVIDER_200", {
      provider: "openrouter",
      model: ENV.openRouterImageModel,
      imageProvider: provider,
    });
    return image;
  } catch (error) {
    console.warn("[ImageGen] OpenRouter image generation failed; falling back to Pollinations.", error);
    void appendOperationalLog("IMAGE_PROVIDER_FALLBACK", {
      fromProvider: "openrouter",
      fromModel: ENV.openRouterImageModel,
      toProvider: "pollinations",
      error,
    });
  }

  return generateWithPollinations(prompt, provider);
}
