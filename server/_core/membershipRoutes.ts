import { createClient } from "@supabase/supabase-js";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { ENV } from "./env";
import { enrollStartPilot, startPilotMemberLimit } from "../startPilot";
import { registerAgencyRoutes } from "../agency";
import { confirmSparkRefill } from "../billing";
import {
  confirmMembershipCheckout, createMembershipPortal, MembershipError,
  enrollmentOffers, paidStudioPlanSchema, readMembership, startMembershipCheckout,
} from "../membership";

const cycleInput = z.object({ cycle: z.enum(["monthly", "annual"]), plan: paidStudioPlanSchema.optional() }).strict();
const confirmationInput = z.object({ sessionId: z.string().regex(/^cs_(?:test|live)_[a-zA-Z0-9]+$/).max(128) }).strict();

export function membershipOrigin(req: Request) {
  if (ENV.isProduction) return "https://postspark.com.br";
  // Stripe returns to the same browser origin only for local development.
  const host = req.get("host") ?? "";
  return /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)
    ? `http://${host}` : "https://postspark.com.br";
}

export function registerMembershipRoutes(app: Express) {
  const auth = ENV.supabaseUrl && ENV.supabaseServiceRoleKey
    ? createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, { auth: { persistSession: false } })
    : null;

  function withIdentity(handler: (req: Request, userId: string) => Promise<unknown>) {
    return async (req: Request, res: Response) => {
      res.set("Cache-Control", "no-store");
      const token = /^Bearer (\S+)$/.exec(req.get("authorization") ?? "")?.[1];
      if (!auth || !token) {
        res.status(401).json({ error: "Entre na sua conta para continuar." });
        return;
      }
      try {
        const { data: { user }, error } = await auth.auth.getUser(token);
        if (error || !user) throw new MembershipError(401, "Entre novamente para continuar.");
        if (!user.email || !user.email_confirmed_at)
          throw new MembershipError(403, "Confirme seu e-mail para assinar.");
        res.json(await handler(req, user.id));
      } catch (error) {
        if (error instanceof MembershipError) {
          res.status(error.status).json({ error: error.message });
        } else if (error instanceof z.ZodError) {
          res.status(400).json({ error: "Solicitação de assinatura inválida." });
        } else {
          console.error("[Membership]", error instanceof Error ? error.name : "request_failed");
          res.status(503).json({ error: "Não foi possível consultar a assinatura agora. Tente novamente." });
        }
      }
    };
  }

  registerAgencyRoutes(app, withIdentity);

  // These endpoints authenticate the Supabase identity before the app session
  // bridge is granted. The token is never accepted as app access by itself.
  app.get("/api/membership/offers", (_req, res) => {
    res.set("Cache-Control", "no-store").json(enrollmentOffers());
  });
  app.get("/api/membership", withIdentity(async (_req, userId) => {
    const { active, cycle, paidUntil, plan } = await readMembership(userId);
    return { active: active === true, cycle, paidUntil, plan };
  }));
  app.post("/api/membership/checkout", withIdentity((req, userId) => {
    const { cycle, plan } = cycleInput.parse(req.body);
    return plan ? startMembershipCheckout(userId, cycle, membershipOrigin(req), plan)
      : startMembershipCheckout(userId, cycle, membershipOrigin(req));
  }));
  app.post("/api/membership/confirm", withIdentity((req, userId) =>
    confirmMembershipCheckout(userId, confirmationInput.parse(req.body).sessionId)));
  app.post("/api/membership/topup-confirm", withIdentity((req, userId) =>
    confirmSparkRefill(userId, confirmationInput.parse(req.body).sessionId)));
  app.post("/api/membership/portal", withIdentity((req, userId) =>
    createMembershipPortal(userId, membershipOrigin(req))));
  app.post("/api/membership/start", withIdentity(async (_req, userId) => {
    if (!startPilotMemberLimit()) throw new MembershipError(404, "O START ainda está indisponível.");
    const result = await enrollStartPilot(userId);
    if (!result.enrolled) throw new MembershipError(409, "O START está indisponível para esta conta.");
    return result;
  }));
}
