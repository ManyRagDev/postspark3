// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_POST } from "@/pages/CanvasLab/components/types";
import StudioGalleryView from "./StudioGalleryView";
import StudioMobileFlashcards from "./StudioMobileFlashcards";
vi.mock("./StudioDirectionFeedback", () => ({ default: () => null }));
vi.mock("@/components/UserTopMenu", () => ({ default: () => null }));
vi.mock("@/pages/CanvasLab/components/CanvasPostStage", () => ({
  CanvasPostStage: ({ post }: { post: typeof INITIAL_POST }) => <div data-testid="stage" data-post={JSON.stringify(post)}>Arte</div>,
}));
vi.mock("@/pages/CanvasLab/components/PostDownloadDialog", () => ({
  default: ({ post }: { post: typeof INITIAL_POST }) => (
    <div data-testid="download">{JSON.stringify(post)}</div>
  ),
}));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const button = (label: string) => Array.from(host.querySelectorAll("button")).find(b => b.textContent?.includes(label))!;
describe("gallery fidelity", () => {
  it("keeps images and selected ratio identical for personalization and download", () => {
    const select = vi.fn();
    const post = {
      ...INITIAL_POST,
      bgImage: "root.png",
      slides: [{ ...INITIAL_POST.slides[0], bgImage: "slide.png" }],
    };
    act(() =>
      root.render(
        <StudioGalleryView
          variations={[post]}
          onSelectVariation={select}
          onBackToCreate={vi.fn()}
        />
      )
    );
    expect(button("5:6")).toBeUndefined();
    act(() => button("4:5").click());
    act(() => button("Personalizar Post").click());
    const selected = select.mock.calls[0][0];
    expect(selected.aspectRatio).toBe("4:5");
    expect(selected.bgImage).toBe("root.png");
    expect(selected.slides[0].bgImage).toBe("slide.png");
    act(() => button("Baixar").click());
    expect(
      JSON.parse(host.querySelector('[data-testid="download"]')!.textContent!)
    ).toEqual(selected);
  });

  it("waits with an empty gallery, then delivers the first complete carousel while other proposals are running", () => {
    const select = vi.fn();
    const back = vi.fn();
    const more = vi.fn();
    const render = (variations: (typeof INITIAL_POST)[]) => act(() => root.render(
      <StudioGalleryView variations={variations} initialAspectRatio="4:5" onSelectVariation={select} onBackToCreate={back} onGenerateMore={more} isGeneratingMore />
    ));
    render([]);
    expect(host.textContent).toContain("Preparando suas direções de arte");
    expect(host.querySelector('[data-testid="stage"]')).toBeNull();
    expect(button("Baixar")).toBeUndefined();
    expect(button("Personalizar Post")).toBeUndefined();
    act(() => button("Novo Tema").click());
    expect(back).toHaveBeenCalledOnce();
    const carousel = {
      ...structuredClone(INITIAL_POST),
      id: "first-ready-carousel",
      aspectRatio: "4:5" as const,
      slides: ["Capa", "Desenvolvimento", "Convite"].map((headline, index) => ({ ...structuredClone(INITIAL_POST.slides[0]), id: `slide-${index}`, headline })),
    };
    render([carousel]);
    expect(host.textContent).not.toContain("Preparando suas direções de arte");
    expect(host.querySelectorAll('[data-testid="stage"]')).toHaveLength(2);
    act(() => button("Personalizar Post").click());
    expect(select).toHaveBeenCalledWith(carousel);
    act(() => button("Baixar").click());
    expect(JSON.parse(host.querySelector('[data-testid="download"]')!.textContent!)).toEqual(carousel);
    expect(more).not.toHaveBeenCalled();
  });

  it("keeps an empty terminal gallery usable without suggesting a generation is still running", () => {
    act(() => root.render(<StudioGalleryView variations={[]} onSelectVariation={vi.fn()} onBackToCreate={vi.fn()} />));
    expect(host.textContent).toContain("Nenhuma direção de arte disponível");
    expect(host.textContent).not.toContain("Preparando suas direções de arte");
    expect(button("Novo Tema")).toBeTruthy();
  });

  it("handles empty mobile cards and resets the selection when the variations are replaced", () => {
    const select = vi.fn();
    const render = (variations: (typeof INITIAL_POST)[]) => act(() => root.render(
      <StudioMobileFlashcards variations={variations} aspectRatio="1:1" onAspectRatioChange={vi.fn()} onSelectVariation={select} onBackToCreate={vi.fn()} isGeneratingMore />
    ));
    render([]);
    expect(host.querySelector('[data-testid="stage"]')).toBeNull();
    const posts = ["a", "b", "c"].map(id => ({ ...structuredClone(INITIAL_POST), id }));
    render(posts);
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Próxima variação"]')!.click());
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Próxima variação"]')!.click());
    act(() => button("Personalizar Esta Variação").click());
    expect(select).toHaveBeenLastCalledWith(posts[2]);
    render([posts[0]]);
    expect(host.textContent).toContain("1 / 1");
    expect(host.querySelectorAll('[data-testid="stage"]')).toHaveLength(1);
    act(() => button("Personalizar Esta Variação").click());
    expect(select).toHaveBeenLastCalledWith(posts[0]);
    render([]);
    expect(host.querySelector('[data-testid="stage"]')).toBeNull();
    expect(host.textContent).not.toContain("1 / 0");
  });

  it("renders 3 skeleton cards with shimmer in empty state during generation", () => {
    act(() => {
      root.render(
        <StudioGalleryView
          variations={[]}
          onSelectVariation={vi.fn()}
          onBackToCreate={vi.fn()}
          isGeneratingMore={true}
        />
      );
    });

    expect(host.textContent).toContain("Preparando suas direções de arte");
    expect(host.textContent).toContain("Opção 01");
    expect(host.textContent).toContain("Opção 02");
    expect(host.textContent).toContain("Opção 03");
    expect(host.querySelectorAll(".skeleton-shimmer").length).toBeGreaterThanOrEqual(6);
  });

  it("renders staged reveal with 1 ready variation and 2 skeleton cards while generating", () => {
    const post = {
      ...structuredClone(INITIAL_POST),
      id: "var-1",
    };
    act(() => {
      root.render(
        <StudioGalleryView
          variations={[post]}
          onSelectVariation={vi.fn()}
          onBackToCreate={vi.fn()}
          isGeneratingMore={true}
          expectedCount={3}
        />
      );
    });

    // 1 arte pronta (2 stages: desktop + mobile)
    expect(host.querySelectorAll('[data-testid="stage"]')).toHaveLength(2);
    // Slots pendentes renderizam esqueleto: Opção 02 e Opção 03
    expect(host.textContent).toContain("Opção 02");
    expect(host.textContent).toContain("Opção 03");
    expect(host.querySelectorAll(".skeleton-shimmer").length).toBeGreaterThanOrEqual(4);
  });
});

