import { createHash } from "node:crypto";
import type { ScrapeResult, SiteEvidence } from "@shared/postspark";
import { discoverPages, type DiscoveredPage } from "./screenshotService";

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

export function extractReadablePage(url: string, html: string): ScrapedSitePage {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title =
    extractMeta(html, "og:title") ||
    decodeHtmlEntities(titleMatch?.[1] || "").replace(/\s+/g, " ").trim();
  const description =
    extractMeta(html, "og:description") || extractMeta(html, "description");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch?.[1] || html;
  const content = decodeHtmlEntities(
    bodyHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12_000);

  return { url, title, description, content };
}

export async function scrapeUrl(url: string): Promise<ScrapedSitePage> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PostSpark/2.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return extractReadablePage(url, await response.text());
  } catch (error) {
    console.warn("[siteContent] Failed to scrape URL:", url, error);
    return { url, title: "", description: "", content: "" };
  }
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
        text: page.title.slice(0, 300),
      });
    }
    if (page.description) {
      evidence.push({
        id: `page-${pageIndex + 1}-description`,
        sourceUrl: page.url,
        kind: "description",
        text: page.description.slice(0, 500),
      });
    }
    if (page.content) {
      evidence.push({
        id: `page-${pageIndex + 1}-body`,
        sourceUrl: page.url,
        kind: "body",
        text: page.content.slice(0, 2_500),
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
  const pages = await Promise.all(urls.map(scrapeUrl));
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
