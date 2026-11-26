import type { PaidStudioPlan } from "@shared/membership";
import { applySessionPlan } from "./sessionPlanAccess";
import { COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";
import { hasPostSparkAccess, hasStartPilotAccess, hasAgencyAccess } from "./appAccess";
import { recordLocalAuth } from "./localAuthDiagnostic";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  name: string | null;
  phone?: string | null;
  company?: string | null;
  role?: string | null;
  access?: "start" | "agency";
  impersonatedPlan?: PaidStudioPlan;
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
  async authenticateRequest(req: Request, options?: { allowStart?: boolean; allowAgency?: boolean }): Promise<AuthenticatedUser> {
    const cookies = this.parseCookies(req.headers.cookie);
    const accessToken = cookies.get(COOKIE_NAME);

    if (!accessToken) {
      recordLocalAuth(req, "request.cookie_missing");
      throw ForbiddenError("Missing session token");
    }

    const supabase = getSupabaseAuthClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      recordLocalAuth(req, "request.invalid_session");
      throw ForbiddenError("Invalid or expired session");
    }

    let access: AuthenticatedUser["access"];
    const hasAccess = await hasPostSparkAccess(user.id);
    if (!hasAccess && options?.allowStart && user.email_confirmed_at && await hasStartPilotAccess(user.id)) access = "start";
    if (!hasAccess && !access && options?.allowAgency && user.email_confirmed_at && await hasAgencyAccess(user.id)) access = "agency";
    if (!hasAccess && !access) {
      recordLocalAuth(req, "request.access_denied");
      throw ForbiddenError("PostSpark access required");
    }

    recordLocalAuth(req, "request.authenticated");

    const metadata = user.user_metadata ?? {};
    const nameFromMetadata =
      typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string"
          ? metadata.name
          : null;
    const phoneFromMetadata =
      typeof metadata.phone === "string" ? metadata.phone : null;
    const companyFromMetadata =
      typeof metadata.company === "string" ? metadata.company : null;
    const roleFromMetadata =
      typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null;

    const impersonatedPlan = hasAccess ? await applySessionPlan(req, accessToken, user) : null;
    return {
      id: user.id,
      email: user.email ?? null,
      name: nameFromMetadata,
      phone: phoneFromMetadata,
      company: companyFromMetadata,
      role: impersonatedPlan ? null : roleFromMetadata,
      ...(impersonatedPlan ? { impersonatedPlan } : {}),
      ...(access ? { access } : {}),
    };
  }
}

export const sdk = new SDKServer();
