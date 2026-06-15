import { describe, expect, it } from "vitest";
import { extractReadablePage, normalizeSiteUrl } from "./siteContent";

describe("siteContent", () => {
  it("normalizes protocol, host, hash and trailing slash", () => {
    expect(normalizeSiteUrl("EXAMPLE.com/oferta/#precos")).toBe(
      "https://example.com/oferta",
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
      </html>`,
    );

    expect(page.title).toBe("Produto Claro");
    expect(page.description).toBe("Automacao para pequenas equipes");
    expect(page.content).toContain("Ganhe tempo");
    expect(page.content).toContain("processos & reduza");
    expect(page.content).not.toContain("window.secret");
  });
});
