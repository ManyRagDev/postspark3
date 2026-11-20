// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import VisualIdentityModal from "./VisualIdentityModal";
import { identityFixture } from "@shared/visualIdentity.fixture";
const h = vi.hoisted(() => ({ save: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    brandProjects: {
      saveIdentity: { useMutation: () => ({ mutateAsync: h.save }) },
    },
    post: { saveMediaAsset: { useMutation: () => ({ mutateAsync: vi.fn() }) } },
    useUtils: () => ({ brandProjects: { list: { invalidate: h.invalidate } } }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  h.save.mockReset();
  h.invalidate.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});
it("saves a minimal identity without requiring brand context, keeps a stable creation key and displays substitutions", async () => {
  const identity = identityFixture({ headingFont: "Fonte ausente" });
  h.save.mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    visualIdentity: identity,
  });
  const onSaved = vi.fn();
  act(() =>
    root.render(
      <VisualIdentityModal
        project={{ name: "Marca", visualIdentity: identity }}
        onSaved={onSaved}
        onClose={vi.fn()}
      />
    )
  );
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).not.toContain("Público-alvo");
  expect(dialog.querySelectorAll("textarea")).toHaveLength(1);
  const form = dialog.querySelector("form")!;
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
    await Promise.resolve();
  });
  expect(h.save).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Marca",
      description: identity.description,
      creationId: expect.any(String),
    })
  );
  expect(onSaved).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  expect(dialog.textContent).toContain("Foi ajustado para Inter");
});
it("keeps remote save errors visible without selecting a fictitious local success", async () => {
  h.save.mockRejectedValue(new Error("Serviço indisponível"));
  const onSaved = vi.fn();
  act(() =>
    root.render(
      <VisualIdentityModal
        project={{ name: "Marca", visualIdentity: identityFixture() }}
        onSaved={onSaved}
        onClose={vi.fn()}
      />
    )
  );
  const form = document.querySelector('[role="dialog"] form')!;
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
    await Promise.resolve();
  });
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    "Serviço indisponível"
  );
  expect(onSaved).not.toHaveBeenCalled();
});
