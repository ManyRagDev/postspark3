// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { resolveSlideAppearance } from "./lib/slideReplication";
import { OFFICIAL_FAMILIES_META } from "./components/types";
import CanvasLabPage from "./CanvasLabPage";
import { INITIAL_POST, type CanvasPostModel } from "./components/types";
import { createArsenalFixtureComposition } from "./lib/arsenalFixture";
import { putArsenalComposition } from "./lib/arsenalComposition";
import { canvasModelToSavePayload, savedPostToCanvasModel, normalizeCanvasModel } from "./lib/saveAdapter";
import { fitSavePayload } from "./lib/fitSavePayload";
import { replicateSlideAppearance } from "./lib/slideReplication";

let canvasLabProps: any = null;
let topbarProps: any = null;
const mediaMock = vi.hoisted(() => ({ generate: vi.fn(), upload: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { post: { generateImage: { useMutation: () => ({ mutateAsync: mediaMock.generate }) }, saveMediaAsset: { useMutation: () => ({ mutateAsync: mediaMock.upload }) } } } }));
vi.mock("./components/FontPickerDropdown", () => ({ default: () => null }));

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
  default: (props: any) => { topbarProps = props; return <div data-testid="topbar-stub" />; },
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
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ categories: {} }) }));
  mediaMock.generate.mockReset();
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
  vi.unstubAllGlobals();
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

function clickButton(label: string) {
  const button = Array.from(host.querySelectorAll("button")).find(item => item.textContent?.trim() === label);
  expect(button, `Botão ${label}`).toBeDefined();
  button!.click();
}
function typeText(textarea: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("sessões da interface com o controlador real", () => {
  it("aplica família ao slide atual sem recolorir a paleta existente", async () => {
    const post = structuredClone(INITIAL_POST);
    post.palette = { ...post.palette, background: "#151515", accent: "#eeeeee", text: "#f8f4ee", headlineColor: "#f8f4ee", subtextColor: "#f8f4ee" };
    await act(async () => root.render(<CanvasLabPage initialPost={post} />));
    await act(async () => clickButton("Aparência"));
    await act(async () => clickButton(OFFICIAL_FAMILIES_META["brutal-split"].name));
    expect(resolveSlideAppearance(canvasLabProps.post, 0).familyId).toBe("brutal-split");
    expect(resolveSlideAppearance(canvasLabProps.post, 0).palette).toEqual(post.palette);
    expect(resolveSlideAppearance(canvasLabProps.post, 1).familyId).toBe(post.familyId);
    await act(async () => topbarProps.onUndo());
    expect(resolveSlideAppearance(canvasLabProps.post, 0).familyId).toBe(post.familyId);
  });
  it("agrupa digitações da legenda em uma única ação de desfazer e refazer", async () => {
    const post = structuredClone(INITIAL_POST); post.caption = "Antes";
    await act(async () => root.render(<CanvasLabPage initialPost={post} />));
    await act(async () => clickButton("Legenda"));
    const field = host.querySelector<HTMLTextAreaElement>("#canvas-caption")!;
    expect(field).toBeTruthy();
    await act(async () => { field.focus(); typeText(field, "A"); });
    await act(async () => typeText(field, "Agora"));
    await act(async () => typeText(field, "Agora completo"));
    await act(async () => field.blur());
    expect(canvasLabProps.post.caption).toBe("Agora completo");
    await act(async () => topbarProps.onUndo());
    expect(canvasLabProps.post.caption).toBe("Antes");
    expect(topbarProps.canUndo).toBe(false);
    await act(async () => topbarProps.onRedo());
    expect(canvasLabProps.post.caption).toBe("Agora completo");
  });
  it("agrupa a digitação do texto selecionado em desfazer e refazer", async () => {
    const post = structuredClone(INITIAL_POST); post.slides[0].headline = "Título antes";
    await act(async () => root.render(<CanvasLabPage initialPost={post} />));
    await act(async () => clickButton("Camadas"));
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Título'))!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Fechar painel"]')!.click());
    await act(async () => clickButton("Ajustar"));
    const field = host.querySelector<HTMLTextAreaElement>("#canvas-selected-text")!;
    expect(field.value).toBe("Título antes");
    await act(async () => { field.focus(); typeText(field, "Título"); });
    await act(async () => typeText(field, "Título corrigido"));
    await act(async () => field.blur());
    expect(canvasLabProps.post.slides[0].headline).toBe("Título corrigido");
    await act(async () => topbarProps.onUndo());
    expect(canvasLabProps.post.slides[0].headline).toBe("Título antes");
    expect(topbarProps.canUndo).toBe(false);
    await act(async () => topbarProps.onRedo());
    expect(canvasLabProps.post.slides[0].headline).toBe("Título corrigido");
  });
  it("retém imagem tardia se painel fechar e o destino for bloqueado", async () => {
    const composition = createArsenalFixtureComposition();
    const post = putArsenalComposition(structuredClone(INITIAL_POST), composition);
    post.slides[0].imagePrompt = "Imagem de teste";
    let complete!: (result: {imageUrl:string}) => void;
    mediaMock.generate.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    await act(async () => root.render(<CanvasLabPage initialPost={post} />));
    await act(async () => clickButton("Adicionar"));
    await act(async () => clickButton("Imagem"));
    await act(async () => clickButton("Gerar imagem com IA"));
    expect(mediaMock.generate).toHaveBeenCalledOnce();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Fechar painel"]')!.click());
    await act(async () => clickButton("Camadas"));
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Fundo'))!.click());
    await act(async () => clickButton("Bloquear"));
    await act(async () => complete({ imageUrl: "https://example.com/late.png" }));
    expect(canvasLabProps.post.slides[0].composition.customBackground?.imageUrl).not.toBe("https://example.com/late.png");
    await act(async () => clickButton("Adicionar"));
    await act(async () => clickButton("Imagem"));
    expect(host.querySelector<HTMLImageElement>('img[alt="Imagem pronta para aplicação"]')?.src).toBe("https://example.com/late.png");
  });
});
