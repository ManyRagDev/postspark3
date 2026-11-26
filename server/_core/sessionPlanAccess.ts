import type { Request } from "express";
import type { User } from "@supabase/supabase-js";
import { getRealBillingProfile } from "../billing";
import { ENV } from "./env";
import { bindSessionPlan, readSessionPlan } from "./planImpersonation";

export async function maySelectPlan(user: { id: string; email?: string | null; role?: string | null }) {
  return user.role === "admin" || (await getRealBillingProfile(user.email ?? "", user.id)).plan === "DEV";
}

export async function applySessionPlan(req: Request, verifiedToken: string, user: User) {
  const candidate = readSessionPlan(ENV.supabaseServiceRoleKey, user.id, verifiedToken, req.headers.cookie);
  const plan = candidate && await maySelectPlan({ id: user.id, email: user.email, role: user.app_metadata?.role }) ? candidate : null;
  bindSessionPlan(user.id, plan);
  return plan;
}
