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

type ImageCandidate = {
  value: string;
  mimeType?: string;
};

function candidateFromImageNode(value: unknown): ImageCandidate | null {
  if (typeof value === "string") return { value };
  if (!value || typeof value !== "object") return null;

  const node = value as Record<string, unknown>;
  const imageUrl = node.image_url ?? node.imageUrl;
  if (typeof imageUrl === "string") return { value: imageUrl };
  if (imageUrl && typeof imageUrl === "object") {
    const url = (imageUrl as Record<string, unknown>).url;
    if (typeof url === "string") return { value: url };
  }
  if (typeof node.url === "string") return { value: node.url };

  const inlineData = node.inline_data ?? node.inlineData;
  if (inlineData && typeof inlineData === "object") {
    const data = (inlineData as Record<string, unknown>).data;
    const mimeType = (inlineData as Record<string, unknown>).mime_type
      ?? (inlineData as Record<string, unknown>).mimeType;
    if (typeof data === "string") {
      return { value: data, mimeType: typeof mimeType === "string" ? mimeType : undefined };
    }
  }

  if (typeof node.data === "string") {
    const mimeType = node.mime_type ?? node.mimeType;
    return {
      value: node.data,
      mimeType: typeof mimeType === "string" ? mimeType : undefined,
    };
  }

  return null;
}

function collectImageCandidates(response: unknown): ImageCandidate[] {
  if (!response || typeof response !== "object") return [];

  const output: ImageCandidate[] = [];
  const choices = (response as Record<string, unknown>).choices;
  if (!Array.isArray(choices)) return output;

  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as Record<string, unknown>).message;
    if (!message || typeof message !== "object") continue;
    const messageRecord = message as Record<string, unknown>;

    if (Array.isArray(messageRecord.images)) {
      for (const image of messageRecord.images) {
        const candidate = candidateFromImageNode(image);
        if (candidate) output.push(candidate);
      }
    }

    if (Array.isArray(messageRecord.content)) {
      for (const part of messageRecord.content) {
        if (!part || typeof part !== "object") continue;
        const type = (part as Record<string, unknown>).type;
        if (type !== "image" && type !== "image_url" && type !== "output_image") continue;
        const candidate = candidateFromImageNode(part);
        if (candidate) output.push(candidate);
      }
    }
  }

  return output;
}

function detectImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) {
    return "image/gif";
  }
  return null;
}

function validatedDataUri(base64: string, declaredMimeType?: string): string {
  const normalized = base64.replace(/\s/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("Image payload is not valid base64");
  }

  const buffer = Buffer.from(normalized, "base64");
  const detectedMimeType = detectImageMimeType(buffer);
  if (!detectedMimeType) {
    throw new Error(`Image payload has an invalid binary signature${declaredMimeType ? ` (declared ${declaredMimeType})` : ""}`);
  }

  return `data:${detectedMimeType};base64,${buffer.toString("base64")}`;
}

async function toDataUri(candidate: ImageCandidate): Promise<string> {
  const dataUri = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(candidate.value);
  if (dataUri) return validatedDataUri(dataUri[2], dataUri[1]);

  if (/^https?:\/\//i.test(candidate.value)) {
    const response = await fetch(candidate.value);
    if (!response.ok) {
      throw new Error(`Image URL fetch failed: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return validatedDataUri(buffer.toString("base64"), response.headers.get("content-type") ?? undefined);
  }

  return validatedDataUri(candidate.value, candidate.mimeType);
}

async function generateWithOpenRouter(
  prompt: string,
  provider: ImageProvider,
): Promise<string> {
  if (!ENV.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured for image generation");
  }

  console.info("[ImageGen] Calling image service", {
    service: "OpenRouter",
    model: ENV.openRouterImageModel,
    qualityMode: provider,
  });

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
  const candidates = collectImageCandidates(json);
  console.log('[ImageGen] Collected structured image candidates:', candidates.length);
  if (candidates.length === 0) {
    throw new Error("OpenRouter image response did not contain an image payload");
  }

  let image: string | null = null;
  let lastValidationError: unknown;
  for (const candidate of candidates) {
    try {
      image = await toDataUri(candidate);
      break;
    } catch (error) {
      lastValidationError = error;
    }
  }
  if (!image) {
    throw new Error("OpenRouter image response contained no valid image payload", {
      cause: lastValidationError,
    });
  }

  console.info("[ImageGen] Image service succeeded", {
    service: "OpenRouter",
    model: ENV.openRouterImageModel,
    qualityMode: provider,
  });
  return image;
}

async function generateWithPollinations(
  prompt: string,
  provider: ImageProvider,
): Promise<string> {
  const modelId = provider === "pollinations_hd" ? "nanobanana-pro" : "nanobanana";
  const encodedPrompt = encodeURIComponent(wrapPrompt(prompt));
  const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${modelId}&nologo=true&width=1080&height=1080&enhance=true`;

  console.info("[ImageGen] Calling image service", {
    service: "Pollinations.ai",
    model: modelId,
    qualityMode: provider,
  });

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
  console.info("[ImageGen] Image service succeeded", {
    service: "Pollinations.ai",
    model: modelId,
    qualityMode: provider,
  });
  return dataUri;
}

export async function generateBackgroundImage(
  prompt: string,
  provider: ImageProvider = "pollinations_fast",
): Promise<string> {
  console.info("[ImageGen] Image generation requested", {
    primaryService: "OpenRouter",
    primaryModel: ENV.openRouterImageModel,
    fallbackService: "Pollinations.ai",
    qualityMode: provider,
  });

  try {
    const image = await generateWithOpenRouter(prompt, provider);
    void appendOperationalLog("IMAGE_PROVIDER_200", {
      provider: "openrouter",
      model: ENV.openRouterImageModel,
      imageProvider: provider,
    });
    return image;
  } catch (error) {
    console.warn("[ImageGen] Switching image service", {
      failedService: "OpenRouter",
      failedModel: ENV.openRouterImageModel,
      nextService: "Pollinations.ai",
      qualityMode: provider,
      error,
    });
    void appendOperationalLog("IMAGE_PROVIDER_FALLBACK", {
      fromProvider: "openrouter",
      fromModel: ENV.openRouterImageModel,
      toProvider: "pollinations",
      error,
    });
  }

  return generateWithPollinations(prompt, provider);
}
