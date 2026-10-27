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
import {
  hashPrompt,
  recordLlmTraceCall,
  recordGenerationEvent,
} from "./ai/generationTrace";
import {
  imageDimensions,
  openRouterImageRatio,
  type ImageAspectRatio,
} from "@shared/imageGeneration";

export type ImageProvider = "pollinations_fast" | "pollinations_hd";

function wrapPrompt(userPrompt: string): string {
  return (
    `Create a polished, original background image for a social media post. ${userPrompt}\n` +
    "Preserve the user-selected scene as the primary visual intent, including a static product scene when requested. " +
    "Show its relevant environment and circumstances; include buying or marketplace context only when the selected scene calls for it. " +
    "Use coherent materials, natural proportions, controlled lighting and fine detail. " +
    "Treat any supplied palette as a gentle harmony cue where it fits; preserve the scene's specified colors and lighting. " +
    "Composition and copy-space notes are optional suggestions, never mandatory blank areas, masks or crop zones. " +
    "Avoid readable text, logos and watermarks by default. If the selected scene includes a screen, interface, sign, tag, label or package, include it when relevant and use plausible visual details without legible invented copy. " +
    "Avoid unrelated stock-photo clichés."
  );
}

type ImageCandidate = {
  value: string;
  mimeType?: string;
};

export interface ImageGenerationRouteOptions {
  routePolicy?: "legacy" | "strict";
  purpose?: string;
  originalImages?: Array<{ url?: string; b64Json?: string; mimeType?: string }>;
  signal?: AbortSignal;
}

export type StrictImageModelCapabilities = {
  inputReferences: boolean;
  aspectRatios: readonly ImageAspectRatio[];
  supportedPurposes: readonly string[];
};

/** Explicitly verified capabilities for strict V5 image models. */
export const strictImageModelCapabilities: Readonly<
  Record<string, StrictImageModelCapabilities>
> = {
  "google/gemini-3.1-flash-image": {
    inputReferences: true,
    aspectRatios: ["1:1", "4:5", "5:6", "9:16"],
    supportedPurposes: [
      "editorial-photo",
      "product",
      "illustration",
      "series",
      "conceptual",
    ],
  },
  "bytedance-seed/seedream-5-0-pro": {
    inputReferences: true,
    aspectRatios: ["1:1", "4:5", "5:6", "9:16"],
    supportedPurposes: [
      "product",
      "editorial-photo",
      "illustration",
      "series",
      "conceptual",
    ],
  },
  // Alias retrocompatível com ponto
  "bytedance-seed/seedream-5.0-pro": {
    inputReferences: true,
    aspectRatios: ["1:1", "4:5", "5:6", "9:16"],
    supportedPurposes: [
      "product",
      "editorial-photo",
      "illustration",
      "series",
      "conceptual",
    ],
  },
};

/** Purpose-based model priority and verified fallback candidates (Blueprint §7) */
export const PURPOSE_MODEL_ROUTING: Readonly<
  Record<string, { primary: string; fallbacks: readonly string[] }>
> = {
  product: {
    primary: "bytedance-seed/seedream-5-0-pro",
    fallbacks: ["google/gemini-3.1-flash-image"],
  },
  "editorial-photo": {
    primary: "google/gemini-3.1-flash-image",
    fallbacks: ["bytedance-seed/seedream-5-0-pro"],
  },
  illustration: {
    primary: "bytedance-seed/seedream-5-0-pro",
    fallbacks: ["google/gemini-3.1-flash-image"],
  },
  series: {
    primary: "google/gemini-3.1-flash-image",
    fallbacks: ["bytedance-seed/seedream-5-0-pro"],
  },
  conceptual: {
    primary: "google/gemini-3.1-flash-image",
    fallbacks: ["bytedance-seed/seedream-5-0-pro"],
  },
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
    const mimeType =
      (inlineData as Record<string, unknown>).mime_type ??
      (inlineData as Record<string, unknown>).mimeType;
    if (typeof data === "string") {
      return {
        value: data,
        mimeType: typeof mimeType === "string" ? mimeType : undefined,
      };
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
        if (type !== "image" && type !== "image_url" && type !== "output_image")
          continue;
        const candidate = candidateFromImageNode(part);
        if (candidate) output.push(candidate);
      }
    }
  }

  return output;
}

function detectImageMimeType(buffer: Buffer): string | null {
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))
  ) {
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
    throw new Error(
      `Image payload has an invalid binary signature${declaredMimeType ? ` (declared ${declaredMimeType})` : ""}`
    );
  }

  return `data:${detectedMimeType};base64,${buffer.toString("base64")}`;
}

async function toDataUri(candidate: ImageCandidate): Promise<string> {
  const dataUri = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(
    candidate.value
  );
  if (dataUri) return validatedDataUri(dataUri[2], dataUri[1]);

  if (/^https?:\/\//i.test(candidate.value)) {
    const response = await fetch(candidate.value);
    if (!response.ok) {
      throw new Error(
        `Image URL fetch failed: ${response.status} ${response.statusText}`
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return validatedDataUri(
      buffer.toString("base64"),
      response.headers.get("content-type") ?? undefined
    );
  }

  return validatedDataUri(candidate.value, candidate.mimeType);
}

async function generateWithOpenRouter(
  prompt: string,
  provider: ImageProvider,
  aspectRatio: ImageAspectRatio,
  model: string,
  strictRoute: boolean,
  references: string[] = [],
  signal?: AbortSignal
): Promise<string> {
  if (!ENV.openRouterApiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured for image generation"
    );
  }

  console.info("[ImageGen] Calling image service", {
    service: "OpenRouter",
    model,
    qualityMode: provider,
  });

  const nativeRatio = openRouterImageRatio[aspectRatio];
  const normalizedModel =
    model === "bytedance-seed/seedream-5.0-pro"
      ? "bytedance-seed/seedream-5-0-pro"
      : model;
  const startedAt = Date.now();
  const recordUnknownAttempt = (reason: string) =>
    recordLlmTraceCall({
      label: "proposal_image",
      taskRoute: "image_generation",
      requestedModel: normalizedModel,
      effectiveModel: "unknown",
      effectiveModelReported: false,
      provider: "openrouter",
      promptHash: hashPrompt([
        { prompt, aspectRatio, references: references.length },
      ]),
      messages: [],
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: Date.now() - startedAt,
      estimatedCostUsd: 0,
      costSource: "unknown",
      error: reason,
    });

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.openRouterApiKey}`,
        "HTTP-Referer": ENV.openRouterSiteUrl,
        "X-Title": ENV.openRouterAppName,
      },
      body: JSON.stringify({
        model: normalizedModel,
        image_config: { aspect_ratio: nativeRatio },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${wrapPrompt(prompt)}

Output requirements:
- Compose for a ${aspectRatio} social media canvas using the requested ${nativeRatio} native image ratio. Keep important scene elements comfortably within the canvas when practical; do not force a centered subject or reserve blank crop bands.
- Quality level: ${provider === "pollinations_hd" ? "high detail" : "fast production quality"}.
- Return the image result; do not return explanatory text.`,
              },
              ...references.map(url => ({
                type: "image_url" as const,
                image_url: { url },
              })),
            ],
          },
        ],
        modalities: ["image", "text"],
        provider: {
          allow_fallbacks: !strictRoute,
          data_collection: "deny",
        },
      }),
      signal,
    });
  } catch (error) {
    recordUnknownAttempt("image_provider_transport_failed");
    throw error;
  }

  if (!response.ok) {
    recordUnknownAttempt(`image_provider_http_${response.status}`);
    const body = (await response.text()).slice(0, 500);
    void appendOperationalLog("IMAGE_PROVIDER_NON_200", {
      provider: "openrouter",
      model,
      statusCode: response.status,
      statusText: response.statusText,
      body,
    });
    throw new Error(
      `OpenRouter image generation failed: ${response.status} ${response.statusText}`
    );
  }

  const json = await response.json();
  const usage = json.usage ?? {};
  const metric = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : 0;
  const knownCost =
    typeof usage.cost === "number" &&
    Number.isFinite(usage.cost) &&
    usage.cost >= 0;
  recordLlmTraceCall({
    label: "proposal_image",
    taskRoute: "image_generation",
    requestedModel: normalizedModel,
    effectiveModel:
      typeof json.model === "string" && json.model.trim()
        ? json.model
        : "unknown",
    effectiveModelReported:
      typeof json.model === "string" && Boolean(json.model.trim()),
    provider: "openrouter",
    providerId: typeof json.id === "string" ? json.id : undefined,
    promptHash: hashPrompt([
      { prompt, aspectRatio, references: references.length },
    ]),
    messages: [
      { role: "user", content: prompt, referenceImageCount: references.length },
    ],
    response: { id: json.id, model: json.model, usage: json.usage },
    promptTokens: metric(usage.prompt_tokens),
    completionTokens: metric(usage.completion_tokens),
    totalTokens:
      metric(usage.total_tokens) ||
      metric(usage.prompt_tokens) + metric(usage.completion_tokens),
    latencyMs: Date.now() - startedAt,
    estimatedCostUsd: knownCost ? usage.cost : 0,
    costSource: knownCost ? "provider" : "unknown",
  });
  recordGenerationEvent({
    stage: "image_provider_response",
    status: "completed",
    detail: "provider_evidence",
    data: {
      modelReported: typeof json.model === "string",
      providerIdReported: typeof json.id === "string",
      usageReported: Boolean(json.usage),
      costKnown: knownCost,
    },
  });
  const candidates = collectImageCandidates(json);
  console.log(
    "[ImageGen] Collected structured image candidates:",
    candidates.length
  );
  if (candidates.length === 0) {
    throw new Error(
      "OpenRouter image response did not contain an image payload"
    );
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
    throw new Error(
      "OpenRouter image response contained no valid image payload",
      {
        cause: lastValidationError,
      }
    );
  }

  console.info("[ImageGen] Image service succeeded", {
    service: "OpenRouter",
    model,
    qualityMode: provider,
  });
  return image;
}

async function generateWithPollinations(
  prompt: string,
  provider: ImageProvider,
  aspectRatio: ImageAspectRatio,
  signal?: AbortSignal
): Promise<string> {
  const modelId =
    provider === "pollinations_hd" ? "nanobanana-pro" : "nanobanana";
  const { width, height } = imageDimensions[aspectRatio];
  const encodedPrompt = encodeURIComponent(wrapPrompt(prompt));
  const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${modelId}&nologo=true&width=${width}&height=${height}&enhance=true`;

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

  const response = await fetch(url, { method: "GET", headers, signal });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "No error body");
    void appendOperationalLog("IMAGE_PROVIDER_NON_200", {
      provider: "pollinations",
      model: modelId,
      statusCode: response.status,
      statusText: response.statusText,
      body: errorText.slice(0, 500),
    });
    throw new Error(
      `Pollinations API failed: ${response.status} ${response.statusText}`
    );
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
  aspectRatio: ImageAspectRatio = "1:1",
  routeOptions: ImageGenerationRouteOptions = {}
): Promise<string> {
  const strict = routeOptions.routePolicy === "strict";
  const references = strict
    ? await resolveStrictReferences(routeOptions.originalImages ?? [])
    : [];
  if (strict) {
    const purpose = routeOptions.purpose ?? "editorial-photo";
    const routing = PURPOSE_MODEL_ROUTING[purpose] ?? {
      primary: ENV.openRouterV5ImageModel || "google/gemini-3.1-flash-image",
      fallbacks: ["bytedance-seed/seedream-5-0-pro"],
    };
    const configuredModel = ENV.openRouterV5ImageModel;
    if (configuredModel && !strictImageModelCapabilities[configuredModel]) {
      throw new Error(
        `Modelo strict '${configuredModel}' com capabilities não verificadas`
      );
    }
    const candidateModels = Array.from(
      new Set([
        routing.primary,
        ...(configuredModel ? [configuredModel] : []),
        ...routing.fallbacks,
      ])
    );

    let lastError: unknown;
    for (const candidate of candidateModels) {
      const capabilities = strictImageModelCapabilities[candidate];
      if (!capabilities) {
        continue;
      }
      if (!capabilities.aspectRatios.includes(aspectRatio)) {
        continue;
      }
      if (references.length > 0 && !capabilities.inputReferences) {
        continue;
      }

      console.info("[ImageGen] Strict route invoking model", {
        service: "OpenRouter",
        model: candidate,
        purpose,
        aspectRatio,
        referencesCount: references.length,
      });

      try {
        const image = await generateWithOpenRouter(
          prompt,
          provider,
          aspectRatio,
          candidate,
          true,
          references,
          routeOptions.signal
        );
        void appendOperationalLog("IMAGE_PROVIDER_200", {
          provider: "openrouter",
          model: candidate,
          imageProvider: provider,
          purpose,
        });
        return image;
      } catch (error) {
        lastError = error;
        console.warn(
          "[ImageGen] Strict route model failed, attempting verified fallback",
          {
            failedModel: candidate,
            purpose,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        void appendOperationalLog("IMAGE_PROVIDER_STRICT_FALLBACK", {
          provider: "openrouter",
          failedModel: candidate,
          purpose,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error(
      `Imagem strict falhou em todos os modelos compatíveis para o propósito '${purpose}': ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }

  const model = ENV.openRouterImageModel;

  console.info("[ImageGen] Image generation requested", {
    primaryService: "OpenRouter",
    primaryModel: model,
    fallbackService: "Pollinations.ai",
    qualityMode: provider,
  });

  try {
    const image = await generateWithOpenRouter(
      prompt,
      provider,
      aspectRatio,
      model,
      strict,
      references,
      routeOptions.signal
    );
    void appendOperationalLog("IMAGE_PROVIDER_200", {
      provider: "openrouter",
      model,
      imageProvider: provider,
    });
    return image;
  } catch (error) {
    console.warn("[ImageGen] Switching image service", {
      failedService: "OpenRouter",
      failedModel: model,
      nextService: "Pollinations.ai",
      qualityMode: provider,
      error,
    });
    void appendOperationalLog("IMAGE_PROVIDER_FALLBACK", {
      fromProvider: "openrouter",
      fromModel: model,
      toProvider: "pollinations",
      error,
    });
  }

  return generateWithPollinations(
    prompt,
    provider,
    aspectRatio,
    routeOptions.signal
  );
}

async function resolveStrictReferences(
  references: NonNullable<ImageGenerationRouteOptions["originalImages"]>
): Promise<string[]> {
  if (references.length > 10)
    throw new Error("Modelo strict aceita no máximo 10 imagens de referência");
  return Promise.all(
    references.map(async reference => {
      let value: string;
      let mimeType = reference.mimeType;
      if (reference.url) {
        if (!reference.url.startsWith("data:image/")) {
          throw new Error(
            "Referência strict deve conter bytes autorizados; URLs externas não são buscadas"
          );
        }
        value = reference.url;
      } else if (reference.b64Json) {
        value = reference.b64Json;
      } else {
        throw new Error("Referência strict sem bytes de imagem");
      }

      const dataUri = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(
        value
      );
      if (dataUri) {
        if (dataUri[2].length > 11_200_000)
          throw new Error("Referência de imagem strict excede 8 MiB");
        return toDataUri({ value });
      }
      if (!mimeType || !/^image\/(?:png|jpeg|webp)$/i.test(mimeType)) {
        throw new Error("MIME type da referência strict inválido");
      }
      if (value.length > 11_200_000)
        throw new Error("Referência de imagem strict excede 8 MiB");
      return toDataUri({ value, mimeType });
    })
  );
}
