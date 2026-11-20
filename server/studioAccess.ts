import { TRPCError } from "@trpc/server";
import { hasProfessionalEditor, studioPlanForProfile } from "@shared/membership";
import type { AuthenticatedUser } from "./_core/sdk";
import { getBillingProfile, rpcCall } from "./billing";

export async function resolveStudioPlan(user: AuthenticatedUser) {
  if (user.access === "start") return "START";
  if (user.access === "agency") return "AGENCY";
  const profile = await getBillingProfile(user.email ?? "", user.id);
  if (profile.id === "error" || profile.id === "no-profile")
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Plano indisponível. Tente novamente." });
  return studioPlanForProfile(profile.plan);
}

export async function requireProfessionalStudio(user: AuthenticatedUser, feature: string) {
  if (user.access === "agency") return requireAgencyEditor(user.id);
  if (!hasProfessionalEditor(await resolveStudioPlan(user))) {
    throw new TRPCError({ code: "FORBIDDEN", message: `${feature} está disponível a partir do PRO.` });
  }
}

export function requireProfessionalEditor(user: AuthenticatedUser) {
  return requireProfessionalStudio(user, "O Editor Avançado");
}

export async function requireAgencyEditor(userId: string) {
  const { data, error } = await rpcCall<boolean>("has_agency_editor_access", { p_user_id: userId });
  if (error || data !== true)
    throw new TRPCError({ code: "FORBIDDEN", message: "A edição exige permissão de editor na equipe." });
}
