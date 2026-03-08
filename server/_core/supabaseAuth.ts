import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";

function getSupabaseAdmin() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  return createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}

export function registerSupabaseAuthRoutes(app: Express) {
  /**
   * POST /api/auth/supabase-session
   * Recebe access_token do frontend e grava no cookie bridge httpOnly.
   */
  app.post("/api/auth/supabase-session", async (req: Request, res: Response) => {
    const { access_token } = req.body;

    if (!access_token || typeof access_token !== "string") {
      res.status(400).json({ error: "access_token is required" });
      return;
    }

    try {
      const supabase = getSupabaseAdmin();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(access_token);

      if (error || !user) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, access_token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      const metadata = user.user_metadata ?? {};
      const name =
        typeof metadata.full_name === "string"
          ? metadata.full_name
          : typeof metadata.name === "string"
            ? metadata.name
            : null;

      res.json({ ok: true, id: user.id, email: user.email ?? null, name });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Session creation failed";
      res.status(500).json({ error: "Session creation failed", detail: message });
    }
  });

  /**
   * POST /api/auth/supabase-logout
   * Limpa cookie bridge de sessao.
   */
  app.post("/api/auth/supabase-logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.json({ ok: true });
  });
}