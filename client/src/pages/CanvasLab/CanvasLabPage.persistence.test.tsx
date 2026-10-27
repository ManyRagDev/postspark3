// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import CanvasLabPage from "./CanvasLabPage";
import { INITIAL_POST, type CanvasPostModel } from "./components/types";
import { writeSavePreference } from "./components/CanvasLabDialogs";

let activeDraft = false;

const stageMock = vi.hoisted(() => ({
  stageProps: null as any,
  exportPng4K: vi.fn(),
  exportZip4K: vi.fn(),
  exportThumbnail: vi.fn(),
  commitDraft: vi.fn(),
  cancelDraft: vi.fn(),
  hasActiveDraft: vi.fn(() => activeDraft),
}));

vi.mock("./components/CanvasPostStage", () => ({
  CanvasPostStage: React.forwardRef((props: any, ref: any) => {
    stageMock.stageProps = props;
    React.useImperativeHandle(ref, () => ({
      exportPng4K: stageMock.exportPng4K,
      exportZip4K: stageMock.exportZip4K,
      exportThumbnail: stageMock.exportThumbnail,
      commitDraft: () => {
        stageMock.commitDraft();
        activeDraft = false;
        // Simulate committing draft headline edit to the post
        if (props.onCommitTextEdit) {
          props.onCommitTextEdit("headline", "Texto Final Confirmado", [{ text: "Texto Final Confirmado" }]);
        }
      },
      cancelDraft: () => {
        stageMock.cancelDraft();
        activeDraft = false;
      },
      hasActiveDraft: () => activeDraft,
    }));
    return <div data-testid="stage-mock" />;
  }),
}));

vi.mock("./components/CanvasTopBar", () => ({
  default: (props: any) => (
    <div data-testid="top-bar-mock">
      <button data-testid="btn-back" onClick={props.onBackToGallery}>Voltar</button>
      <button data-testid="btn-save" onClick={props.onSave}>Salvar</button>
      <button data-testid="btn-restart" onClick={props.onRestart}>Recomeçar</button>
      <button data-testid="btn-undo" onClick={props.onUndo}>Undo</button>
      <button data-testid="btn-redo" onClick={props.onRedo}>Redo</button>
    </div>
  ),
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

  stageMock.commitDraft.mockClear();
  stageMock.cancelDraft.mockClear();
  stageMock.hasActiveDraft.mockReturnValue(false);

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => createCanvas(20, 20).getContext("2d") as never
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("CanvasLabPage Persistence and Draft Flushing (OS-008)", () => {
  it("AC-008-01 & AC-008-05: flushes active text draft on exit to gallery", async () => {
    activeDraft = true;

    const onBackToGallery = vi.fn();
    const onSave = vi.fn().mockResolvedValue(true);

    await act(async () => {
      root.render(
        <CanvasLabPage
          initialPost={INITIAL_POST}
          onBackToGallery={onBackToGallery}
          onSave={onSave}
          hasSavedPost={false}
        />
      );
    });

    const backBtn = host.querySelector('[data-testid="btn-back"]') as HTMLButtonElement;
    expect(backBtn).not.toBeNull();

    await act(async () => {
      backBtn.click();
    });

    // Draft was committed before exiting
    expect(stageMock.commitDraft).toHaveBeenCalledTimes(1);
    expect(onBackToGallery).toHaveBeenCalledTimes(1);
    const passedPost = onBackToGallery.mock.calls[0][0] as CanvasPostModel;
    expect(passedPost.slides[passedPost.currentSlideIndex].headline).toBe("Texto Final Confirmado");
  });

  it("AC-008-01: manual save flushes draft and saves the committed document", async () => {
    activeDraft = true;

    const onSave = vi.fn().mockResolvedValue(true);

    await act(async () => {
      root.render(
        <CanvasLabPage
          initialPost={INITIAL_POST}
          onSave={onSave}
          hasSavedPost={true}
        />
      );
    });

    // Simulate clicking save button
    const saveBtn = host.querySelector('[data-testid="btn-save"]') as HTMLButtonElement;
    expect(saveBtn).not.toBeNull();

    writeSavePreference("update");

    await act(async () => {
      saveBtn.click();
    });

    expect(stageMock.commitDraft).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    const savedDoc = onSave.mock.calls[0][0] as CanvasPostModel;
    expect(savedDoc.slides[savedDoc.currentSlideIndex].headline).toBe("Texto Final Confirmado");
  });
});
