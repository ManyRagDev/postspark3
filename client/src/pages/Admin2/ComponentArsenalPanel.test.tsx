// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ComponentArsenalPanel from "./ComponentArsenalPanel";

const state = vi.hoisted(() => ({ entries: [] as unknown[] }));
vi.mock("@/lib/trpc", () => ({ trpc: { designCatalog: { listComponents: { useQuery: () => ({ data: { entries: state.entries, total: state.entries.length }, refetch: vi.fn() }) } } } }));
vi.mock("@/lib/arsenalApi", () => ({ arsenalApi: {} }));
vi.mock("@shared/componentAssembly", () => ({ componentDefinitionV1Schema: { safeParse: (data: unknown) => ({ success: true, data }) } }));
vi.mock("../CanvasLab/components/CanvasPostStage", () => ({ CanvasPostStage: () => null }));
vi.mock("./componentReview", () => ({ reviewSamples: ["curto"] }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("distinguishes agent evidence, human rejection, and absent evidence from publication", () => {
  state.entries = [
    { id: "agent", status: "approved", review: { kind: "agent_visual", decision: "approved" } },
    { id: "human", status: "draft", review: { kind: "human", decision: "rejected" } },
    { id: "none", status: "draft", review: null },
    { id: "unknown", status: "draft", review: { decision: "approved" } },
  ].map(entry => ({ ...entry, source_key: "fixture", definition: { id: entry.id, label: entry.id, kind: "content", aspectRatios: ["4:5"], densities: ["balanced"], hash: "a".repeat(64) }, review: entry.review && { ...entry.review, created_at: "2026-10-09T12:00:00Z" } }));
  act(() => root.render(<ComponentArsenalPanel />));
  const rows = Array.from(host.querySelectorAll("tbody tr"));
  expect(rows[0].textContent).toContain("PublicadoAgente · Aprovado");
  expect(rows[0].textContent).not.toContain("Humana");
  expect(rows[1].textContent).toContain("RascunhoHumana · Correção solicitada");
  expect(rows[2].textContent).toContain("Sem revisão visual");
  expect(rows[3].textContent).toContain("Origem não informada · Aprovado");
  expect(rows[3].textContent).not.toContain("Humana");
  expect(host.querySelector("thead")?.textContent).toContain("Revisão visual");
});
