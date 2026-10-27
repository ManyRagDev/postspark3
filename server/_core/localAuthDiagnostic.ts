import { createHash } from "node:crypto";
import type { Request } from "express";
import { parse } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { localDiagnosticsEnabled, writeLocalDiagnostic } from "../ai/localDiagnostics";

/** Local-only correlation. Neither raw credentials, user identity nor URL queries are stored. */
export function recordLocalAuth(req: Request, event: string, token?: string) {
  if (!localDiagnosticsEnabled()) return;
  let cookie: string | undefined;
  try { cookie = parse(req.headers.cookie ?? "")[COOKIE_NAME]; } catch {}
  const value = token ?? cookie;
  let origin: string | undefined;
  let referrerPath: string | undefined;
  try { if(typeof req.headers.origin === "string") origin=new URL(req.headers.origin).origin; } catch {}
  try { if(req.headers.referer) referrerPath=new URL(req.headers.referer).pathname; } catch {}
  void writeLocalDiagnostic("auth-session", {
    at: new Date().toISOString(), event,
    route: (req.originalUrl || req.url).split("?")[0],
    host: req.hostname,
    origin, referrerPath,
    bridge: req.headers["x-postspark-auth-bridge"] === "shared" ? "shared" : "unmarked",
    cookiePresent: Boolean(cookie),
    ...(token ? {cookieMatchesToken: cookie === token} : {}),
    ...(value ? {sessionFingerprint:createHash("sha256").update(value).digest("hex").slice(0,16)} : {}),
  }).catch(() => process.stderr.write("[diagnostics] Falha ao gravar diagnóstico local de autenticação.\n"));
}
