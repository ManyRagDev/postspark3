/**
 * Image generation helper using internal ImageService
 *
 * Example usage:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "A serene landscape with mountains"
 *   });
 *
 * For editing:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "Add a rainbow to this landscape",
 *     originalImages: [{
 *       url: "https://example.com/original.jpg",
 *       mimeType: "image/jpeg"
 *     }]
 *   });
 */
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
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUri);
  if (!match) {
    throw new Error("Image generation returned an invalid data URI");
  }
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, "base64");

  // Save to S3
  const { url } = await storagePut(
    `generated/${Date.now()}.png`,
    buffer,
    mimeType
  );
  return {
    url,
  };
}
