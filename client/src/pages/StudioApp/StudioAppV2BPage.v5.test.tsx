// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_POST } from "@/pages/CanvasLab/components/types";
import Studio from "./StudioAppV2BPage";
import {
  ACTIVE_V5_REQUEST_SESSION_KEY,
  PENDING_V5_START_SESSION_KEY,
  type PendingV5Start,
} from "./lib/studioGenerationV5State";

const h = vi.hoisted(() => ({
  ownerId: "00000000-0000-4000-8000-000000000001",
  create: null as any,
  gallery: null as any,
  editor: null as any,
  start: vi.fn(),
  getData: undefined as any,
  getError: null as any,
  cancel: vi.fn(),
  save: vi.fn(),
  generateV4: vi.fn(),
  capabilities: { selectable: true, enabled: true, reason: "ready" },
  materialize: vi.fn(),
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/trpc", () => ({ trpc: {
  generation: {
    capabilities: { useQuery: () => ({ data: { ownerId: h.ownerId, ...h.capabilities, contractVersion: 5 } }) },
    start: { useMutation: () => ({ mutateAsync: h.start, isPending: false }) },
    get: { useQuery: () => ({ data: h.getData, error: h.getError, refetch: vi.fn() }) },
    cancel: { useMutation: () => ({ mutateAsync: h.cancel, isPending: false }) },
  },
  designCatalog: {
    generationReadiness: { useQuery: () => ({ data: undefined }) },
    reportCompilation: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    reportArsenalCompilation: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    reportComponentCompilation: { useMutation: () => ({ mutateAsync: vi.fn() }) },
  },
  brandKit: { get: { useQuery: () => ({ data: undefined }) } },
  post: {
    generate: { useMutation: () => ({ mutateAsync: h.generateV4 }) },
    save: { useMutation: () => ({ mutateAsync: h.save }) },
    update: { useMutation: () => ({ mutateAsync: vi.fn() }) },
  },
} }));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()] }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/fonts", () => ({ loadCatalogFonts: vi.fn() }));
vi.mock("./components/StudioArtPreferences", () => ({ default: () => null }));
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
  FormatConfirmModal: () => null,
  GenerationFailureModal: () => null,
}));
vi.mock("./components/v2/BriefReviewModal", () => ({ default: () => null }));
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
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  h.create = h.gallery = h.editor = null;
  h.getData = undefined;
  h.getError = null;
  h.capabilities = { selectable: true, enabled: true, reason: "ready" };
  h.start.mockReset();
  h.cancel.mockReset();
  h.save.mockResolvedValue({ id: 21 });
  h.generateV4.mockResolvedValue({ variations: [], generationRunId: runId });
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
  host.remove();
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});

describe("Studio V5 progressive flow", () => {
  it("lets DEV select V5 while the executor starts and uses V5 once it becomes ready", async () => {
    h.capabilities = { selectable: true, enabled: false, reason: "durable_worker_required" };
    h.start.mockResolvedValue({ snapshot: snapshot([running("proposal-a", 0)]), created: true });
    mount();
    const flag = host.querySelector<HTMLInputElement>('input[aria-label="Usar geração progressiva V5"]')!;
    expect(flag.disabled).toBe(false);
    act(() => flag.click());
    expect(flag.checked).toBe(true);
    expect(host.textContent).toContain("Aguardando o processamento V5");
    h.capabilities = { selectable: true, enabled: true, reason: "ready" };
    mount();
    await act(async () => { await h.create.onSubmit("Café artesanal", "static"); });
    expect(h.start).toHaveBeenCalledOnce();
    expect(h.generateV4).not.toHaveBeenCalled();
  });
  it("keeps the flag unavailable when the server disallows this account", () => {
    h.capabilities = { selectable: false, enabled: false, reason: "dev_account_required" };
    mount();
    const flag = host.querySelector<HTMLInputElement>('input[aria-label="Usar geração progressiva V5"]')!;
    expect(flag.disabled).toBe(true);
    expect(host.textContent).toContain("contas DEV");
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
    await act(async () => { host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click(); await Promise.resolve(); });
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

  it("replays an unacknowledged start after refresh with the exact stored body and idempotency key", async () => {
    const pending: PendingV5Start = {
      input: {
        ownerId: h.ownerId,
        inputType: "text", content: "Brief original congelado", platform: "instagram", postMode: "static",
        formatIntentConfirmed: false, includeDraftDesigns: false, aspectRatio: "4:5", model: "llama",
        creationMode: "ideation", idempotencyKey: "same-idempotency-key",
      },
      source: "create", promptText: "Brief original congelado", mode: "static", inputType: "text",
    };
    sessionStorage.setItem(PENDING_V5_START_SESSION_KEY, JSON.stringify(pending));
    h.start.mockResolvedValue({ snapshot: snapshot([running("proposal-a", 0)]), created: false });
    mount();
    await flush();
    expect(h.start).toHaveBeenCalledOnce();
    expect(h.start).toHaveBeenCalledWith(pending.input);
    expect(sessionStorage.getItem(PENDING_V5_START_SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(ACTIVE_V5_REQUEST_SESSION_KEY)).toBe(requestId);
    expect(h.generateV4).not.toHaveBeenCalled();
  });

  it("does not let an old admission response replace the current request or its session binding", async () => {
    let resolveOld!: (value:any)=>void;
    h.start.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}))
      .mockResolvedValueOnce({snapshot:{...snapshot([running("new-proposal",0)]),requestId:secondRequestId},created:true});
    mount();
    await act(async()=>{host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();await Promise.resolve();});
    let oldSubmit!: Promise<void>;
    act(()=>{oldSubmit=h.create.onSubmit("Pedido antigo","static");});
    await act(async()=>{await h.create.onSubmit("Pedido atual","static");});
    expect(sessionStorage.getItem(ACTIVE_V5_REQUEST_SESSION_KEY)).toBe(secondRequestId);
    await act(async()=>{resolveOld({snapshot:snapshot([ready("old-proposal",0)]),created:true});await oldSubmit;});
    expect(sessionStorage.getItem(ACTIVE_V5_REQUEST_SESSION_KEY)).toBe(secondRequestId);
    expect(h.gallery.variations).toEqual([]);
    expect(h.materialize).not.toHaveBeenCalled();
  });

  it("clears an inaccessible session binding so a fresh generation is available", async () => {
    sessionStorage.setItem(ACTIVE_V5_REQUEST_SESSION_KEY, requestId);
    h.getError = { data: { code: "NOT_FOUND" } };
    mount();
    await flush();

    expect(sessionStorage.getItem(ACTIVE_V5_REQUEST_SESSION_KEY)).toBeNull();
    const v5Toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(v5Toggle?.disabled).toBe(false);
    expect(host.textContent).not.toContain("Retomar pedido");
    expect(h.toast.info).toHaveBeenCalledWith("Esta geração não está disponível nesta sessão. Você pode iniciar uma nova.");

    await act(async () => { h.create.onSubmit("Novo pedido", "static"); await Promise.resolve(); });
    expect(h.generateV4).toHaveBeenCalledOnce();
  });

  it("does not automatically admit a pending briefing left by another account", async () => {
    sessionStorage.setItem(PENDING_V5_START_SESSION_KEY,JSON.stringify({input:{ownerId:"00000000-0000-4000-8000-000000000004",idempotencyKey:"other-account",inputType:"text",content:"Brief privado",platform:"instagram",postMode:"static"},source:"create",promptText:"Brief privado",mode:"static",inputType:"text"}));
    mount();
    await flush();
    expect(h.start).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_V5_START_SESSION_KEY)).toBeNull();
    expect(h.toast.info).toHaveBeenCalledWith("O pedido pendente pertence a outra conta. Inicie uma nova geração nesta sessão.");
  });

  it("shows cancellation as cancelled when no proposals were ready", async () => {
    sessionStorage.setItem(ACTIVE_V5_REQUEST_SESSION_KEY, requestId);
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
    await act(async () => { host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click(); await Promise.resolve(); });
    await act(async () => { h.create.onSubmit("Criação antiga", "static"); await Promise.resolve(); });
    await flush();
    act(() => h.gallery.onBackToCreate());
    await act(async () => { h.create.onSubmit("Criação nova", "static"); await Promise.resolve(); });
    await flush();
    await act(async () => { resolveOld(materializedResult([post("old-post")])); await Promise.resolve(); });
    expect(h.gallery.variations).toEqual([]);
    expect(host.querySelector('[data-testid="gallery"]')?.textContent).toBe("");
    expect(h.generateV4).not.toHaveBeenCalled();
  });

  it("restores request context after refresh and recovers a failed ready bundle without another start", async () => {
    const bundle = { marker: "proposal-a", slot: 0 };
    sessionStorage.setItem(ACTIVE_V5_REQUEST_SESSION_KEY, requestId);
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
});
