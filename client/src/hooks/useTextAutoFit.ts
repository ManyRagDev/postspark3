/**
 * useTextAutoFit — Ajusta automaticamente o texto para caber no aspect ratio
 *
 * Calibração de fontes baseada no tamanho real do card no canvas:
 *  - 1:1  ≈ 380px wide  → fonte base compacta
 *  - 5:6  ≈ 320px wide  → fonte base média
 *  - 9:16 ≈ 260px wide  → fonte proporcionalmente menor (card estreito e alto)
 */

import { useMemo } from "react";
import type { AspectRatio } from "@shared/postspark";

export interface TextAutoFitResult {
  headlineSize: string;
  bodySize: string;
  headlineLineClamp: number | undefined;
  bodyLineClamp: number | undefined;
  padding: string;
  maxHeadlineChars: number;
  maxBodyChars: number;
  shouldTruncateHeadline: boolean;
  shouldTruncateBody: boolean;
}

interface TextAutoFitOptions {
  headline: string;
  body: string;
  aspectRatio: AspectRatio;
  isCompact?: boolean;
}

export function useTextAutoFit({
  headline,
  body,
  aspectRatio,
  isCompact = false,
}: TextAutoFitOptions): TextAutoFitResult {
  return useMemo(() => {
    if (isCompact) {
      return {
        headlineSize: "1rem",
        bodySize: "0.72rem",
        headlineLineClamp: 1,
        bodyLineClamp: 1,
        padding: "1rem",
        maxHeadlineChars: 50,
        maxBodyChars: 80,
        shouldTruncateHeadline: headline.length > 50,
        shouldTruncateBody: body.length > 80,
      };
    }

    const isStory = aspectRatio === "9:16";
    const isPortrait = aspectRatio === "5:6";

    // ══════════════════════════════════════════════════════════════════
    // STORY LAYOUT (9:16)
    // Card estreito (~250-290px wide), fonte proporcional menor
    // ══════════════════════════════════════════════════════════════════
    if (isStory) {
      const headlineLen = headline.length;
      const totalLen = headlineLen + body.length;

      // Headline: base 1.45rem, mín 1.0rem
      // Threshold menor pois o card é estreito e texto quebra mais rápido
      const hBase = 1.45;
      const hMin = 1.0;
      const hThreshold = 30;
      const hDecay = 0.014;
      const hExcess = Math.max(0, headlineLen - hThreshold);
      const headlineSize = `${Math.max(hMin, hBase - hExcess * hDecay).toFixed(3)}rem`;

      // Body: base 0.85rem, mín 0.72rem
      const bBase = 0.85;
      const bMin = 0.72;
      const bThreshold = 80;
      const bDecay = 0.0015;
      const bExcess = Math.max(0, totalLen - bThreshold);
      const bodySize = `${Math.max(bMin, bBase - bExcess * bDecay).toFixed(3)}rem`;

      // Story não trunca — mostra tudo (aproveita a altura do card)
      return {
        headlineSize,
        bodySize,
        headlineLineClamp: undefined,
        bodyLineClamp: undefined,
        padding: "1.75rem 1.5rem",
        maxHeadlineChars: 120,
        maxBodyChars: 300,
        shouldTruncateHeadline: false,
        shouldTruncateBody: false,
      };
    }

    // ══════════════════════════════════════════════════════════════════
    // PORTRAIT LAYOUT (5:6) — card médio (~320px wide)
    // ══════════════════════════════════════════════════════════════════
    if (isPortrait) {
      const headlineLen = headline.length;
      const totalLen = headlineLen + body.length;

      // Headline: base 1.55rem, mín 1.05rem
      const hBase = 1.55;
      const hMin = 1.05;
      const hThreshold = 35;
      const hDecay = 0.014;
      const hExcess = Math.max(0, headlineLen - hThreshold);
      const headlineSize = `${Math.max(hMin, hBase - hExcess * hDecay).toFixed(3)}rem`;

      // Body: base 0.9rem, mín 0.75rem
      const bBase = 0.9;
      const bMin = 0.75;
      const bThreshold = 110;
      const bDecay = 0.001;
      const bExcess = Math.max(0, totalLen - bThreshold);
      const bodySize = `${Math.max(bMin, bBase - bExcess * bDecay).toFixed(3)}rem`;

      const maxHeadlineChars = 80;
      const maxBodyChars = 180;

      return {
        headlineSize,
        bodySize,
        headlineLineClamp: headlineLen > 60 ? 3 : 2,
        bodyLineClamp: totalLen > 140 ? 4 : 3,
        padding: "1.85rem",
        maxHeadlineChars,
        maxBodyChars,
        shouldTruncateHeadline: headlineLen > maxHeadlineChars,
        shouldTruncateBody: body.length > maxBodyChars,
      };
    }

    // ══════════════════════════════════════════════════════════════════
    // SQUARE LAYOUT (1:1) — card maior (~380px wide)
    // ══════════════════════════════════════════════════════════════════
    const headlineLen = headline.length;
    const totalLen = headlineLen + body.length;

    // Headline: base 1.65rem, mín 1.1rem
    const hBase = 1.65;
    const hMin = 1.1;
    const hThreshold = 40;
    const hDecay = 0.014;
    const hExcess = Math.max(0, headlineLen - hThreshold);
    const headlineSize = `${Math.max(hMin, hBase - hExcess * hDecay).toFixed(3)}rem`;

    // Body: base 0.95rem, mín 0.78rem
    const bBase = 0.95;
    const bMin = 0.78;
    const bThreshold = 120;
    const bDecay = 0.0008;
    const bExcess = Math.max(0, totalLen - bThreshold);
    const bodySize = `${Math.max(bMin, bBase - bExcess * bDecay).toFixed(3)}rem`;

    const maxHeadlineChars = 60;
    const maxBodyChars = 120;

    return {
      headlineSize,
      bodySize,
      headlineLineClamp: headlineLen > 60 ? 3 : 2,
      bodyLineClamp: 4,
      padding: "1.75rem",
      maxHeadlineChars,
      maxBodyChars,
      shouldTruncateHeadline: headlineLen > maxHeadlineChars,
      shouldTruncateBody: body.length > maxBodyChars,
    };
  }, [headline, body, aspectRatio, isCompact]);
}

/**
 * Sugere um texto truncado se exceder o limite
 */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars - 3);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.7) {
    return truncated.slice(0, lastSpace) + "...";
  }
  return truncated + "...";
}

/**
 * Calcula se o texto precisa de ajuste para caber
 */
export function analyzeTextFit(
  headline: string,
  body: string,
  aspectRatio: AspectRatio
): {
  headlineStatus: "ideal" | "tight" | "overflow";
  bodyStatus: "ideal" | "tight" | "overflow";
  suggestions: string[];
} {
  const limits = {
    "1:1": { headline: 60, body: 120 },
    "5:6": { headline: 80, body: 180 },
    "9:16": { headline: 120, body: 300 },
  };

  const limit = limits[aspectRatio];
  const suggestions: string[] = [];

  let headlineStatus: "ideal" | "tight" | "overflow" = "ideal";
  let bodyStatus: "ideal" | "tight" | "overflow" = "ideal";

  if (headline.length > limit.headline) {
    headlineStatus = "overflow";
    suggestions.push(
      `Reduza o título para ${limit.headline} caracteres (atual: ${headline.length})`
    );
  } else if (headline.length > limit.headline * 0.8) {
    headlineStatus = "tight";
  }

  if (body.length > limit.body) {
    bodyStatus = "overflow";
    suggestions.push(
      `Reduza o corpo para ${limit.body} caracteres (atual: ${body.length})`
    );
  } else if (body.length > limit.body * 0.8) {
    bodyStatus = "tight";
  }

  return { headlineStatus, bodyStatus, suggestions };
}
