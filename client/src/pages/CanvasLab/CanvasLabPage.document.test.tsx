// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import CanvasLabPage from "./CanvasLabPage";
import { INITIAL_POST, type CanvasPostModel } from "./components/types";
import { composePost } from "./lib/guidedComposition";
import { resolveSlideAppearance } from "./lib/slideReplication";
import { resolveSlideExtraTexts } from "./lib/documentCommands";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "./lib/saveAdapter";
import { createArsenalFixtureComposition } from "./lib/arsenalFixture";
import { putArsenalComposition } from "./lib/arsenalComposition";

const c = vi.hoisted(() => ({
  stage: null as any,
  bar: null as any,
  chrome: null as any,
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

vi.mock("./components/CanvasEditorChrome", () => ({
  default: (p: any) => { c.chrome = p; return null; },
  CanvasAddPanel: () => null,
}));
vi.mock("./components/GuidedEditor", () => ({
  GuidedEditorDialog: (p: any) => { c.guide = p; return null; },
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

function basePost(): CanvasPostModel {
  const p = structuredClone(INITIAL_POST);
  p.slides = p.slides.slice(0, 2);
  p.extraTexts = undefined;
  p.extraImages = undefined;
  return p;
}

describe("CanvasLabPage Document Contracts (OS-001)", () => {
  it("AC-01 (BUG-CL-002): applies balanced proposal without root default stomping; supports undo", async () => {
    const post = basePost();
    // Post inicial configurado explicitamente com Playfair Display e headlineAlign: "left"
    post.fontFamily = "Playfair Display";
    post.headlineAlign = "left";
    post.slides[0].visualStyle = {
      fontFamily: "Playfair Display",
      headlineAlign: "left",
    };

    await act(async () => {
      root.render(<CanvasLabPage initialPost={post} />);
    });

    // Gera proposta balanceada (ex: Arial e alinhamento centralizado)
    const proposal = composePost(c.stage.post, "balanced").post!;
    const previewAppearance = resolveSlideAppearance(proposal, 0);
    expect(previewAppearance.fontFamily).toBe("Arial");
    expect(previewAppearance.headlineAlign).toBe("center");

    // Abre a reorganização e aplica a proposta na prévia
    await act(async () => { c.chrome.contents.appearance.props.children[0].props.onReorganize(); });
    await act(async () => {
      c.guide.onApply(proposal);
    });

    // O modelo do documento recebe Arial e center fielmente
    const appliedAppearance = resolveSlideAppearance(c.stage.post, 0);
    expect(appliedAppearance.fontFamily).toBe("Arial");
    expect(appliedAppearance.headlineAlign).toBe("center");

    // Desfazer (undo) restaura o estado anterior com Playfair Display e left
    expect(c.bar.canUndo).toBe(true);
    await act(async () => {
      c.bar.onUndo();
    });

    const undoneAppearance = resolveSlideAppearance(c.stage.post, 0);
    expect(undoneAppearance.fontFamily).toBe("Playfair Display");
    expect(undoneAppearance.headlineAlign).toBe("left");
  });

  it("AC-02 (BUG-CL-003): isolates extra elements to active slide; does not leak to root or sibling slides", async () => {
    const post = basePost();
    await act(async () => {
      root.render(<CanvasLabPage initialPost={post} />);
    });

    // Adiciona texto extra no slide 0
    await act(async () => {
      c.chrome.contents.add.props.children[0].props.onAddText();
    });

    // Slide 0 possui 1 texto extra
    expect(c.stage.post.slides[0].extraTexts).toHaveLength(1);
    // Raiz do documento NÃO possui extraTexts (evita vazamento)
    expect(c.stage.post.extraTexts).toBeUndefined();

    // Navega para o slide 1
    await act(async () => {
      c.film.onSelectSlide(1);
    });

    // Slide 1 não enxerga o texto extra do slide 0
    expect(c.stage.post.slides[1].extraTexts).toBeUndefined();
    expect(resolveSlideExtraTexts(c.stage.post, 1)).toEqual([]);

    // Persistência via saveAdapter e reabertura preservam isolamento
    const savePayload = canvasModelToSavePayload(c.stage.post, {
      inputType: "text",
      inputContent: "test",
    });
    const reopened = savedPostToCanvasModel({
      id: 10,
      canvas_model: savePayload.canvasModel,
    });

    expect(reopened.slides[0].extraTexts).toHaveLength(1);
    expect(reopened.slides[1].extraTexts).toBeUndefined();
    expect(reopened.extraTexts).toBeUndefined();
  });

  it("AC-03 (BUG-CL-003 legado): resolves and materializes inherited extras on modification without altering other slides", async () => {
    // Cria documento com formato legado: extras na raiz, slides sem array local
    const legacyPost = basePost();
    legacyPost.extraTexts = [
      { id: "tx-leg-1", text: "Legado Um" },
      { id: "tx-leg-2", text: "Legado Dois" },
    ];
    legacyPost.slides[0].extraTexts = undefined;
    legacyPost.slides[1].extraTexts = undefined;

    await act(async () => {
      root.render(<CanvasLabPage initialPost={legacyPost} />);
    });

    // No slide 0, removemos tx-leg-1
    await act(async () => {
      c.chrome.contents.layers.props.onAction({ slideId: c.stage.post.slides[0].id, elementId: "tx-leg-1" }, "remove", {});
    });

    // Slide 0 agora materializou apenas [tx-leg-2]
    expect(c.stage.post.slides[0].extraTexts).toHaveLength(1);
    expect(c.stage.post.slides[0].extraTexts[0].id).toBe("tx-leg-2");

    // Raiz permanece com os 2 para não quebrar compatibilidade
    expect(c.stage.post.extraTexts).toHaveLength(2);

    // Navega para o slide 1
    await act(async () => {
      c.film.onSelectSlide(1);
    });

    // Slide 1 ainda resolve os 2 textos herdados normalmente
    expect(c.stage.post.slides[1].extraTexts).toBeUndefined();
    expect(resolveSlideExtraTexts(c.stage.post, 1)).toHaveLength(2);

    // Volta ao slide 0 e remove o segundo texto (ficando vazio)
    await act(async () => {
      c.film.onSelectSlide(0);
    });
    await act(async () => {
      c.chrome.contents.layers.props.onAction({ slideId: c.stage.post.slides[0].id, elementId: "tx-leg-2" }, "remove", {});
    });

    // Slide 0 deve ser [] (não undefined), impedindo que os extras da raiz resurjam
    expect(c.stage.post.slides[0].extraTexts).toEqual([]);
    expect(resolveSlideExtraTexts(c.stage.post, 0)).toEqual([]);
  });

  it("AC-04 (BUG-CL-008): preserves global caption and hashtags across secondary slide visual mutations", async () => {
    let post = basePost();
    const comp0 = createArsenalFixtureComposition();
    const comp1 = createArsenalFixtureComposition();
    post.modelVersion = 2;
    post.slides[0].composition = comp0;
    post.slides[1].composition = comp1;
    post.caption = "Legenda global autoritativa";
    post.hashtags = ["#postspark", "#studio"];

    await act(async () => {
      root.render(<CanvasLabPage initialPost={post} />);
    });

    // Usuário altera a legenda explicitamente
    await act(async () => {
      c.chrome.contents.appearance.props.children[0].props.onUpdatePost({
        caption: "Legenda atualizada pelo usuário",
        hashtags: ["#novidade"],
      });
    });

    expect(c.stage.post.caption).toBe("Legenda atualizada pelo usuário");
    expect(c.stage.post.hashtags).toEqual(["#novidade"]);

    // Navega para o slide 1
    await act(async () => {
      c.film.onSelectSlide(1);
    });

    // Realiza uma mutação visual no slide 1 via composition update
    await act(async () => {
      c.stage.onUpdateComposition(comp1);
    });

    // A legenda e hashtags globais NÃO devem ser revertidas pelo conteúdo em comp1.content
    expect(c.stage.post.caption).toBe("Legenda atualizada pelo usuário");
    expect(c.stage.post.hashtags).toEqual(["#novidade"]);

    // E uma edição explícita de texto no slide também preserva a legenda
    await act(async () => {
      c.stage.onUpdateText("headline", "Headline alterada no slide 1");
    });

    expect(c.stage.post.caption).toBe("Legenda atualizada pelo usuário");
    expect(c.stage.post.hashtags).toEqual(["#novidade"]);
    expect(c.stage.post.slides[1].headline).toBe("Headline alterada no slide 1");
  });

  it("AC-05 (P07): opening and closing a tool preserves document identity without spurious edits", async () => {
    const post = basePost();
    post.caption = "Legenda intocada";

    await act(async () => {
      root.render(<CanvasLabPage initialPost={post} />);
    });

    const initialDoc = c.stage.post;
    expect(c.bar.canUndo).toBe(false);

    // Abre a ferramenta Marca
    await act(async () => {
      c.chrome.onToolChange("brand");
    });

    // Fecha a ferramenta
    await act(async () => {
      c.chrome.onToolChange(null);
    });

    // O documento não foi clonado nem sofreu mutações
    expect(c.stage.post).toBe(initialDoc);
    // Não criou entradas fantasmas no histórico
    expect(c.bar.canUndo).toBe(false);
  });

  it("BUG-CL-008 (RV-05): explicit clearing of caption on native cover synchronizes to secondary composition slide and survives reopen", async () => {
    const post = basePost();
    post.slides[1].composition = createArsenalFixtureComposition();
    post.caption = "CLEARED BY USER";
    post.currentSlideIndex = 0;

    await act(async () => {
      root.render(<CanvasLabPage initialPost={post} />);
    });

    // Usuário apaga a legenda explicitamente no slide nativo
    await act(async () => {
      c.chrome.contents.caption.props.onChange("");
    });
    expect(c.stage.post.caption).toBe("");

    // Navega para o slide 1 com composição
    await act(async () => {
      c.film.onSelectSlide(1);
    });

    // A composição secundária deve ter sincronizado a legenda vazia
    expect(c.stage.post.slides[1].composition?.content.caption).toBe("");

    // Serialização e reabertura preservam a legenda vazia
    const payload = canvasModelToSavePayload(c.stage.post, { inputType: "text", inputContent: "audit" });
    const reopened = savedPostToCanvasModel({ id: 10, canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)) });
    expect(reopened.caption).toBe("");
  });

  it("BUG-CL-018 (RV-06): explicit setting of INITIAL_POST.caption on native cover survives secondary composition visual mutation", async () => {
    const post = basePost();
    const comp1 = createArsenalFixtureComposition();
    post.slides[1].composition = comp1;
    post.caption = "EARLIER USER CAPTION";
    post.currentSlideIndex = 0;

    await act(async () => {
      root.render(<CanvasLabPage initialPost={post} />);
    });

    // Usuário define explicitamente a legenda como INITIAL_POST.caption
    await act(async () => {
      c.chrome.contents.caption.props.onChange(INITIAL_POST.caption);
    });
    expect(c.stage.post.caption).toBe(INITIAL_POST.caption);

    // Navega para o slide 1
    await act(async () => {
      c.film.onSelectSlide(1);
    });

    // Mutação visual no slide 1 via composition update
    await act(async () => {
      c.stage.onUpdateComposition(comp1);
    });

    // A legenda explicitamente definida NÃO deve ser substituída pela legenda da composição
    expect(c.stage.post.caption).toBe(INITIAL_POST.caption);
  });

  it("BUG-CL-019 / BUG-CL-020: updating composition projects cover subtext and initializes root hashtags", async () => {
    const post = basePost();
    const comp0 = createArsenalFixtureComposition();
    comp0.content = {
      schemaVersion: 3 as const,
      blocks: [{ id: "h", type: "text" as const, role: "headline" as const, text: "Título sem apoio" }],
      caption: "",
      hashtags: ["#novatag"],
    };
    post.slides[0].composition = comp0;
    post.subtext = "Texto demonstrativo antigo";
    post.hashtags = undefined;
    post.currentSlideIndex = 0;

    await act(async () => {
      root.render(<CanvasLabPage initialPost={post} />);
    });

    // Atualiza a composição na capa
    await act(async () => {
      c.stage.onUpdateComposition(comp0);
    });

    // Subtext da raiz projeta o subtext da capa (vazio, e não o texto demonstrativo antigo)
    expect(c.stage.post.subtext).toBe("");
    expect(c.stage.post.slides[0].subtext).toBe("");

    // Hashtags da raiz foram inicializadas a partir da composição
    expect(c.stage.post.hashtags).toEqual(["#novatag"]);
  });
});
