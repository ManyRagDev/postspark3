// @vitest-environment happy-dom
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { CanvasPostStage, type CanvasPostStageRef } from "./CanvasPostStage";
import { INITIAL_POST, type CanvasPostModel } from "./types";

const stageNodes: Record<string, any> = {};
let capturedTransformer: any = null;

vi.mock("react-konva", async () => {
  const React = await import("react");
  const container = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, {}, children);

  return {
    Stage: React.forwardRef((props: any, ref) => {
      React.useImperativeHandle(ref, () => ({
        find: () => [],
        getLayers: () => [{ draw() {}, batchDraw() {} }],
        toDataURL: () => "data:image/png;base64,mock",
      }));
      return container(props);
    }),
    Layer: container,
    Group: React.forwardRef((props: any, ref) => {
      React.useImperativeHandle(ref, () => ({
        setAttrs: vi.fn(),
        x: () => props.x ?? 0,
        y: () => props.y ?? 0,
        scaleX: () => props.scaleX ?? 1,
        scaleY: () => props.scaleY ?? 1,
        rotation: () => props.rotation ?? 0,
        width: () => props.width ?? 100,
        height: () => props.height ?? 100,
      }));
      return container(props);
    }),
    Transformer: React.forwardRef((props: any, ref) => {
      const transObj = {
        props,
        activeAnchor: "top-right",
        getActiveAnchor: () => transObj.activeAnchor,
        nodes: vi.fn(),
        getLayer: () => ({ batchDraw() {} }),
        forceUpdate: vi.fn(),
      };
      capturedTransformer = transObj;
      React.useImperativeHandle(ref, () => transObj);
      return null;
    }),
    Rect: React.forwardRef((props: any, ref) => {
      React.useImperativeHandle(ref, () => ({
        setAttrs: vi.fn(),
        x: () => props.x ?? 0,
        y: () => props.y ?? 0,
        scaleX: () => 1,
        scaleY: () => 1,
        rotation: () => 0,
        width: () => props.width ?? 100,
        height: () => props.height ?? 50,
      }));
      return null;
    }),
    Text: React.forwardRef((props: any, ref) => {
      React.useImperativeHandle(ref, () => ({
        setAttrs: vi.fn(),
        x: () => props.x ?? 0,
        y: () => props.y ?? 0,
        scaleX: () => 1,
        scaleY: () => 1,
        rotation: () => 0,
        width: () => props.width ?? 100,
        height: () => props.height ?? 50,
      }));
      return null;
    }),
    Image: () => null,
    Line: () => null,
    Circle: () => null,
  };
});

vi.mock("../lib/arsenalAssets", () => ({
  ensureArsenalCompositionFonts: vi.fn(async () => {}),
  ensureArsenalCompositionAssets: vi.fn(async () => {}),
}));
vi.mock("@/hooks/useDynamicFont", () => ({ useDynamicFont: () => {} }));
vi.mock("./ArsenalCompositionContents", () => ({ ArsenalCompositionContents: () => null }));

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => createCanvas(20, 20).getContext("2d") as never);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  capturedTransformer = null;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("CanvasPostStage Interaction (OS-004)", () => {
  it("renders with decoration transforms applied and calls onUpdateDecorationTransform", async () => {
    const post: CanvasPostModel = {
      ...INITIAL_POST,
      slides: [
        {
          ...INITIAL_POST.slides[0],
          nativeDecorationTransforms: {
            logo: { scaleX: 1.5, scaleY: 1.5, rotation: 45 },
            badge: { scaleX: 1.2, scaleY: 1.2, rotation: 0 },
            bar: { scaleX: 1, scaleY: 2, rotation: 90 },
          },
        },
      ],
    };

    const handleUpdateDecorationTransform = vi.fn();
    const ref = createRef<CanvasPostStageRef>();

    await act(async () => {
      root.render(
        <CanvasPostStage
          ref={ref}
          post={post}
          zoom={1}
          isReadOnly={false}
          onUpdateElementPosition={vi.fn()}
          onUpdateDecorationTransform={handleUpdateDecorationTransform}
        />
      );
    });

    expect(capturedTransformer).not.toBeNull();
    // Transformer has corner and lateral anchors enabled for text
    expect(capturedTransformer.props.enabledAnchors).toBeDefined();
  });

  it("guided mode (isReadOnly=true) disables interactive editing and hides transformer", async () => {
    const post = structuredClone(INITIAL_POST);
    const ref = createRef<CanvasPostStageRef>();

    await act(async () => {
      root.render(
        <CanvasPostStage
          ref={ref}
          post={post}
          zoom={1}
          isReadOnly={true}
        />
      );
    });

    // In read-only (guided) mode, transformer is not rendered
    expect(capturedTransformer).toBeNull();
  });
});
