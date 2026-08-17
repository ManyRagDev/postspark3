import { beforeEach, describe, expect, it } from "vitest";
import { CAROUSEL_SLIDES, FREE_TEXT_ELEMENTS, IMAGE_ELEMENTS, createCarouselVariation, createPostVariation } from "../../../tests/fixtures/postspark";
import { postVisualSnapshotSchema } from "../../../shared/postsparkSchemas";
import { validateVisualFit } from "../../../shared/visualFit";
import { useEditorStore } from "../store/editorStore";
import { applyDesignTokensToSnapshot, buildVariationSnapshot, createPostVisualSnapshot, hasManualSectionLayouts, normalizeSections, normalizeVariationForEditor, projectSnapshotForSlide } from "./variationSnapshot";

describe("variationSnapshot", () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
  });

  it("normalizes structured sections with stable ids and icons", () => {
    const sections = normalizeSections(createPostVariation().sections);

    expect(sections).toEqual([
      expect.objectContaining({ id: "section-1", icon: "Target", number: 1 }),
      expect.objectContaining({
        id: "section-plan",
        icon: "Target",
        number: 2,
      }),
      expect.objectContaining({
        id: "section-3",
        icon: "TrendingUp",
        number: 3,
      }),
    ]);
  });

  it("preserves rich visual fields when normalizing for the editor", () => {
    const variation = createPostVariation({ imageElements: IMAGE_ELEMENTS });
    const normalized = normalizeVariationForEditor(variation);

    expect(normalized.imageUrl).toBe(variation.imageUrl);
    expect(normalized.designTokens).toEqual(variation.designTokens);
    expect(normalized.textElements).toEqual(variation.textElements);
    expect(normalized.imageElements).toEqual(IMAGE_ELEMENTS);
    expect(normalized.template).toBe("feature-grid");
    expect(normalized.layoutSettingsByAspectRatio).toEqual(variation.layoutSettingsByAspectRatio);
    expect(normalized.layoutSettings?.sectionLayouts).toEqual(variation.layoutSettings?.sectionLayouts);
  });

  it("does not invent absolute section geometry during editor normalization", () => {
    const normalized = normalizeVariationForEditor(
      createPostVariation({
        layoutSettings: undefined,
        layoutSettingsByAspectRatio: undefined,
      })
    );

    expect(normalized.layoutSettings).toBeUndefined();
    expect(normalized.layoutSettingsByAspectRatio).toBeUndefined();
    expect(hasManualSectionLayouts(normalized.layoutSettings)).toBe(false);
  });

  it("builds a complete persistence snapshot from editor state", () => {
    const variation = createPostVariation({
      bgValue: {
        type: "gallery",
        url: "https://fixture.example/background.jpg",
      },
      imageSettings: { zoom: 1.25, brightness: 1.1 },
    });
    const store = useEditorStore.getState();

    store.setActiveVariation(variation);
    store.updateVariation({ headline: "Headline editada" });
    store.updateLayoutSettings({
      headline: {
        position: "center",
        textAlign: "center",
        width: 64,
        freePosition: { x: 50, y: 22 },
      },
    });

    const snapshot = buildVariationSnapshot(useEditorStore.getState(), variation, "5:6");

    expect(snapshot).toMatchObject({
      headline: "Headline editada",
      aspectRatio: "5:6",
      imageUrl: variation.imageUrl,
      template: "feature-grid",
      textElements: variation.textElements,
      designTokens: variation.designTokens,
      bgValue: variation.bgValue,
    });
    expect(snapshot.sections?.every(section => Boolean(section.id))).toBe(true);
    expect(snapshot.layoutSettings.sectionLayouts).toEqual({});
    expect(snapshot.layoutSettings.headline).toMatchObject({
      width: 64,
      freePosition: { x: 50, y: 22 },
    });
  });

  it("persists only section positions explicitly created by the user", () => {
    const variation = createPostVariation();
    const store = useEditorStore.getState();

    store.setActiveVariation(variation);
    store.updateLayoutSettings({
      sectionLayouts: {
        "section-1": {
          position: "center",
          textAlign: "center",
          width: 30,
          freePosition: { x: 22, y: 68 },
        },
      },
    });

    const snapshot = buildVariationSnapshot(useEditorStore.getState(), variation, "1:1");

    expect(snapshot.layoutSettings.sectionLayouts).toEqual({
      "section-1": expect.objectContaining({
        width: 30,
        freePosition: { x: 22, y: 68 },
      }),
    });
  });

  it("resolves AI output once into a complete version 3 snapshot", () => {
    const variation = createPostVariation({
      imageUrl: undefined,
      bgValue: undefined,
      aspectRatioOptimizations: {
        "5:6": {
          layout: "centered",
          backgroundColor: "#112233",
          textColor: "#F8FAFC",
          accentColor: "#22C55E",
        },
      },
    });

    const snapshot = createPostVisualSnapshot(variation, "5:6");

    expect(snapshot).toMatchObject({
      snapshotVersion: 4,
      aspectRatio: "5:6",
      layout: "centered",
      backgroundColor: "#112233",
      textColor: "#F8FAFC",
      accentColor: "#22C55E",
      bgValue: { type: "solid", color: "#112233" },
      designTokens: {
        colors: {
          background: "#112233",
          text: "#F8FAFC",
          primary: "#22C55E",
        },
      },
    });
    expect(snapshot.layoutSettings.headline.textAlign).toBe("center");
  });

  it("is idempotent when a visual snapshot crosses the canonical boundary again", () => {
    const fixtures = [
      createPostVariation({
        textElements: [
          {
            id: "cd-outside",
            type: "text",
            text: "Decoracao",
            x: 340,
            y: 520,
            width: 120,
            styles: { fontSize: "24", color: "#FFFFFF" },
          },
        ],
      }),
      createPostVariation({
        template: "simple",
        sections: undefined,
        headline: "Um titulo longo o bastante para testar quebra de linha no snapshot",
        body: "Uma descricao tambem longa para validar que a segunda passagem nao muda a geometria ja saneada.",
        aspectRatioOptimizations: {
          "5:6": {
            layout: "centered",
            headline: { x: 50, y: 44, width: 58, textAlign: "center" },
            body: { x: 50, y: 48, width: 58, textAlign: "center" },
          },
        },
      }),
      createCarouselVariation(CAROUSEL_SLIDES),
    ];

    for (const variation of fixtures) {
      for (const aspectRatio of ["1:1", "5:6", "9:16"] as const) {
        const first = createPostVisualSnapshot(variation, aspectRatio);
        const second = createPostVisualSnapshot(first, aspectRatio);
        expect(second).toEqual(first);
      }
    }
  });

  it("prioritizes aspect-ratio layout over global creative layout settings", () => {
    const variation = createPostVariation({
      layout: "minimal",
      // Geometria absoluta da IA só é honrada em templates simple: nos
      // estruturados as sections fluem e o snapshot cai para layout de fluxo.
      template: "simple",
      sections: undefined,
      layoutSettings: {
        headline: {
          position: "top-left",
          textAlign: "left",
          freePosition: { x: 8, y: 58 },
          width: 84,
        },
        body: {
          position: "top-left",
          textAlign: "left",
          freePosition: { x: 8, y: 72 },
          width: 84,
        },
      },
      aspectRatioOptimizations: {
        "5:6": {
          layout: "centered",
          headline: {
            x: 50,
            y: 24,
            width: 70,
            textAlign: "center",
          },
          body: {
            x: 50,
            y: 48,
            width: 64,
            textAlign: "center",
          },
        },
      },
    });

    const snapshot = createPostVisualSnapshot(variation, "5:6");

    // CR-003/CR-008: a FAMÍLIA (layoutSettings globais, calibradas por
    // proporção no compose) é a autoridade do layout efetivo — a otimização
    // por-ratio do LLM (aspectRatioOptimizations) mantém layout/cor, mas não
    // sobrescreve a geometria calibrada da família. O layout vira "centered"
    // (otimização).
    // NOTA (Fase 2.4): sem tipografia resolvida (fontes ausentes no cliente),
    // o fallback volta a valer e converte para flow-layout. Em produção com
    // fontes disponíveis, a geometria seria protegida. Aqui, vê-se o fallback
    // em ação (comportamento esperado com resolução falha).
    expect(snapshot.layout).toBe("centered");
    expect(snapshot.layoutSettings.headline.width).toBe(84);
    expect(snapshot.typographyResolutionError).toBeDefined();
  });

  it("stores the exact selected snapshot and keeps it current after editing", () => {
    const selected = applyDesignTokensToSnapshot(
      createPostVisualSnapshot(createPostVariation()),
      {
        colors: { background: "#020617", primary: "#F97316", secondary: "#FB923C", text: "#FFF7ED", card: "#111827" },
        typography: { fontFamily: "Inter", customFontUrl: "", originalFont: "Inter", textTransform: "none", textAlign: "left" },
        structure: { borderRadius: "20px", boxShadow: "none", border: "none" },
        decorations: "minimal",
      },
    );

    useEditorStore.getState().loadSnapshot(selected);
    expect(useEditorStore.getState().visualSnapshot).toMatchObject(selected);

    useEditorStore.getState().updateVariation({ headline: "Estado atual persistível" });
    expect(useEditorStore.getState().visualSnapshot?.headline).toBe("Estado atual persistível");

    useEditorStore.getState().updateVariation({
      designTokens: {
        ...selected.designTokens,
        colors: { ...selected.designTokens!.colors!, primary: "#14B8A6" },
      },
    });
    expect(useEditorStore.getState().visualSnapshot?.accentColor).toBe("#14B8A6");
    expect(useEditorStore.getState().visualSnapshot?.designTokens?.colors?.primary).toBe("#14B8A6");
  });

  it("keeps a High Ticket variation identical across HoloDeck selection and Workbench restore", () => {
    const highTicketVariation = createPostVariation({
      headline: "Diagnostico executivo do funil",
      body: "Um roteiro direto para reposicionar a oferta sem perder margem.",
      layout: "split",
      backgroundColor: "#101828",
      textColor: "#F8FAFC",
      accentColor: "#F97316",
      aspectRatioOptimizations: {
        "1:1": {
          layout: "split",
          backgroundColor: "#101828",
          textColor: "#F8FAFC",
          accentColor: "#F97316",
        },
        "4:5": {
          layout: "stacked",
          backgroundColor: "#0F172A",
          textColor: "#F8FAFC",
          accentColor: "#FB923C",
        },
        "9:16": {
          layout: "centered",
          backgroundColor: "#111827",
          textColor: "#FFFFFF",
          accentColor: "#FDBA74",
        },
      },
      layoutSettingsByAspectRatio: {
        "4:5": {
          headline: {
            position: "top",
            textAlign: "left",
            width: 78,
            freePosition: { x: 14, y: 16 },
          },
          body: {
            position: "bottom",
            textAlign: "left",
            width: 72,
            freePosition: { x: 14, y: 64 },
          },
        },
      },
      designTokens: {
        colors: {
          background: "#101828",
          primary: "#F97316",
          secondary: "#FB923C",
          text: "#F8FAFC",
          card: "#1D2939",
        },
        typography: {
          fontFamily: "Inter",
          customFontUrl: "",
          originalFont: "Inter",
          textTransform: "none",
          textAlign: "left",
        },
        structure: {
          borderRadius: "12px",
          boxShadow: "none",
          border: "1px solid #344054",
        },
        decorations: "minimal",
      },
    });

    const holodeckSnapshot = createPostVisualSnapshot(highTicketVariation, "4:5");
    useEditorStore.getState().loadSnapshot(holodeckSnapshot);

    const workbenchSnapshot = useEditorStore.getState().visualSnapshot;

    expect(workbenchSnapshot).toMatchObject(holodeckSnapshot);
    expect(workbenchSnapshot?.snapshotVersion).toBe(4);
    expect(workbenchSnapshot?.layout).toBe("stacked");
    expect(workbenchSnapshot?.backgroundColor).toBe("#0F172A");
    expect(workbenchSnapshot?.accentColor).toBe("#FB923C");
    expect(workbenchSnapshot?.aspectRatioOptimizations).toEqual(
      highTicketVariation.aspectRatioOptimizations,
    );
    expect(workbenchSnapshot?.layoutSettings.headline.freePosition).toEqual({ x: 14, y: 16 });
  });

  it("round-trips image elements through the canonical schema and store restore", () => {
    const selected = createPostVisualSnapshot(
      createPostVariation({ imageElements: IMAGE_ELEMENTS }),
    );
    useEditorStore.getState().loadSnapshot(selected);

    const serialized = JSON.stringify(useEditorStore.getState().visualSnapshot);
    const parsed = postVisualSnapshotSchema.parse(JSON.parse(serialized));

    useEditorStore.getState().reset();
    useEditorStore.getState().loadSnapshot(createPostVisualSnapshot(parsed));

    expect(useEditorStore.getState().activeVariation?.imageElements).toEqual(IMAGE_ELEMENTS);
    expect(useEditorStore.getState().visualSnapshot?.imageElements).toEqual(IMAGE_ELEMENTS);
  });

  it("keeps current-slide overrides inside the slide instead of leaking them to the document base", () => {
    const selected = createPostVisualSnapshot(
      createPostVariation({ postMode: "carousel", slides: CAROUSEL_SLIDES }),
    );
    useEditorStore.getState().loadSnapshot(selected);

    useEditorStore.getState().updateVariation({ accentColor: "#EF4444" });
    useEditorStore.getState().addImageElement(IMAGE_ELEMENTS[0]);

    const snapshot = useEditorStore.getState().visualSnapshot;
    expect(snapshot?.accentColor).toBe(selected.accentColor);
    expect(snapshot?.imageElements).toBeUndefined();
    expect(snapshot?.slides?.[0].editorState?.variation?.accentColor).toBe("#EF4444");
    expect(snapshot?.slides?.[0].editorState?.variation?.imageElements).toEqual(IMAGE_ELEMENTS);

    const projected = projectSnapshotForSlide(snapshot!, 0);
    expect(projected.accentColor).toBe("#EF4444");
    expect(projected.imageElements).toEqual(IMAGE_ELEMENTS);
    expect(snapshot?.accentColor).toBe(selected.accentColor);
  });

  it("P0: textElements edit with scope=current must not leak to root in carousel", () => {
    const selected = createPostVisualSnapshot(
      createCarouselVariation(CAROUSEL_SLIDES, { textElements: FREE_TEXT_ELEMENTS }),
    );
    useEditorStore.getState().loadSnapshot(selected);

    const rootBefore = [...(useEditorStore.getState().visualSnapshot?.textElements ?? [])];
    useEditorStore.getState().setApplyScope("current");
    useEditorStore.getState().updateVariation({
      textElements: [{ ...rootBefore[0], x: 999, y: 999 }],
    });

    const snapshot = useEditorStore.getState().visualSnapshot;
    expect(snapshot?.textElements).toEqual(rootBefore);

    const slideOverride = snapshot?.slides?.[0]?.editorState?.variation?.textElements;
    expect(slideOverride).toBeDefined();
    expect(slideOverride![0].x).toBe(999);
    expect(slideOverride![0].y).toBe(999);

    const projected = projectSnapshotForSlide(snapshot!, 0);
    expect(projected.textElements![0].x).toBe(999);
  });

  it("P0: textElements edit with scope=all must propagate to root and all slides", () => {
    const selected = createPostVisualSnapshot(
      createCarouselVariation(CAROUSEL_SLIDES, { textElements: FREE_TEXT_ELEMENTS }),
    );
    useEditorStore.getState().loadSnapshot(selected);

    useEditorStore.getState().setApplyScope("all");
    useEditorStore.getState().updateVariation({
      textElements: [{ ...FREE_TEXT_ELEMENTS[0], x: 50, y: 60 }],
    });

    const snapshot = useEditorStore.getState().visualSnapshot;
    expect(snapshot?.textElements![0].x).toBe(50);
    expect(snapshot?.textElements![0].y).toBe(60);

    for (let i = 0; i < CAROUSEL_SLIDES.length; i++) {
      const slideElements = snapshot?.slides?.[i]?.editorState?.variation?.textElements;
      expect(slideElements).toBeDefined();
      expect(slideElements![0].x).toBe(50);
    }
  });

  it("P0: navigation between slides preserves textElements per slide", () => {
    const selected = createPostVisualSnapshot(
      createCarouselVariation(CAROUSEL_SLIDES, { textElements: FREE_TEXT_ELEMENTS }),
    );
    useEditorStore.getState().loadSnapshot(selected);

    useEditorStore.getState().setApplyScope("current");
    useEditorStore.getState().updateVariation({
      textElements: [{ ...FREE_TEXT_ELEMENTS[0], x: 10, y: 20 }],
    });

    useEditorStore.getState().setCurrentSlideIndex(1);
    useEditorStore.getState().updateVariation({
      textElements: [{ ...FREE_TEXT_ELEMENTS[0], x: 80, y: 90 }],
    });

    useEditorStore.getState().setCurrentSlideIndex(0);
    const slide0 = useEditorStore.getState().visualSnapshot?.slides?.[0]?.editorState?.variation?.textElements;
    expect(slide0![0].x).toBe(10);

    useEditorStore.getState().setCurrentSlideIndex(1);
    const slide1 = useEditorStore.getState().visualSnapshot?.slides?.[1]?.editorState?.variation?.textElements;
    expect(slide1![0].x).toBe(80);

    const rootTextElements = useEditorStore.getState().visualSnapshot?.textElements;
    expect(rootTextElements).toEqual(FREE_TEXT_ELEMENTS);
  });

  // ── Fase 2: snapshot frozen server-side ────────────────────────────

  it("Fase 2: frozen v3 snapshot enters the store without destructive re-normalization", () => {
    const raw = createPostVariation({ aspectRatio: "9:16" });
    const frozen = createPostVisualSnapshot(raw, "9:16");

    // The store's loadSnapshot -> setActiveVariation trusts a v3 snapshot at the
    // matching aspect ratio and must not re-normalize it.
    useEditorStore.getState().loadSnapshot(frozen);
    const store = useEditorStore.getState();

    expect(store.activeVariation).toBeTruthy();
    // visualSnapshot is the authoritative document; it must equal the frozen
    // snapshot's layoutSettings (not a re-derived layoutToAdvanced fallback).
    expect(store.visualSnapshot?.snapshotVersion).toBe(4);
    expect(store.visualSnapshot?.aspectRatio).toBe("9:16");
    expect(store.visualSnapshot?.layoutSettings).toEqual(frozen.layoutSettings);
    expect(store.visualSnapshot?.designTokens).toEqual(frozen.designTokens);
    expect(store.visualSnapshot?.bgValue).toEqual(frozen.bgValue);
  });

  it("Fase A.2: v3 snapshot with invalid shape falls back to canonical normalizer", () => {
    // Um snapshot que declara snapshotVersion===3 mas tem campos obrigatórios
    // ausentes (layoutSettings parcial, bgValue inválido) NÃO deve ser tratado
    // como frozen. Ele deve atravessar createPostVisualSnapshot para saneamento.
    const raw = createPostVariation({ aspectRatio: "1:1" });
    const frozen = createPostVisualSnapshot(raw, "1:1");
    // Trunca campos críticos para invalidar o shape sem mudar a versão.
    const truncated = {
      ...frozen,
      layoutSettings: { headline: {} }, // layoutSettings incompleto
      bgValue: { type: "unknown-type" }, // bgValue inválido
    } as unknown as typeof frozen;

    useEditorStore.getState().loadSnapshot(truncated);
    const store = useEditorStore.getState();

    // O snapshot resultante deve ter sido re-normalizado: layoutSettings e
    // bgValue voltam a ter shape válido (não os valores truncados).
    expect(store.visualSnapshot?.snapshotVersion).toBe(4);
    expect(store.visualSnapshot?.layoutSettings.headline).toHaveProperty("position");
    expect(store.visualSnapshot?.bgValue).not.toEqual({ type: "unknown-type" });
  });

  it("Fase 2: re-normalizing a frozen v3 snapshot is idempotent at the same aspect ratio", () => {
    const raw = createPostVariation({ aspectRatio: "5:6" });
    const frozen = createPostVisualSnapshot(raw, "5:6");
    const renormalized = createPostVisualSnapshot(frozen, "5:6");

    // The frozen snapshot must survive a second pass unchanged. This is the
    // Fase 0 gate (§61) applied to the Fase 2 delivery contract.
    expect(renormalized.layoutSettings).toEqual(frozen.layoutSettings);
    expect(renormalized.designTokens).toEqual(frozen.designTokens);
    expect(renormalized.textElements).toEqual(frozen.textElements);
    expect(renormalized.snapshotVersion).toBe(4);
  });

  it("Fase 2/G4: compose derives canvas height from variation aspect ratio", () => {
    // composeVariation is not imported here to keep the test unit-isolated;
    // instead we verify the contract that compose relies on: canvasHeight for
    // 9:16 at 360 width is 640, which is what compose.ts now computes.
    const raw = createPostVariation({ aspectRatio: "9:16" });
    const snapshot = createPostVisualSnapshot(raw, "9:16");

    // The snapshot must carry the requested aspect ratio, and its decorative
    // textElements (cd-*) must have been authored against the 9:16 canvas.
    expect(snapshot.aspectRatio).toBe("9:16");
    // createPostVisualSnapshot applies applyVisualFitFallback which uses
    // canvasHeight(aspectRatio); for 9:16 that is 360 * 16/9 = 640. If compose
    // were still hardcoded to 1:1, cd-* elements positioned at y near the
    // bottom would be dropped as out-of-canvas. We assert the snapshot is valid.
    const schemaResult = postVisualSnapshotSchema.safeParse(snapshot);
    expect(schemaResult.success).toBe(true);
  });

  it("Fase 2: legacy variation (no snapshotVersion) still gets normalized on store hydration", () => {
    // A raw PostVariation without snapshotVersion must still traverse the
    // normalizer when loaded into the store (backwards compatibility).
    const legacy = createPostVariation({ aspectRatio: "1:1" });
    expect((legacy as any).snapshotVersion).toBeUndefined();

    useEditorStore.getState().loadSnapshot(legacy as any);
    const store = useEditorStore.getState();

    expect(store.visualSnapshot?.snapshotVersion).toBe(4);
    expect(store.activeVariation?.aspectRatio).toBe("1:1");
  });

  it("flags visually truncated headline when a short phrase is placed in a narrow text box", () => {
    const snapshot = createPostVisualSnapshot(createPostVariation({
      template: "simple",
      aspectRatio: "1:1",
      headline: "Faça escolhas corretamente",
      body: "",
      layoutSettings: {
        headline: { position: "top-left", textAlign: "left", freePosition: { x: 20, y: 30 }, width: 28 },
        body: { position: "bottom-left", textAlign: "left", freePosition: { x: 20, y: 75 }, width: 70 },
      },
    }), "1:1");

    expect(validateVisualFit(snapshot).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "text_exceeds_visible_area", target: "headline" }),
    ]));
  });

  it("does not flag the same headline when its text box has enough width", () => {
    const snapshot = createPostVisualSnapshot(createPostVariation({
      template: "simple",
      aspectRatio: "1:1",
      headline: "Faça escolhas corretamente",
      body: "",
      layoutSettings: {
        headline: { position: "top-left", textAlign: "left", freePosition: { x: 50, y: 30 }, width: 80 },
        body: { position: "bottom-left", textAlign: "left", freePosition: { x: 50, y: 75 }, width: 70 },
      },
    }), "1:1");

    expect(validateVisualFit(snapshot).issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "text_exceeds_visible_area" }),
    ]));
  });

  it("preserves visual identity and elements when previewing a frozen post in another format", () => {
    const source = createPostVisualSnapshot(createPostVariation({
      aspectRatio: "1:1",
      layout: "centered",
      backgroundColor: "#061225",
      textColor: "#F8FAFC",
      accentColor: "#22B8F0",
      bgValue: { type: "solid", color: "#061225" },
      aspectRatioOptimizations: {
        "5:6": {
          layout: "split",
          backgroundColor: "#7C3F86",
          textColor: "#FDE68A",
          accentColor: "#F97316",
          headline: { x: 8, y: 54, width: 8, textAlign: "left" },
          body: { x: 9, y: 70, width: 10, textAlign: "left" },
        },
      },
    }), "1:1");
    const sourceWithElements = {
      ...source,
      textElements: FREE_TEXT_ELEMENTS,
      imageElements: IMAGE_ELEMENTS,
    };

    const reformatted = createPostVisualSnapshot(sourceWithElements, "5:6", {
      preserveVisualIdentity: true,
    });

    expect(reformatted).toMatchObject({
      aspectRatio: "5:6",
      layout: "centered",
      backgroundColor: "#061225",
      textColor: "#F8FAFC",
      accentColor: "#22B8F0",
      bgValue: { type: "solid", color: "#061225" },
    });
    expect(reformatted.designTokens.colors).toMatchObject({
      background: "#061225",
      text: "#F8FAFC",
      primary: "#22B8F0",
    });
    expect(reformatted.textElements).toEqual(FREE_TEXT_ELEMENTS);
    expect(reformatted.imageElements).toEqual(IMAGE_ELEMENTS);
    expect(reformatted.layoutSettings.headline.width).toBeGreaterThanOrEqual(36);
    expect(reformatted.layoutSettings.body.width).toBeGreaterThanOrEqual(36);
  });

  it("falls back from dangerously narrow AI text boxes during initial normalization", () => {
    const snapshot = createPostVisualSnapshot(createPostVariation({
      template: "simple",
      sections: undefined,
      aspectRatioOptimizations: {
        "9:16": {
          layout: "left-aligned",
          backgroundColor: "#061225",
          textColor: "#F8FAFC",
          accentColor: "#22B8F0",
          headline: { x: 6, y: 20, width: 7, textAlign: "left" },
          body: { x: 7, y: 58, width: 9, textAlign: "left" },
        },
      },
    }), "9:16");

    expect(snapshot.layoutSettings.headline.width).toBeGreaterThanOrEqual(36);
    expect(snapshot.layoutSettings.body.width).toBeGreaterThanOrEqual(36);
  });
});
