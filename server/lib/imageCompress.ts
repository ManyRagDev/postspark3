import { createCanvas, loadImage } from "@napi-rs/canvas";

export async function compressBase64Image(dataUri: string, maxDimension = 600): Promise<string> {
  if (!dataUri || !dataUri.startsWith("data:image/")) return dataUri;
  // If it's already small (< 60KB), don't touch it
  if (dataUri.length < 80000) return dataUri;

  try {
    const img = await loadImage(dataUri);
    let { width, height } = img;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    // Encode to JPEG
    const jpegBuffer = canvas.toBuffer("image/jpeg");
    const newUri = `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
    console.info(`[imageCompress] Compressed ${Math.round(dataUri.length / 1024)} KB -> ${Math.round(newUri.length / 1024)} KB (${width}x${height})`);
    return newUri;
  } catch (err) {
    console.warn("[imageCompress] Failed to compress image, keeping original:", err);
    return dataUri;
  }
}

/**
 * Traverses any post creation/update payload and compresses any base64 images
 * found in imageUrl, bgValue, slides, variationSnapshot, or canvasModel.
 */
export async function compressPostPayload<T extends Record<string, any>>(payload: T): Promise<T> {
  const result: any = { ...payload };

  if (typeof result.imageUrl === "string" && result.imageUrl.startsWith("data:image/") && result.imageUrl.length > 50000) {
    result.imageUrl = await compressBase64Image(result.imageUrl);
  }

  if (result.bgValue && typeof result.bgValue === "object" && typeof (result.bgValue as any).url === "string" && (result.bgValue as any).url.startsWith("data:image/") && (result.bgValue as any).url.length > 50000) {
    result.bgValue = { ...result.bgValue, url: await compressBase64Image((result.bgValue as any).url) };
  }

  if (Array.isArray(result.slides)) {
    result.slides = await Promise.all(
      result.slides.map(async (slide: any) => {
        if (!slide || typeof slide !== "object") return slide;
        const s = { ...slide };
        if (typeof s.imageUrl === "string" && s.imageUrl.startsWith("data:image/") && s.imageUrl.length > 50000) {
          s.imageUrl = await compressBase64Image(s.imageUrl);
        }
        if (s.editorState && typeof s.editorState === "object" && s.editorState.bgValue && typeof s.editorState.bgValue.url === "string" && s.editorState.bgValue.url.startsWith("data:image/") && s.editorState.bgValue.url.length > 50000) {
          s.editorState = {
            ...s.editorState,
            bgValue: {
              ...s.editorState.bgValue,
              url: await compressBase64Image(s.editorState.bgValue.url),
            },
          };
        }
        return s;
      })
    );
  }

  if (result.variationSnapshot && typeof result.variationSnapshot === "object") {
    const snap = { ...(result.variationSnapshot as any) };
    if (typeof snap.imageUrl === "string" && snap.imageUrl.startsWith("data:image/") && snap.imageUrl.length > 50000) {
      snap.imageUrl = await compressBase64Image(snap.imageUrl);
    }
    if (snap.bgValue && typeof snap.bgValue.url === "string" && snap.bgValue.url.startsWith("data:image/") && snap.bgValue.url.length > 50000) {
      snap.bgValue = { ...snap.bgValue, url: await compressBase64Image(snap.bgValue.url) };
    }
    if (Array.isArray(snap.slides)) {
      snap.slides = await Promise.all(
        snap.slides.map(async (slide: any) => {
          if (!slide || typeof slide !== "object") return slide;
          const s = { ...slide };
          if (typeof s.imageUrl === "string" && s.imageUrl.startsWith("data:image/") && s.imageUrl.length > 50000) {
            s.imageUrl = await compressBase64Image(s.imageUrl);
          }
          if (s.editorState && typeof s.editorState === "object" && s.editorState.bgValue && typeof s.editorState.bgValue.url === "string" && s.editorState.bgValue.url.startsWith("data:image/") && s.editorState.bgValue.url.length > 50000) {
            s.editorState = {
              ...s.editorState,
              bgValue: {
                ...s.editorState.bgValue,
                url: await compressBase64Image(s.editorState.bgValue.url),
              },
            };
          }
          return s;
        })
      );
    }
    result.variationSnapshot = snap;
  }

  if (result.canvasModel && typeof result.canvasModel === "object") {
    const cm = { ...(result.canvasModel as any) };
    if (typeof cm.bgImage === "string" && cm.bgImage.startsWith("data:image/") && cm.bgImage.length > 50000) {
      cm.bgImage = await compressBase64Image(cm.bgImage);
    }
    if (Array.isArray(cm.slides)) {
      cm.slides = await Promise.all(
        cm.slides.map(async (slide: any) => {
          if (!slide || typeof slide !== "object") return slide;
          const s = { ...slide };
          if (typeof s.bgImage === "string" && s.bgImage.startsWith("data:image/") && s.bgImage.length > 50000) {
            s.bgImage = await compressBase64Image(s.bgImage);
          }
          return s;
        })
      );
    }
    result.canvasModel = cm;
  }

  return result;
}
