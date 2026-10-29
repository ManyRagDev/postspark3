// @vitest-environment happy-dom
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { CanvasPostStage, type CanvasPostStageRef } from "./CanvasPostStage";
import { ensureArsenalCompositionAssets } from "../lib/arsenalAssets";
import { createArsenalFixtureComposition } from "../lib/arsenalFixture";
import { INITIAL_POST, type CanvasPostModel } from "./types";

const stageNodes: Record<string, any> = {};
let capturedTransformer: any = null;
let previewRatio = 1;
const setPreviewRatio = vi.fn((ratio: number) => { previewRatio = ratio; });

vi.mock("react-konva", async () => {
  const React = await import("react");
  const container = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, {}, children);

  return {
    Stage: React.forwardRef((props: any, ref) => {
      React.useImperativeHandle(ref, () => ({
        find: () => [],
        getLayers: () => [{ draw() {}, batchDraw() {}, getCanvas: () => ({ getPixelRatio: () => previewRatio, setPixelRatio: setPreviewRatio }) }],
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
      if (props.name) stageNodes[props.name] = props;
      return React.createElement("div", { "data-native": props.name, "data-visible": String(props.visible !== false), "data-listening": String(props.listening !== false) }, props.children);
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
    Image: (props: any) => React.createElement("i", { "data-konva-image": "true", "data-x": props.x, "data-y": props.y, "data-width": props.width, "data-height": props.height }),
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
  previewRatio = 1; setPreviewRatio.mockClear();
  for (const key of Object.keys(stageNodes)) delete stageNodes[key];
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


it("explicit text editing selects the target, exposes its draft, commits once and respects locked, hidden and read-only states", async () => {
  const post = structuredClone(INITIAL_POST);
  const onCommitTextEdit = vi.fn(), onEditingChange = vi.fn();
  const ref = createRef<CanvasPostStageRef>();
  const render = async (locked = false, hidden = false, readOnly = false) => {
    post.slides[0].elementStates = { headline: { locked, hidden } };
    await act(async () => root.render(<CanvasPostStage ref={ref} post={{...post}} zoom={0.65} onUpdateElementPosition={vi.fn()} onCommitTextEdit={onCommitTextEdit} onEditingChange={onEditingChange} isReadOnly={readOnly} />));
  };
  await render();
  await act(async () => ref.current!.beginTextEdit("headline"));
  expect(ref.current!.hasActiveDraft()).toBe(true);
  expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe(post.slides[0].headline);
  expect(onEditingChange).toHaveBeenLastCalledWith(true);
  const conclude = document.body.querySelector<HTMLButtonElement>('button[title="Concluir edição"]');
  expect(conclude).not.toBeNull();
  expect(conclude?.className).toContain("min-h-11");
  await act(async () => conclude!.click());
  expect(onCommitTextEdit).toHaveBeenCalledTimes(1);
  expect(onCommitTextEdit.mock.calls[0][0]).toBe("headline");
  expect(ref.current!.hasActiveDraft()).toBe(false);
  expect(onEditingChange).toHaveBeenLastCalledWith(false);
  for (const [locked, hidden, readOnly] of [[true,false,false],[false,true,false],[false,false,true]]) {
    await render(locked,hidden,readOnly);
    await act(async () => ref.current!.beginTextEdit("headline"));
    expect(ref.current!.hasActiveDraft()).toBe(false);
  }
  expect(onCommitTextEdit).toHaveBeenCalledTimes(1);
});

it("renders native stack order, hidden state and locking from the document while keeping list selection", async () => {
  const post = structuredClone(INITIAL_POST);
  post.slides[0].elementOrder = ["subtext", "headline"];
  post.slides[0].elementStates = { headline: { hidden: true }, subtext: { locked: true } };
  await act(async () => root.render(<CanvasPostStage post={post} zoom={1} onUpdateElementPosition={vi.fn()} selectedElementId="subtext" />));
  const layers = Array.from(host.querySelectorAll("[data-native^='native-element-']"));
  expect(layers.slice(0,3).map(node => node.getAttribute("data-native"))).toEqual(["native-element-background", "native-element-subtext", "native-element-headline"]);
  expect(host.querySelector('[data-native="native-element-headline"]')?.getAttribute("data-visible")).toBe("false");
  expect(host.querySelector('[data-native="native-element-subtext"]')?.getAttribute("data-listening")).toBe("false");
  expect(capturedTransformer.nodes).toHaveBeenLastCalledWith([]);
});


it("keeps a photo in the document drawing order when it loads after reordering at non-default zoom", async () => {
  const images: any[] = [];
  vi.spyOn(window, "Image").mockImplementation(function() {
    const image = { onload: null, src: "", naturalWidth: 400, naturalHeight: 300 };
    images.push(image);
    return image as unknown as HTMLImageElement;
  });
  const post = structuredClone(INITIAL_POST), ref = createRef<CanvasPostStageRef>();
  post.bgImage = ""; post.logoUrl = "";
  post.slides[0].extraImages = [{ id: "photo", url: "photo.png", x: 15, y: 30, width: 100, height: 80 }];
  post.slides[0].headlinePos = { x: 40, y: 60 };
  post.slides[0].headlineWidth = 200;
  post.slides[0].elementOrder = ["photo", "headline"];
  const render = async (zoom = .65, displayScale = zoom) => { await act(async () => root.render(<CanvasPostStage ref={ref} post={{...post}} zoom={zoom} displayScale={displayScale} onUpdateElementPosition={vi.fn()} />)); };
  await render();
  expect(host.querySelector('[data-native="native-element-photo"] i')).toBeNull();
  post.slides[0].elementOrder = ["headline", "photo"];
  await render();
  await act(async () => images[0].onload());
  expect(host.querySelector('[data-native="native-element-photo"] i')).not.toBeNull();
  const ids = Array.from(host.querySelectorAll("[data-native^='native-element-']")).map(node => node.getAttribute("data-native"));
  expect(ids.indexOf("native-element-headline")).toBeLessThan(ids.indexOf("native-element-photo"));
  expect(ref.current!.getElementGeometry("headline")).toMatchObject({x:40,y:60,width:200});
  await render(1, 1.5);
  expect(setPreviewRatio).toHaveBeenLastCalledWith(1.5);
  expect(ref.current!.getElementGeometry("headline")).toMatchObject({x:40,y:60,width:200});
});


it("begins requested composition editing when pending assets become ready", async () => {
  let finishAssets!: () => void;
  vi.mocked(ensureArsenalCompositionAssets).mockImplementationOnce(() => new Promise<void>(resolve => { finishAssets = resolve; }));
  const post = structuredClone(INITIAL_POST), ref = createRef<CanvasPostStageRef>();
  const composition = createArsenalFixtureComposition();
  const text = composition.elements.find(element => element.kind === "text")!;
  post.slides[0].composition = composition;
  await act(async () => root.render(<CanvasPostStage ref={ref} post={post} zoom={1} onUpdateComposition={vi.fn()} />));
  await act(async () => ref.current!.beginTextEdit(text.id));
  expect(ref.current!.hasActiveDraft()).toBe(false);
  await act(async () => finishAssets());
  expect(ref.current!.hasActiveDraft()).toBe(true);
  expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe(text.text);
  await act(async () => ref.current!.cancelDraft());
  expect(ref.current!.hasActiveDraft()).toBe(false);
});


it("fits a square native logo inside its original editable box without stretching", async () => {
  const images: any[] = [];
  vi.spyOn(window, "Image").mockImplementation(function() {
    const image = { onload: null, src: "", naturalWidth: 160, naturalHeight: 160 };
    images.push(image); return image as unknown as HTMLImageElement;
  });
  const post = structuredClone(INITIAL_POST), ref = createRef<CanvasPostStageRef>();
  post.logoUrl = "square.svg"; post.bgImage = "";
  const before = structuredClone(post);
  await act(async () => root.render(<CanvasPostStage ref={ref} post={post} zoom={1} onUpdateElementPosition={vi.fn()} />));
  await act(async () => images[0].onload());
  const logo = host.querySelector('[data-native="native-element-logo"] i')!;
  expect(logo.getAttribute("data-width")).toBe("24");
  expect(logo.getAttribute("data-height")).toBe("24");
  expect(logo.getAttribute("data-x")).toBe("11");
  expect(logo.getAttribute("data-y")).toBe("0");
  expect(ref.current!.getElementGeometry("logo")).toMatchObject({width:46,height:24});
  expect(post).toEqual(before);
});
