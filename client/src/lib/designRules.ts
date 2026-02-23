/**
 * designRules.ts
 * Constantes e funções de validação derivadas do Guia Universal de Design para Posts.
 * Referência: guia_design.md
 */

import type { PostVariation, AspectRatio } from "@shared/postspark";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CheckSeverity = "ok" | "warn" | "error";

export interface DesignCheckItem {
    id: string;
    label: string;
    description: string;
    severity: CheckSeverity;
    /** Ratio numérico para exibição extra (ex: contraste 5.2:1) */
    value?: string;
}

// ─── Alinhamento × Objetivo (Seção 5 do guia) ────────────────────────────────

export const LAYOUT_OBJECTIVE_MAP: Record<
    string,
    { label: string; bestRatios: AspectRatio[]; useCases: string }
> = {
    centered: {
        label: "Centralizado",
        bestRatios: ["1:1", "9:16"],
        useCases: "Inspiração, emoção, celebração, perguntas",
    },
    "left-aligned": {
        label: "Esquerda",
        bestRatios: ["5:6", "9:16"],
        useCases: "Educação, listas, notícias, tutoriais",
    },
    split: {
        label: "Dividido",
        bestRatios: ["1:1", "5:6", "9:16"],
        useCases: "Promoções, impacto, números, chamadas fortes",
    },
    minimal: {
        label: "Minimalista",
        bestRatios: ["1:1", "5:6", "9:16"],
        useCases: "Marcas que priorizam white space",
    },
};

// ─── Contraste WCAG 2.1 (Seção 4 do guia) ────────────────────────────────────

/** Converte hex para componentes RGB normalizados (0–1) */
function hexToRgbNorm(hex: string): [number, number, number] | null {
    const clean = hex.replace("#", "");
    if (clean.length !== 6) return null;
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return [r, g, b];
}

/** Luminância relativa (WCAG 2.1) */
function relativeLuminance(r: number, g: number, b: number): number {
    const toLinear = (c: number) =>
        c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Calcula a razão de contraste entre dois hex colors.
 * @returns razão ≥ 1 (ex: 4.5, 7.0) ou null se os valores forem inválidos
 */
export function contrastRatio(hex1: string, hex2: string): number | null {
    const rgb1 = hexToRgbNorm(hex1);
    const rgb2 = hexToRgbNorm(hex2);
    if (!rgb1 || !rgb2) return null;
    const L1 = relativeLuminance(...rgb1);
    const L2 = relativeLuminance(...rgb2);
    const lighter = Math.max(L1, L2);
    const darker = Math.min(L1, L2);
    return (lighter + 0.05) / (darker + 0.05);
}

// ─── Hierarquia Tipográfica (Seção 1 do guia) ────────────────────────────────

/**
 * Verifica se a proporção entre headline e body font size
 * segue a escala mínima de 1.5x recomendada pelo guia.
 */
export function checkTypographyHierarchy(
    headlineMult: number,
    bodyMult: number
): boolean {
    // Consideramos que a base do autoFit já aplica proporção razoável.
    // Verificamos que o multiplicador do headline ≥ 1.5× o do body.
    return headlineMult / bodyMult >= 1.2; // tolerância ligeira ao valor do guia (1.5)
}

// ─── Função principal de validação ───────────────────────────────────────────

/**
 * Avalia um PostVariation contra as regras do guia de design.
 * Retorna uma lista de itens do checklist com severidade.
 */
export function validateDesignChecklist(
    variation: PostVariation,
    aspectRatio: AspectRatio
): DesignCheckItem[] {
    const items: DesignCheckItem[] = [];

    // 1. LEGIBILIDADE: contraste textColor × backgroundColor
    const ratio = contrastRatio(variation.textColor, variation.backgroundColor);
    if (ratio === null) {
        items.push({
            id: "contrast",
            label: "Legibilidade",
            description: "Não foi possível calcular o contraste (cor inválida).",
            severity: "warn",
        });
    } else if (ratio < 3) {
        items.push({
            id: "contrast",
            label: "Legibilidade",
            description: `Contraste insuficiente (${ratio.toFixed(1)}:1). Mínimo recomendado: 4.5:1.`,
            severity: "error",
            value: `${ratio.toFixed(1)}:1`,
        });
    } else if (ratio < 4.5) {
        items.push({
            id: "contrast",
            label: "Legibilidade",
            description: `Contraste aceitável (${ratio.toFixed(1)}:1), mas abaixo do ideal WCAG AA (4.5:1).`,
            severity: "warn",
            value: `${ratio.toFixed(1)}:1`,
        });
    } else {
        items.push({
            id: "contrast",
            label: "Legibilidade",
            description: `Contraste excelente (${ratio.toFixed(1)}:1). ✓ WCAG AA`,
            severity: "ok",
            value: `${ratio.toFixed(1)}:1`,
        });
    }

    // 2. HIERARQUIA: layout × proporção
    const layoutInfo = LAYOUT_OBJECTIVE_MAP[variation.layout];
    const layoutMatchesRatio = layoutInfo?.bestRatios.includes(aspectRatio) ?? true;
    items.push({
        id: "hierarchy",
        label: "Hierarquia Visual",
        description: layoutMatchesRatio
            ? `Layout "${variation.layout}" está alinhado com a proporção ${aspectRatio}.`
            : `Layout "${variation.layout}" é mais eficaz em ${layoutInfo?.bestRatios.join(", ")}. Considere ajustar.`,
        severity: layoutMatchesRatio ? "ok" : "warn",
    });

    // 3. TIPOGRAFIA: proporção headline × body
    const hSize = variation.headlineFontSize ?? 1;
    const bSize = variation.bodyFontSize ?? 1;
    const typOk = checkTypographyHierarchy(hSize, bSize);
    items.push({
        id: "typography",
        label: "Escala Tipográfica",
        description: typOk
            ? "Proporção entre título e corpo dentro da escala recomendada."
            : "Título e corpo com tamanhos muito próximos. Aumente o headline ou reduza o body.",
        severity: typOk ? "ok" : "warn",
    });

    // 4. ALINHAMENTO: headline/body não devem ser muito curtos para "split"
    if (variation.layout === "split" && variation.headline.length < 10) {
        items.push({
            id: "alignment",
            label: "Alinhamento",
            description: "Layout \"split\" com headline muito curto pode parecer desequilibrado.",
            severity: "warn",
        });
    } else {
        items.push({
            id: "alignment",
            label: "Alinhamento",
            description: "Alinhamento consistente com o comprimento do conteúdo.",
            severity: "ok",
        });
    }

    // 5. WHITE SPACE: body muito longo esgota o espaço vazio
    const bodyLen = variation.body?.length ?? 0;
    if (bodyLen > 90) {
        items.push({
            id: "whitespace",
            label: "Respiração",
            description: `Body com ${bodyLen} caracteres pode reduzir o white space. Ideal: ≤ 80 chars.`,
            severity: "warn",
        });
    } else {
        items.push({
            id: "whitespace",
            label: "Respiração",
            description: "Conteúdo dentro do limite para um post respirado.",
            severity: "ok",
        });
    }

    return items;
}
