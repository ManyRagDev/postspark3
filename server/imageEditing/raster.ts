import { createHash } from "node:crypto";
import {
  IMAGE_EDITOR_MAX_BYTES,
  IMAGE_EDITOR_MAX_DIMENSION,
  IMAGE_EDITOR_MAX_PIXELS,
} from "../../shared/imageEditor";

export class ImageEditorError extends Error {
  constructor(
    public code:
      | "INVALID"
      | "BUSY"
      | "UNAVAILABLE"
      | "TIMEOUT"
      | "CANCELLED"
      | "FAILED",
    message: string
  ) {
    super(message);
  }
}
const invalid = () =>
  new ImageEditorError(
    "INVALID",
    "Envie uma imagem PNG, JPEG ou WebP válida de até 8 MiB e 3840 pixels por lado."
  );

/** Bound dimensions before any decoder allocates a full raster. Never trusts the URI MIME. */
export function inspectRaster(bytes: Buffer) {
  if (!bytes.length || bytes.length > IMAGE_EDITOR_MAX_BYTES) throw invalid();
  let width = 0,
    height = 0,
    mimeType = "";
  if (
    bytes.length >= 33 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString("ascii", 12, 16) === "IHDR"
  ) {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
    mimeType = "image/png";
  } else if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216) {
    mimeType = "image/jpeg";
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 255) throw invalid();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) throw invalid();
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) throw invalid();
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        if (length < 8) throw invalid();
        height = bytes.readUInt16BE(offset + 3);
        width = bytes.readUInt16BE(offset + 5);
        break;
      }
      offset += length;
    }
  } else if (
    bytes.length >= 30 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    mimeType = "image/webp";
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      if (bytes[20] & 2)
        throw new ImageEditorError(
          "INVALID",
          "Use uma imagem estática para editar."
        );
      width = bytes.readUIntLE(24, 3) + 1;
      height = bytes.readUIntLE(27, 3) + 1;
    } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (
      chunk === "VP8 " &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      width = bytes.readUInt16LE(26) & 0x3fff;
      height = bytes.readUInt16LE(28) & 0x3fff;
    }
  }
  if (
    !width ||
    !height ||
    width > IMAGE_EDITOR_MAX_DIMENSION ||
    height > IMAGE_EDITOR_MAX_DIMENSION ||
    width * height > IMAGE_EDITOR_MAX_PIXELS
  )
    throw invalid();
  return {
    width,
    height,
    mimeType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function decodeImageData(value: string) {
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw invalid();
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.toString("base64") !== match[2]) throw invalid();
  const metadata = inspectRaster(bytes);
  if (metadata.mimeType !== `image/${match[1]}`) throw invalid();
  return { bytes, ...metadata };
}
