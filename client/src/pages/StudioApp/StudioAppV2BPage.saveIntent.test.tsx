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
    return <div data-testid="canvaslab-stub" />;
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
        onClick={() => props.onSelectVariation({ ...INITIAL_POST, id: "test-post-intent" })}
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
    JSON.stringify({ variations: [{ ...INITIAL_POST, id: "test-post-intent" }] })
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("StudioAppV2BPage Save Intent and Queue Serialization (OS-008 & C01)", () => {
  it("CP-27: explicit save as new preserves original and creates a second record", async () => {
    await act(async () => root.render(<StudioAppV2BPage />));
    await act(async () => {
      (host.querySelector('[data-testid="select-variation"]') as HTMLButtonElement).click();
    });
    const doc = { ...INITIAL_POST, id: "copy-intent" };
    await act(async () => {
      await canvasLabProps.onSave(doc, "new", "manual");
    });
    await act(async () => {
      await canvasLabProps.onSave({ ...doc, headline: "New version" }, "new", "manual");
    });
    expect(trpcMock.saveMutateAsync).toHaveBeenCalledTimes(2);
    expect(trpcMock.updateMutateAsync).not.toHaveBeenCalled();
  });

  it("CP-34: three save callers remain serialized after first INSERT", async () => {
    await act(async () => root.render(<StudioAppV2BPage />));
    await act(async () => {
      (host.querySelector('[data-testid="select-variation"]') as HTMLButtonElement).click();
    });
    let releaseInsert!: (v: any) => void;
    const initial = new Promise((r) => (releaseInsert = r));
    trpcMock.saveMutateAsync.mockReturnValueOnce(initial);
    const releases: Array<() => void> = [];
    let active = 0,
      maxActive = 0;
    trpcMock.updateMutateAsync.mockImplementation(() => {
      active++;
      maxActive = Math.max(maxActive, active);
      return new Promise((r) =>
        releases.push(() => {
          active--;
          r({ id: 505 });
        })
      );
    });
    const doc = { ...INITIAL_POST, id: "queue-3" };
    let a: any, b: any, c: any;
    await act(async () => {
      a = canvasLabProps.onSave(doc, "new", "auto");
      b = canvasLabProps.onSave({ ...doc, headline: "B" }, "update", "manual");
      c = canvasLabProps.onSave({ ...doc, headline: "C" }, "update", "auto");
      await Promise.resolve();
    });
    await act(async () => {
      releaseInsert({ id: 505 });
      await a;
      await new Promise((r) => setTimeout(r, 0));
    });
    const observed = maxActive;
    await act(async () => {
      for (const release of releases) release();
      await Promise.all([b, c]);
    });
    expect(observed).toBe(1);
  });
});

