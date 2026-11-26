import React, { createRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  CanvasPostStage,
  type CanvasPostStageRef,
} from "../pages/CanvasLab/components/CanvasPostStage";
import { normalizeCanvasModel } from "../pages/CanvasLab/lib/saveAdapter";
import { activeTemporalSlots } from "../pages/CanvasLab/lib/activeTemporalSlots";
import type { CanvasPostModel } from "../pages/CanvasLab/components/types";

import type { ArsenalAsset } from "@shared/designArsenal";
import {
  installArsenalFontBytes,
  installArsenalImageBytes,
} from "../pages/CanvasLab/lib/arsenalAssets";

const root = createRoot(document.getElementById("root")!);
const ref = createRef<CanvasPostStageRef>();
async function open(
  post: CanvasPostModel,
  assets: { asset: ArsenalAsset; base64: string }[] = []
) {
  await Promise.all(
    assets.map(({ asset, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), char =>
        char.charCodeAt(0)
      ).buffer;
      return asset.family
        ? installArsenalFontBytes(asset, bytes)
        : installArsenalImageBytes(asset, bytes);
    })
  );
  const model = normalizeCanvasModel(post);
  if (!activeTemporalSlots(model, model.currentSlideIndex).length)
    throw new Error("O slide não contém vídeo visível.");
  flushSync(() =>
    root.render(<CanvasPostStage ref={ref} post={model} zoom={1} isReadOnly />)
  );
  if (!ref.current) throw new Error("Palco de vídeo indisponível.");
}
async function frame(time: number, maxDimension: number) {
  if (!ref.current?.exportFrameAt) throw Error("Exportador indisponível.");
  const canvas = await ref.current.exportFrameAt(time, maxDimension);
  return canvas.toDataURL("image/png").split(",")[1];
}
Object.assign(window, { mareOpenSlide: open, mareRenderFrame: frame });
