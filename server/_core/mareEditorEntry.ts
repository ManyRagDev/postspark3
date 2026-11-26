import express, { type Express, type RequestHandler } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { FONT_DIR } from "@shared/typography/fonts/registry";
import { createContext } from "./context";
import { allowsMarePreview, getMareCapabilities } from "../mareCapabilities";
const documentHead = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Maré Studio · PostSpark</title>';

function editorEntry(preview: boolean): RequestHandler {
  return async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.vary("Cookie");
    try {
      const { user } = await createContext({ req, res });
      if (!user) {
        res.status(401).send(documentHead + '<main><h1>Entre no PostSpark</h1><p>Após entrar, recarregue esta aba para retomar o projeto.</p><a href="/" target="_blank" rel="noopener">Entrar no PostSpark</a></main></html>');
        return;
      }
      if (preview && !await allowsMarePreview(req.hostname, user)) {
        res.sendStatus(403);
        return;
      }
      if (!preview && !(await getMareCapabilities(user)).editor) {
        res.status(403).send(documentHead + '<main><h1>O Maré Studio ainda não está disponível para esta conta</h1><p id="status" role="status"></p><ul id="projects"></ul><a href="/thevoid">Voltar ao PostSpark</a></main><script type="module" src="/mare/project-recovery.js"></script></html>');
        return;
      }
      const url = new URL(req.originalUrl, "http://localhost");
      if (!url.pathname.endsWith("/") && !url.pathname.endsWith("/index.html")) {
        res.redirect(302, (preview ? "/previa-mare/" : "/mare/") + url.search);
        return;
      }
      const builtEntry = path.resolve("dist/private/mare/index.html");
      const entry = process.env.NODE_ENV === "production" && existsSync(builtEntry)
        ? builtEntry : path.resolve("labs/mare-studio/dist/index.html");
      res.sendFile(entry, { cacheControl: false });
    } catch {
      res.status(503).send("Não foi possível verificar o acesso ao Maré.");
    }
  };
}

export function registerMareEditorEntry(app: Express) {
  app.get(["/mare", "/mare/index.html"], editorEntry(false));
  app.use("/previa-mare", (req, res, next) => {
    if (process.env.NODE_ENV !== "development" || !["localhost", "127.0.0.1", "[::1]"].includes(req.hostname)) {
      res.sendStatus(404);
      return;
    }
    next();
  });
  app.get(["/previa-mare", "/previa-mare/index.html"], editorEntry(true));
  if (process.env.NODE_ENV === "development") {
    for (const base of ["/mare", "/previa-mare"]) {
      app.use(base + "/fonts", express.static(FONT_DIR));
      app.use(base + "/transition-media", express.static("labs/mare-studio/processor/transition-media"));
      const serveAsset = express.static("labs/mare-studio/dist", { index: false });
      app.use(base, (req, res, next) => {
        // The editor document is served exclusively by the authenticated entry.
        if (path.extname(decodeURIComponent(req.path)).toLowerCase() === ".html") {
          res.sendStatus(404);
          return;
        }
        serveAsset(req, res, next);
      });
    }
  }
}
