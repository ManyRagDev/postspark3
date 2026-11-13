// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioCreateViewV2B from "./StudioCreateViewV2B";

vi.mock("@/lib/trpc",()=>({trpc:{catalog:{acervo82Directory:{useQuery:()=>({data:{families:[]}})}}}}));
vi.mock("@/lib/fonts", () => ({ loadFontByName: vi.fn() }));
vi.mock("@/components/UserTopMenu", () => ({ default: () => null }));
vi.mock("@/components/SparkLogo", () => ({ default: () => null }));
vi.mock("./ProjectSelectorDropdown", () => ({ default: () => null }));
vi.mock("./BrandCaptureModal",()=>({default:({url}:any)=><div data-testid="brand-capture">{url}</div>}));
vi.mock("./ProjectCalibrationModal", () => ({ default: () => null }));
vi.mock("./shared", () => ({
  STUDIO: { bg: "#000", ink: "#fff", ink40: "#888", hairline: "#444", urlSignal: "#fff" },
  MONO: {},
  URL_REGEX: /^https?:\/\//,
  SPECIMEN_FONTS: [],
  FormatSelector: () => null,
  buildSpecimens: () => [],
  SpecimenCard: () => null,
  ProductionOverlay: () => null,
}));

describe("StudioCreateViewV2B draft control", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it.each(["auto", "claude", "deepseek", "gemini"])("submits the active %s model and keeps legacy GPT hidden", model => {
    const onSubmit = vi.fn();
    act(() => root.render(<StudioCreateViewV2B onSubmit={onSubmit} isLoading={false} declaredFamilyId={null} onDeclareFamily={() => {}} initialPrompt="Uma ideia" />));
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Modelo de geração"]')!;
    expect(select.querySelector('option[value="gpt"]')?.className).toContain("hidden");
    act(() => { select.value = model; select.dispatchEvent(new Event("change", { bubbles: true })); });
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Criar posts"]')!.click());
    expect(onSubmit).toHaveBeenCalledWith("Uma ideia", "static", expect.objectContaining({ generationModel: model }));
    expect(container.textContent).not.toContain("sub-segundo");
  });

  it("defaults to automatic and submits an explicit GPT choice with the briefing", () => {
    const onSubmit = vi.fn();
    const props = { onSubmit, isLoading: false, declaredFamilyId: null, onDeclareFamily: vi.fn(), initialPrompt: "Uma ideia" };
    act(() => root.render(<StudioCreateViewV2B {...props} />));
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Modelo de geração"]')!;
    expect(select.value).toBe("auto");
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Criar posts"]')!.click());
    expect(onSubmit).toHaveBeenCalledWith("Uma ideia", "static", expect.objectContaining({ generationModel: "auto" }));
    act(() => { select.value = "gpt"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Criar posts"]')!.click());
    expect(onSubmit).toHaveBeenCalledWith("Uma ideia", "static", expect.objectContaining({ generationModel: "gpt" }));
    act(() => root.render(<StudioCreateViewV2B {...props} initialGenerationModel="gpt" isLoading />));
    expect(select.disabled).toBe(true);
    expect(select.value).toBe("gpt");
  });

  it("offers discard only for a saved draft and clears the visible prompt", () => {
    const onDiscardDraft = vi.fn();
    const props = {
      onSubmit: vi.fn(),
      isLoading: false,
      declaredFamilyId: null,
      onDeclareFamily: vi.fn(),
      initialPrompt: "Ideia anterior",
      onDiscardDraft,
    };

    act(() => root.render(<StudioCreateViewV2B {...props} hasSavedDraft />));
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Tema ou ideia do post"]');
    expect(textarea?.value).toBe("Ideia anterior");
    expect(container.textContent).toContain("Rascunho salvo neste navegador");

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Apagar rascunho salvo e limpar o prompt"]')?.click());
    expect(onDiscardDraft).toHaveBeenCalledOnce();
    expect(textarea?.value).toBe("");

    act(() => root.render(<StudioCreateViewV2B {...props} hasSavedDraft={false} initialPrompt="" />));
    expect(container.querySelector('button[aria-label="Apagar rascunho salvo e limpar o prompt"]')).toBeNull();
  });
  it("routes a bare URL to free brand review and keeps page-as-content explicit",()=>{
    const onSubmit=vi.fn();act(()=>root.render(<StudioCreateViewV2B onSubmit={onSubmit} isLoading={false} declaredFamilyId={null} onDeclareFamily={()=>{}} initialPrompt="https://example.com/"/>));
    act(()=>container.querySelector<HTMLButtonElement>('button[aria-label="Capturar marca gratuitamente"]')!.click());
    expect(container.querySelector('[data-testid=brand-capture]')?.textContent).toBe("https://example.com/");expect(onSubmit).not.toHaveBeenCalled();
    act(()=>container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    act(()=>container.querySelector<HTMLButtonElement>('button[aria-label="Criar posts"]')!.click());
    expect(onSubmit).toHaveBeenCalledWith("https://example.com/","static",expect.objectContaining({platform:"instagram"}));
  });
  it("treats a URL followed by instructions as content and exposes all four platforms",()=>{
    const onSubmit=vi.fn();act(()=>root.render(<StudioCreateViewV2B onSubmit={onSubmit} isLoading={false} declaredFamilyId={null} onDeclareFamily={()=>{}} initialPrompt="https://example.com/ Compare os critérios"/>));
    expect(container.querySelectorAll('select[aria-label=Plataforma] option')).toHaveLength(4);
    act(()=>container.querySelector<HTMLButtonElement>('button[aria-label="Criar posts"]')!.click());expect(onSubmit).toHaveBeenCalledOnce();expect(container.querySelector('[data-testid=brand-capture]')).toBeNull();
  });

  it("defaults AI image generation to false and toggles to true on user click", () => {
    const onSubmit = vi.fn();
    act(() => root.render(<StudioCreateViewV2B onSubmit={onSubmit} isLoading={false} declaredFamilyId={null} onDeclareFamily={() => {}} initialPrompt="Uma ideia sem imagem" />));
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="Gerar imagens com IA"]')!;
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Criar posts"]')!.click());
    expect(onSubmit).toHaveBeenLastCalledWith("Uma ideia sem imagem", "static", expect.objectContaining({ allowAiImages: false }));
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Criar posts"]')!.click());
    expect(onSubmit).toHaveBeenLastCalledWith("Uma ideia sem imagem", "static", expect.objectContaining({ allowAiImages: true }));
  });

  it("detects script briefing, switches to carousel with slideCount and includes scriptMode preserve", () => {
    const onSubmit = vi.fn();
    const scriptPrompt = "## Carrossel\n\n**Slide 1:** Capa\n**Slide 2:** Problema\n**Slide 3:** Solução\n**Slide 4:** CTA";
    act(() => root.render(<StudioCreateViewV2B onSubmit={onSubmit} isLoading={false} declaredFamilyId={null} onDeclareFamily={() => {}} initialPrompt={scriptPrompt} />));

    expect(container.textContent).toContain("Roteiro de 4 slides detectado");
    expect(container.textContent).toContain("Preservar meu texto ✓");

    const submitBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Diagramar 4 slides com fidelidade"]')!;
    expect(submitBtn).not.toBeNull();
    act(() => submitBtn.click());

    expect(onSubmit).toHaveBeenCalledWith(
      scriptPrompt,
      "carousel",
      expect.objectContaining({
        slideCount: 4,
        scriptMode: "preserve",
        parsedSlides: expect.arrayContaining([
          expect.objectContaining({ slideIndex: 0 }),
          expect.objectContaining({ slideIndex: 3 }),
        ]),
      })
    );
  });

  it("allows user to toggle to reescrever com IA mode", () => {
    const onSubmit = vi.fn();
    const scriptPrompt = "## Carrossel\n\n**Slide 1:** Capa\n**Slide 2:** Problema\n**Slide 3:** Solução";
    act(() => root.render(<StudioCreateViewV2B onSubmit={onSubmit} isLoading={false} declaredFamilyId={null} onDeclareFamily={() => {}} initialPrompt={scriptPrompt} />));

    const rewriteBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent?.includes("Reescrever com IA"))!;
    expect(rewriteBtn).not.toBeNull();
    act(() => rewriteBtn.click());

    const submitBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Criar posts"]')!;
    expect(submitBtn).not.toBeNull();
    act(() => submitBtn.click());

    expect(onSubmit).toHaveBeenCalledWith(
      scriptPrompt,
      "carousel",
      expect.not.objectContaining({ scriptMode: "preserve" })
    );
  });
  it("keeps Enter available for mobile paragraphs and submits only with an explicit shortcut", () => {
    const width = Object.getOwnPropertyDescriptor(window, "innerWidth");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    const onSubmit = vi.fn();
    try {
      act(() => root.render(<StudioCreateViewV2B onSubmit={onSubmit} isLoading={false} declaredFamilyId={null} onDeclareFamily={() => {}} initialPrompt="Um roteiro" />));
      const field = container.querySelector("textarea")!;
      act(() => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
      expect(onSubmit).not.toHaveBeenCalled();
      act(() => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })));
      expect(onSubmit).toHaveBeenCalledOnce();
    } finally {
      if (width) Object.defineProperty(window, "innerWidth", width);
    }
  });

  describe("compact mobile creation", () => {
    let originalWidth: PropertyDescriptor | undefined;
    beforeEach(() => {
      originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    });
    afterEach(() => {
      if (originalWidth) Object.defineProperty(window, "innerWidth", originalWidth);
    });
    const setField = (field: HTMLTextAreaElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const script = "**Slide 1:** Capa\n**Slide 2:** Problema\n**Slide 3:** Solução\n**Slide 4:** CTA";

    it("keeps three lines while typing and expands only on request without losing the briefing", () => {
      act(() => root.render(<StudioCreateViewV2B onSubmit={vi.fn()} isLoading={false} declaredFamilyId={null} onDeclareFamily={vi.fn()} initialPrompt="Uma ideia" />));
      const field = container.querySelector("textarea")!;
      Object.defineProperty(field, "scrollHeight", { configurable: true, get: () => 384 });
      const briefing = "Minha ideia com todos os detalhes. ".repeat(30);
      act(() => setField(field, briefing));
      expect(field.style.height).toBe("72px");
      expect(field.rows).toBe(3);
      const expand = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("Expandir texto"))!;
      expect(expand.disabled).toBe(false);
      act(() => expand.click());
      expect(field.style.height).toBe("384px");
      expect(field.value).toBe(briefing);
      act(() => expand.click());
      expect(field.style.height).toBe("72px");
      expect(field.value).toBe(briefing);
    });

    it.each([
      ["Uma ideia", "text"],
      [script, "script"],
      ["https://example.com/", "url"],
    ])("uses the context of %s for all scoped mobile highlights", (prompt, tone) => {
      act(() => root.render(<StudioCreateViewV2B onSubmit={vi.fn()} isLoading={false} declaredFamilyId={null} onDeclareFamily={vi.fn()} initialPrompt={prompt} />));
      expect(container.querySelector("[data-mobile-tone]")?.getAttribute("data-mobile-tone")).toBe(tone);
      expect(container.querySelector(".studio-mobile-create")).not.toBeNull();
      expect(container.textContent).not.toContain("Diagramar");
    });

    it("submits once through the in-field arrow with the selected model, platform and script policy", () => {
      const onSubmit = vi.fn(), onRatio = vi.fn();
      const props = { onSubmit, isLoading: false, declaredFamilyId: null, onDeclareFamily: vi.fn(), initialPrompt: script, proposalAspectRatio: "4:5" as const, onProposalAspectRatioChange: onRatio };
      act(() => root.render(<StudioCreateViewV2B {...props} />));
      const select = (label: string, value: string) => {
        const field = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
        field.value = value; field.dispatchEvent(new Event("change", { bubbles: true }));
      };
      act(() => {
        select("Modelo de geração", "claude");
        select("Plataforma", "linkedin");
        select("Formato das propostas", "1:1");
      });
      act(() => container.querySelector<HTMLButtonElement>('[aria-label="Gerar imagens com IA"]')!.click());
      act(() => container.querySelector<HTMLButtonElement>('[aria-label="Gerar posts"]')!.click());
      expect(onRatio).toHaveBeenCalledWith("1:1");
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenLastCalledWith(script, "carousel", expect.objectContaining({ platform: "linkedin", generationModel: "claude", allowAiImages: true, scriptMode: "preserve", slideCount: 4 }));
      act(() => select("Tratamento do roteiro", "rewrite"));
      expect(container.querySelector('[data-mobile-tone="text"]')).not.toBeNull();
      act(() => container.querySelector<HTMLButtonElement>('[aria-label="Gerar posts"]')!.click());
      expect(onSubmit).toHaveBeenLastCalledWith(script, "carousel", expect.not.objectContaining({ scriptMode: "preserve" }));
      act(() => root.render(<StudioCreateViewV2B {...props} isLoading />));
      expect(container.querySelector<HTMLButtonElement>('[aria-label="Gerar posts"]')!.disabled).toBe(true);
    });

    it("preserves free URL capture and distinguishes explicitly using the page as content", () => {
      const onSubmit = vi.fn();
      act(() => root.render(<StudioCreateViewV2B onSubmit={onSubmit} isLoading={false} declaredFamilyId={null} onDeclareFamily={vi.fn()} initialPrompt="https://example.com/" />));
      act(() => container.querySelector<HTMLButtonElement>('[aria-label="Capturar marca gratuitamente"]')!.click());
      expect(onSubmit).not.toHaveBeenCalled();
      expect(container.querySelector('[data-testid="brand-capture"]')?.textContent).toBe("https://example.com/");
      act(() => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
      expect(container.querySelector('[data-mobile-tone="url"]')).not.toBeNull();
      act(() => container.querySelector<HTMLButtonElement>('[aria-label="Gerar posts"]')!.click());
      expect(onSubmit).toHaveBeenCalledWith("https://example.com/", "static", expect.objectContaining({ platform: "instagram" }));
    });

    it("keeps the arrow disabled for an empty briefing", () => {
      const onSubmit = vi.fn();
      act(() => root.render(<StudioCreateViewV2B onSubmit={onSubmit} isLoading={false} declaredFamilyId={null} onDeclareFamily={vi.fn()} />));
      const generate = container.querySelector<HTMLButtonElement>('[aria-label="Gerar posts"]')!;
      expect(generate.disabled).toBe(true);
      act(() => generate.click());
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

});
