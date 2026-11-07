// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import History from "./History";

const h = vi.hoisted(() => ({ generations: [] as any[], navigate: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    post: {
      listGenerations: {
        useQuery: () => ({
          data: h.generations,
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
    },
  },
}));
vi.mock("wouter", () => ({ useLocation: () => ["/history", h.navigate] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  vi.clearAllMocks();
  const base = {
    created_at: new Date().toISOString(),
    platform: "instagram",
    post_mode: "static",
    input_type: "text",
  };
  h.generations = [
    {
      ...base,
      id: "partial-run",
      status: "partial",
      input_content: "Entrega parcial",
      output_snapshot: [
        null,
        { id: "proposal-b", completeDesignV1: { slot: 1 } },
        null,
      ],
    },
    {
      ...base,
      id: "cancelled-run",
      status: "cancelled",
      input_content: "Cancelamento",
      output_snapshot: [null, null, null],
    },
  ];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<History />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});

it("filters partial and cancelled runs and restores only committed proposals with their original slot", () => {
  const select = host.querySelector<HTMLSelectElement>(
    'select[aria-label="Filtrar por status"]'
  )!;
  expect(select.textContent).toContain("Parcialmente concluídos (1)");
  expect(select.textContent).toContain("Cancelados (1)");
  act(() => {
    select.value = "cancelled";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.textContent).toContain("Cancelamento");
  expect(host.textContent).not.toContain("Entrega parcial");
  expect(
    Array.from(host.querySelectorAll("button")).filter(b =>
      b.textContent?.includes("Recuperar")
    )
  ).toHaveLength(0);
  act(() => {
    select.value = "partial";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.textContent).toContain("1 variação");
  const recover = Array.from(host.querySelectorAll("button")).find(b =>
    b.textContent?.includes("Recuperar")
  )!;
  act(() => recover.click());
  const restored = JSON.parse(
    sessionStorage.getItem("postspark.restore_generation")!
  );
  expect(restored.generationRunId).toBe("partial-run");
  expect(restored.variations).toEqual([
    { id: "proposal-b", completeDesignV1: { slot: 1 } },
  ]);
  expect(h.navigate).toHaveBeenCalledWith("/thevoid");
});

it("renders actual Supabase created_at and filters by its date while preserving legacy createdAt", () => {
  expect(host.textContent).toContain("Agora");
  expect(host.textContent).not.toContain("Invalid Date");
  h.generations[1].created_at=undefined;
  h.generations[1].createdAt=new Date(Date.now()-14*86400000).toISOString();
  act(()=>root.render(<History />));
  const select=Array.from(host.querySelectorAll<HTMLSelectElement>("select")).find(select=>Array.from(select.options).some(option=>option.value==="today"))!;
  act(()=>{select.value="today";select.dispatchEvent(new Event("change",{bubbles:true}));});
  expect(host.textContent).toContain("Entrega parcial");
  expect(host.textContent).not.toContain("Cancelamento");
});
