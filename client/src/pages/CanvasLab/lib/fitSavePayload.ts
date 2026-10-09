/** Vercel rejects function requests above 4.5 MB before Express can compress them. */
const MAX_SAVE_REQUEST_BYTES = 3_500_000;

type ImageEncoder = (dataUri: string, maxDimension: number, quality: number) => Promise<string>;

function payloadBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}

function collectInlineImages(value: unknown, counts: Map<string, number>): void {
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) counts.set(value, (counts.get(value) ?? 0) + 1);
  } else if (Array.isArray(value)) {
    value.forEach(item => collectInlineImages(item, counts));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach(item => collectInlineImages(item, counts));
  }
}

function replaceInlineImages<T>(value: T, replacements: Map<string, string>): T {
  if (typeof value === "string") return (replacements.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map(item => replaceInlineImages(item, replacements)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceInlineImages(item, replacements)]),
    ) as T;
  }
  return value;
}

async function encodeInlineImage(dataUri: string, maxDimension: number, quality: number): Promise<string> {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return resolve(dataUri);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        // WebP keeps transparency in logos and overlays, unlike JPEG.
        const encoded = canvas.toDataURL("image/webp", quality);
        resolve(encoded.startsWith("data:image/webp") ? encoded : dataUri);
      } catch {
        resolve(dataUri);
      }
    };
    image.onerror = () => resolve(dataUri);
    image.src = dataUri;
  });
}

/** Compress only when a complete save request approaches the function limit. */
export async function fitSavePayload<T extends object>(
  payload: T,
  encodeImage: ImageEncoder = encodeInlineImage,
): Promise<T> {
  if (payloadBytes(payload) <= MAX_SAVE_REQUEST_BYTES) return payload;

  const counts = new Map<string, number>();
  collectInlineImages(payload, counts);
  const images = Array.from(counts.keys()).sort((left, right) =>
    right.length * counts.get(right)! - left.length * counts.get(left)!,
  );
  const replacements = new Map<string, string>();

  for (const { maxDimension, quality } of [
    { maxDimension: 800, quality: 0.78 },
    { maxDimension: 600, quality: 0.62 },
    { maxDimension: 420, quality: 0.48 },
  ]) {
    for (const image of images) {
      const encoded = await encodeImage(image, maxDimension, quality);
      if (encoded.length >= (replacements.get(image) ?? image).length) continue;
      replacements.set(image, encoded);
      const prepared = replaceInlineImages(payload, replacements);
      if (payloadBytes(prepared) <= MAX_SAVE_REQUEST_BYTES) return prepared;
    }
  }

  throw new Error("Este post é grande demais para salvar. Reduza algumas imagens ou o texto e tente novamente.");
}
