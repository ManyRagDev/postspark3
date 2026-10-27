// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioCreateViewV2B from "./StudioCreateViewV2B";

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
    act(()=>container.querySelector<HTMLButtonElement>('button[aria-label="Criar direções de arte"]')!.click());
    expect(onSubmit).toHaveBeenCalledWith("https://example.com/","static",expect.objectContaining({platform:"instagram"}));
  });
  it("treats a URL followed by instructions as content and exposes all four platforms",()=>{
    const onSubmit=vi.fn();act(()=>root.render(<StudioCreateViewV2B onSubmit={onSubmit} isLoading={false} declaredFamilyId={null} onDeclareFamily={()=>{}} initialPrompt="https://example.com/ Compare os critérios"/>));
    expect(container.querySelectorAll('select[aria-label=Plataforma] option')).toHaveLength(4);
    act(()=>container.querySelector<HTMLButtonElement>('button[aria-label="Criar direções de arte"]')!.click());expect(onSubmit).toHaveBeenCalledOnce();expect(container.querySelector('[data-testid=brand-capture]')).toBeNull();
  });

});
