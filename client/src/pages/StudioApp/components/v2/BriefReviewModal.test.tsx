// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interpretRawBriefing } from "@shared/creationBrief";
import BriefReviewModal from "./BriefReviewModal";

describe("BriefReviewModal", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("reviews slide count without offering another format selector", () => {
    const onConfirmGenerate = vi.fn();
    const brief = interpretRawBriefing("Carrossel com 5 slides", {
      selectedFormat: "carousel",
    });

    act(() => {
      root?.render(
        <BriefReviewModal
          brief={brief}
          onUpdateBrief={vi.fn()}
          onConfirmGenerate={onConfirmGenerate}
          onBackToEditPrompt={vi.fn()}
          isLoading={false}
        />
      );
    });

    expect(container?.textContent).not.toContain("Post Único (1 slide)");
    expect(container?.textContent).not.toContain("Carrossel Multi-slide");
    expect(container?.textContent).toContain("Quantidade de slides do carrossel");

    const confirmButton = Array.from(container?.querySelectorAll("button") || [])
      .find(button => button.textContent?.includes("Confirmar & Gerar"));
    act(() => confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onConfirmGenerate).toHaveBeenCalledTimes(1);
  });
  it("shows the complete project voice separately from piece overrides", () => {
    const voice = "Uma voz longa, natural e próxima. ".repeat(60).trim();
    const brief = {...interpretRawBriefing("Carrossel sobre ofertas", {selectedFormat:"carousel"}), projectDossier:`## POSTURA E TOM DE VOZ\n${voice}\n## PÚBLICO-ALVO\nQuem compara preços\n## CHAMADA PARA AÇÃO (CTA PADRÃO)\nConheça o acompanhamento`, tone:"Didático"};
    act(() => root?.render(<BriefReviewModal brief={brief} onUpdateBrief={vi.fn()} onConfirmGenerate={vi.fn()} onBackToEditPrompt={vi.fn()} isLoading={false} />));
    expect(container?.querySelector('[aria-label="Padrões do projeto"]')?.textContent).toContain(voice);
    expect(container?.textContent).toContain("Quem compara preços");
    expect(container?.textContent).not.toContain("Brand Kit ativo");
    const advanced = Array.from(container!.querySelectorAll("button")).find(b => b.textContent?.includes("Ajustes desta peça"))!;
    act(() => advanced.click());
    expect(Array.from(container!.querySelectorAll("input")).some(i => i.value === "Didático")).toBe(true);
  });
});
