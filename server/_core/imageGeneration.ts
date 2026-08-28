import { storagePut } from "server/storage";
import { generateBackgroundImage } from "../imageGenerateBackground";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  const sourceImageNote =
    options.originalImages && options.originalImages.length > 0
      ? " Use the provided reference image(s) as style/content guidance when supported."
      : "";
  
  const dataUri = await generateBackgroundImage(
    `${options.prompt}.${sourceImageNote}`,
    "pollinations_hd",
  );

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
