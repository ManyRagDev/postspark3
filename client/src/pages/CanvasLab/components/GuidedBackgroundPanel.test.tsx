// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { INITIAL_POST } from "./types";
import GuidedBackgroundPanel from "./GuidedBackgroundPanel";
const api = vi.hoisted(() => ({ generate: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    post: {
      generateImage: { useMutation: () => ({ mutateAsync: api.generate }) },
    },
    useUtils: () => ({
      billing: { getProfile: { invalidate: api.invalidate } },
    }),
  },
}));
let root: Root;
let host: HTMLDivElement;
const button = (text: string) =>
  Array.from(host.querySelectorAll("button")).find(
    b => b.textContent === text
  )!;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
function mount() {
  const onImage = vi.fn(),
    onProposal = vi.fn(),
    onBusyChange = vi.fn();
  const post = structuredClone(INITIAL_POST);
  post.slides[0].headline = "50% de desconto";
  post.slides[0].subtext = "Compare os preços.";
  act(() =>
    root.render(
      <GuidedBackgroundPanel
        post={post}
        busy={false}
        onBusyChange={onBusyChange}
        onImage={onImage}
        onProposal={onProposal}
        onUpload={vi.fn()}
        onImageTools={vi.fn()}
      />
    )
  );
  return { onImage, onProposal, onBusyChange };
}
it("generates only on explicit click and prepares copy space before requesting a preview", async () => {
  api.generate.mockResolvedValue({ imageUrl: "result.png" });
  const callbacks = mount();
  expect(api.generate).not.toHaveBeenCalled();
  act(() => button("Usar cores").click());
  act(() => button("Criar com IA").click());
  expect(api.generate).not.toHaveBeenCalled();
  await act(async () => {
    button("Gerar imagem com IA").click();
    button("Gerar imagem com IA").click();
  });
  expect(api.generate).toHaveBeenCalledTimes(1);
  expect(api.generate.mock.calls[0][0].postContext).toMatchObject({
    headline: "50% de desconto",
    compositionGuidance: expect.any(String),
  });
  expect(callbacks.onImage).toHaveBeenCalledWith("result.png");
  expect(callbacks.onProposal).not.toHaveBeenCalled();
  expect(callbacks.onBusyChange.mock.calls).toEqual([[true], [false]]);
  expect(api.invalidate).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Cada geração usa Sparks");
});
it("retains the prompt and permits a retry after failure without applying a photo", async () => {
  api.generate.mockRejectedValue(new Error("Sem saldo disponível"));
  const callbacks = mount();
  const prompt = host.querySelector("textarea")!.value;
  await act(async () => button("Gerar imagem com IA").click());
  expect(host.querySelector("[role=alert]")?.textContent).toContain(
    "Sem saldo"
  );
  expect(host.querySelector("textarea")!.value).toBe(prompt);
  expect(callbacks.onImage).not.toHaveBeenCalled();
  api.generate.mockResolvedValue({ imageUrl: "retry.png" });
  await act(async () => button("Gerar imagem com IA").click());
  expect(callbacks.onImage).toHaveBeenCalledWith("retry.png");
});
