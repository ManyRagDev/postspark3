// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { brandProjectInputSchema } from "@shared/brandProjects";
import BrandCaptureModal from "./BrandCaptureModal";
const h = vi.hoisted(() => ({
  start: vi.fn(),
  save: vi.fn(),
  invalidate: vi.fn(),
  query: null as any,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ brandProjects: { list: { invalidate: h.invalidate } } }),
    brandProjects: {
      captureStart: {
        useMutation: () => ({ mutateAsync: h.start, isPending: false }),
      },
      captureGet: { useQuery: () => ({ data: h.query }) },
      captureSave: {
        useMutation: () => ({ mutateAsync: h.save, isPending: false }),
      },
    },
  },
}));
let root: Root, host: HTMLDivElement;
const captureId = "00000000-0000-4000-8000-000000000001";
const preview = brandProjectInputSchema.parse({
  name: "Marca geral",
  niche: "Serviços",
  structuredData: { factualDifferentials: "Atendimento por agendamento" },
  capture: {
    version: 1,
    captureId,
    sourceUrl: "https://example.com/",
    capturedAt: "2026-10-26T00:00:00Z",
    warnings: ["Dados incompletos: confirme as condições."],
    inferredFields: ["targetAudience"],
  },
  visualPreferences: {
    colors: ["#112233"],
    fonts: ["Inter"],
    personality: ["calm"],
    composition: "spacious",
  },
});
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  sessionStorage.clear();
  h.invalidate.mockResolvedValue(undefined);
  h.query = { id: captureId, status: "completed", preview };
  h.start.mockResolvedValue(h.query);
  h.save.mockResolvedValue({ project: { id: "saved-project" } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});
async function mount(onSaved = vi.fn()) {
  await act(async () => {
    root.render(
      <BrandCaptureModal
        url="https://example.com/"
        projectId="00000000-0000-4000-8000-000000000002"
        onClose={() => {}}
        onSaved={onSaved}
      />
    );
  });
  return onSaved;
}
async function clickSave() {
  const b = Array.from(host.querySelectorAll("button")).find(b =>
    /Salvar como novo|Atualizar projeto/.test(b.textContent ?? "")
  )!;
  await act(async () => b.click());
}
it("reviews inferred fields and warnings, saves only on an explicit action, and creates a separate project by default", async () => {
  const saved = await mount();
  expect(h.start).toHaveBeenCalledOnce();
  expect(h.save).not.toHaveBeenCalled();
  expect(host.textContent).toContain("inferido");
  expect(host.textContent).toContain("Dados incompletos");
  await clickSave();
  expect(h.save.mock.calls[0][0].project.id).toBeUndefined();
  expect(h.save.mock.calls[0][0].project.capture.captureId).toBe(captureId);
  expect(saved).toHaveBeenCalledWith("saved-project");
});
it("failed persistence stays open and retries the identical save key without announcing success", async () => {
  h.save.mockRejectedValueOnce(new Error("Persistência indisponível"));
  const saved = await mount();
  await clickSave();
  expect(saved).not.toHaveBeenCalled();
  expect(host.querySelector("[role=alert]")?.textContent).toContain(
    "Persistência indisponível"
  );
  await clickSave();
  expect(h.save.mock.calls[0][0]).toEqual(h.save.mock.calls[1][0]);
  expect(saved).toHaveBeenCalledOnce();
});
it("updating an existing project requires choosing the explicit update control", async () => {
  await mount();
  const checkbox = host.querySelector<HTMLInputElement>(
    "input[type=checkbox]"
  )!;
  act(() => checkbox.click());
  await clickSave();
  expect(h.save.mock.calls[0][0].project.id).toBe(
    "00000000-0000-4000-8000-000000000002"
  );
});
