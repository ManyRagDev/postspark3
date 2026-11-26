// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TemplateIngestionModal } from "./TemplateIngestionModal";

const { extract, projects } = vi.hoisted(() => ({
  projects: [{ id: "reune", name: "ReUNE" }, { id: "bizu", name: "BizuMiner" }],
  extract: vi.fn().mockRejectedValue(new Error("Fim da captura de teste")),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    brandProjects: {
      list: { useQuery: () => ({ data: projects }) },
      upsert: { useMutation: () => ({}) },
    },
    templateIngestion: { extractDesign: { useMutation: () => ({ mutateAsync: extract }) } },
  },
}));

it("requires an explicit capture destination when another project is active", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    act(() => root.render(<TemplateIngestionModal isOpen projectId="reune" onClose={() => {}} />));
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const destination = dialog.querySelector<HTMLSelectElement>('select[aria-label="Projeto de destino"]')!;
    const url = dialog.querySelector<HTMLInputElement>('input[placeholder^="https:"]')!;
    const create = Array.from(dialog.querySelectorAll("button")).find(button => button.textContent?.trim() === "Criar modelos")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(url, "https://bizu.example");
      url.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(destination.value).toBe("");
    expect(create.disabled).toBe(true);
    act(() => {
      destination.value = "bizu";
      destination.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(create.disabled).toBe(false);
    await act(async () => create.click());
    expect(extract).toHaveBeenCalledWith(expect.objectContaining({ projectId: "bizu", url: "https://bizu.example" }));
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
