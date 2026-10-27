// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PostDownloadDialog from "./PostDownloadDialog";
import { INITIAL_POST } from "./types";

const stageMock = vi.hoisted(() => ({
  exportPng4K: vi.fn(),
  exportZip4K: vi.fn(),
  exportThumbnail: vi.fn(),
}));

vi.mock("./CanvasPostStage", () => ({
  CanvasPostStage: React.forwardRef((_, ref) => {
    React.useImperativeHandle(ref, () => stageMock);
    return <div data-testid="canvas-stage-stub" />;
  }),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  stageMock.exportPng4K.mockReset().mockReturnValue("data:image/png;base64,pngdata");
  stageMock.exportZip4K.mockReset().mockResolvedValue(new Blob(["zipdata"]));
  stageMock.exportThumbnail.mockReset().mockResolvedValue("data:image/png;base64,thumbdata");

  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:fake-url"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("disables buttons and prevents concurrent export while busy", async () => {
  let resolveThumbnail: (val: string) => void;
  stageMock.exportThumbnail.mockImplementation(
    () => new Promise<string>((res) => { resolveThumbnail = res; })
  );

  const onClose = vi.fn();
  await act(async () => {
    root.render(<PostDownloadDialog post={INITIAL_POST} onClose={onClose} />);
  });

  const downloadBtn = Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.textContent?.includes("Baixar imagem")
  );
  expect(downloadBtn).toBeDefined();

  // Trigger export
  await act(async () => {
    downloadBtn!.click();
  });

  // Now busy state should be active
  expect(downloadBtn!.textContent).toBe("Preparando…");
  expect((downloadBtn as HTMLButtonElement).disabled).toBe(true);

  // Click again while busy should be no-op
  await act(async () => {
    downloadBtn!.click();
  });
  expect(stageMock.exportThumbnail).toHaveBeenCalledTimes(1);

  // Resolve thumbnail
  await act(async () => {
    resolveThumbnail!("data:image/png;base64,done");
  });

  // Restores normal state
  expect(downloadBtn!.textContent).toBe("Baixar imagem");
  expect((downloadBtn as HTMLButtonElement).disabled).toBe(false);
  expect(stageMock.exportPng4K).toHaveBeenCalledTimes(1);
});

it("shows error alert if thumbnail or resource readiness check fails", async () => {
  stageMock.exportThumbnail.mockResolvedValueOnce("");

  const onClose = vi.fn();
  await act(async () => {
    root.render(<PostDownloadDialog post={INITIAL_POST} onClose={onClose} />);
  });

  const downloadBtn = Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.textContent?.includes("Baixar imagem")
  );

  await act(async () => {
    downloadBtn!.click();
  });

  const alert = document.body.querySelector('[role="alert"]');
  expect(alert).not.toBeNull();
  expect(alert?.textContent).toContain("A imagem ou fonte ainda não carregou");
  expect(stageMock.exportPng4K).not.toHaveBeenCalled();
});
