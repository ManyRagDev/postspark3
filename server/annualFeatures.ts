import { TRPCError } from "@trpc/server";
import { getSupabase } from "./billing";
import { readMembership } from "./membership";

export function irisReleaseChannel() {
  const channel = process.env.POSTSPARK_IRIS_RELEASE_CHANNEL;
  return channel === "early" || channel === "labs" ? channel : "general";
}

export async function readAnnualFeatures(userId: string) {
  const member = await readMembership(userId);
  const annual = member.active === true && member.cycle === "annual";
  const channel = irisReleaseChannel();
  const configured = process.env.ADVANCED_IMAGE_IRIS_ENABLED === "true";
  const labsAvailable = configured && channel === "labs" && annual;
  let optedIn = false;
  if (labsAvailable) {
    const { data, error } = await getSupabase().from("annual_lab_preferences")
      .select("opted_in").eq("user_id", userId).eq("feature", "image_iris").maybeSingle();
    if (error) throw new Error("Preferências do Labs indisponíveis.");
    optedIn = data?.opted_in === true;
  }
  return {
    annual, labsAvailable, optedIn, cycle: member.cycle, paidUntil: member.paidUntil,
    irisAllowed: channel === "general" || (annual && (channel === "early" || optedIn)),
  };
}

export async function setIrisExperiment(userId: string, optedIn: boolean) {
  if (!(await readAnnualFeatures(userId)).labsAvailable)
    throw new TRPCError({ code: "FORBIDDEN", message: "Este experimento está disponível para assinantes anuais elegíveis." });
  const { error } = await getSupabase().from("annual_lab_preferences")
    .upsert({ user_id: userId, feature: "image_iris", opted_in: optedIn });
  if (error) throw new Error("Não foi possível salvar a preferência do Labs.");
  return { optedIn };
}

export async function requireIrisAccess(userId: string) {
  if (irisReleaseChannel() !== "general" && !(await readAnnualFeatures(userId)).irisAllowed)
    throw new TRPCError({ code: "FORBIDDEN", message: "Este recurso requer acesso antecipado ou inscrição no Labs." });
}
