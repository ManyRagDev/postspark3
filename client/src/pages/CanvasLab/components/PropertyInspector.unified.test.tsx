// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PropertyInspector from "./PropertyInspector";
import { INITIAL_POST, type CanvasPostModel } from "./types";
import { reorderExtraElement } from "../lib/documentCommands";
import { createArsenalFixtureComposition } from "../lib/arsenalFixture";
import { reorderArsenalLayer } from "../lib/arsenalComposition";

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("Property Inspector Unificado (OS-005)", () => {
  it("AC-005-01: renders contextual controls for native text element (headline)", async () => {
    const post = structuredClone(INITIAL_POST);
    const handleUpdate = vi.fn();
    const handleClose = vi.fn();

    await act(async () => {
      root.render(
        <PropertyInspector
          post={post}
          selectedId="headline"
          onUpdatePost={handleUpdate}
          onClose={handleClose}
        />
      );
    });

    expect(host.textContent).toContain("Título Principal");
    expect(host.textContent).toContain("Fonte e Alinhamento");
    expect(host.textContent).toContain("Cor do Texto");
    expect(host.textContent).toContain("Fundo de Legibilidade");
  });

  it("AC-005-01: renders contextual controls for native extra text with z-order controls", async () => {
    const post: CanvasPostModel = {
      ...INITIAL_POST,
      slides: [
        {
          ...INITIAL_POST.slides[0],
          extraTexts: [
            { id: "tx-1", text: "Extra 1", fontSize: 24, color: "#fff" },
            { id: "tx-2", text: "Extra 2", fontSize: 20, color: "#aaa" },
          ],
        },
      ],
    };
    const handleUpdate = vi.fn();

    await act(async () => {
      root.render(
        <PropertyInspector
          post={post}
          selectedId="tx-1"
          onUpdatePost={handleUpdate}
          onClose={vi.fn()}
        />
      );
    });

    expect(host.textContent).toContain("Texto Adicional");
    expect(host.textContent).toContain("Trazer p/ Frente");
    expect(host.textContent).toContain("Enviar p/ Trás");
  });

  it("AC-005-04 / D-04: native z-order reordering shifts element position in extraTexts list", () => {
    const post: CanvasPostModel = {
      ...INITIAL_POST,
      currentSlideIndex: 0,
      slides: [
        {
          ...INITIAL_POST.slides[0],
          extraTexts: [
            { id: "tx-1", text: "Extra 1" },
            { id: "tx-2", text: "Extra 2" },
            { id: "tx-3", text: "Extra 3" },
          ],
        },
      ],
    };

    // Trazer tx-1 para a frente (final da lista)
    const frontPost = reorderExtraElement(post, "tx-1", "front");
    const frontTexts = frontPost.slides[0].extraTexts!;
    expect(frontTexts[frontTexts.length - 1].id).toBe("tx-1");

    // Enviar tx-3 para trás (início da lista)
    const backPost = reorderExtraElement(post, "tx-3", "back");
    const backTexts = backPost.slides[0].extraTexts!;
    expect(backTexts[0].id).toBe("tx-3");
  });

  it("AC-005-04 / D-04: arsenal z-order reordering updates sibling zIndex overrides", () => {
    const c = createArsenalFixtureComposition();
    const elem0 = c.elements[0];
    const elem1 = c.elements[1];

    const reordered = reorderArsenalLayer(c, elem0.id, "front");
    expect(Number(reordered.overrides[elem0.id]?.zIndex)).toBeGreaterThanOrEqual(
      Number(reordered.overrides[elem1.id]?.zIndex ?? 0)
    );
  });
});

