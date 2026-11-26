import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";
import { parse } from "cookie";
import type { RequestHandler } from "express";
import { PAID_PLAN_OFFERS, type PaidStudioPlan } from "@shared/membership";

export const PLAN_COOKIE = "postspark_session_plan";
export const PLAN_DURATION_MS = 8 * 60 * 60 * 1000;

const scope = new AsyncLocalStorage<{ actor?: string; plan?: PaidStudioPlan }>();
export const sessionPlanScope: RequestHandler = (_req, _res, next) => scope.run({}, next);

export function bindSessionPlan(actor: string, plan: PaidStudioPlan | null) {
  const request = scope.getStore();
  if (request) Object.assign(request, { actor, plan: plan ?? undefined });
}

export function getImpersonatedPlan(actor?: string): PaidStudioPlan | null {
  const request = scope.getStore();
  return actor && request?.actor === actor ? request.plan ?? null : null;
}

// The caller must first validate this access token with Supabase getUser.
// session_id survives a token refresh and changes on the next login.
function sessionId(token: string) {
  try {
    const id = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).session_id;
    return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch { return null; }
}

function signature(secret: string, actor: string, session: string, payload: string) {
  return createHmac("sha256", secret).update(JSON.stringify([PLAN_COOKIE, actor, session, payload])).digest("base64url");
}

export function issueSessionPlan(secret: string, actor: string, token: string, plan: PaidStudioPlan, now = Date.now()) {
  const session = sessionId(token);
  if (!session || !secret) throw Error("Sessão indisponível para impersonação.");
  const payload = plan + "." + (now + PLAN_DURATION_MS);
  return payload + "." + signature(secret, actor, session, payload);
}

export function readSessionPlan(secret: string, actor: string, token: string, cookies?: string, now = Date.now()): PaidStudioPlan | null {
  const value = parse(cookies ?? "")[PLAN_COOKIE];
  if (!value || !secret) return null;
  const fields = value.split(".");
  if (fields.length !== 3) return null;
  const [plan, expires, mac] = fields;
  if (!Object.hasOwn(PAID_PLAN_OFFERS, plan) || !/^\d{13}$/.test(expires) || Number(expires) <= now) return null;
  const session = sessionId(token);
  if (!session || !/^[\w-]{43}$/.test(mac)) return null;
  const expected = signature(secret, actor, session, plan + "." + expires);
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? plan as PaidStudioPlan : null;
}
