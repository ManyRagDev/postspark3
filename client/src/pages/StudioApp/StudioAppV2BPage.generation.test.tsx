// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_POST } from "@/pages/CanvasLab/components/types";
vi.mock("@/hooks/useGenerationEvents",()=>({useGenerationEvents:()=>({error:false,reconnect:vi.fn()})}));
import Studio from "./StudioAppV2BPage";
import {
  ACTIVE_GENERATION_REQUEST_SESSION_KEY,
  PENDING_GENERATION_START_SESSION_KEY,
  type PendingGenerationStart,
} from "./lib/studioGenerationState";

const h = vi.hoisted(() => ({
  ownerId: "00000000-0000-4000-8000-000000000001",
  brandKitData: undefined as any,
  brandKitRead: vi.fn(),
  readiness: undefined as any,
  create: null as any,
  gallery: null as any,
  editor: null as any,
  failure: null as any,
  briefReview: null as any,
  formatConfirm: null as any,
  start: vi.fn(),
  getData: undefined as any,
  getError: null as any,
  cancel: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  invalidatePosts: vi.fn(),
  invalidateBilling: vi.fn(),
  legacyGenerate: vi.fn(),
  capabilities: { selectable: true, enabled: true, reason: "ready" },
  materialize: vi.fn(),
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ post: { list: { invalidate: h.invalidatePosts },listSummary:{invalidate:vi.fn()} }, billing: { getProfile: { invalidate: h.invalidateBilling } } }),
  generation: {
    reconcile:{useMutation:()=>({mutate:vi.fn(),isPending:false})},
    resume:{useMutation:()=>({mutate:vi.fn(),isPending:false})},
    capabilities: { useQuery: () => ({ data: { ownerId: h.ownerId, ...h.capabilities, contractVersion: 5 },refetch:async()=>({data:{ownerId:h.ownerId,...h.capabilities,contractVersion:5}}) }) },
    start: { useMutation: () => ({ mutateAsync: h.start, isPending: false }) },
    get: { useQuery: () => ({ data: h.getData, error: h.getError, refetch: vi.fn() }) },
    cancel: { useMutation: () => ({ mutateAsync: h.cancel, isPending: false }) },
  },
  designCatalog: {
    generationReadiness: { useQuery: () => ({ data: h.readiness }) },
    reportCompilation: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    reportArsenalCompilation: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    reportComponentCompilation: { useMutation: () => ({ mutateAsync: vi.fn() }) },
  },
  brandKit: { get: { useQuery: () => { h.brandKitRead(); return { data: h.brandKitData }; } } },
  post: {
    saveMediaAsset:{useMutation:()=>({mutateAsync:async()=>({url:"/api/post-media/source"}),isPending:false})},
    generate: { useMutation: () => ({ mutateAsync: h.legacyGenerate }) },
    save: { useMutation: () => ({ mutateAsync: h.save }) },
    update: { useMutation: () => ({ mutateAsync: h.update }) },
  },
} }));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()] }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/fonts", () => ({ loadCatalogFonts: vi.fn() }));
vi.mock("./components/StudioArtPreferences", () => ({ default: () => null }));
vi.mock("./components/v2/shared", () => ({ ProductionOverlay: ({ prompt }: { prompt: string }) => <div data-testid="production-intro">{prompt}</div> }));
vi.mock("./components/v2/StudioCreateViewV2B", () => ({ default: (props: any) => {
  h.create = props;
  return <div data-testid="create" />;
} }));
vi.mock("./components/StudioGalleryView", () => ({ default: (props: any) => {
  h.gallery = props;
  return <div data-testid="gallery">{props.variations.map((post: any) => post.id).join(",")}</div>;
} }));
vi.mock("@/pages/CanvasLab/CanvasLabPage", () => ({ default: (props: any) => {
  h.editor = props;
  return <div data-testid="editor">{props.initialPost.id}</div>;
} }));
vi.mock("./components/v2/CreationGuards", () => ({
  CreationGuardsHost: ({ children }: any) => <>{children}</>,
  FormatConfirmModal: (props: any) => { h.formatConfirm = props; return null; },
  GenerationFailureModal: (props: any) => { h.failure = props; return null; },
}));
vi.mock("./components/v2/BriefReviewModal", () => ({ default: (props: any) => { h.briefReview = props; return null; } }));
vi.mock("./lib/studioGeneration", () => ({
  materializeCatalogVariationsDetailed: h.materialize,
  buildInitialFallbackVariations: () => [],
  buildExtraFallbackVariations: () => [],
  buildTasteInstruction: () => "",
  aiGenerationProvenance: (generationRunId: string) => ({ source: "ai", generationRunId, generatedAt: "2026-10-08T00:00:00.000Z" }),
}));

const requestId = "a9a4e573-8316-4220-9289-273acd77f1d4";
const secondRequestId = "f0bb2044-1472-40d2-8c1d-885472648abe";
const runId = "d08511f3-825a-45ed-a106-0b53d3957d7c";
const post = (id: string) => ({ ...structuredClone(INITIAL_POST), id });
const ready = (proposalId: string, slot: number, bundle: any = { marker: proposalId }) => ({
  contractVersion: 1,
  proposalId,
  runId,
  slot,
  revision: 1,
  findings: [],
  diagnostics: [],
  status: "ready" as const,
  bundle,
});
const running = (proposalId: string, slot: number) => ({
  contractVersion: 1,
  proposalId,
  runId,
  slot,
  revision: 1,
  findings: [],
  diagnostics: [],
  status: "running" as const,
});
const snapshot = (proposals: any[], overallStatus: "running" | "completed" | "partial" | "failed" | "cancelled" = "running") => ({
  contractVersion: 1 as const,
  requestId,
  runId,
  overallStatus,
  proposals,
  updatedAt: Date.now(),
});
function materializedResult(posts: any[], failures: any[] = []) {
  return { posts, failures, requestedCount: posts.length + failures.length, materializedCount: posts.length };
}

let host: HTMLDivElement;
let root: Root;
function mount() { act(() => root.render(<Studio />)); }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

beforeEach(() => {
  h.readiness=undefined;
  h.brandKitData=undefined;
  h.ownerId="00000000-0000-4000-8000-000000000001";
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  h.create = h.gallery = h.editor = h.failure = h.briefReview = h.formatConfirm = null;
  h.getData = undefined;
  h.getError = null;
  h.capabilities = { selectable: true, enabled: true, reason: "ready" };
  h.start.mockReset();
  h.cancel.mockReset();
  h.save.mockResolvedValue({ id: 21 });
  h.update.mockResolvedValue({ success: true });
  h.invalidatePosts.mockResolvedValue(undefined);
  h.invalidateBilling.mockResolvedValue(undefined);
  h.legacyGenerate.mockResolvedValue({ variations: [], generationRunId: runId });
  h.materialize.mockImplementation(async (variations: any[]) => {
    const slot = variations[0]?.completeDesignV1?.slot ?? 0;
    return materializedResult([post(`post-${slot}`)]);
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  host.remove();
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});

describe("Studio Generation progressive flow", () => {
  it("holds the production introduction for five seconds while admission and gallery already run", async () => {
    vi.useFakeTimers();
    h.start.mockResolvedValue({ snapshot: snapshot([running("proposal-a", 0)]), created: true });
    mount();
    await act(async () => { h.create.onSubmit("Café artesanal", "static"); await Promise.resolve(); });
    expect(h.start).toHaveBeenCalledOnce();
    expect(host.querySelector('[data-testid="gallery"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="production-intro"]')).toBeTruthy();
    expect(host.querySelector('[inert]')).toBeTruthy();
    act(() => vi.advanceTimersByTime(4999));
    expect(host.querySelector('[data-testid="production-intro"]')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(host.querySelector('[data-testid="production-intro"]')).toBeNull();
    expect(host.querySelector('[inert]')).toBeNull();
    expect(h.start).toHaveBeenCalledOnce();
  });

  it("waits for a slow admission without adding another five seconds after its response", async () => {
    vi.useFakeTimers();
    let admit!: (value: any) => void;
    h.start.mockImplementation(() => new Promise(resolve => { admit = resolve; }));
    mount();
    act(() => h.create.onSubmit("Café artesanal", "static"));
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(host.querySelector('[data-testid="production-intro"]')).toBeTruthy();
    await act(async () => { admit({ snapshot: snapshot([running("proposal-a", 0)]), created: true }); await Promise.resolve(); });
    act(() => vi.advanceTimersByTime(1));
    expect(host.querySelector('[data-testid="production-intro"]')).toBeNull();
    expect(h.start).toHaveBeenCalledOnce();
  });

  it("reveals admission errors immediately instead of hiding them behind the minimum introduction", async () => {
    vi.useFakeTimers();
    h.start.mockRejectedValue(new Error("network timeout"));
    mount();
    await act(async () => { h.create.onSubmit("Café artesanal", "static"); await Promise.resolve(); });
    expect(h.failure).toBeTruthy();
    expect(host.querySelector('[data-testid="production-intro"]')).toBeNull();
  });

  it("opens the selected history run without resuming or mixing an unrelated session generation", async () => {
    sessionStorage.setItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY, requestId);
    sessionStorage.setItem("postspark.restore_generation", JSON.stringify({
      version: 1, generationRunId: secondRequestId, inputType: "text", inputContent: "Histórico B", postMode: "static", variations: [{ headline: "Documento B" }],
    }));
    h.materialize.mockResolvedValue(materializedResult([post("history-b")]));
    h.start.mockResolvedValue({ snapshot: { ...snapshot([running("more-b", 0)]), requestId: secondRequestId }, created: true });
    mount();
    await flush();
    // A late cached/polled response for A must not replace B's input or append A.
    h.getData = { snapshot: snapshot([ready("old-a", 0)], "completed"), input: { inputType: "text", content: "Pedido A", postMode: "static", executionBrief: { rawInput: "Pedido A", brandInput: { brandName: "Marca A" } } } };
    mount();
    await flush();
    expect(h.gallery.variations.map((item: any) => item.id)).toEqual(["history-b"]);
    expect(h.materialize).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY)).toBeNull();
    await act(async () => { h.gallery.onGenerateMore(); await Promise.resolve(); });
    expect(h.start.mock.calls[0][0]).toMatchObject({ content: "Crie 3 novos ganchos criativos e direções de arte alternativas sobre: Histórico B" });
    expect(h.start.mock.calls[0][0].executionBrief).toBeUndefined();
  });

  it("starts the single durable pipeline when its executor becomes available, without a version selector", async () => {
    h.capabilities = { selectable: true, enabled: false, reason: "durable_worker_required" };
    h.start.mockResolvedValue({ snapshot: snapshot([running("proposal-a", 0)]), created: true });
    mount();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    expect(host.textContent).toContain("Aguardando o serviço de geração");
    h.capabilities = { selectable: true, enabled: true, reason: "ready" };
    mount();
    await act(async () => { h.create.onSubmit("Café artesanal", "static"); await Promise.resolve(); });
    expect(h.start).toHaveBeenCalledOnce();
    expect(h.start.mock.calls[0][0]).toMatchObject({ ownerId: h.ownerId, inputType: "text", content: "Café artesanal", creationMode: "execution", executionBrief: { rawInput: "Café artesanal" } });
    expect(h.legacyGenerate).not.toHaveBeenCalled();
  });

  it("shows service availability without exposing implementation versions", () => {
    h.capabilities = { selectable: false, enabled: false, reason: "durable_worker_required" };
    mount();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    expect(host.textContent).toContain("atualizada automaticamente");
    expect(host.textContent).not.toMatch(/V[45]|piloto|DEV/);
  });
  it("generates more through the same API while keeping ready documents and their saved binding", async () => {
    h.materialize.mockResolvedValue(materializedResult([post("post-a")]));
    h.start.mockResolvedValueOnce({ snapshot: snapshot([ready("proposal-a", 0)], "completed"), created: true })
      .mockResolvedValueOnce({ snapshot: { ...snapshot([running("proposal-new", 0)]), requestId: secondRequestId, runId: "new-run" }, created: true });
    mount();
    await act(async () => { h.create.onSubmit("Café artesanal", "static"); await Promise.resolve(); });
    await flush();
    act(() => h.gallery.onSelectVariation(h.gallery.variations[0]));
    await act(async () => { await h.editor.onSave(h.editor.initialPost, "new", "auto"); });
    act(() => h.editor.onBackToGallery(h.editor.initialPost));
    await act(async () => { h.gallery.onGenerateMore(); await Promise.resolve(); });
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.start.mock.calls[1][0]).toMatchObject({ inputType: "text", content: "Crie 3 novos ganchos criativos e direções de arte alternativas sobre: Café artesanal", executionBrief: h.start.mock.calls[0][0].executionBrief });
    expect(h.gallery.variations.map((item: any) => item.id)).toEqual(["post-a"]);
    act(() => h.gallery.onSelectVariation(h.gallery.variations[0]));
    expect(h.editor.hasSavedPost).toBe(true);
    expect(h.legacyGenerate).not.toHaveBeenCalled();
  });

  it("refreshes the saved library and account count after insert/update without hiding successful saves on cache failure", async () => {
    h.materialize.mockResolvedValue(materializedResult([post("post-saved")]));
    h.start.mockResolvedValue({ snapshot: snapshot([ready("proposal-saved", 0)], "completed"), created: true });
    mount();
    await act(async () => { h.create.onSubmit("Café artesanal", "static"); await Promise.resolve(); });
    await flush();
    act(() => h.gallery.onSelectVariation(h.gallery.variations[0]));
    let saved: boolean | undefined;
    await act(async () => { saved = await h.editor.onSave(h.editor.initialPost, "new", "auto"); });
    expect(saved).toBe(true);
    expect(h.invalidatePosts).toHaveBeenCalledTimes(1);
    expect(h.invalidateBilling).toHaveBeenCalledTimes(1);
    expect(h.editor.hasSavedPost).toBe(true);
    h.invalidatePosts.mockRejectedValueOnce(new Error("cache unavailable"));
    await act(async () => { saved = await h.editor.onSave(h.editor.initialPost, "update", "auto"); });
    expect(saved).toBe(true);
    expect(h.update.mock.calls[0][0].id).toBe(21);
    expect(h.invalidatePosts).toHaveBeenCalledTimes(2);
    expect(h.invalidateBilling).toHaveBeenCalledTimes(2);
    h.update.mockRejectedValueOnce(new Error("write failed"));
    await act(async () => { saved = await h.editor.onSave(h.editor.initialPost, "update", "auto"); });
    expect(saved).toBe(false);
    expect(h.invalidatePosts).toHaveBeenCalledTimes(2);
    expect(h.invalidateBilling).toHaveBeenCalledTimes(2);
  });

  it("keeps URLs intact and persists the exact unacknowledged admission for retry", async () => {
    h.start.mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({ snapshot: snapshot([running("proposal-a", 0)]), created: false });
    mount();
    await act(async () => { h.create.onSubmit("https://cafe.example/about", "static"); await Promise.resolve(); });
    await flush();
    const original = h.start.mock.calls[0][0];
    expect(original).not.toHaveProperty("model");
    expect(original.inputType).toBe("url");
    expect(original.content).toBe("https://cafe.example/about");
    expect(original.executionBrief.brandInput.websiteUrl).toBe("https://cafe.example/about");
    expect(JSON.parse(sessionStorage.getItem(PENDING_GENERATION_START_SESSION_KEY)!).input).toEqual(JSON.parse(JSON.stringify(original)));
    await act(async () => { h.failure.onRetry(); await Promise.resolve(); });
    await flush();
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.start.mock.calls[1][0]).toEqual(original);
    expect(h.legacyGenerate).not.toHaveBeenCalled();
  });

  it("reviews a carousel before admission, keeps the edited execution brief and delivers the whole sequence for saving", async () => {
    const carousel = { ...post("carousel-a"), slides: [0, 1].map(index => ({ ...structuredClone(INITIAL_POST.slides[0]), id: `slide-${index}`, headline: `Conteúdo ${index}` })) };
    h.start.mockResolvedValue({ snapshot: snapshot([ready("proposal-a", 0)], "completed"), created: true });
    h.materialize.mockResolvedValue(materializedResult([carousel]));
    mount();
    act(() => h.create.onSubmit("Carrossel sobre café artesanal", "carousel"));
    expect(h.start).not.toHaveBeenCalled();
    expect(h.briefReview.brief.format).toBe("carousel");
    act(() => h.briefReview.onUpdateBrief({ ...h.briefReview.brief, slideCount: 2, callToAction: "Visite nossa cafeteria", tone: "Acolhedor", audience: "Entusiastas de café", brandEssence: "Café artesanal familiar" }));
    await act(async () => { h.briefReview.onConfirmGenerate(); await Promise.resolve(); });
    await flush();
    expect(h.start.mock.calls[0][0]).toMatchObject({ postMode: "carousel", slideCount: 2, creationMode: "execution", executionBrief: { format: "carousel", rawInput: "Carrossel sobre café artesanal", callToAction: "Visite nossa cafeteria", tone: "Acolhedor", audience: "Entusiastas de café", brandEssence: "Café artesanal familiar" } });
    expect(h.gallery.variations[0].slides).toHaveLength(2);
    act(() => h.gallery.onSelectVariation(h.gallery.variations[0]));
    await act(async () => { await h.editor.onSave(h.editor.initialPost, "new", "manual"); });
    expect(h.save.mock.calls[0][0]).toMatchObject({ inputType: "text", inputContent: "Carrossel sobre café artesanal" });
    expect(h.save.mock.calls[0][0].canvasModel.slides).toHaveLength(2);
    expect(h.legacyGenerate).not.toHaveBeenCalled();
  });

  it("resolves a format mismatch before any durable admission", async () => {
    h.start.mockResolvedValue({ snapshot: snapshot([running("proposal-a", 0)]), created: true });
    mount();
    act(() => h.create.onSubmit("Um carrossel com 3 slides sobre café", "static"));
    expect(h.start).not.toHaveBeenCalled();
    expect(h.formatConfirm.selectedMode).toBe("static");
    act(() => h.formatConfirm.onSwitchToDetected());
    expect(h.briefReview.brief.format).toBe("carousel");
    expect(h.start).not.toHaveBeenCalled();
    await act(async () => { h.briefReview.onConfirmGenerate(); await Promise.resolve(); });
    expect(h.start.mock.calls[0][0]).toMatchObject({ postMode: "carousel", slideCount: 3 });
  });

  it("keeps URL identity through admission, delivery, editor and save", async () => {
    h.start.mockResolvedValue({ snapshot: snapshot([ready("proposal-a", 0)], "completed"), created: true });
    mount();
    await act(async () => { h.create.onSubmit("https://cafe.example/about", "static"); await Promise.resolve(); });
    await flush();
    expect(h.start.mock.calls[0][0]).toMatchObject({ inputType: "url", content: "https://cafe.example/about" });
    act(() => h.gallery.onSelectVariation(h.gallery.variations[0]));
    await act(async () => { await h.editor.onSave(h.editor.initialPost, "new", "manual"); });
    expect(h.save.mock.calls[0][0]).toMatchObject({ inputType: "url", inputContent: "https://cafe.example/about" });
    expect(h.legacyGenerate).not.toHaveBeenCalled();
  });

  it("restores a private image request, preserves its image type in saved documents and reuses the image for more", async () => {
    sessionStorage.setItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY, requestId);
    h.getData = { snapshot: snapshot([ready("proposal-a", 0)], "completed"), input: { inputType: "image", imageUrl: "/api/media/owned-photo", content: "Faça um post desta fotografia", postMode: "static", platform: "instagram", aspectRatio: "4:5" } };
    h.start.mockResolvedValue({ snapshot: { ...snapshot([running("new", 0)]), requestId: secondRequestId }, created: true });
    mount();
    await flush();
    act(() => h.gallery.onSelectVariation(h.gallery.variations[0]));
    await act(async () => { await h.editor.onSave(h.editor.initialPost, "new", "auto"); });
    expect(h.save.mock.calls[0][0]).toMatchObject({ inputType: "image", inputContent: "Faça um post desta fotografia" });
    act(() => h.editor.onBackToGallery(h.editor.initialPost));
    await act(async () => { h.gallery.onGenerateMore(); await Promise.resolve(); });
    expect(h.start.mock.calls[0][0]).toMatchObject({ inputType: "image", imageUrl: "/api/media/owned-photo" });
    expect(h.legacyGenerate).not.toHaveBeenCalled();
  });

  it("opens ready A while B is running, then keeps A in the editor after B arrives late and cancel is requested", async () => {
    let resolveB!: (result: ReturnType<typeof materializedResult>) => void;
    h.materialize.mockImplementation((variations: any[]) => {
      const bundle = variations[0].completeDesignV1;
      if (bundle.marker === "proposal-b") return new Promise((resolve) => { resolveB = resolve; });
      return Promise.resolve(materializedResult([post("post-a")]));
    });
    h.start.mockResolvedValue({ snapshot: snapshot([ready("proposal-a", 0), running("proposal-b", 1)]), created: true });
    h.cancel.mockResolvedValue({ snapshot: snapshot([ready("proposal-a", 0), { ...running("proposal-b", 1), status: "cancelled" }], "partial") });
    mount();
    await act(async () => { h.create.onSubmit("Ideias de café", "static"); await Promise.resolve(); });
    await flush();
    expect(h.gallery.variations.map((item: any) => item.id)).toContain("post-a");

    const cancelButton = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Cancelar geração"));
    expect(cancelButton).toBeTruthy();
    await act(async () => { cancelButton?.click(); await Promise.resolve(); });
    expect(h.cancel).toHaveBeenCalledWith({ requestId });

    act(() => h.gallery.onSelectVariation(h.gallery.variations.find((item: any) => item.id === "post-a")));
    expect(host.querySelector('[data-testid="editor"]')?.textContent).toBe("post-a");

    h.getData = { snapshot: snapshot([ready("proposal-a", 0), ready("proposal-b", 1)], "completed"), input: { inputType: "text", content: "Ideias de café", postMode: "static" } };
    mount();
    expect(host.querySelector('[data-testid="editor"]')?.textContent).toBe("post-a");
    await act(async () => { resolveB(materializedResult([post("post-b")])); await Promise.resolve(); });
    expect(host.querySelector('[data-testid="editor"]')?.textContent).toBe("post-a");
  });

  it("reuses the unacknowledged nonce when the normal form is submitted again after a timeout", async () => {
    h.start.mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({ snapshot: snapshot([running("proposal-a", 0)]), created: false });
    mount();
    await act(async () => { h.create.onSubmit("Café artesanal", "static"); await Promise.resolve(); });
    await flush();
    const original = h.start.mock.calls[0][0];
    expect(sessionStorage.getItem(PENDING_GENERATION_START_SESSION_KEY)).toBeTruthy();
    // The ordinary Submit button must behave as retry for the same body, too.
    await act(async () => { h.create.onSubmit("Café artesanal", "static"); await Promise.resolve(); });
    await flush();
    expect(h.start).toHaveBeenCalledTimes(2);
    expect(h.start.mock.calls[1][0]).toEqual(original);
    expect(sessionStorage.getItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY)).toBe(requestId);
    expect(h.legacyGenerate).not.toHaveBeenCalled();
  });

  it("keeps a changed briefing as a new request instead of silently replaying the old content", async () => {
    h.start.mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({ snapshot: { ...snapshot([running("new", 0)]), requestId: secondRequestId }, created: true });
    mount();
    await act(async () => { h.create.onSubmit("Café artesanal", "static"); await Promise.resolve(); });
    await flush();
    const original = h.start.mock.calls[0][0];
    await act(async () => { h.create.onSubmit("Campanha de chá", "static"); await Promise.resolve(); });
    await flush();
    expect(h.start).toHaveBeenCalledTimes(2);
    const changed = h.start.mock.calls[1][0];
    expect(changed.content).toBe("Campanha de chá");
    expect(changed.executionBrief.rawInput).toBe("Campanha de chá");
    expect(changed.idempotencyKey).not.toBe(original.idempotencyKey);
    expect(sessionStorage.getItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY)).toBe(secondRequestId);
  });

  it("shares an in-flight admission for repeated same-body submits and applies its response to the current epoch", async () => {
    let resolve!: (value: any) => void;
    h.start.mockImplementation(() => new Promise(done => { resolve = done; }));
    mount();
    act(() => { h.create.onSubmit("Café artesanal", "static"); });
    await flush();
    act(() => { h.create.onSubmit("Café artesanal", "static"); });
    await flush();
    expect(h.start).toHaveBeenCalledOnce();
    await act(async () => { resolve({ snapshot: snapshot([running("proposal-a", 0)]), created: true }); await Promise.resolve(); });
    await flush();
    expect(sessionStorage.getItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY)).toBe(requestId);
    expect(host.querySelector('[data-testid="gallery"]')).toBeTruthy();
  });

  it("preserves billing denial semantics from a tRPC admission error", async () => {
    h.start.mockRejectedValue(Object.assign(new Error("Sparks insuficientes"), { data: { code: "PAYMENT_REQUIRED" } }));
    mount();
    await act(async () => { h.create.onSubmit("Café artesanal", "static"); await Promise.resolve(); });
    await flush();
    expect(h.start).toHaveBeenCalledOnce();
    expect(h.failure).toMatchObject({ reason: "insufficient_sparks", retryable: false });
    expect(h.failure.userMessage).toContain("Sparks insuficientes");
    expect(h.legacyGenerate).not.toHaveBeenCalled();
  });

  it("restores full generation options for generate-more after refresh", async () => {
    sessionStorage.setItem("postspark.generation_v5.request_id", requestId);
    const executionBrief = {
      creationMode: "execution", format: "static", platform: "instagram", objective: "authority",
      interventionLevel: "visual_only", contentSourceType: "caption_ready", rawInput: "Brief preservado",
      mustInclude: ["Nossa marca"], forbiddenTerms: ["promessa"], notes: "Tom sóbrio",
      brandInput: { logoUrl: "https://storage.example/logo.png", brandColors: ["#102030"], adaptationMode: "strict" },
    };
    h.getData = { snapshot: snapshot([ready("proposal-a", 0)], "completed"), input: {
      inputType: "text", content: "Brief preservado", postMode: "static", executionBrief,
      platform: "instagram", aspectRatio: "9:16", includeDraftDesigns: true, model: "gemini",
    } };
    h.start.mockResolvedValue({ snapshot: { ...snapshot([running("new", 0)]), requestId: secondRequestId }, created: true });
    mount();
    await flush();
    await act(async () => { h.gallery.onGenerateMore(); await Promise.resolve(); });
    expect(h.start.mock.calls[0][0]).toMatchObject({ aspectRatio: "9:16", includeDraftDesigns: true, model: "gemini", executionBrief });
    expect(sessionStorage.getItem("postspark.generation_v5.request_id")).toBeNull();
    expect(sessionStorage.getItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY)).toBe(secondRequestId);
  });

  it("ignores a slow cancel response after generate-more has bound a new request in the same epoch", async () => {
    let resolveCancel!: (value: any) => void;
    h.cancel.mockImplementation(() => new Promise(resolve => { resolveCancel = resolve; }));
    h.start.mockResolvedValueOnce({ snapshot: snapshot([ready("proposal-a", 0), running("proposal-b", 1)]), created: true })
      .mockResolvedValueOnce({ snapshot: { ...snapshot([running("new-proposal", 0)]), requestId: secondRequestId }, created: true });
    mount();
    await act(async () => { h.create.onSubmit("Café artesanal", "static"); await Promise.resolve(); });
    await flush();
    act(() => Array.from(host.querySelectorAll("button")).find(button => button.textContent?.includes("Cancelar geração"))!.click());
    // Polling sees the old request become terminal before the cancel HTTP response arrives.
    h.getData = { snapshot: snapshot([ready("proposal-a", 0)], "partial"), input: { inputType: "text", content: "Café artesanal", postMode: "static" } };
    mount();
    await flush();
    await act(async () => { h.gallery.onGenerateMore(); await Promise.resolve(); });
    expect(h.gallery.generationProposals[0].proposalId).toBe("new-proposal");
    await act(async () => { resolveCancel({ snapshot: snapshot([ready("proposal-a", 0)], "cancelled") }); await Promise.resolve(); });
    await flush();
    expect(h.gallery.generationProposals[0].proposalId).toBe("new-proposal");
    expect(sessionStorage.getItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY)).toBe(secondRequestId);
  });

  it("replays an unacknowledged start after refresh with the exact stored body and idempotency key", async () => {
    const pending: PendingGenerationStart = {
      input: {
        ownerId: h.ownerId,
        inputType: "text", content: "Brief original congelado", platform: "instagram", postMode: "static",
        formatIntentConfirmed: false, includeDraftDesigns: false, aspectRatio: "4:5", model: "llama",
        creationMode: "ideation", idempotencyKey: "same-idempotency-key",
      },
      source: "create", promptText: "Brief original congelado", mode: "static", inputType: "text",
    };
    sessionStorage.setItem(PENDING_GENERATION_START_SESSION_KEY, JSON.stringify(pending));
    h.start.mockResolvedValue({ snapshot: snapshot([running("proposal-a", 0)]), created: false });
    mount();
    await flush();
    expect(h.start).toHaveBeenCalledOnce();
    expect(h.start).toHaveBeenCalledWith(pending.input);
    expect(sessionStorage.getItem(PENDING_GENERATION_START_SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY)).toBe(requestId);
    expect(h.legacyGenerate).not.toHaveBeenCalled();
  });

  it("does not let an old admission response replace the current request or its session binding", async () => {
    let resolveOld!: (value:any)=>void;
    h.start.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}))
      .mockResolvedValueOnce({snapshot:{...snapshot([running("new-proposal",0)]),requestId:secondRequestId},created:true});
    mount();
    let oldSubmit!: Promise<void>;
    act(()=>{oldSubmit=h.create.onSubmit("Pedido antigo","static");});
    await act(async()=>{await h.create.onSubmit("Pedido atual","static");});
    expect(sessionStorage.getItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY)).toBe(secondRequestId);
    await act(async()=>{resolveOld({snapshot:snapshot([ready("old-proposal",0)]),created:true});await oldSubmit;});
    expect(sessionStorage.getItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY)).toBe(secondRequestId);
    expect(h.gallery.variations).toEqual([]);
    expect(h.materialize).not.toHaveBeenCalled();
  });

  it("clears an inaccessible session binding so a fresh generation is available", async () => {
    sessionStorage.setItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY, requestId);
    h.getError = { data: { code: "NOT_FOUND" } };
    mount();
    await flush();

    expect(sessionStorage.getItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY)).toBeNull();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    expect(host.textContent).not.toContain("Retomar pedido");
    expect(h.toast.info).toHaveBeenCalledWith("Esta geração não está disponível nesta sessão. Você pode iniciar uma nova.");

    await act(async () => { h.create.onSubmit("Novo pedido", "static"); await Promise.resolve(); });
    expect(h.start).toHaveBeenCalledOnce();
    expect(h.legacyGenerate).not.toHaveBeenCalled();
  });

  it("does not automatically admit a pending briefing left by another account", async () => {
    sessionStorage.setItem(PENDING_GENERATION_START_SESSION_KEY,JSON.stringify({input:{ownerId:"00000000-0000-4000-8000-000000000004",idempotencyKey:"other-account",inputType:"text",content:"Brief privado",platform:"instagram",postMode:"static"},source:"create",promptText:"Brief privado",mode:"static",inputType:"text"}));
    mount();
    await flush();
    expect(h.start).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_GENERATION_START_SESSION_KEY)).toBeNull();
    expect(h.toast.info).toHaveBeenCalledWith("O pedido pendente pertence a outra conta. Inicie uma nova geração nesta sessão.");
  });

  it("shows cancellation as cancelled when no proposals were ready", async () => {
    sessionStorage.setItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY, requestId);
    h.getData = { snapshot: snapshot([running("proposal-a", 0)], "running"), input: { inputType: "text", content: "Brief", postMode: "static" } };
    h.cancel.mockResolvedValue({ snapshot: snapshot([{ ...running("proposal-a", 0), status: "cancelled" }], "cancelled") });
    mount();
    await flush();
    const cancelButton = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Cancelar geração"));
    await act(async () => { cancelButton?.click(); await Promise.resolve(); });
    await flush();

    expect(host.textContent).toContain("Geração progressiva · Cancelada");
    expect(host.textContent).not.toContain("Geração progressiva · Falhou");
  });

  it("ignores a late materialization after the user starts a new creation", async () => {
    let resolveOld!: (result: ReturnType<typeof materializedResult>) => void;
    h.materialize.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    h.start
      .mockResolvedValueOnce({ snapshot: snapshot([ready("old-proposal", 0)]), created: true })
      .mockResolvedValueOnce({ snapshot: { ...snapshot([running("new-proposal", 0)]), requestId: secondRequestId }, created: true });
    mount();
    await act(async () => { h.create.onSubmit("Criação antiga", "static"); await Promise.resolve(); });
    await flush();
    act(() => h.gallery.onBackToCreate());
    await act(async () => { h.create.onSubmit("Criação nova", "static"); await Promise.resolve(); });
    await flush();
    await act(async () => { resolveOld(materializedResult([post("old-post")])); await Promise.resolve(); });
    expect(h.gallery.variations).toEqual([]);
    expect(host.querySelector('[data-testid="gallery"]')?.textContent).toBe("");
    expect(h.legacyGenerate).not.toHaveBeenCalled();
  });

  it("restores request context after refresh and recovers a failed ready bundle without another start", async () => {
    const bundle = { marker: "proposal-a", slot: 0 };
    sessionStorage.setItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY, requestId);
    h.getData = {
      snapshot: snapshot([ready("proposal-a", 0, bundle)], "partial"),
      input: { inputType: "text", content: "Crie ganchos sobre outro prompt", postMode: "carousel", executionBrief: { rawInput: "Brief preservado", format: "carousel" } },
    };
    h.materialize
      .mockResolvedValueOnce(materializedResult([], [{ message: "fonte indisponível" }]))
      .mockResolvedValueOnce(materializedResult([post("recovered-a")]));
    mount();
    await flush();
    expect(h.start).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Tentar montar este resultado");
    expect(h.materialize.mock.calls[0][0][0].completeDesignV1).toBe(bundle);

    const retry = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Tentar montar este resultado"));
    await act(async () => { retry?.click(); await Promise.resolve(); });
    expect(h.materialize).toHaveBeenCalledTimes(2);
    expect(h.materialize.mock.calls[1][0][0].completeDesignV1).toBe(bundle);
    expect(h.start).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="gallery"]')?.textContent).toContain("recovered-a");

    act(() => h.gallery.onBackToCreate());
    expect(h.create.initialPrompt).toBe("Brief preservado");
    expect(h.create.initialMode).toBe("carousel");
    act(() => h.gallery.onSelectVariation(h.gallery.variations.find((item: any) => item.id === "recovered-a")));
    await act(async () => { await h.editor.onSave(h.gallery.variations.find((item: any) => item.id === "recovered-a"), "new", "auto"); });
    expect(h.save.mock.calls[0][0].inputContent).toBe("Brief preservado");
  });

  it("uses only the request when no project is selected, even with a populated Brand Kit", async () => {
    h.brandKitData = {brand_name:"KIT_SENTINELA",tone:"TOM_DO_KIT",target_audience:"PUBLICO_DO_KIT"};
    mount(); await flush();
    await act(async () => {h.create.onSubmit("Benefício do acompanhamento de preços","static");await Promise.resolve();});
    await flush();
    const input = h.start.mock.calls[0][0];
    expect(h.brandKitRead).not.toHaveBeenCalled();
    expect(input.projectId).toBeUndefined();
    expect(input.projectSnapshot).toBeUndefined();
    expect(JSON.stringify(input)).not.toContain("KIT_SENTINELA");
    expect(JSON.stringify(input)).not.toContain("TOM_DO_KIT");
  });

  it("freezes the project independently of Brand Kit across modal edits, refresh, retry, more and project changes", async () => {
    h.brandKitData = {
      brand_name: "Fintech Horizon",
      brand_essence: "Inovação financeira transparente",
      target_audience: "Diretores Financeiros e CFOs",
      tone: "Analítico e confiante",
      must_include: ["ROI previsível"],
      forbidden_terms: ["promessa milagrosa"],
    };

    const project = {id:"11111111-1111-4111-8111-111111111111", name:"Projeto Horizon", niche:"Finanças", compiledDocument:"# DOSSIÊ DE MARCA: Projeto Horizon\n## POSTURA E TOM DE VOZ\n" + "Voz completa e natural. ".repeat(30) + "\n## PÚBLICO-ALVO\nDiretores financeiros\n## CHAMADA PARA AÇÃO (CTA PADRÃO)\nConheça o projeto", structuredData:{}};
    localStorage.setItem("postspark.local_brand_projects.v1", JSON.stringify([project]));
    localStorage.setItem("postspark.selected_project_id.v1",project.id);
    mount();
    await flush();

    await act(async () => {
      h.create.onSubmit("Como estruturar fluxo de caixa em 5 passos", "carousel");
      await Promise.resolve();
    });
    await flush();

    expect(h.briefReview).not.toBeNull();
    expect(h.brandKitRead).not.toHaveBeenCalled();
    expect(h.briefReview.brief.projectSnapshot.structuredData.voiceTone).toBe("Voz completa e natural. ".repeat(30).trim());
    expect(h.briefReview.brief.tone).toBeUndefined();
    expect(h.briefReview.brief.audience).toBeUndefined();
    expect(h.briefReview.brief.requiredTerms ?? []).toEqual([]);
    expect(h.briefReview.brief.forbiddenTerms ?? []).toEqual([]);

    act(() => {
      h.briefReview.onUpdateBrief({
        ...h.briefReview.brief,
        audience: "Controllers e Gestores de Tesouraria",
      });
    });

    h.start.mockRejectedValueOnce(new Error("Falha temporária de rede na admissão"));

    await act(async () => {
      h.briefReview.onConfirmGenerate();
      await Promise.resolve();
    });
    await flush();

    expect(h.start).toHaveBeenCalledTimes(1);
    const firstCallInput = h.start.mock.calls[0][0];
    expect(firstCallInput.executionBrief.audience).toBe("Controllers e Gestores de Tesouraria");
    expect(firstCallInput.projectDossier).toBe(project.compiledDocument);
    expect(JSON.stringify(firstCallInput)).not.toContain("Inovação financeira transparente");
    expect(firstCallInput.executionBrief.tone).toBeUndefined();
    expect(firstCallInput.executionBrief.mustInclude ?? []).toEqual([]);
    expect(firstCallInput.executionBrief.forbiddenTerms ?? []).toEqual([]);
    const firstIdempotencyKey = firstCallInput.idempotencyKey;
    expect(firstIdempotencyKey).toBeTruthy();

    expect(h.failure).not.toBeNull();

    h.start.mockResolvedValueOnce({
      snapshot: snapshot([ready("prop-car-1", 0)]),
      created: true,
    });

    await act(async () => {
      await h.failure.onRetry();
      await Promise.resolve();
    });
    await flush();

    expect(h.start).toHaveBeenCalledTimes(2);
    const retryCallInput = h.start.mock.calls[1][0];
    expect(retryCallInput.idempotencyKey).toBe(firstIdempotencyKey);
    expect(retryCallInput.executionBrief.audience).toBe("Controllers e Gestores de Tesouraria");
    expect(retryCallInput.projectDossier).toBe(project.compiledDocument);
    expect(JSON.stringify(retryCallInput)).not.toContain("Inovação financeira transparente");

    localStorage.setItem("postspark.local_brand_projects.v1", JSON.stringify([{...project, compiledDocument:"Documento modificado depois da geração"}]));
    // Simulate page refresh / remount: active request restored from session with new executionBrief fields
    sessionStorage.setItem(ACTIVE_GENERATION_REQUEST_SESSION_KEY, requestId);
    h.getData = {
      snapshot: snapshot([ready("prop-car-1", 0)]),
      input: retryCallInput,
    };
    mount();
    await flush();

    // Verify restored context on generate more after refresh
    h.start.mockResolvedValueOnce({
      snapshot: { ...snapshot([ready("prop-car-more-1", 0)]), requestId: secondRequestId },
      created: true,
    });

    await act(async () => {
      h.gallery.onGenerateMore();
      await Promise.resolve();
    });
    await flush();

    expect(h.start).toHaveBeenCalledTimes(3);
    const moreCallInput = h.start.mock.calls[2][0];
    expect(moreCallInput.executionBrief.audience).toBe("Controllers e Gestores de Tesouraria");
    expect(moreCallInput.projectDossier).toBe(project.compiledDocument);
    expect(JSON.stringify(moreCallInput)).not.toContain("Inovação financeira transparente");
    expect(moreCallInput.executionBrief.tone).toBeUndefined();
    expect(moreCallInput.idempotencyKey).not.toBe(firstIdempotencyKey);
    expect(moreCallInput.projectSnapshot).toEqual(firstCallInput.projectSnapshot);

    act(() => {
      h.gallery.onBackToCreate();
    });
    await flush();

    const secondProject = {...project,id:"22222222-2222-4222-8222-222222222222",name:"Outro projeto",compiledDocument:"## TOM_DE_VOZ\nVoz do segundo projeto"};
    localStorage.setItem("postspark.local_brand_projects.v1",JSON.stringify([project,secondProject]));
    act(() => h.create.onSelectProjectId(secondProject.id));
    await flush();

    h.start.mockResolvedValueOnce({
      snapshot: { ...snapshot([ready("prop-static-1", 0)]), requestId: "a0000000-0000-0000-0000-000000000099" },
      created: true,
    });

    await act(async () => {
      h.create.onSubmit("Novo briefing estático sobre liderança", "static");
      await Promise.resolve();
    });
    await flush();

    expect(h.start).toHaveBeenCalledTimes(4);
    const changeCallInput = h.start.mock.calls[3][0];
    expect(changeCallInput.idempotencyKey).not.toBe(firstIdempotencyKey);
    expect(changeCallInput.idempotencyKey).not.toBe(moreCallInput.idempotencyKey);
    expect(changeCallInput.postMode).toBe("static");
    expect(changeCallInput.executionBrief.audience).toBeUndefined();
    expect(changeCallInput.projectId).toBe(secondProject.id);
    expect(changeCallInput.projectDossier).toBe(secondProject.compiledDocument);
    expect(changeCallInput.projectSnapshot.structuredData.voiceTone).toBe("Voz do segundo projeto");
  });
  it("preserves platform and image source purpose through admission and restored briefing",async()=>{
    h.start.mockResolvedValue({snapshot:snapshot([running("proposal-a",0)]),created:true});mount();
    await act(async()=>{h.create.onSubmit("Leia a imagem para explicar a proposta","static",{platform:"linkedin",image:"/api/post-media/source",imagePurpose:"content"});await Promise.resolve();});
    expect(h.start.mock.calls[0][0]).toMatchObject({platform:"linkedin",inputType:"image",sources:[{kind:"image",purpose:"content",value:"/api/post-media/source"}],executionBrief:{platform:"linkedin"}});
    const brief=JSON.parse(localStorage.getItem("postspark.creation_brief.draft.v1")!).brief;expect(brief.platform).toBe("linkedin");expect(brief.sources[0].purpose).toBe("content");
  });

});

// Comentado conforme incorporação do acervo de rascunho por padrão e ocultação do checkbox na UI:
// it("defaults to normal and keeps the admin choice stable across catalog publication, clearing it on account change",()=>{
//  h.readiness={candidateCount:0,draftCandidateCount:4,reason:"no_eligible_candidate"};mount();
//  const checkbox=()=>host.querySelector('input[type="checkbox"]') as HTMLInputElement;
//  expect(checkbox().checked).toBe(false);act(()=>checkbox().click());expect(checkbox().checked).toBe(true);
//  h.readiness={candidateCount:1,draftCandidateCount:5,reason:"ready"};mount();expect(checkbox().checked).toBe(true);
//  h.ownerId="00000000-0000-4000-8000-000000000099";mount();expect(checkbox().checked).toBe(false);
// });

