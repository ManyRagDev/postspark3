import type {
  ImageEditAsset,
  ImageEditOperation,
  ImageEditResult,
} from "@shared/imageEditor";
import type { CanvasPostModel } from "../components/types";
import {
  applyMediaOperation,
  BACKGROUND_SLOT,
  mediaTargets,
  type MediaTarget,
} from "./mediaSlots";
import {
  getEditorElementState,
  COMPOSITION_BACKGROUND_ID,
  COMPOSITION_LOGO_ID,
} from "./editorElementState";
import { setEditorLogo } from "./editorController";

export interface AdvancedImageTarget extends MediaTarget {
  url: string;
  label: string;
  locked: boolean;
}
export function advancedImageTargets(
  post: CanvasPostModel
): AdvancedImageTarget[] {
  const slide = post.slides[post.currentSlideIndex];
  if (!slide) return [];
  const targets = mediaTargets(post).flatMap(target => {
    if (target.replacement?.originalActive) return [];
    const url =
      target.url ??
      (target.id === BACKGROUND_SLOT && !slide.composition
        ? post.bgImage
        : undefined);
    if (!url) return [];
    const elementId =
      target.id === BACKGROUND_SLOT
        ? slide.composition
          ? COMPOSITION_BACKGROUND_ID
          : "background"
        : target.id;
    return [
      {
        postId: post.id,
        slideId: slide.id,
        slotId: target.id,
        label: target.label,
        url,
        locked: getEditorElementState(post, slide.id, elementId).locked,
      },
    ];
  });
  const logoUrl = slide.composition
    ? slide.composition.version === 3
      ? slide.composition.logo?.url
      : undefined
    : (slide.logo?.url ?? post.logoUrl);
  if (logoUrl)
    targets.push({
      postId: post.id,
      slideId: slide.id,
      slotId: COMPOSITION_LOGO_ID,
      label: "Logo",
      url: logoUrl,
      locked: getEditorElementState(
        post,
        slide.id,
        slide.composition ? COMPOSITION_LOGO_ID : "logo"
      ).locked,
    });
  return targets;
}
function applyTargetImage(
  post: CanvasPostModel,
  target: AdvancedImageTarget,
  url: string
) {
  if (target.slotId !== COMPOSITION_LOGO_ID)
    return applyMediaOperation(post, target, { kind: "apply", url });
  const result = setEditorLogo(post, [target.slideId], { url });
  return result.ok ? result.post : null;
}
export function currentAdvancedTarget(
  post: CanvasPostModel,
  target: AdvancedImageTarget
) {
  const index = post.slides.findIndex(slide => slide.id === target.slideId);
  if (post.id !== target.postId || index < 0) return undefined;
  return advancedImageTargets({ ...post, currentSlideIndex: index }).find(
    t => t.slotId === target.slotId
  );
}
export interface AdvancedImagePreview {
  document: CanvasPostModel;
  target: AdvancedImageTarget;
  result: ImageEditResult;
  operation: ImageEditOperation;
}
/** Disposable rendering projection. Never commit or serialize this document. */
export function projectAdvancedImagePreview(
  post: CanvasPostModel,
  preview?: AdvancedImagePreview | null
): CanvasPostModel | null {
  if (
    !preview ||
    preview.document !== post ||
    post.slides[post.currentSlideIndex]?.id !== preview.target.slideId
  )
    return null;
  return (
    applyAdvancedPixels(
      post,
      preview.target,
      preview.result.imageData,
      preview.operation,
      preview.result
    )?.next ?? null
  );
}
function applyAdvancedPixels(
  post: CanvasPostModel,
  target: AdvancedImageTarget,
  url: string,
  operation: ImageEditOperation,
  result: ImageEditResult
) {
  const current = currentAdvancedTarget(post, target);
  if (!current || current.locked || current.url !== target.url) return null;
  let next = applyTargetImage(post, target, url);
  if (!next) return null;
  // Keep existing framing for pixel edits. Crop/trim intentionally center the new file.
  const index = post.slides.findIndex(s => s.id === target.slideId);
  const old = mediaTargets({ ...post, currentSlideIndex: index }).find(
    t => t.id === target.slotId
  );
  const composition = post.slides[index].composition;
  const geometric =
    ["crop", "trim"].includes(operation.kind) &&
    (result.sourceDimensions.width !== result.resultDimensions.width ||
      result.sourceDimensions.height !== result.resultDimensions.height);
  const fixedSlot =
    composition &&
    target.slotId !== BACKGROUND_SLOT &&
    !(
      composition.version === 3 &&
      composition.authorialLayers.some(layer => layer.id === target.slotId)
    );
  if (old && (geometric || fixedSlot))
    next =
      applyMediaOperation(next, target, {
        kind: "focal",
        focalX: geometric ? 0.5 : old.focalX,
        focalY: geometric ? 0.5 : old.focalY,
      }) ?? next;
  return { next, old };
}
export function applyAdvancedImageResult(
  post: CanvasPostModel,
  target: AdvancedImageTarget,
  saved: { inputUrl: string; resultUrl: string },
  result: ImageEditResult,
  operation: ImageEditOperation
): CanvasPostModel | null {
  const applied = applyAdvancedPixels(
    post,
    target,
    saved.resultUrl,
    operation,
    result
  );
  if (!applied) return null;
  const { next, old } = applied;
  const previous = post.advancedImageAssets?.[target.url];
  const record: ImageEditAsset = {
    version: 1,
    originalUrl: previous?.originalUrl ?? saved.inputUrl,
    inputUrl: saved.inputUrl,
    resultUrl: saved.resultUrl,
    operation,
    sourceDimensions: result.sourceDimensions,
    resultDimensions: result.resultDimensions,
  };
  if (previous?.originalFocal) record.originalFocal = previous.originalFocal;
  else if (old)
    record.originalFocal = {
      x: Math.max(0, Math.min(1, old.focalX)),
      y: Math.max(0, Math.min(1, old.focalY)),
    };
  const records = { ...post.advancedImageAssets, [saved.resultUrl]: record };
  if (Object.keys(records).length > 64) {
    // Drop receipts only for assets no longer referenced by the current document. Undo holds its own document.
    const { advancedImageAssets: _, ...document } = next;
    const serialized = JSON.stringify(document);
    for (const key of Object.keys(records))
      if (key !== saved.resultUrl && !serialized.includes(key))
        delete records[key];
    if (Object.keys(records).length > 64) return null;
  }
  return { ...next, advancedImageAssets: records };
}
export function restoreAdvancedImage(
  post: CanvasPostModel,
  target: AdvancedImageTarget
): CanvasPostModel | null {
  const current = currentAdvancedTarget(post, target),
    record = post.advancedImageAssets?.[target.url];
  if (!current || current.locked || current.url !== target.url || !record)
    return null;
  const next = applyTargetImage(post, target, record.originalUrl);
  return next && record.originalFocal
    ? applyMediaOperation(next, target, {
        kind: "focal",
        focalX: record.originalFocal.x,
        focalY: record.originalFocal.y,
      })
    : next;
}

/** Read pixels the signed-in browser can already access; never asks the server to fetch an arbitrary URL. */
export async function readAdvancedImage(
  url: string,
  signal: AbortSignal
): Promise<{ imageData: string; width: number; height: number }> {
  let blob: Blob;
  if (url.startsWith("data:image/")) {
    if (url.length > 12 * 1024 * 1024)
      throw new Error("Use uma imagem de até 8 MiB.");
    blob = await (await fetch(url, { signal })).blob();
  } else {
    const address = new URL(url, location.origin);
    if (!["https:", "http:"].includes(address.protocol))
      throw new Error("Esta referência de imagem não pode ser editada.");
    const response = await fetch(address, {
      signal,
      credentials: address.origin === location.origin ? "include" : "omit",
    });
    if (!response.ok)
      throw new Error(
        "A imagem original não está disponível. Reenvie a imagem para editar."
      );
    if (Number(response.headers.get("Content-Length")) > 8 * 1024 * 1024)
      throw new Error("Use uma imagem de até 8 MiB.");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Não foi possível ler a imagem.");
    let size = 0;
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 8 * 1024 * 1024)
          throw new Error("Use uma imagem de até 8 MiB.");
        chunks.push(new Uint8Array(part.value));
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const mime =
      bytes[0] === 137
        ? "image/png"
        : bytes[0] === 255
          ? "image/jpeg"
          : "image/webp";
    blob = new Blob([bytes], { type: mime });
  }
  if (!blob.size || blob.size > 8 * 1024 * 1024)
    throw new Error("Use uma imagem PNG, JPEG ou WebP de até 8 MiB.");
  const signature = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const mime =
    signature[0] === 137 &&
    signature[1] === 80 &&
    signature[2] === 78 &&
    signature[3] === 71
      ? "image/png"
      : signature[0] === 255 && signature[1] === 216
        ? "image/jpeg"
        : String.fromCharCode(...Array.from(signature.slice(0, 4))) ===
              "RIFF" &&
            String.fromCharCode(...Array.from(signature.slice(8, 12))) ===
              "WEBP"
          ? "image/webp"
          : undefined;
  if (!mime) throw new Error("Use uma imagem PNG, JPEG ou WebP válida.");
  blob = new Blob([blob], { type: mime });
  const imageData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    signal.addEventListener("abort", abort, { once: true });
    reader.onload = () => {
      signal.removeEventListener("abort", abort);
      resolve(String(reader.result));
    };
    reader.onerror = reader.onabort = () => {
      signal.removeEventListener("abort", abort);
      reject(new Error("Leitura da imagem cancelada."));
    };
    reader.readAsDataURL(blob);
    if (signal.aborted) reader.abort();
  });
  if (signal.aborted) throw new Error("Leitura da imagem cancelada.");
  const bitmap = await createImageBitmap(blob).catch(() => {
    throw new Error(
      "Não foi possível abrir a imagem. Use um PNG, JPEG ou WebP válido."
    );
  });
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  if (dimensions.width > 3840 || dimensions.height > 3840)
    throw new Error("Use uma imagem de até 3840 pixels por lado.");
  return { imageData, ...dimensions };
}
