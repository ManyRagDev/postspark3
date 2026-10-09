// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_POST } from "./types";
import GuidedEditor from "./GuidedEditor";
vi.mock("./CanvasPostStage", () => ({
  CanvasPostStage: ({ post }: { post: typeof INITIAL_POST }) => (
    <div data-testid="preview">{post.slides[0].headline}</div>
  ),
}));
let root: Root;
let host: HTMLDivElement;
const button = (text: string) =>
  Array.from(document.querySelectorAll("button")).find(node =>
    node.textContent?.includes(text)
  )!;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
describe("guided editor interaction", () => {
  it("does not mutate or apply while exploring and cancelling", () => {
    const onApply = vi.fn();
    const post = structuredClone(INITIAL_POST);
    const before = structuredClone(post);
    act(() =>
      root.render(
        <GuidedEditor
          post={post}
          free={false}
          onFreeChange={vi.fn()}
          onApply={onApply}
          onImageTools={vi.fn()}
        />
      )
    );
    act(() => button("Reorganizar visual").click());
    act(() => button("Equilibrado").click());
    expect(button("Aplicar ao slide").disabled).toBe(false);
    act(() => button("Comparar com atual").click());
    expect(onApply).not.toHaveBeenCalled();
    act(() => button("Cancelar").click());
    expect(post).toEqual(before);
    expect(onApply).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("offers targeted emphasis without duplicating gallery compositions", () => {
    const onApply = vi.fn();
    const post = structuredClone(INITIAL_POST);
    post.slides[0].headline = "A armadilha dos 50% de desconto";
    act(() =>
      root.render(
        <GuidedEditor
          post={post}
          free={false}
          onFreeChange={vi.fn()}
          onApply={onApply}
          onImageTools={vi.fn()}
        />
      )
    );
    act(() => button("Destaque").click());
    expect(
      document.querySelector('[aria-label="Trecho do título"]')
    ).toHaveProperty("value", "50%");
    expect(document.querySelector('[aria-label="Composições"]')).toBeNull();
    act(() => button("Sublinhado").click());
    expect(onApply).not.toHaveBeenCalled();
    act(() => button("Aplicar ao slide").click());
    const result = onApply.mock.calls[0][0];
    expect(result.slides[0].headline).toBe(post.slides[0].headline);
    expect(
      result.slides[0].headlineRich.find(
        (c: { text: string }) => c.text === "50%"
      ).underline
    ).toBe(true);
    expect(result.familyId).toBe(post.familyId);
  });
  it("applies one complete proposal and keeps recovery reachable in free mode", () => {
    const onApply = vi.fn();
    act(() =>
      root.render(
        <GuidedEditor
          post={INITIAL_POST}
          free
          onFreeChange={vi.fn()}
          onApply={onApply}
          onImageTools={vi.fn()}
        />
      )
    );
    expect(button("Voltar à edição guiada")).toBeTruthy();
    act(() => button("Reorganizar visual").click());
    act(() => button("Equilibrado").click());
    act(() => button("Aplicar ao slide").click());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].slides[0].headline).toBe(
      INITIAL_POST.slides[0].headline
    );
    expect(onApply.mock.calls[0][0].slides[0].guidedComposition.id).toBe(
      "balanced"
    );
  });
});
