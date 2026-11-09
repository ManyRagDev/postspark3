import { publicHtml } from "./publicUrl";
import { createHash } from "node:crypto";
import { completeSourceContext, SourceContextLimitError } from "@shared/sourceContext";
import type { ScrapeResult, SiteEvidence } from "@shared/postspark";
import { captureScreenshot, discoverPages, type DiscoveredPage } from "./screenshotService";
import { readReferenceText } from "./referenceOcr";

export interface ScrapedSitePage extends ScrapeResult {
  url: string;
}

export interface SiteContentSnapshot {
  normalizedUrl: string;
  pages: ScrapedSitePage[];
  evidence: SiteEvidence[];
  fingerprint: string;
  discoveredPages: DiscoveredPage[];
}

export function normalizeSiteUrl(rawUrl: string): string {
  const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const url = new URL(withProtocol);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractMeta(html: string, property: string): string {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]).trim();
  }
  return "";
}

export function extractReadablePage(url: string, html: string, options?: { requireComplete?: boolean }): ScrapedSitePage & { hasBodyText: boolean } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title =
    extractMeta(html, "og:title") ||
    extractMeta(html, "twitter:title") ||
    decodeHtmlEntities(titleMatch?.[1] || "").replace(/\s+/g, " ").trim();
  const description =
    extractMeta(html, "og:description") ||
    extractMeta(html, "description") ||
    extractMeta(html, "twitter:description");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch?.[1] || html;
  const extractedBody = decodeHtmlEntities(
    bodyHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

  // Em SPAs (ex: React com <div id="root"></div>), o body inicial é vazio.
  // Usamos os metadados (descrição e título) como fallback informativo.
  const fallbackMeta = [description, title].filter(Boolean).join(". ").trim();
  const content = extractedBody || fallbackMeta;

  return {
    url,
    title,
    description,
    content: options?.requireComplete ? completeSourceContext(content) : content.slice(0, 12_000),
    hasBodyText: extractedBody.length >= 40,
  };
}

export async function scrapeUrl(url: string, options?: { requireComplete?: boolean }): Promise<ScrapedSitePage> {
  const normalized = normalizeSiteUrl(url);
  let initialPage: (ScrapedSitePage & { hasBodyText: boolean }) | null = null;
  try {
    const response = await publicHtml(normalized);
    initialPage = extractReadablePage(response.url, response.html, options);
  } catch (error) {
    if (error instanceof SourceContextLimitError) throw error;
    console.warn("[siteContent] Failed to fetch HTML via publicHtml:", normalized, error);
  }

  // Se o HTML estático já forneceu corpo de texto (>= 40 caracteres), retorna diretamente sem overhead
  if (initialPage && initialPage.hasBodyText) {
    return initialPage;
  }

  // Caso seja SPA (<div id="root"></div>) ou publicHtml foi bloqueado (403/Cloudflare/WAF),
  // tenta capturar via microserviço headless (Playwright) + OCR para capturar o conteúdo real da tela
  try {
    const screenshotBuffer = await captureScreenshot(normalized);
    if (screenshotBuffer) {
      const ocr = await readReferenceText(Buffer.from(screenshotBuffer));
      if (ocr.status === "completed" && ocr.lines.length > 0) {
        const ocrText = ocr.lines.map(l => l.text).join(" ").replace(/\s+/g, " ").trim();
        if (ocrText.length >= 20) {
          const combined = initialPage?.content
            ? `${initialPage.content}\n\n${ocrText}`
            : ocrText;
          return {
            url: normalized,
            title: initialPage?.title || "",
            description: initialPage?.description || "",
            content: options?.requireComplete ? completeSourceContext(combined) : combined.slice(0, 12_000),
          };
        }
      }
    }
  } catch (ocrError) {
    console.warn("[siteContent] Rendered OCR fallback failed for:", normalized, ocrError);
  }

  if (initialPage) {
    return initialPage;
  }

  return { url: normalized, title: "", description: "", content: "" };
}

function buildEvidence(pages: ScrapedSitePage[]): SiteEvidence[] {
  const evidence: SiteEvidence[] = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    if (page.title) {
      evidence.push({
        id: `page-${pageIndex + 1}-title`,
        sourceUrl: page.url,
        kind: "title",
        text: page.title,
      });
    }
    if (page.description) {
      evidence.push({
        id: `page-${pageIndex + 1}-description`,
        sourceUrl: page.url,
        kind: "description",
        text: page.description,
      });
    }
    if (page.content) {
      evidence.push({
        id: `page-${pageIndex + 1}-body`,
        sourceUrl: page.url,
        kind: "body",
        text: page.content,
      });
    }
  }

  return evidence.slice(0, 15);
}

export async function collectSiteContent(rawUrl: string): Promise<SiteContentSnapshot> {
  const normalizedUrl = normalizeSiteUrl(rawUrl);
  const discoveredPages = await discoverPages(normalizedUrl, 8);
  const prioritized = discoveredPages
    .filter((page) => page.priority !== "low")
    .map((page) => page.url);
  const urls = Array.from(new Set([normalizedUrl, ...prioritized])).slice(0, 5);
  const pages = await Promise.all(urls.map(url => scrapeUrl(url,{requireComplete:true})));
  completeSourceContext(pages.map(p=>`${p.title}\n${p.description}\n${p.content}`).join("\n"));
  if(!pages.some(p=>p.content.trim() || p.description.trim() || p.title.trim()))throw new Error("A página não forneceu conteúdo legível.");
  const evidence = buildEvidence(pages);
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(
        pages.map(({ url, title, description, content }) => ({
          url,
          title,
          description,
          content,
        })),
      ),
    )
    .digest("hex");

  return {
    normalizedUrl,
    pages,
    evidence,
    fingerprint,
    discoveredPages,
  };
}
