import { describe, expect, it } from "vitest";
import { extractReadablePage, normalizeSiteUrl } from "./siteContent";

describe("siteContent", () => {
  it("normalizes protocol, host, hash and trailing slash", () => {
    expect(normalizeSiteUrl("EXAMPLE.com/oferta/#precos")).toBe(
      "https://example.com/oferta"
    );
  });

  it("extracts metadata and readable body without scripts", () => {
    const page = extractReadablePage(
      "https://example.com",
      `<!doctype html>
      <html>
        <head>
          <title>Fallback title</title>
          <meta property="og:title" content="Produto Claro">
          <meta name="description" content="Automacao para pequenas equipes">
        </head>
        <body>
          <h1>Ganhe tempo</h1>
          <script>window.secret = "ignore";</script>
          <p>Centralize processos &amp; reduza trabalho manual.</p>
        </body>
      </html>`
    );

    expect(page.title).toBe("Produto Claro");
    expect(page.description).toBe("Automacao para pequenas equipes");
    expect(page.content).toContain("Ganhe tempo");
    expect(page.content).toContain("processos & reduza");
    expect(page.content).not.toContain("window.secret");
  });

  it("extracts metadata as content fallback when body is an empty SPA container", () => {
    const page = extractReadablePage(
      "https://example.com/app",
      `<!doctype html>
      <html>
        <head>
          <title>App SPA</title>
          <meta property="og:title" content="App SPA – Plataforma Moderna">
          <meta name="description" content="Plataforma de alta produtividade para criadores digitais.">
        </head>
        <body>
          <div id="root"></div>
        </body>
      </html>`
    );

    expect(page.title).toBe("App SPA – Plataforma Moderna");
    expect(page.description).toBe("Plataforma de alta produtividade para criadores digitais.");
    expect(page.content).toBe(
      "Plataforma de alta produtividade para criadores digitais.. App SPA – Plataforma Moderna"
    );
  });

  it("falls back to twitter metadata tags when og tags are missing", () => {
    const page = extractReadablePage(
      "https://example.com/twitter-card",
      `<!doctype html>
      <html>
        <head>
          <meta name="twitter:title" content="Título Twitter">
          <meta name="twitter:description" content="Descrição Twitter">
        </head>
        <body>
          <div id="app"></div>
        </body>
      </html>`
    );

    expect(page.title).toBe("Título Twitter");
    expect(page.description).toBe("Descrição Twitter");
    expect(page.content).toBe("Descrição Twitter. Título Twitter");
  });
});

describe("complete source extraction for generation", () => {
  it("retains a late qualifier while legacy extraction keeps its existing limit", () => {
    const html = `<body>${"a".repeat(13000)} Frete grátis somente acima de R$ 100</body>`;
    expect(
      extractReadablePage("https://example.com", html, {
        requireComplete: true,
      }).content
    ).toContain("somente acima de R$ 100");
    expect(
      extractReadablePage("https://example.com", html).content
    ).toHaveLength(12000);
  });
  it("rejects oversize complete extraction instead of presenting a cut source as complete", () => {
    expect(() =>
      extractReadablePage(
        "https://example.com",
        `<body>${"a".repeat(24001)}</body>`,
        { requireComplete: true }
      )
    ).toThrow("limite de leitura integral");
  });
});
