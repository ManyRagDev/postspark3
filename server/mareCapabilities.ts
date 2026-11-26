import type { Express } from "express";
import { createContext } from "./_core/context";
import type { AuthenticatedUser } from "./_core/sdk";
import { mareSpeechReady } from "./mareSpeech";
import { maySelectPlan } from "./_core/sessionPlanAccess";
import { getBillingProfile } from "./billing";

export async function allowsMarePreview(host: string, user: AuthenticatedUser) {
  return process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(host) &&
    !user.access && !user.impersonatedPlan && await maySelectPlan(user);
}

export async function getMareCapabilities(user: AuthenticatedUser) {
  const disabled = {
    video: false,
    editor: false,
    publicEntry: false,
    mobileContextual: false,
    paid: false,
    speech: false,
    projectRender: false,
  };
  const env = process.env;
  if (
    user.access === "start" ||
    (env.POSTSPARK_MARE_ENABLED !== "true" &&
      env.POSTSPARK_CANVAS_VIDEO_ENABLED !== "true")
  )
    return disabled;
  const cohort = env.POSTSPARK_MARE_PILOT_USERS?.split(",")
    .map(value => value.trim())
    .filter(Boolean);
  if (cohort?.length && !cohort.includes(user.id)) return disabled;
  const plan =
    user.access === "agency"
      ? "AGENCY"
      : (await getBillingProfile(user.email ?? "", user.id)).plan;
  const professional = ["PRO", "PRO_PLUS", "AGENCY", "FOUNDER", "DEV"].includes(
    plan
  );
  const editor = professional && env.POSTSPARK_MARE_ENABLED === "true";
  return {
    video:
      (professional || plan === "SOLO") &&
      env.POSTSPARK_CANVAS_VIDEO_ENABLED === "true",
    editor,
    projectRender: editor && env.POSTSPARK_MARE_RENDER_ENABLED === "true",
    publicEntry: editor && env.POSTSPARK_MARE_PUBLIC_ENTRY === "true",
    mobileContextual: editor && env.POSTSPARK_MARE_MOBILE_CONTEXTUAL === "true",
    speech: editor && env.POSTSPARK_MARE_SPEECH === "true" && await mareSpeechReady(),
    paid: editor && env.POSTSPARK_MARE_PAID_ENABLED === "true",
  };
}

export function registerMareCapabilities(app: Express) {
  app.get("/api/mare/capabilities", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const { user } = await createContext({ req, res });
      if (!user) {
        res.sendStatus(401);
        return;
      }
      const localPreview = await allowsMarePreview(req.hostname, user);
      res.json({...await getMareCapabilities(user), localPreview, ...(localPreview ? {previewActorId: user.id} : {})});
    } catch {
      res
        .status(503)
        .json({ error: "Não foi possível consultar o acesso ao Maré." });
    }
  });
}
