// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import ScriptSlidesModal from "./ScriptSlidesModal";

let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
const button = (text: string) =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')
  ).find(b => b.textContent === text)!;
function enterText(input: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});

it("starts with bulk paste, divides the script for editing and only applies the reviewed slides", () => {
  const onApply = vi.fn();
  act(() =>
    root.render(
      <ScriptSlidesModal initial={[]} onApply={onApply} onClose={vi.fn()} />
    )
  );
  expect(button("Colar texto").getAttribute("aria-pressed")).toBe("true");
  const raw = "slide1:\nTítulo\n\nCorpo original.\n\nslide2:\nSegundo texto.";
  enterText(document.querySelector<HTMLTextAreaElement>("#script-block")!, raw);
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "2 slides identificados"
  );
  expect(onApply).not.toHaveBeenCalled();
  act(() => button("Dividir em slides").click());
  expect(
    document.querySelector<HTMLTextAreaElement>("#script-page-0")!.value
  ).toBe("Título\n\nCorpo original.");
  enterText(
    document.querySelector<HTMLTextAreaElement>("#script-page-1")!,
    "Segundo texto editado."
  );
  act(() => button("Usar estes 2 slides").click());
  expect(onApply).toHaveBeenCalledWith([
    "Título\n\nCorpo original.",
    "Segundo texto editado.",
  ]);
});

it("keeps both drafts across mode switches and updates bulk text after a manual edit", () => {
  act(() =>
    root.render(
      <ScriptSlidesModal
        initial={[]}
        initialText="Ainda sem marcadores"
        onApply={vi.fn()}
        onClose={vi.fn()}
      />
    )
  );
  act(() => button("Slide por slide").click());
  act(() => button("Colar texto").click());
  expect(
    document.querySelector<HTMLTextAreaElement>("#script-block")!.value
  ).toBe("Ainda sem marcadores");
  enterText(
    document.querySelector<HTMLTextAreaElement>("#script-block")!,
    "Primeiro.\n---\nSegundo."
  );
  act(() => button("Dividir em slides").click());
  act(() => button("Colar texto").click());
  expect(
    document.querySelector<HTMLTextAreaElement>("#script-block")!.value
  ).toBe("Primeiro.\n---\nSegundo.");
  act(() => button("Slide por slide").click());
  enterText(
    document.querySelector<HTMLTextAreaElement>("#script-page-0")!,
    "Primeiro editado."
  );
  act(() => button("Colar texto").click());
  expect(
    document.querySelector<HTMLTextAreaElement>("#script-block")!.value
  ).toBe("Slide 1:\nPrimeiro editado.\n\nSlide 2:\nSegundo.");
});

it("retains excess slides for correction and prevents silently applying a truncated script", () => {
  const onApply = vi.fn();
  act(() =>
    root.render(
      <ScriptSlidesModal initial={[]} onApply={onApply} onClose={vi.fn()} />
    )
  );
  enterText(
    document.querySelector<HTMLTextAreaElement>("#script-block")!,
    Array.from({ length: 12 }, (_, i) => `slide${i + 1}:\nTexto ${i + 1}`).join(
      "\n\n"
    )
  );
  act(() => button("Dividir em slides").click());
  expect(document.querySelectorAll('[role="dialog"] textarea')).toHaveLength(
    12
  );
  expect(button("Usar estes 12 slides").disabled).toBe(true);
  expect(
    document.querySelector<HTMLTextAreaElement>("#script-page-11")!.value
  ).toBe("Texto 12");
  expect(onApply).not.toHaveBeenCalled();
});
