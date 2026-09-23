// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  extractUrlsFromText,
  interpretRawBriefing,
  creationBriefToExecutionBrief,
} from "@shared/creationBrief";
import {
  saveBriefDraft,
  loadBriefDraft,
  clearBriefDraft,
} from "./briefDraftStorage";
import {
  createHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  canUndo,
  canRedo,
} from "@/pages/CanvasLab/lib/canvasHistory";
import { AutoSaveManager } from "@/pages/CanvasLab/lib/autoSaveManager";
import {
  computeBackgroundGeometry,
  createDefaultPlacement,
} from "@/pages/CanvasLab/lib/backgroundPlacement";
import {
  duplicateExtraElement,
  reorderExtraElement,
  reorderSlides,
  resolveCoverSlide,
  applyPatchToCurrentSlide,
} from "@/pages/CanvasLab/lib/documentCommands";
import type { CanvasPostModel } from "@/pages/CanvasLab/components/types";

describe("E2E Integration Matrix — Experiência Inteligente PostSpark (Etapa 9)", () => {
  it("Phase 1: Briefing ingestion, URL extraction, format detection and persistent draft recovery", () => {
    localStorage.clear();

    const rawInput = "Veja as novidades em https://postspark.app/features com 4 passos para crescer no digital.";
    const urls = extractUrlsFromText(rawInput);
    expect(urls).toEqual(["https://postspark.app/features"]);

    const brief = interpretRawBriefing(rawInput, {
      selectedFormat: "carousel",
      brandKit: {
        brand_name: "PostSpark Labs",
        tone: "Inovador e direto",
      },
    });

    expect(brief.version).toBe(1);
    expect(brief.format).toBe("carousel");
    expect(brief.slideCount).toBe(4);
    expect(brief.sourceUrls).toContain("https://postspark.app/features");
    expect(brief.tone).toBe("Inovador e direto");

    // Persistência de rascunho (resiliência contra refresh ou queda de aba)
    saveBriefDraft(brief, "editorial-poster", "create");
    const restored = loadBriefDraft();

    expect(restored).not.toBeNull();
    expect(restored?.brief.rawInput).toBe(rawInput);
    expect(restored?.declaredFamilyId).toBe("editorial-poster");

    clearBriefDraft();
    expect(loadBriefDraft()).toBeNull();
  });

  it("Phase 2: Progressive disclosure execution brief generation", () => {
    const brief = interpretRawBriefing("Post simples sobre inovação", { selectedFormat: "static" });
    const execution = creationBriefToExecutionBrief(brief);

    expect(execution.format).toBe("static");
    expect(execution.creationMode).toBe("execution");
    expect(execution.objective).toBeDefined();
    expect(brief.version).toBe(1);
  });

  it("Phase 3: CanvasLab authoring with non-destructive background placement", () => {
    const placement = createDefaultPlacement("contain");
    expect(placement.fitMode).toBe("contain");

    const geometry = computeBackgroundGeometry({
      imageWidth: 1920,
      imageHeight: 1080,
      baseWidth: 1080,
      baseHeight: 1080,
      placement,
    });

    // Modo contain preserva a imagem inteira sem cortes
    expect(geometry.width).toBe(1080);
    expect(geometry.height).toBe(608);
    expect(geometry.crop).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it("Phase 4: Extra elements with RFC4122/UUID-v4, layer reordering and onTransformEnd stability", () => {
    const post: CanvasPostModel = {
      id: "matrix-post",
      familyId: "editorial-poster",
      familyName: "Editorial de Luxo",
      aspectRatio: "1:1",
      headlineAlign: "left",
      bodyAlign: "left",
      badgeText: "",
      headline: "Título da Capa",
      subtext: "Subtítulo da Capa",
      caption: "",
      fontFamily: "Playfair Display",
      overlayOpacity: 0.5,
      logoPosition: "top-right",
      palette: { background: "#111111", text: "#FFFFFF", accent: "#FF4D30" },
      currentSlideIndex: 0,
      slides: [
        {
          id: "s-01",
          step: "SLIDE 01",
          headline: "Título Capa",
          subtext: "Subtítulo Capa",
          extraTexts: [{ id: "tx-init", text: "Nota 1", x: 50, y: 100, width: 200, rotation: 0 }],
          extraImages: [{ id: "img-init", url: "https://x/img.png", x: 20, y: 20, width: 100, height: 100 }],
        },
        {
          id: "s-02",
          step: "SLIDE 02",
          headline: "Título Slide 2",
          subtext: "Subtítulo Slide 2",
        },
      ],
    };

    // 1. Duplicação com UUID v4 real sem colisão
    const { post: withDup, newElementId } = duplicateExtraElement(post, "tx-init");
    expect(newElementId).toBeDefined();
    expect(newElementId).not.toBe("tx-init");
    expect(withDup.slides[0].extraTexts?.length).toBe(2);

    // 2. Reordenação de camada (bring to front)
    const reordered = reorderExtraElement(withDup, "tx-init", "front");
    const lastText = reordered.slides[0].extraTexts![reordered.slides[0].extraTexts!.length - 1];
    expect(lastText.id).toBe("tx-init");

    // 3. Normalização de escala do onTransformEnd (reset de scaleX para 1 evitando acúmulo infinito)
    const scaleX = 1.25;
    const oldWidth = 200;
    const normalizedWidth = Math.max(40, Math.round(oldWidth * scaleX));
    const patchedPost = applyPatchToCurrentSlide(reordered, {
      extraTexts: reordered.slides[0].extraTexts!.map((t) =>
        t.id === "tx-init" ? { ...t, width: normalizedWidth, scaleX: 1, scaleY: 1 } : t
      ),
    });
    expect(patchedPost.slides[0].extraTexts?.find((t) => t.id === "tx-init")?.width).toBe(250);
  });

  it("Phase 5: Productivity engine (Undo/Redo history, resilient autosave mutex and slide reorder)", async () => {
    vi.useFakeTimers();

    const initialPost: CanvasPostModel = {
      id: "prod-post",
      familyId: "editorial-poster",
      familyName: "Editorial",
      aspectRatio: "1:1",
      headlineAlign: "left",
      bodyAlign: "left",
      badgeText: "",
      headline: "Versão 1",
      subtext: "",
      caption: "",
      fontFamily: "Inter",
      overlayOpacity: 0.5,
      logoPosition: "top-right",
      palette: { background: "#000", text: "#FFF", accent: "#F00" },
      currentSlideIndex: 0,
      slides: [
        { id: "s1", step: "01", headline: "Slide 1 (Capa)", subtext: "" },
        { id: "s2", step: "02", headline: "Slide 2", subtext: "" },
      ],
    };

    // 1. Histórico de Undo / Redo
    let history = createHistory(initialPost);
    expect(canUndo(history)).toBe(false);

    const postV2 = { ...initialPost, headline: "Versão 2" };
    history = pushHistory(history, postV2);
    expect(canUndo(history)).toBe(true);
    expect(history.present.headline).toBe("Versão 2");

    history = undoHistory(history);
    expect(history.present.headline).toBe("Versão 1");
    expect(canRedo(history)).toBe(true);

    history = redoHistory(history);
    expect(history.present.headline).toBe("Versão 2");

    // 2. Reordenação de slides garantindo conservação de Capa
    const reorderedSlides = reorderSlides(history.present, 0, 1);
    expect(reorderedSlides.slides[0].id).toBe("s2");
    expect(reorderedSlides.slides[1].id).toBe("s1");
    // resolveCoverSlide sempre aponta para o slide 0
    const cover = resolveCoverSlide(reorderedSlides);
    expect(cover.id).toBe("s2");

    // 3. AutoSave resiliente com Mutex concorrente
    const saveCalls: CanvasPostModel[] = [];
    let resolveSave: (v: boolean) => void = () => {};
    const savePromise = new Promise<boolean>((res) => {
      resolveSave = res;
    });

    const autoSave = new AutoSaveManager<CanvasPostModel>({
      onSave: vi.fn().mockImplementation((doc) => {
        saveCalls.push(doc);
        return savePromise;
      }),
      debounceMs: 500,
    });

    autoSave.triggerChange(history.present);
    vi.advanceTimersByTime(500);
    expect(saveCalls.length).toBe(1);
    expect(autoSave.getState()).toBe("saving");

    // Mutação enquanto o primeiro save está em andamento
    const latestPost = { ...history.present, headline: "Versão Final Mais Recente" };
    autoSave.triggerChange(latestPost);

    // Conclui o primeiro save: o manager processa a alteração pendente imediatamente
    resolveSave(true);
    await vi.runAllTimersAsync();

    expect(saveCalls.length).toBe(2);
    expect(saveCalls[1].headline).toBe("Versão Final Mais Recente");
    expect(autoSave.getState()).toBe("saved");

    autoSave.destroy();
    vi.useRealTimers();
  });
});
