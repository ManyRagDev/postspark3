// @vitest-environment happy-dom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CanvasMediaPanel } from "./CanvasMediaPanel";
import { INITIAL_POST, type CanvasPostModel } from "./types";
import { applyMediaOperation } from "../lib/mediaSlots";
import { applySeamlessPanoramaToPost, type SeamlessPanoramaMeta } from "../lib/seamlessCarousel";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "../lib/saveAdapter";

vi.mock("./MediaSlotPanel", () => ({ default: () => null }));
vi.mock("@/hooks/useMobile", () => ({ useIsMobile: () => true }));
const panorama: SeamlessPanoramaMeta = {
  id: "paper", name: "Papel contínuo", series: "Editorial", slideCount: 2,
  width: 2160, height: 1350, url: "/panorama.webp", previewUrl: "/panorama-preview.webp",
  defaultOverlayOpacity: 0, fallbackBgColor: "#ffffff", isDark: false,
};
const manifest = { categories: { paper: { label: "Papel", images: ["paper/linho.webp"] } }, seamlessCarousels: [panorama] };
const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(element => element.textContent?.includes(text))!;
afterEach(() => vi.unstubAllGlobals());

it("opens the requested category on each visit and applies library choices to the authoritative document", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => manifest }));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  let current: CanvasPostModel = { ...structuredClone(INITIAL_POST), currentSlideIndex: 1, slides: [0, 1].map(index => ({ ...INITIAL_POST.slides[0], id: `slide-${index}`, headline: `Título ${index}`, bgImage: "" })) };
  function Harness() {
    const [post, setPost] = useState(current);
    current = post;
    return <CanvasMediaPanel mode="background" post={post} onMediaUpdate={(target, operation) => {
      const next = applyMediaOperation(post, target, operation);
      if (next) setPost(next);
    }} onApplySeamlessPanorama={value => setPost(applySeamlessPanoramaToPost(post, value))} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => button("Fundo contínuo").click());
    expect(document.querySelector<HTMLSelectElement>('[aria-label="Categoria de fundos"]')?.value).toBe("seamless");
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Fechar biblioteca de fundos"]')!.click());
    await act(async () => button("Biblioteca de texturas").click());
    expect(document.querySelector<HTMLSelectElement>('[aria-label="Categoria de fundos"]')?.value).toBe("all");
    await act(async () => button("linho.webp").click());
    expect(current.slides[0].bgImage).toBe("");
    expect(current.slides[1].bgImage).toBe("/images/backgrounds/paper/linho.webp");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const texturePayload = canvasModelToSavePayload(current, { inputType: "text", inputContent: "Teste" });
    expect(savedPostToCanvasModel({ id: 1, canvas_model: texturePayload.canvasModel }).slides[1].bgImage).toBe(current.slides[1].bgImage);
    await act(async () => button("Fundo contínuo").click());
    expect(document.querySelector<HTMLSelectElement>('[aria-label="Categoria de fundos"]')?.value).toBe("seamless");
    await act(async () => button("Papel contínuo").click());
    expect(current.slides.every(slide => slide.bgImage === panorama.url)).toBe(true);
    const payload = canvasModelToSavePayload(current, { inputType: "text", inputContent: "Teste" });
    const reopened = savedPostToCanvasModel({ id: 1, canvas_model: payload.canvasModel });
    expect(reopened.slides.map(slide => slide.bgPlacement?.focalPoint?.x)).toEqual([0, 1]);
    expect(reopened.slides.every(slide => slide.bgImage === panorama.url)).toBe(true);
  } finally {
    await act(async () => root.unmount()); host.remove();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});
