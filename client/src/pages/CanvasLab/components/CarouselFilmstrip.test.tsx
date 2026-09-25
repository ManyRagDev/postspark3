// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import CarouselFilmstrip from "./CarouselFilmstrip";

describe("CarouselFilmstrip mobile", () => {
  it("mantém o menu de ações com metade da área anterior e seleciona pelo cartão", () => {
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
    expect(menu.className).toContain("h-5 w-5");
    act(() => menu.parentElement?.parentElement?.parentElement?.click());
    expect(onSelectSlide).toHaveBeenCalledWith(1);
    act(() => root.unmount());
    host.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });
});
