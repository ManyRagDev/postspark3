import { access, constants } from "node:fs/promises";
import {
  imageEditResultSchema,
  IMAGE_EDITOR_TOOLS,
  imageEditorToolsForGroups,
  type ImageEditInput,
} from "../../shared/imageEditor";
import { decodeImageData, ImageEditorError } from "./raster";
import { ImageProcessor } from "./processor";

let localProcessor: ImageProcessor | undefined;
let remoteActive = 0;
const remoteActors = new Set<string>();
export function imageEditorConfigured() {
  return (
    process.env.ADVANCED_IMAGE_EDITOR_ENABLED === "true" &&
    Boolean(
      (process.env.ADVANCED_IMAGE_PROCESSOR_URL &&
        process.env.ADVANCED_IMAGE_PROCESSOR_TOKEN) ||
        process.env.PHOTOCRAFT_BIN
    )
  );
}
export async function advancedImageEdit(
  input: ImageEditInput,
  actor: string,
  signal?: AbortSignal
) {
  if (!imageEditorConfigured())
    throw new ImageEditorError(
      "UNAVAILABLE",
      "A edição avançada está temporariamente indisponível."
    );
  if (
    !imageEditorToolsForGroups(
      process.env.ADVANCED_IMAGE_CORE_ENABLED === "true",
      process.env.ADVANCED_IMAGE_FINISHING_ENABLED === "true",
      process.env.ADVANCED_IMAGE_IRIS_ENABLED === "true"
    ).some(t => t.kind === input.operation.kind)
  )
    throw new ImageEditorError(
      "UNAVAILABLE",
      "Este tratamento está temporariamente indisponível."
    );
  const endpoint = process.env.ADVANCED_IMAGE_PROCESSOR_URL;
  if (!endpoint) {
    localProcessor ??= new ImageProcessor({
      binary: process.env.PHOTOCRAFT_BIN!,
      workRoot: process.env.PHOTOCRAFT_WORK_ROOT,
    });
    return localProcessor.process(input, actor, signal);
  }
  if (remoteActive >= 2 || remoteActors.has(actor))
    throw new ImageEditorError(
      "BUSY",
      "O editor está ocupado. Aguarde um instante e tente novamente."
    );
  remoteActive++;
  remoteActors.add(actor);
  try {
    const source = decodeImageData(input.imageData);
    const combined = AbortSignal.any([
      AbortSignal.timeout(95_000),
      ...(signal ? [signal] : []),
    ]);
    const response = await fetch(new URL("/process", endpoint), {
      method: "POST",
      redirect: "error",
      signal: combined,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ADVANCED_IMAGE_PROCESSOR_TOKEN}`,
      },
      body: JSON.stringify({ ...input, actor }),
    });
    if (!response.ok) {
      if (response.status === 429 || response.status === 503)
        throw new ImageEditorError(
          "BUSY",
          "O editor está ocupado. Aguarde um instante e tente novamente."
        );
      if (response.status === 400)
        throw new ImageEditorError(
          "INVALID",
          "Confira a imagem, as dimensões e a seleção."
        );
      if (response.status === 504)
        throw new ImageEditorError(
          "TIMEOUT",
          "A edição demorou demais. Tente uma imagem menor."
        );
      throw new ImageEditorError(
        "FAILED",
        "Não foi possível concluir a edição. Tente novamente."
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("empty response");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 12 * 1024 * 1024) throw new Error("oversized response");
        chunks.push(part.value);
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    }
    const result = imageEditResultSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString())
    );
    const output = decodeImageData(result.imageData);
    if (
      result.requestId !== input.requestId ||
      result.sourceSha256 !== source.sha256 ||
      result.resultSha256 !== output.sha256 ||
      result.format !== input.format ||
      output.mimeType !== `image/${input.format}` ||
      source.width !== result.sourceDimensions.width ||
      source.height !== result.sourceDimensions.height ||
      output.width !== result.resultDimensions.width ||
      output.height !== result.resultDimensions.height
    )
      throw new Error("receipt mismatch");
    return result;
  } catch (error) {
    if (error instanceof ImageEditorError) throw error;
    if (signal?.aborted)
      throw new ImageEditorError("CANCELLED", "Edição cancelada.");
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    )
      throw new ImageEditorError(
        "TIMEOUT",
        "A edição demorou demais. Tente uma imagem menor."
      );
    throw new ImageEditorError(
      "UNAVAILABLE",
      "A edição avançada está temporariamente indisponível."
    );
  } finally {
    remoteActive--;
    remoteActors.delete(actor);
  }
}

export async function advancedImageCapabilities() {
  const enabled = imageEditorConfigured();
  const tools = imageEditorToolsForGroups(
    process.env.ADVANCED_IMAGE_CORE_ENABLED === "true",
    process.env.ADVANCED_IMAGE_FINISHING_ENABLED === "true",
    process.env.ADVANCED_IMAGE_IRIS_ENABLED === "true"
  );
  if (!enabled) return { available: false, tools: [], message: "O processamento de imagens não está configurado neste ambiente." };
  const endpoint = process.env.ADVANCED_IMAGE_PROCESSOR_URL;
  try {
    if (!endpoint) {
      await access(process.env.PHOTOCRAFT_BIN!, constants.X_OK);
      return { available: true, tools };
    }
    const response = await fetch(new URL("/capabilities", endpoint), {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        Authorization: `Bearer ${process.env.ADVANCED_IMAGE_PROCESSOR_TOKEN}`,
      },
    });
    if (response.status === 404)
      return { available: true, tools: IMAGE_EDITOR_TOOLS.slice(0, 6) };
    if (!response.ok) throw new Error("unavailable");
    const body = (await response.json()) as { tools?: Array<{ kind: string }> };
    return {
      available: true,
      tools: tools.filter(t =>
        body.tools?.some(remote => remote.kind === t.kind)
      ),
    };
  } catch {
    return { available: false, tools: [], message: "O processador de imagens está indisponível. Tente conectar novamente." };
  }
}
