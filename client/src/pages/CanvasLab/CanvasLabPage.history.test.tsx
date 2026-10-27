// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import CanvasLabPage from "./CanvasLabPage";
import { INITIAL_POST, type CanvasPostModel } from "./components/types";
import { createArsenalFixtureComposition } from "./lib/arsenalFixture";

const c = vi.hoisted(() => ({
  stage: null as any,
  bar: null as any,
  side: null as any,
  guide: null as any,
  film: null as any,
  rep: null as any,
}));

vi.mock("./components/CanvasPostStage", async () => {
  const R = await import("react");
  return {
    CanvasPostStage: R.forwardRef((p: any, r: any) => {
      c.stage = p;
      R.useImperativeHandle(r, () => ({
        exportPng4K: () => "data:image/png;base64,mock",
      }));
      return null;
    }),
  };
});

vi.mock("./components/CanvasTopBar", () => ({
  default: (p: any) => {
    c.bar = p;
    return null;
  },
}));

vi.mock("./components/CanvasSidebar", () => ({
  default: (p: any) => {
    c.side = p;
    return null;
  },
}));

vi.mock("./components/GuidedEditor", () => ({
  default: (p: any) => {
    c.guide = p;
    return null;
  },
}));

vi.mock("./components/CarouselFilmstrip", () => ({
  default: (p: any) => {
    c.film = p;
    return null;
  },
}));

vi.mock("./components/CanvasMobileQuickActions", () => ({
  default: () => null,
}));

vi.mock("./components/CanvasMobileDrawer", () => ({
  default: () => null,
}));

vi.mock("./components/CanvasToolRail", () => ({
  default: () => null,
}));

vi.mock("./components/SlideReplicationDialog", () => ({
  default: (p: any) => {
    c.rep = p;
    return null;
  },
}));

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => createCanvas(10, 10).getContext("2d") as never
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  window.localStorage.clear();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function createMultiSlidePost(): CanvasPostModel {
  const comp0 = createArsenalFixtureComposition();
  const comp1 = createArsenalFixtureComposition();
  const comp2 = createArsenalFixtureComposition();
  return {
    ...INITIAL_POST,
    currentSlideIndex: 0,
    slides: [
      { id: "s-0", step: "1", headline: "Headline Slide 0", subtext: "Sub 0", composition: comp0 },
      { id: "s-1", step: "2", headline: "Headline Slide 1", subtext: "Sub 1", composition: comp1 },
      { id: "s-2", step: "3", headline: "Headline Slide 2", subtext: "Sub 2", composition: comp2 },
    ],
  };
}

describe("CanvasLabPage History and Navigation (OS-002)", () => {
  it("AC-03 / P06: Edit -> Undo -> Navigate -> Toggle Mode -> Redo preserves redo and does not create spurious autosave", async () => {
    const post = createMultiSlidePost();
    const handleSave = vi.fn().mockReturnValue(true);

    await act(async () => {
      root.render(<CanvasLabPage initialPost={post} onSave={handleSave} />);
    });

    // 1. Edita no slide 0
    await act(async () => {
      c.side.onUpdatePost({ headline: "Headline Editada" });
    });

    expect(c.stage.post.slides[0].headline).toBe("Headline Editada");
    expect(c.bar.canUndo).toBe(true);
    expect(c.bar.canRedo).toBe(false);

    // 2. Undo
    await act(async () => {
      c.bar.onUndo();
    });

    expect(c.stage.post.slides[0].headline).toBe("Headline Slide 0");
    expect(c.bar.canRedo).toBe(true);

    handleSave.mockClear();

    // 3. Navega para slide 1
    await act(async () => {
      c.film.onSelectSlide(1);
    });

    expect(c.stage.post.currentSlideIndex).toBe(1);
    // Redo DEVE sobreviver à navegação
    expect(c.bar.canRedo).toBe(true);
    // Navegação isolada NÃO deve acionar save
    expect(handleSave).not.toHaveBeenCalled();

    // 4. Alterna modo Livre e volta para Guiado
    await act(async () => {
      c.guide.onFreeChange(true);
    });
    expect(c.bar.canRedo).toBe(true);

    await act(async () => {
      c.guide.onFreeChange(false);
    });
    expect(c.bar.canRedo).toBe(true);

    // 5. Redo recupera a edição feita
    await act(async () => {
      c.bar.onRedo();
    });

    expect(c.bar.canRedo).toBe(false);
    expect(c.stage.post.slides[0].headline).toBe("Headline Editada");

    // 6. Novo commit após navegação edita exatamente o slide exibido (slide 1)
    await act(async () => {
      c.side.onUpdatePost({ headline: "Nova Edição no Slide 1" });
    });

    expect(c.stage.post.slides[1].headline).toBe("Nova Edição no Slide 1");
    expect(c.stage.post.slides[0].headline).toBe("Headline Editada");
  });

  it("AC-04: Excluir slide ativo -> Undo -> Redo reconcilia slide ativo e limpa seleção", async () => {
    const post = createMultiSlidePost();

    await act(async () => {
      root.render(<CanvasLabPage initialPost={post} />);
    });

    // Navega para o último slide (índice 2)
    await act(async () => {
      c.film.onSelectSlide(2);
    });
    expect(c.stage.post.currentSlideIndex).toBe(2);

    // Exclui o slide 2 (slide ativo)
    await act(async () => {
      c.film.onRemoveSlide(2);
    });

    // Nova lista tem 2 slides; o anterior (índice 1) vira o ativo
    expect(c.stage.post.slides).toHaveLength(2);
    expect(c.stage.post.currentSlideIndex).toBe(1);
    expect(c.stage.selectedElementId).toBeNull();

    // Undo restaura o slide excluído
    await act(async () => {
      c.bar.onUndo();
    });

    expect(c.stage.post.slides).toHaveLength(3);
    expect(c.bar.canRedo).toBe(true);

    // Redo remove novamente
    await act(async () => {
      c.bar.onRedo();
    });

    expect(c.stage.post.slides).toHaveLength(2);
    expect(c.stage.post.currentSlideIndex).toBe(1);
    expect(c.stage.selectedElementId).toBeNull();
  });

  it("AC-04: Undo reconcilia índice ativo quando snapshot anterior possui menos slides", async () => {
    const post = createMultiSlidePost();

    await act(async () => {
      root.render(<CanvasLabPage initialPost={post} />);
    });

    // Duplica o último slide
    await act(async () => {
      c.film.onDuplicateSlide(2);
    });

    // Agora há 4 slides e o ativo é o clone (índice 3)
    expect(c.stage.post.slides).toHaveLength(4);
    expect(c.stage.post.currentSlideIndex).toBe(3);

    // Undo desfaz a duplicação; snapshot restaurado só tem 3 slides
    await act(async () => {
      c.bar.onUndo();
    });

    expect(c.stage.post.slides).toHaveLength(3);
    // Índice foi clamped / reconciliado para limite válido
    expect(c.stage.post.currentSlideIndex).toBeLessThanOrEqual(2);
    expect(c.stage.post.currentSlideIndex).toBeGreaterThanOrEqual(0);
  });

  it("AC-05: Real edit after Undo discards Redo history", async () => {
    const post = createMultiSlidePost();

    await act(async () => {
      root.render(<CanvasLabPage initialPost={post} />);
    });

    // Edição 1
    await act(async () => {
      c.side.onUpdatePost({ headline: "Edição 1" });
    });
    expect(c.stage.post.slides[0].headline).toBe("Edição 1");

    // Undo
    await act(async () => {
      c.bar.onUndo();
    });
    expect(c.stage.post.slides[0].headline).toBe("Headline Slide 0");
    expect(c.bar.canRedo).toBe(true);

    // Nova edição real deve descartar o Redo
    await act(async () => {
      c.side.onUpdatePost({ headline: "Edição 2" });
    });

    expect(c.stage.post.slides[0].headline).toBe("Edição 2");
    expect(c.bar.canRedo).toBe(false);
  });

  it("AC-05: Atalhos de teclado Ctrl+Z / Ctrl+Y funcionam e são ignorados quando input/textarea está focado", async () => {
    const post = createMultiSlidePost();

    await act(async () => {
      root.render(<CanvasLabPage initialPost={post} />);
    });

    // Realiza uma edição para ter o que desfazer
    await act(async () => {
      c.side.onUpdatePost({ headline: "Edição por Teclado" });
    });
    expect(c.stage.post.slides[0].headline).toBe("Edição por Teclado");

    // Cria um input de formulário na DOM e foca nele
    const input = document.createElement("input");
    host.appendChild(input);
    input.focus();

    // Dispara Ctrl+Z com input focado
    await act(async () => {
      const event = new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
    });

    // Undo foi ignorado porque o foco estava no campo nativo
    expect(c.stage.post.slides[0].headline).toBe("Edição por Teclado");

    // Tira o foco do input
    input.blur();

    // Dispara Ctrl+Z no window
    await act(async () => {
      const event = new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);
    });

    // Undo funcionou no documento
    expect(c.stage.post.slides[0].headline).toBe("Headline Slide 0");
    expect(c.bar.canRedo).toBe(true);

    // Dispara Ctrl+Y no window para Redo
    await act(async () => {
      const event = new KeyboardEvent("keydown", {
        key: "y",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);
    });

    // Redo funcionou
    expect(c.stage.post.slides[0].headline).toBe("Edição por Teclado");

    // Testa também Ctrl+Shift+Z para Redo
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    });
    expect(c.stage.post.slides[0].headline).toBe("Headline Slide 0");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true, bubbles: true }));
    });
    expect(c.stage.post.slides[0].headline).toBe("Edição por Teclado");
  });

  it("RC-03 / RC-04 / BUG-CL-022: seleção pertence ao par (slideId, elementId) e é invalidada ao trocar/remover slide", async () => {
    await act(async () => root.render(<CanvasLabPage initialPost={createMultiSlidePost()} />));

    // 1. Duplica slide 0 criando slide 1
    await act(async () => c.film.onDuplicateSlide(0));
    const copiedSlideId = c.stage.post.slides[1].id;
    const selectedId = c.stage.post.slides[1].composition.elements[0].id;

    // Seleciona elemento no slide copiado
    await act(async () => c.stage.onSelectElement(selectedId));
    expect(c.stage.selectedElementId).toBe(selectedId);

    // 2. Undo da duplicação remove o slide 1 e volta para slide 0
    await act(async () => c.bar.onUndo());
    expect(c.stage.post.slides.some((s: any) => s.id === copiedSlideId)).toBe(false);
    // Mesmo que o slide 0 possua o mesmo ID de catálogo (grade-v-6), a seleção deve ser null!
    expect(c.stage.selectedElementId).toBeNull();

    // 3. Seleção válida no mesmo slide permanece durante edição e reordenação
    const slide0ElementId = c.stage.post.slides[0].composition.elements[0].id;
    await act(async () => c.stage.onSelectElement(slide0ElementId));
    expect(c.stage.selectedElementId).toBe(slide0ElementId);

    // Edição no mesmo slide preserva seleção
    await act(async () => c.side.onUpdatePost({ headline: "Slide 0 Editado" }));
    expect(c.stage.selectedElementId).toBe(slide0ElementId);

    // Reordenação do slide 0 preserva o slide ativo e a seleção
    await act(async () => c.film.onReorderSlide(0, 1));
    expect(c.stage.selectedElementId).toBe(slide0ElementId);

    // 4. Navegar para outro slide limpa a seleção
    await act(async () => c.film.onSelectSlide(2));
    expect(c.stage.selectedElementId).toBeNull();
  });
});
