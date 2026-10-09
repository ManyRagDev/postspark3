import { saveUserMediaAsset } from "../mediaAssets";
import { storagePut } from "server/storage";
import { generateBackgroundImage } from "../imageGenerateBackground";
import { buildImageGenerationPrompt, type ImageAspectRatio, type ImagePostContext } from "@shared/imageGeneration";

export type GenerateImageOptions = {
  prompt: string;
  ownerId?: string;
  aspectRatio?: ImageAspectRatio;
  postContext?: ImagePostContext;
  purpose?: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
  /** Strict is reserved for proposal V5 and requires a capability-verified image route. */
  routePolicy?: "legacy" | "strict";
  signal?: AbortSignal;
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (options.routePolicy === "strict" && !options.ownerId) {
    throw new Error("Proprietário é obrigatório para geração de mídia V5");
  }

  const sourceImageNote =
    options.routePolicy !== "strict" && options.originalImages && options.originalImages.length > 0
      ? " Use the provided reference image(s) as style/content guidance when supported."
      : "";

  const prompt = `${buildImageGenerationPrompt(options.prompt, options.postContext)}${sourceImageNote}`;
  const dataUri = options.routePolicy === "strict"
    ? await generateBackgroundImage(prompt, "pollinations_hd", options.aspectRatio, {
        routePolicy: "strict",
        purpose: options.purpose,
        originalImages: options.originalImages,
        signal: options.signal,
      })
    : await generateBackgroundImage(prompt, "pollinations_hd", options.aspectRatio);

  if (options.ownerId) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error("Operação de geração de imagem cancelada");
    }
    const saved = options.signal
      ? await saveUserMediaAsset(dataUri, options.ownerId, options.signal)
      : await saveUserMediaAsset(dataUri, options.ownerId);
    if (options.routePolicy === "strict") {
      const privateAsset = /^\/api\/post-media\/([^/]+)\/([a-f0-9]{64})$/i.exec(saved.url);
      if (!privateAsset || privateAsset[1] !== options.ownerId) {
        throw new Error("Storage não retornou asset privado do proprietário");
      }
    }
    return saved;
  }

  // Tenta persistir no Storage Proxy se configurado; caso contrário, retorna o próprio DataURI gerado pela IA
  try {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUri);
    if (match) {
      const [, mimeType, base64Data] = match;
      const buffer = Buffer.from(base64Data, "base64");
      const { url } = await storagePut(
        `generated/${Date.now()}.png`,
        buffer,
        mimeType
      );
      if (url) return { url };
    }
  } catch (storageErr) {
    console.info("[imageGeneration] Storage proxy local bypass, using direct DataURI.");
  }

  return {
    url: dataUri,
  };
}
