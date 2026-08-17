// @vitest-environment happy-dom
/**
 * CR-001 — consumo vinculante do `ResolvedTextBlock` no renderer.
 *
 * Prova: snapshot v4 com `resolvedTypography` renderiza, em preview, edição
 * e export, exatamente a decisão medida — fontSize, lineHeight, fontWeight,
 * textTransform, linhas quebradas e caixa — sem multiplicadores tardios, sem
 * clamp e sem re-quebra pelo browser.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PostCardV2 from "./PostCardV2";
import type { PostVisualSnapshot } from "@shared/postspark";

// Sem rede no happy-dom: o carregamento dinâmico de fontes vira no-op.
vi.mock("@/lib/fonts", () => ({
  getActiveFontInfo: () => ({ name: "Inter", url: "" }),
  loadFont: () => undefined,
  buildGoogleFontUrl: () => "",
  parseFontNameFromUrl: () => null,
}));

const HEADLINE = "Cafe artesanal: o ponto exato da torra";
const BODY = "Torra media preserva acidez e doce do grao.";

function snapshotV4(): PostVisualSnapshot {
  return {
    id: "var-1",
    snapshotVersion: 4,
    headline: HEADLINE,
    body: BODY,
    caption: "Legenda",
    hashtags: ["#cafe"],
    callToAction: "Saiba mais",
    tone: "profissional",
    imagePrompt: "coffee",
    backgroundColor: "#1a1a2e",
    textColor: "#ffffff",
    accentColor: "#a855f7",
    layout: "centered",
    aspectRatio: "1:1",
    platform: "instagram",
    postMode: "static",
    template: "simple",
    copyAngle: { type: "beneficio", label: "Benefício", badge: "Cafe", stickerText: "Prove" },
    resolvedTypography: {
      engineVersion: "spec-001.v1",
      headline: {
        text: HEADLINE,
        fontFamily: "Inter",
        fontWeight: 700,
        fontSizePx: 36,
        lineHeight: 1.15,
        lines: ["Cafe artesanal: o ponto", "exato da torra"],
        box: { x: 30, y: 60, width: 302, height: 83 },
        textTransform: "none",
      },
      body: {
        text: BODY,
        fontFamily: "Inter",
        fontWeight: 400,
        fontSizePx: 18,
        lineHeight: 1.5,
        lines: ["Torra media preserva", "acidez e doce do grao."],
        box: { x: 30, y: 160, width: 302, height: 54 },
        textTransform: "none",
      },
    },
  } as PostVisualSnapshot;
}

describe("PostCardV2 — consumo vinculante de ResolvedTextBlock (CR-001)", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // O componente consulta Google Fonts para o fontFamily; happy-dom não tem
    // rede — stub determinístico para isolar o teste de estilo.
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("", { status: 200 })));
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    host.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function renderCard(mode: "preview" | "edit" | "export") {
    host.innerHTML = "";
    const root = createRoot(host);
    await act(async () => {
      root.render(<PostCardV2 mode={mode} snapshot={snapshotV4()} />);
    });
    const h2 = host.querySelector("h2") as HTMLHeadingElement | null;
    const p = host.querySelector("p") as HTMLParagraphElement | null;
    expect(h2).toBeTruthy();
    expect(p).toBeTruthy();
    return { h2: h2!, p: p! };
  }

  it("preview, edição e export aplicam a MESMA projeção resolvida (fontSize/lineHeight/fontWeight/transform/caixa/linhas)", async () => {
    const surfaces: Array<{ h2: HTMLHeadingElement; p: HTMLParagraphElement }> = [];
    for (const mode of ["preview", "edit", "export"] as const) {
      const { h2, p } = await renderCard(mode);
      surfaces.push({ h2, p });
    }

    for (const { h2, p } of surfaces) {
      expect(h2).toBeTruthy();
      expect(p).toBeTruthy();
      // fontSize exato da medição — NUNCA um `calc(...)` com multiplicador.
      expect(h2.style.fontSize).toBe("36px");
      expect(p.style.fontSize).toBe("18px");
      expect(h2.style.lineHeight).toBe("1.15");
      expect(p.style.lineHeight).toBe("1.5");
      expect(h2.style.fontWeight).toBe("700");
      expect(p.style.fontWeight).toBe("400");
      expect(h2.style.textTransform).toBe("none");
      // Linhas quebradas pela medição renderizadas verbatim (pre-line) — o
      // browser não pode re-quebrar.
      expect(h2.style.whiteSpace).toBe("pre-line");
      expect(p.style.whiteSpace).toBe("pre-line");
      expect(h2.textContent).toContain("Cafe artesanal: o ponto");
      expect(h2.textContent).toContain("exato da torra");
      // Caixa medida aplicada como constraint.
      expect(h2.style.maxWidth).toBe("302px");
      expect(p.style.maxWidth).toBe("302px");
      // Zero clamp no caminho resolvido.
      expect(h2.style.webkitLineClamp).toBeUndefined();
      expect(p.style.webkitLineClamp).toBeUndefined();
      expect(h2.style.display).not.toContain("-webkit-box");
    }
  });

  it("as três superfícies produzem a mesma geometria (fontSize/linhas/caixa idênticos entre si)", async () => {
    const captures: Array<{ fontSize: string; lineHeight: string; text: string | null; maxWidth: string }> = [];
    for (const mode of ["preview", "edit", "export"] as const) {
      const { h2 } = await renderCard(mode);
      captures.push({
        fontSize: h2.style.fontSize,
        lineHeight: h2.style.lineHeight,
        text: h2.textContent,
        maxWidth: h2.style.maxWidth,
      });
    }
    const [a, b, c] = captures;
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("snapshot v3 (legado, sem resolvedTypography) mantém o caminho legado com clamp", async () => {
    const legacy = { ...snapshotV4(), snapshotVersion: 3, resolvedTypography: undefined } as unknown as PostVisualSnapshot;
    host.innerHTML = "";
    const root = createRoot(host);
    await act(async () => {
      root.render(<PostCardV2 mode="preview" snapshot={legacy} />);
    });
    const h2 = host.querySelector("h2") as HTMLHeadingElement;
    // Legado: NÃO usa a medição (tamanho calc, não o resolvido), re-quebra
    // livremente (pre-wrap) e aplica o efeito de clamp (overflow oculto).
    // happy-dom descarta `-webkit-*`, então a prova do clamp é o overflow.
    expect(h2.style.fontSize).not.toBe("36px");
    expect(h2.style.whiteSpace).toBe("pre-wrap");
    expect(h2.style.overflow).toBe("hidden");
  });
});
