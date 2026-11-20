// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import StudioDebugger from "./StudioDebugger";

const mocks = vi.hoisted(() => ({ frequency: vi.fn(), request: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { generation: {
  designFrequency: { useQuery: mocks.frequency }, debugger: { useQuery: mocks.request },
} } }));

it("only reads the aggregate on its own tab, even before the first generation", () => {
  mocks.frequency.mockReturnValue({data: {sampled: 7, skipped: 2, cohorts: [{
    label:"Estático", rounds:5, families:[{family:"acervo82-reference-07", registered:5, eligible:4, evaluated:1, selected:1, retained:0, delivered:0}],
  }]}});
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"), root = createRoot(host);
  const click = (name: string) => act(() => Array.from(host.querySelectorAll("button")).find(b => b.textContent === name)!.click());
  try {
    act(() => root.render(<StudioDebugger owner="frequency-test" requestId={null} posts={[]} steps={[]} />));
    act(() => host.querySelector("button")!.click());
    expect(mocks.frequency).not.toHaveBeenCalled();
    click("Frequência dos designs");
    expect(mocks.frequency.mock.calls[0][0]).toEqual({rounds:100, before:undefined});
    expect(host.textContent).toContain("5 de 7 rodadas");
    expect(host.textContent).toContain("REF-07");
    expect(host.textContent).toContain("25%");
    const metric = host.querySelectorAll("select")[2];
    act(() => { metric.value = "retained"; metric.dispatchEvent(new Event("change", {bubbles:true})); });
    expect(host.textContent).toContain("0 / 1");
    click("Pedido");
    expect(host.textContent).toContain("Inicie uma geração");
    expect(mocks.request).not.toHaveBeenCalled();
  } finally { act(() => root.unmount()); }
});
