// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasCustomText, CanvasPostModel } from "./types";
import TypographyColorControls from "./TypographyColorControls";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const selectedBox: CanvasCustomText = {
  id: "tx-selected",
  text: "Caixa selecionada",
  effect: "none",
  effectColor: "#112233",
};

function makePost(): CanvasPostModel {
  return {
    id: "typography-controls-test",
    familyId: "editorial-poster",
    familyName: "Editorial de Luxo",
    aspectRatio: "1:1",
    headlineAlign: "left",
    bodyAlign: "left",
    badgeText: "",
    headline: "Título",
    subtext: "Corpo",
    caption: "",
    fontFamily: "Inter",
    overlayOpacity: 0.55,
    logoPosition: "top-right",
    palette: { background: "#120D0A", text: "#F8F4EE", accent: "#E5A93C" },
    currentSlideIndex: 0,
    slides: [{
      id: "s1",
      step: "SLIDE 01",
      headline: "Título",
      subtext: "Corpo",
      extraTexts: [selectedBox],
    }],
  };
}

describe("TypographyColorControls", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = undefined;
    container = undefined;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("targets only the selected extra text when choosing a legibility background", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onUpdatePost = vi.fn();
    const onUpdateExtraText = vi.fn();

    await act(async () => {
      root?.render(
        <TypographyColorControls
          post={makePost()}
          onUpdatePost={onUpdatePost}
          selectedExtraText={selectedBox}
          onUpdateExtraText={onUpdateExtraText}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const selectedTarget = buttons.find(button => button.textContent?.trim() === "Caixa selecionada");
    expect(selectedTarget?.getAttribute("aria-pressed")).toBe("true");

    const cardEffect = buttons.find(button => button.textContent?.includes("Cartão"));
    expect(cardEffect).toBeDefined();
    act(() => cardEffect?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(onUpdateExtraText).toHaveBeenCalledWith("tx-selected", { effect: "box-card" });
    expect(onUpdatePost).not.toHaveBeenCalled();
  });
});
