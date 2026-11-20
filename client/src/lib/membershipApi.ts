import { supabase } from "@/lib/supabaseClient";
import type { MembershipCycle, PaidStudioPlan } from "@shared/membership";

export const membershipCycleKey = "postspark.checkout-cycle";

class MembershipRequestError extends Error {}

export async function requestIdentityApi<T>(path: string, input?: object) {
  const result = await supabase?.auth.getSession();
  const token = result?.data.session?.access_token;
  if (!token) throw new MembershipRequestError("Entre na sua conta para continuar.");
  const response = await fetch(path, {
    method: input ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(input ? { "Content-Type": "application/json" } : {}) },
    body: input ? JSON.stringify(input) : undefined,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new MembershipRequestError(body?.error ?? "Não foi possível consultar a assinatura.");
  return body as T;
}

function requestMembership<T>(path: string, input?: object) {
  return requestIdentityApi<T>(`/api/membership${path}`, input);
}

export function startProCheckout(cycle: MembershipCycle, plan: PaidStudioPlan = "PRO") {
  return requestMembership<{ url: string }>("/checkout", plan === "PRO" ? { cycle } : { cycle, plan });
}
export function enrollStartPilot() {
  return requestMembership<{ enrolled: boolean }>("/start", {});
}
export async function readEnrollmentOffers() {
  const response = await fetch("/api/membership/offers");
  if (!response.ok) throw new MembershipRequestError("Ofertas indisponíveis.");
  return await response.json() as { start: boolean; paid: PaidStudioPlan[]; annualPaid?: PaidStudioPlan[] };
}
export function confirmProCheckout(sessionId: string) {
  return requestMembership<{ active: boolean }>("/confirm", { sessionId });
}
export function confirmSparkRefill(sessionId: string) {
  return requestMembership<{ credited: boolean }>("/topup-confirm", { sessionId });
}
export function readProMembership() {
  return requestMembership<{ active: boolean; cycle?: MembershipCycle; paidUntil?: string; plan?: PaidStudioPlan }>("");
}
export function openProPortal() {
  return requestMembership<{ url: string }>("/portal", {});
}
