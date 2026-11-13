// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import CarouselFilmstrip from "./CarouselFilmstrip";

describe("CarouselFilmstrip mobile", () => {
  it("oferece ações com alvo mínimo de toque e seleção por botão acessível", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onSelectSlide = vi.fn();
    act(() => root.render(
      <CarouselFilmstrip
        slides={[
          { id: "a", step: "1", headline: "Um", subtext: "" },
          { id: "b", step: "2", headline: "Dois", subtext: "" },
        ]}
        currentIndex={0}
        onSelectSlide={onSelectSlide}
        onAddSlide={vi.fn()}
        onDuplicateSlide={vi.fn()}
        onRemoveSlide={vi.fn()}
      />
    ));
    const menu = host.querySelector('button[aria-label="Ações do slide 2"]') as HTMLButtonElement;
    expect(menu.className).toContain("min-h-11");
    expect(menu.className).toContain("min-w-11");
    const select = host.querySelector<HTMLButtonElement>('[aria-label="Selecionar slide 2: Dois"]');
    expect(select).not.toBeNull();
    act(() => select?.click());
    expect(onSelectSlide).toHaveBeenCalledWith(1);
    act(() => root.unmount());
    host.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });
});

it("changes slides through the compact controls while a tool remains available", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), select = vi.fn();
  const props = { compact: true, slides: [{ id: "a", step: "1", headline: "Um", subtext: "" }, { id: "b", step: "2", headline: "Dois", subtext: "" }], currentIndex: 0, onSelectSlide: select, onAddSlide: vi.fn(), onDuplicateSlide: vi.fn(), onRemoveSlide: vi.fn() };
  try {
    act(() => root.render(<CarouselFilmstrip {...props} />));
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Slide anterior"]')!.disabled).toBe(true);
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Próximo slide"]')!.click());
    expect(select).toHaveBeenLastCalledWith(1);
    act(() => root.render(<CarouselFilmstrip {...props} currentIndex={1} />));
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Próximo slide"]')!.disabled).toBe(true);
    const picker = host.querySelector<HTMLSelectElement>('[aria-label="Slide atual"]')!;
    act(() => { picker.value = "0"; picker.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(select).toHaveBeenLastCalledWith(0);
  } finally { act(() => root.unmount()); host.remove(); delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; }
});
