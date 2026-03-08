import { COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  name: string | null;
  role?: string | null;
};

let _supabaseAuthClient: ReturnType<typeof createClient> | null = null;

function getSupabaseAuthClient() {
  if (!_supabaseAuthClient) {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    _supabaseAuthClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }

  return _supabaseAuthClient;
}

class SDKServer {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  /**
   * Auth 100% Supabase:
   * - le access token do cookie bridge
   * - valida com supabase.auth.getUser(token)
   */
  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const cookies = this.parseCookies(req.headers.cookie);
    const accessToken = cookies.get(COOKIE_NAME);

    if (!accessToken) {
      throw ForbiddenError("Missing session token");
    }

    const supabase = getSupabaseAuthClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      throw ForbiddenError("Invalid or expired session");
    }

    const metadata = user.user_metadata ?? {};
    const nameFromMetadata =
      typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string"
          ? metadata.name
          : null;
    const roleFromMetadata =
      typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null;

    return {
      id: user.id,
      email: user.email ?? null,
      name: nameFromMetadata,
      role: roleFromMetadata,
    };
  }
}

export const sdk = new SDKServer();