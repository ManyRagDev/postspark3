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
  it("navigates each desktop carousel independently and opens/downloads the displayed page without mutating slides", () => {
    const posts = ["first", "second"].map(id => ({ ...structuredClone(INITIAL_POST), id,
      slides: ["Capa", "Explicação", "Fechamento"].map((headline, index) => ({ ...structuredClone(INITIAL_POST.slides[0]), id: `${id}-${index}`, headline })) }));
    const baseline = structuredClone(posts);
    const select = vi.fn();
    act(() => root.render(<StudioGalleryView variations={posts} onSelectVariation={select} onBackToCreate={vi.fn()} />));
    const desktop = host.querySelector('.md\\:flex')!;
    const next = () => desktop.querySelectorAll<HTMLButtonElement>('[aria-label="Próxima página do carrossel"]')[0];
    act(() => next().click());
    act(() => next().click());
    expect(next().disabled).toBe(true);
    const stages = Array.from(desktop.querySelectorAll('[data-testid="stage"]')).map(el => JSON.parse(el.getAttribute('data-post')!));
    expect(stages.map(post => post.currentSlideIndex)).toEqual([2, 0]);
    expect(stages[0].slides).toEqual(posts[0].slides);
    act(() => button("Personalizar Post").click());
    expect(select.mock.calls[0][0].currentSlideIndex).toBe(2);
    act(() => Array.from(desktop.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent === "Baixar")!.click());
    expect(JSON.parse(host.querySelector('[data-testid="download"]')!.textContent!).currentSlideIndex).toBe(2);
    expect(posts).toEqual(baseline);
  });

  it("separates mobile page navigation from direction navigation and editing", () => {
    const posts = ["a", "b"].map(id => ({ ...structuredClone(INITIAL_POST), id,
      slides: [0, 1].map(index => ({ ...structuredClone(INITIAL_POST.slides[0]), id: `${id}-${index}` })) }));
    const select = vi.fn();
    act(() => root.render(<StudioMobileFlashcards variations={posts} aspectRatio="1:1" onAspectRatioChange={vi.fn()} onSelectVariation={select} onBackToCreate={vi.fn()} />));
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Próxima página do carrossel"]')!.click());
    expect(select).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Página 2 de 2");
    act(() => button("Personalizar Esta Variação").click());
    expect(select.mock.calls[0][0].id).toBe("a");
    expect(select.mock.calls[0][0].currentSlideIndex).toBe(1);
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Próxima variação"]')!.click());
    expect(host.textContent).toContain("Página 1 de 2");
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Variação anterior"]')!.click());
    expect(host.textContent).toContain("Página 2 de 2");
  });
  it("adopts the first asynchronous result format and preserves a later explicit format choice", () => {
    const select = vi.fn();
    const render = (variations: (typeof INITIAL_POST)[], initialAspectRatio: "1:1" | "4:5" | "9:16") => act(() => root.render(
      <StudioGalleryView variations={variations} initialAspectRatio={initialAspectRatio} onSelectVariation={select} onBackToCreate={vi.fn()} isGeneratingMore={!variations.length} />
    ));
    render([], "1:1");
    render([{ ...structuredClone(INITIAL_POST), aspectRatio: "4:5" }], "4:5");
    act(() => button("Personalizar Post").click());
    expect(select.mock.calls[0][0].aspectRatio).toBe("4:5");
    act(() => button("9:16").click());
    render([{ ...structuredClone(INITIAL_POST), aspectRatio: "1:1" }], "1:1");
    act(() => button("Personalizar Post").click());
    expect(select.mock.calls[1][0].aspectRatio).toBe("9:16");
  });

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
    expect(host.querySelectorAll('[role="progressbar"]')).toHaveLength(3);
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
  it("tracks pending slots by proposal identity when the second proposal finishes first", () => {
    const proposal = (proposalId: string, slot: number, status: "running" | "ready") => ({ proposalId, runId: "run", slot, status, revision: 1, contractVersion: 1, findings: [], diagnostics: [] }) as any;
    act(() => root.render(<StudioGalleryView
      variations={[{ ...structuredClone(INITIAL_POST), id: "ready-slot-1" }]}
      onSelectVariation={vi.fn()} onBackToCreate={vi.fn()} isGeneratingMore
      generationProposals={[proposal("a", 0, "running"), proposal("b", 1, "ready"), proposal("c", 2, "running")]}
      materializedProposalKeys={["b:1"]}
    />));
    expect(host.querySelector('[aria-label="Opção 01: Em andamento"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Opção 02: Pronta"]')).toBeNull();
    expect(host.querySelector('[aria-label="Opção 03: Em andamento"]')).toBeTruthy();
  });

  it("shows the next batch's independent slots even when the gallery already has three posts", () => {
    const proposals = [0, 1, 2].map(slot => ({ proposalId: `new-${slot}`, runId: "new-run", slot, status: "running", revision: 1, contractVersion: 1, findings: [], diagnostics: [] })) as any;
    act(() => root.render(<StudioGalleryView
      variations={["old-a", "old-b", "old-c"].map(id => ({ ...structuredClone(INITIAL_POST), id }))}
      onSelectVariation={vi.fn()} onBackToCreate={vi.fn()} isGeneratingMore
      generationProposals={proposals} materializedProposalKeys={[]}
    />));
    expect(host.querySelectorAll('[aria-label$=": Em andamento"]').length).toBe(3);
  });

  it("stops the failed local proposal's shimmer while keeping other slots active", () => {
    const proposals = [0, 1].map(slot => ({ proposalId: `p-${slot}`, runId: "run", slot, status: slot === 0 ? "ready" : "running", revision: 1, contractVersion: 1, findings: [], diagnostics: [] })) as any;
    act(() => root.render(<StudioGalleryView
      variations={[{ ...structuredClone(INITIAL_POST), id: "ready-third" }]}
      onSelectVariation={vi.fn()} onBackToCreate={vi.fn()} isGeneratingMore
      generationProposals={proposals} materializedProposalKeys={[]} materializationFailureKeys={["p-0:1"]}
    />));
    const failed = host.querySelector('[aria-label="Opção 01: Falha ao montar a proposta"]')!;
    expect(failed).toBeTruthy();
    expect(failed.querySelector('.skeleton-shimmer')).toBeNull();
    expect(failed.querySelector('[role="progressbar"]')).toBeNull();
    expect(host.querySelector('[aria-label="Opção 02: Em andamento"] .skeleton-shimmer')).toBeTruthy();
  });

});
