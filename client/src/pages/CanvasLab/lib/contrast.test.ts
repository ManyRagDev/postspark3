import { describe, it, expect } from "vitest";
import {
  applyContrastGuard,
  getContrastWarnings,
  hasLegibleTextContrast,
  patchTouchesContrast,
  resolveGuardedPalette,
} from "./contrast";
import { applyFamilyPreset } from "./familyPreset";
import { INITIAL_POST, type CanvasPostModel } from "../components/types";

function makePost(overrides: Partial<CanvasPostModel> = {}): CanvasPostModel {
  return {
    ...INITIAL_POST,
    palette: { ...INITIAL_POST.palette },
    slides: INITIAL_POST.slides.map((s) => ({ ...s })),
    ...overrides,
  };
}

describe("Contrast Guard — regra de contraste automático (fundo escuro ⇄ texto claro)", () => {
  it("fundo escuro força texto claro quando nada é manual", () => {
    const post = makePost({
      palette: { background: "#0A0A0C", text: "#1A1A1A", accent: "#FF4D30" },
    });
    const guarded = applyContrastGuard(post);
    expect(guarded.palette.text).toBe("#FFFFFF");
    expect(guarded.palette.headlineColor).toBe("#FFFFFF");
    expect(guarded.palette.subtextColor).toBe("#FFFFFF");
  });

  it("fundo claro força texto escuro quando nada é manual", () => {
    const post = makePost({
      palette: { background: "#F8F9FA", text: "#FFFFFF", accent: "#2563EB" },
    });
    const guarded = applyContrastGuard(post);
    expect(guarded.palette.text).toBe("#121214");
  });

  it("override manual do título é preservado e sinalizado como baixo contraste", () => {
    const post = makePost({
      palette: { background: "#0A0A0C", text: "#FFFFFF", accent: "#FF4D30", headlineColor: "#1A1A1A" },
      manualHeadlineColor: true,
    });
    const guarded = applyContrastGuard(post);
    expect(guarded.palette.headlineColor).toBe("#1A1A1A");
    const warnings = getContrastWarnings(guarded);
    expect(warnings.headline).toBe(true);
    // corpo não manual continua corrigido
    expect(warnings.subtext).toBe(false);
  });

  it("hasLegibleTextContrast reflete a regra binária escura/claro", () => {
    expect(hasLegibleTextContrast("#0A0A0C", "#FFFFFF")).toBe(true);
    expect(hasLegibleTextContrast("#0A0A0C", "#111111")).toBe(false);
    expect(hasLegibleTextContrast("#F8F9FA", "#121214")).toBe(true);
  });

  it("patchTouchesContrast detecta mudanças de fundo, acento, família e limpeza de manual", () => {
    const base = makePost();
    expect(patchTouchesContrast(base, { palette: { ...base.palette, background: "#FFFFFF" } })).toBe(true);
    expect(patchTouchesContrast(base, { palette: { ...base.palette, accent: "#FFFFFF" } })).toBe(true);
    expect(patchTouchesContrast(base, { familyId: "brutal-split" })).toBe(true);
    expect(patchTouchesContrast(base, { manualHeadlineColor: false })).toBe(true);
    expect(patchTouchesContrast(base, { headlineSizeScale: 1.2 })).toBe(false);
    expect(patchTouchesContrast(base, { headline: "novo" })).toBe(false);
  });
});

describe("Contrast Guard — metades do brutal-split", () => {
  it("título resolve contra background (metade de cima) e corpo contra accent (metade de baixo)", () => {
    const post = makePost({
      familyId: "brutal-split",
      palette: { background: "#171717", text: "#171717", accent: "#21F1A8" },
    });
    const { palette, warnings } = resolveGuardedPalette(post);
    // título sobre metade escura → claro
    expect(palette.headlineColor).toBe("#FFFFFF");
    // corpo sobre acento claro → escuro legível (não pode ser o preto hardcoded legado)
    expect(palette.subtextColor).toBe("#171717");
    expect(warnings.headline).toBe(false);
    expect(warnings.subtext).toBe(false);
  });

  it("split com acento escuro resolve corpo claro", () => {
    const post = makePost({
      familyId: "brutal-split",
      palette: { background: "#171717", text: "#FFFFFF", accent: "#0A2E20" },
    });
    const { palette } = resolveGuardedPalette(post);
    expect(palette.subtextColor).toBe("#FFFFFF");
  });

  it("corpo manual do split é preservado e sinalizado quando ilegível", () => {
    const post = makePost({
      familyId: "brutal-split",
      palette: { background: "#171717", text: "#FFFFFF", accent: "#21F1A8", subtextColor: "#FFFFFF" },
      manualSubtextColor: true,
    });
    const guarded = applyContrastGuard(post);
    expect(guarded.palette.subtextColor).toBe("#FFFFFF");
    expect(getContrastWarnings(guarded).subtext).toBe(true);
  });
});

describe("applyFamilyPreset — estilos pré-definidos nunca alteram cores", () => {
  it("troca de família preserva background e accent e só re-resolve legibilidade", () => {
    const post = makePost({
      palette: { background: "#0D1117", text: "#FFFFFF", accent: "#FF5E00", surface: "#161B22" },
    });
    const adapted = applyFamilyPreset(post, "kinetic-type");

    expect(adapted.familyId).toBe("kinetic-type");
    expect(adapted.familyName).toBe("Tipografia Cinética");
    expect(adapted.fontFamily).toBe("Syne");
    // cores preservadas
    expect(adapted.palette.background).toBe("#0D1117");
    expect(adapted.palette.accent).toBe("#FF5E00");
    expect(adapted.palette.surface).toBe("#161B22");
    // texto legível mantido
    expect(adapted.palette.text).toBe("#FFFFFF");
  });

  it("surface vazia recebe o default da família, sem sobrescrever cores do usuário", () => {
    const post = makePost({
      palette: { background: "#123456", text: "#FFFFFF", accent: "#ABCDEF" },
    });
    const adapted = applyFamilyPreset(post, "glass-veil");
    expect(adapted.palette.surface).toBe("#151C2E");
    expect(adapted.palette.background).toBe("#123456");
    expect(adapted.palette.accent).toBe("#ABCDEF");
  });

  it("mudança de família para brutal-split re-resolve o corpo contra o acento atual", () => {
    const post = makePost({
      palette: { background: "#171717", text: "#FFFFFF", accent: "#FFD600" },
    });
    const adapted = applyFamilyPreset(post, "brutal-split");
    expect(adapted.familyId).toBe("brutal-split");
    expect(adapted.palette.subtextColor).toBe("#121214");
    expect(adapted.palette.background).toBe("#171717");
    expect(adapted.palette.accent).toBe("#FFD600");
  });
});
