// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import CanvasLabPage from "./CanvasLabPage";
import { INITIAL_POST, type CanvasPostModel } from "./components/types";
import { createArsenalFixtureComposition } from "./lib/arsenalFixture";
import { putArsenalComposition } from "./lib/arsenalComposition";
import { canvasModelToSavePayload, savedPostToCanvasModel, normalizeCanvasModel } from "./lib/saveAdapter";
import { fitSavePayload } from "./lib/fitSavePayload";
import { replicateSlideAppearance } from "./lib/slideReplication";

let canvasLabProps: any = null;

vi.mock("./components/CanvasPostStage", () => ({
  CanvasPostStage: React.forwardRef((props: any, ref: any) => {
    canvasLabProps = props;
    React.useImperativeHandle(ref, () => ({
      exportPng4K: vi.fn(() => "data:image/png;base64,mockpng4k"),
      exportZip4K: vi.fn(async () => new Blob(["zipdata"])),
      exportThumbnail: vi.fn(async () => "data:image/png;base64,thumb"),
      commitDraft: vi.fn(),
      cancelDraft: vi.fn(),
      hasActiveDraft: vi.fn(() => false),
    }));
    return <div data-testid="stage-stub" />;
  }),
}));

vi.mock("./components/CanvasTopBar", () => ({
  default: () => <div data-testid="topbar-stub" />,
}));
vi.mock("./components/CanvasSidebar", () => ({ default: () => null }));
vi.mock("./components/CanvasMobileDrawer", () => ({ default: () => null }));
vi.mock("./components/CanvasMobileQuickActions", () => ({ default: () => null }));
vi.mock("./components/CanvasToolRail", () => ({ default: () => null }));
vi.mock("./components/CarouselFilmstrip", () => ({ default: () => null }));
vi.mock("./components/GuidedEditor", () => ({ default: () => null }));
vi.mock("./components/ArsenalCompositionInspector", () => ({ default: () => null }));
vi.mock("./components/SlideReplicationDialog", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => createCanvas(20, 20).getContext("2d") as never
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("Integrated Verification Suite (J-CONT-01, AC-008-06)", () => {
  it("executes complete lifecycle: multi-model composition, edits, save, reopen and continuity validation", async () => {
    // 1. Prepare base document with Slide 1 (Native) and Slide 2 (Arsenal Composition)
    const baseDoc = structuredClone(INITIAL_POST);
    baseDoc.aspectRatio = "1:1";
    baseDoc.slides = [
      {
        ...baseDoc.slides[0],
        id: "slide-native-1",
        headline: "Slide 1 Nativo Inicial",
        subtext: "Subtítulo nativo",
        nativeDecorationTransforms: {
          logo: { scaleX: 1.2, scaleY: 1.2, rotation: 15 },
          badge: { scaleX: 1.0, scaleY: 1.0, rotation: 0 },
        },
      },
      {
        ...baseDoc.slides[0],
        id: "slide-arsenal-2",
        headline: "Slide 2 Composição",
        subtext: "Subtítulo comp",
        composition: createArsenalFixtureComposition(),
      },
    ];

    // User font attached
    baseDoc.userFonts = [
      {
        family: "MinhaFonteEspecial",
        url: "data:font/woff2;base64,d09GMgABAAAAAA=",
        format: "woff2",
      },
    ];

    let savedPayloadDoc: any = null;
    const handleSave = vi.fn(async (doc: CanvasPostModel) => {
      savedPayloadDoc = doc;
      return true;
    });

    await act(async () => {
      root.render(
        <CanvasLabPage
          initialPost={baseDoc}
          onSave={handleSave}
          hasSavedPost={false}
        />
      );
    });

    expect(canvasLabProps).not.toBeNull();

    // 2. Perform cross-slide replication (replicate style from Slide 1 to Slide 2)
    const replicatedDoc = replicateSlideAppearance(baseDoc, 0, [1], [
      "colors",
      "font",
      "headline",
      "body",
    ]);

    // 3. Save payload generation through fitSavePayload
    const rawPayload = canvasModelToSavePayload(replicatedDoc, {
      inputType: "text",
      inputContent: "Post Integrado J-CONT-01",
    });
    const fittedPayload = await fitSavePayload(rawPayload);

    expect(fittedPayload.canvasModel).toBeDefined();
    const modelRecord = fittedPayload.canvasModel as any;
    expect(modelRecord.aspectRatio).toBe("1:1");

    // 4. Clean session reopen through savedPostToCanvasModel & normalizeCanvasModel
    const reopenedDoc = normalizeCanvasModel(savedPostToCanvasModel({
      id: 999,
      canvas_model: fittedPayload.canvasModel,
    }));

    // 5. Assertions on reopened model (J-CONT-01 invariants)
    expect(reopenedDoc.aspectRatio).toBe("1:1");
    expect(reopenedDoc.slides.length).toBe(2);

    // Native slide continuity
    const slide1 = reopenedDoc.slides[0];
    expect(slide1.headline).toBe("Slide 1 Nativo Inicial");
    expect(slide1.nativeDecorationTransforms?.logo?.rotation).toBe(15);
    expect(slide1.nativeDecorationTransforms?.logo?.scaleX).toBe(1.2);

    // Arsenal slide continuity
    const slide2 = reopenedDoc.slides[1];
    expect(slide2.composition).toBeDefined();
    expect([2, 3]).toContain(slide2.composition?.version);

    // User fonts preservation
    expect(reopenedDoc.userFonts).toBeDefined();
    expect(reopenedDoc.userFonts?.length).toBe(1);
    expect(reopenedDoc.userFonts?.[0].family).toBe("MinhaFonteEspecial");
    expect(reopenedDoc.userFonts?.[0].format).toBe("woff2");
  });
});
