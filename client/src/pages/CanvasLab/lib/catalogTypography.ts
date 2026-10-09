/** Shared by the Stage and catalog compiler; keep measurement and rendering identical. */
export function canvasTypography(family: string) {
  const headlineBase = ["chromatic-block", "stroke-impact"].includes(family)
    ? 32
    : family === "cinematic-depth"
      ? 34
      : family === "kinetic-type"
        ? 30
        : ["brutal-split", "data-punch"].includes(family)
          ? 28
          : family === "quote-authority"
            ? 26
            : ["cyber-glitch", "glitch-signal"].includes(family)
              ? 18
              : family === "editorial-poster"
                ? 23
                : 22;
  return {
    headlineBase,
    bodyBase: ["chromatic-block", "cyber-glitch", "glitch-signal"].includes(
      family
    )
      ? 11
      : 12,
    headlineLineHeight: family === "chromatic-block" ? 1.1 : 1.25,
    headlineLetterSpacing:
      family === "chromatic-block"
        ? 0.5
        : family === "editorial-poster"
          ? -0.2
          : -0.4,
    bodyLineHeight: 1.45,
  };
}
