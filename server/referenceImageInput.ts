import { loadImage } from "@napi-rs/canvas";

export async function validateInputImage(dataUrl: string): Promise<{ width: number; height: number; bytes: Buffer; mimeType: "image/png" | "image/jpeg" | "image/webp" }> {
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) throw new Error("A referência não contém uma imagem base64 válida.");
  const mime = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) throw new Error("A referência deve ter entre 1 byte e 8 MB após decodificação.");

  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if ((mime === "png" && !isPng) || (mime === "jpeg" && !isJpeg) || (mime === "webp" && !isWebp)) {
    throw new Error("O conteúdo da referência não corresponde ao tipo de imagem declarado.");
  }

  const decoded = await loadImage(bytes);
  const width = decoded.width;
  const height = decoded.height;
  if (width < 64 || height < 64 || width > 8000 || height > 8000 || width * height > 32_000_000) {
    throw new Error("A referência precisa ter entre 64 e 8000 px por lado e no máximo 32 megapixels.");
  }
  return { width, height, bytes, mimeType: `image/${mime}` as "image/png" | "image/jpeg" | "image/webp" };
}

