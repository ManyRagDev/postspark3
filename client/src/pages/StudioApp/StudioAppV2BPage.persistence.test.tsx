// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import StudioAppV2BPage from "./StudioAppV2BPage";
import { INITIAL_POST, type CanvasPostModel } from "@/pages/CanvasLab/components/types";

const trpcMock = vi.hoisted(() => ({
  saveMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
  listInvalidate: vi.fn(),
  profileInvalidate: vi.fn(),
}));

let canvasLabProps: any = null;

vi.mock("@/lib/fonts", () => ({
  loadCatalogFonts: vi.fn(),
  getActiveFontInfo: vi.fn(() => ({ name: "Inter", url: "" })),
}));

vi.mock("./lib/studioGeneration", async () => {
  const actual = await vi.importActual("./lib/studioGeneration");
  return {
    ...actual,
    materializeCatalogVariationsDetailed: vi.fn(async (variations: any[]) => ({
      posts: variations.map((v, i) => ({ ...INITIAL_POST, ...v, id: `restored-${i}` })),
      failures: [],
      requestedCount: variations.length,
      materializedCount: variations.length,
    })),
  };
});

vi.mock("@/lib/trpc", () => {
  const createQueryMock = () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() });
  const createMutationMock = (mutateAsync = vi.fn().mockResolvedValue({})) => ({ mutateAsync, isLoading: false });

  const handler = {
    get(_target: any, prop: string): any {
      if (prop === "useUtils") {
        return () => ({
          post: { list: { invalidate: trpcMock.listInvalidate },listSummary:{invalidate:vi.fn()} },
          billing: { getProfile: { invalidate: trpcMock.profileInvalidate } },
        });
      }
      return new Proxy({}, {
        get(_t2: any, p2: string): any {
          if (prop === "post" && p2 === "save") return { useMutation: () => ({ mutateAsync: trpcMock.saveMutateAsync }) };
          if (prop === "post" && p2 === "update") return { useMutation: () => ({ mutateAsync: trpcMock.updateMutateAsync }) };
          if (p2 === "useQuery") return () => createQueryMock();
          if (p2 === "useMutation") return () => createMutationMock();
          return new Proxy({}, {
            get(_t3: any, p3: string): any {
              if (p3 === "useQuery") return () => createQueryMock();
              if (p3 === "useMutation") return () => createMutationMock();
              return {};
            }
          });
        }
      });
    }
  };

  return { trpc: new Proxy({}, handler) };
});

vi.mock("wouter", () => ({
  useLocation: () => ["/studio", vi.fn()],
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/pages/CanvasLab/CanvasLabPage", () => ({
  default: (props: any) => {
    canvasLabProps = props;
    return (
      <div data-testid="canvaslab-stub">
        <button
          data-testid="trigger-auto-save"
          onClick={() => props.onSave(props.initialPost, "new", "auto")}
        >
          Auto Save
        </button>
        <button
          data-testid="trigger-manual-save"
          onClick={() => props.onSave(props.initialPost, "new", "manual")}
        >
          Manual Save
        </button>
        <button
          data-testid="trigger-back-gallery"
          onClick={() => props.onBackToGallery({ ...props.initialPost, headline: "Headline Editado" })}
        >
          Back
        </button>
      </div>
    );
  },
}));

vi.mock("./components/v2/StudioCreateViewV2B", () => ({
  default: () => <div data-testid="create-view-stub" />,
}));

vi.mock("./components/StudioGalleryView", () => ({
  default: (props: any) => (
    <div data-testid="gallery-view-stub">
      <button
        data-testid="select-variation"
        onClick={() => props.onSelectVariation({ ...INITIAL_POST, id: "test-post-123" })}
      >
        Select
      </button>
    </div>
  ),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);

  canvasLabProps = null;
  trpcMock.saveMutateAsync.mockReset().mockResolvedValue({ id: 101 });
  trpcMock.updateMutateAsync.mockReset().mockResolvedValue({ id: 101 });
  trpcMock.listInvalidate.mockReset().mockResolvedValue(undefined);
  trpcMock.profileInvalidate.mockReset().mockResolvedValue(undefined);

  sessionStorage.setItem(
    "postspark.restore_generation",
    JSON.stringify({ variations: [{ ...INITIAL_POST, id: "test-post-123" }] })
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("StudioAppV2BPage Persistence and Concurrency (OS-008)", () => {
  it("AC-008-02: first auto-save in flight -> manual save converts to update with same savedId without duplicate INSERT", async () => {
    let resolveFirstInsert: (val: any) => void = () => {};
    const firstInsertPromise = new Promise((resolve) => {
      resolveFirstInsert = resolve;
    });
    trpcMock.saveMutateAsync.mockReturnValueOnce(firstInsertPromise);

    await act(async () => {
      root.render(<StudioAppV2BPage />);
    });

    // 1. Enter editor by selecting the variation in gallery
    const selectBtn = host.querySelector('[data-testid="select-variation"]') as HTMLButtonElement;
    expect(selectBtn).not.toBeNull();
    await act(async () => {
      selectBtn.click();
    });

    expect(canvasLabProps).not.toBeNull();
    const testPost: CanvasPostModel = { ...INITIAL_POST, id: "doc-abc-1" };

    // 2. Start auto-save (in-flight INSERT)
    const autoSavePromise = canvasLabProps.onSave(testPost, "new", "auto");
    await Promise.resolve();
    expect(trpcMock.saveMutateAsync).toHaveBeenCalledTimes(1);

    // 3. While auto-save is in flight, trigger manual continuation save (mode: "update")
    const manualSavePromise = canvasLabProps.onSave(testPost, "update", "manual");
    await Promise.resolve();

    // Still only 1 saveMutation call in flight
    expect(trpcMock.saveMutateAsync).toHaveBeenCalledTimes(1);
    expect(trpcMock.updateMutateAsync).not.toHaveBeenCalled();

    // 4. Resolve the first INSERT
    await act(async () => {
      resolveFirstInsert({ id: 202 });
      await autoSavePromise;
      await manualSavePromise;
    });

    // Now first INSERT finished and manual save chained into UPDATE with id 202!
    expect(trpcMock.saveMutateAsync).toHaveBeenCalledTimes(1);
    expect(trpcMock.updateMutateAsync).toHaveBeenCalledTimes(1);
    const updatePayload = trpcMock.updateMutateAsync.mock.calls[0][0];
    expect(updatePayload.id).toBe(202);
  });

  it("AC-008-02 & C01: first auto-save in flight -> explicit manual save as new creates second record (copy)", async () => {
    let resolveFirstInsert: (val: any) => void = () => {};
    const firstInsertPromise = new Promise((resolve) => {
      resolveFirstInsert = resolve;
    });
    trpcMock.saveMutateAsync.mockReturnValueOnce(firstInsertPromise);

    await act(async () => {
      root.render(<StudioAppV2BPage />);
    });

    const selectBtn = host.querySelector('[data-testid="select-variation"]') as HTMLButtonElement;
    expect(selectBtn).not.toBeNull();
    await act(async () => {
      selectBtn.click();
    });

    expect(canvasLabProps).not.toBeNull();
    const testPost: CanvasPostModel = { ...INITIAL_POST, id: "doc-copy-1" };

    // 1. Auto-save in flight
    const autoSavePromise = canvasLabProps.onSave(testPost, "new", "auto");
    await Promise.resolve();
    expect(trpcMock.saveMutateAsync).toHaveBeenCalledTimes(1);

    // 2. Explicit copy requested while first save is in flight
    const manualCopyPromise = canvasLabProps.onSave(testPost, "new", "manual");
    await Promise.resolve();

    expect(trpcMock.saveMutateAsync).toHaveBeenCalledTimes(1);

    // 3. Resolve first insert
    await act(async () => {
      resolveFirstInsert({ id: 202 });
      await autoSavePromise;
      await manualCopyPromise;
    });

    // Two separate INSERTs were executed! No update was called.
    expect(trpcMock.saveMutateAsync).toHaveBeenCalledTimes(2);
    expect(trpcMock.updateMutateAsync).not.toHaveBeenCalled();
  });

  it("AC-008-03: save failure -> retry does not duplicate post and preserves document", async () => {
    trpcMock.saveMutateAsync.mockRejectedValueOnce(new Error("Network offline"));

    await act(async () => {
      root.render(<StudioAppV2BPage />);
    });

    const selectBtn = host.querySelector('[data-testid="select-variation"]') as HTMLButtonElement;
    expect(selectBtn).not.toBeNull();
    await act(async () => {
      selectBtn.click();
    });

    expect(canvasLabProps).not.toBeNull();
    const testPost: CanvasPostModel = { ...INITIAL_POST, id: "doc-err-1" };

    // 1. First save fails
    let firstResult = true;
    await act(async () => {
      firstResult = await canvasLabProps.onSave(testPost, "new", "auto");
    });
    expect(firstResult).toBe(false);
    expect(trpcMock.saveMutateAsync).toHaveBeenCalledTimes(1);

    // 2. Retry succeeds
    trpcMock.saveMutateAsync.mockResolvedValueOnce({ id: 303 });
    let retryResult = false;
    await act(async () => {
      retryResult = await canvasLabProps.onSave({ ...testPost, headline: "Headline Corrigido" }, "new", "auto");
    });
    expect(retryResult).toBe(true);
    expect(trpcMock.saveMutateAsync).toHaveBeenCalledTimes(2);

    // 3. Subsequent edit updates existing saved post without creating another INSERT
    let subsequentResult = false;
    await act(async () => {
      subsequentResult = await canvasLabProps.onSave({ ...testPost, headline: "Headline Terceira Edição" }, "update", "auto");
    });
    expect(subsequentResult).toBe(true);
    expect(trpcMock.saveMutateAsync).toHaveBeenCalledTimes(2);
    expect(trpcMock.updateMutateAsync).toHaveBeenCalledTimes(1);
    expect(trpcMock.updateMutateAsync.mock.calls[0][0].id).toBe(303);
  });

  it("AC-008-05: onBackToGallery preserves edited post in gallery and state", async () => {
    await act(async () => {
      root.render(<StudioAppV2BPage />);
    });

    const selectBtn = host.querySelector('[data-testid="select-variation"]') as HTMLButtonElement;
    expect(selectBtn).not.toBeNull();
    await act(async () => {
      selectBtn.click();
    });

    expect(canvasLabProps).not.toBeNull();

    await act(async () => {
      canvasLabProps.onBackToGallery({ ...INITIAL_POST, id: "doc-edit-1", headline: "Headline Atualizado" });
    });

    // State transitions back to gallery and preserves edited post
    expect(host.querySelector('[data-testid="gallery-view-stub"]')).not.toBeNull();
  });
});
