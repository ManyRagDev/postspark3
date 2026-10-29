import express from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CaptureBrowser } from "./browser";

const urlSchema = z.string().url().max(2048);
const viewportSchema = z.object({
  width: z.number().int().min(240).max(1920),
  height: z.number().int().min(240).max(1600),
});
const viewportDefault = { width: 1440, height: 900 };
const singleSchema = z.object({
  url: urlSchema,
  viewport: viewportSchema.default(viewportDefault),
});
const batchSchema = z.object({
  urls: z.array(urlSchema).min(1).max(5),
  viewport: viewportSchema.default(viewportDefault),
  maxPages: z.number().int().min(1).max(5).default(5),
});
const elementsSchema = singleSchema.extend({
  selectors: z.array(z.string().min(1).max(500)).min(1).max(8),
});
const discoverSchema = z.object({
  url: urlSchema,
  maxLinks: z.number().int().min(1).max(10).default(8),
});

export function createCaptureApp(
  token: string,
  browser = new CaptureBrowser()
) {
  if (Buffer.byteLength(token) < 32)
    throw new Error("SCREENSHOT_SERVICE_TOKEN must contain at least 32 bytes");
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", publicNetworkOnly: true })
  );
  app.use((req, res, next) => {
    const expected = Buffer.from(`Bearer ${token}`),
      supplied = Buffer.from(req.get("authorization") ?? "");
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(expected, supplied)
    )
      return void res.sendStatus(401);
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.post(
    [
      "/screenshot",
      "/screenshot/mobile",
      "/screenshot/multi",
      "/screenshot/element",
      "/discover",
    ],
    async (req, res) => {
      const stop = new AbortController();
      const timer = setTimeout(
        () => stop.abort(),
        req.path === "/screenshot/multi" ? 85_000 : 27_000
      );
      const disconnect = () => {
        if (!res.writableEnded) stop.abort();
      };
      res.on("close", disconnect);
      try {
        if (req.path === "/screenshot/multi") {
          const { urls, viewport, maxPages } = batchSchema.parse(req.body);
          const screenshots: Record<string, string> = Object.create(null),
            errors: Record<string, string> = Object.create(null);
          for (const url of urls.slice(0, maxPages)) {
            try {
              screenshots[url] = await browser.withPage(
                url,
                viewport,
                stop.signal,
                async page =>
                  (
                    await page.screenshot({ type: "png", timeout: 5000, animations: "disabled" })
                  ).toString("base64")
              );
            } catch {
              errors[url] = "Capture unavailable";
            }
          }
          res.json({ screenshots, errors });
        } else if (req.path === "/screenshot/element") {
          const { url, viewport, selectors } = elementsSchema.parse(req.body);
          const result = await browser.withPage(
            url,
            viewport,
            stop.signal,
            async page => {
              const elements: Record<string, string> = Object.create(null),
                notFound: string[] = [];
              for (const selector of selectors) {
                try {
                  const target = page.locator(selector).first();
                  if (!(await target.count())) {
                    notFound.push(selector);
                    continue;
                  }
                  const box = await target.boundingBox();
                  if (
                    !box ||
                    box.width > 4096 ||
                    box.height > 4096 ||
                    box.width * box.height > 4_000_000
                  ) {
                    notFound.push(selector);
                    continue;
                  }
                  elements[selector] = (
                    await target.screenshot({ type: "png", timeout: 5000, animations: "disabled" })
                  ).toString("base64");
                } catch {
                  notFound.push(selector);
                }
              }
              return { elements, notFound };
            }
          );
          res.json(result);
        } else if (req.path === "/discover") {
          const { url, maxLinks } = discoverSchema.parse(req.body);
          const discoveredPages = await browser.withPage(
            url,
            viewportDefault,
            stop.signal,
            async page => {
              const links = await page
                .locator("a[href]")
                .evaluateAll(nodes =>
                  nodes
                    .slice(0, 500)
                    .map(node => ({
                      url: (node as HTMLAnchorElement).href,
                      label: node.textContent?.trim().slice(0, 120) || "",
                    }))
                );
              const origin = new URL(page.url()).origin,
                seen = new Set<string>();
              return links
                .flatMap(link => {
                  try {
                    const target = new URL(link.url);
                    target.hash = "";
                    if (
                      target.origin !== origin ||
                      !["http:", "https:"].includes(target.protocol) ||
                      target.username ||
                      target.password ||
                      seen.has(target.href)
                    )
                      return [];
                    seen.add(target.href);
                    return [
                      {
                        url: target.href,
                        label: link.label || target.pathname,
                        priority:
                          /about|sobre|produto|product|servic|pricing|preco|contact|contato|team|equipe/i.test(
                            target.pathname
                          )
                            ? "high"
                            : /blog|news|case|portfolio|client|work/i.test(
                                  target.pathname
                                )
                              ? "medium"
                              : "low",
                      },
                    ];
                  } catch {
                    return [];
                  }
                })
                .sort(
                  (a, b) =>
                    ({ high: 0, medium: 1, low: 2 })[a.priority]! -
                    { high: 0, medium: 1, low: 2 }[b.priority]!
                )
                .slice(0, maxLinks);
            }
          );
          res.json({ homepage: url, discoveredPages });
        } else {
          const { url, viewport } = singleSchema.parse(req.body);
          const targetViewport =
            req.path === "/screenshot/mobile"
              ? { width: 390, height: 844 }
              : viewport;
          const png = await browser.withPage(
            url,
            targetViewport,
            stop.signal,
            page => page.screenshot({ type: "png", timeout: 5000, animations: "disabled" })
          );
          res.type("png").send(png);
        }
      } catch (error) {
        if (!res.headersSent && !res.destroyed)
          res
            .status(error instanceof z.ZodError ? 400 : 503)
            .json({
              error:
                error instanceof z.ZodError
                  ? "Invalid capture parameters"
                  : "Capture unavailable",
            });
      } finally {
        clearTimeout(timer);
        res.off("close", disconnect);
      }
    }
  );
  // Invalid JSON and oversized bodies do not expose internals.
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(400).json({ error: "Invalid request" });
    }
  );
  return { app, close: () => browser.close() };
}
