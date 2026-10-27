import React, { createRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { ArsenalAsset, ArsenalComposition } from "@shared/designArsenal";
import {
  CanvasPostStage,
  type CanvasPostStageRef,
} from "../pages/CanvasLab/components/CanvasPostStage";
import { INITIAL_POST } from "../pages/CanvasLab/components/types";
import { putArsenalComposition } from "../pages/CanvasLab/lib/arsenalComposition";
import { installArsenalFontBytes } from "../pages/CanvasLab/lib/arsenalAssets";

// This entry point has no session, API credentials, editor controls or network access.
// It paints the same authoritative composition and exports through the editor itself.
const root = createRoot(document.getElementById("root")!);
async function render(input: {
  composition: ArsenalComposition;
  fonts: Array<{ asset: ArsenalAsset; base64: string }>;
}) {
  await Promise.all(
    input.fonts.map(({ asset, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      return installArsenalFontBytes(asset, bytes.buffer);
    })
  );
  const scene = input.composition;
  const post = putArsenalComposition(
    {
      ...structuredClone(INITIAL_POST),
      id: "review",
      modelVersion: 2,
      aspectRatio: scene.effectiveAspectRatio,
      palette: {
        ...INITIAL_POST.palette,
        background: scene.artboard.background,
      },
      showBadge: false,
      showStep: false,
      currentSlideIndex: 0,
      slides: [{ id: "review-slide", step: "", headline: "", subtext: "" }],
    },
    scene
  );
  const ref = createRef<CanvasPostStageRef>();
  flushSync(() =>
    root.render(
      <CanvasPostStage
        key={crypto.randomUUID()}
        ref={ref}
        post={post}
        zoom={1}
        isReadOnly
      />
    )
  );
  // React effects load the actual Konva images; the editor's export guard rejects
  // incomplete scenes. A frame flush is required after fonts become available.
  await new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
  if (!ref.current || !(await ref.current.exportThumbnail()))
    throw new Error("proposal_review_assets_unavailable");
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const dataUri = ref.current.exportPng4K(1440);
  if (!dataUri) throw new Error("proposal_review_empty_render");
  const image = new Image();
  image.src = dataUri;
  await image.decode();
  flushSync(() => root.render(null));
  return { dataUri, width: image.naturalWidth, height: image.naturalHeight };
}

Object.assign(window, { renderPostSparkReview: render });
