import type { Express, Request, Response } from "express";
import { validateTemporalMedia } from "./mareDocument";
import { z } from "zod";
import { storedAspectRatios } from "@shared/aspectRatios";
import { rpcCall } from "./billing";
import { MembershipError } from "./membership";
import { getImpersonatedPlan } from "./_core/planImpersonation";

const name = z.string().trim().min(1).max(120);
const uuid = z.string().uuid();
const model = z.object({
  aspectRatio: z.enum(storedAspectRatios),
  slides: z.array(z.object({ id: z.string().min(1) }).passthrough()).min(1).max(10),
}).passthrough();

type IdentityHandler = (req: Request, userId: string) => Promise<unknown>;
type IdentityWrapper = (handler: IdentityHandler) => (req: Request, res: Response) => Promise<void>;

async function agencyRpc<T>(procedure: string, userId: string, args: Record<string, unknown> = {}) {
  const { data, error } = await rpcCall<T>(procedure, { p_user_id: userId, ...args });
  if (error?.code === "PT403") throw new MembershipError(403, "Esta conta não pode acessar ou alterar este projeto.");
  if (error?.code === "PT409") throw new MembershipError(409, "A equipe atingiu o limite ou o projeto mudou. Atualize e tente novamente.");
  if (error) throw new Error("Operação de equipe indisponível.");
  return data;
}

function permitsAgencyOwnership(userId: string) {
  const plan = getImpersonatedPlan(userId);
  return plan === null || plan === "AGENCY";
}

function requireAgencyOwnershipPlan(userId: string) {
  if (!permitsAgencyOwnership(userId))
    throw new MembershipError(403, "A gestão da equipe exige o plano Agência.");
}

export function registerAgencyRoutes(app: Express, withIdentity: IdentityWrapper) {
  app.get("/api/agency", withIdentity(async (_req, userId) => {
    const overview = await agencyRpc<{ canCreate: boolean; workspaces: unknown[] }>("agency_overview", userId);
    return { ...overview, canCreate: Boolean(overview?.canCreate) && permitsAgencyOwnership(userId), userId };
  }));
  app.post("/api/agency/workspace", withIdentity(async (req, userId) => {
    requireAgencyOwnershipPlan(userId);
    return { id: await agencyRpc("agency_create_workspace", userId, { p_name: name.parse(req.body?.name) }) };
  }));
  app.post("/api/agency/invite", withIdentity(async (req, userId) => {
    requireAgencyOwnershipPlan(userId);
    const input = z.object({ workspaceId: uuid, email: z.string().email().max(320), role: z.enum(["editor", "reviewer"]) }).strict().parse(req.body);
    return { id: await agencyRpc("agency_invite", userId, {
      p_workspace_id: input.workspaceId, p_email: input.email, p_role: input.role,
    }) };
  }));
  app.post("/api/agency/accept", withIdentity(async (req, userId) => ({
    id: await agencyRpc("agency_accept_invite", userId, { p_invite_id: uuid.parse(req.body?.id) }),
  })));
  app.get("/api/agency/projects/:workspace", withIdentity((req, userId) =>
    agencyRpc("agency_list_projects", userId, { p_workspace_id: uuid.parse(req.params.workspace) })));
  app.get("/api/agency/project/:id", withIdentity(async (req, userId) => {
    const project = await agencyRpc("agency_get_project", userId, { p_project_id: uuid.parse(req.params.id) });
    if (!project) throw new MembershipError(404, "Projeto indisponível.");
    return project;
  }));
  app.post("/api/agency/project", withIdentity((req, userId) => {
    const input = z.object({
      id: uuid.optional(), workspaceId: uuid, revision: z.number().int().positive().optional(), name, model,
    }).strict().parse(req.body);
    validateTemporalMedia(input.model);
    if (Buffer.byteLength(JSON.stringify(input.model), "utf8") > 2_000_000)
      throw new MembershipError(413, "Este projeto excede o tamanho permitido.");
    return agencyRpc("agency_save_project", userId, {
      p_workspace_id: input.workspaceId, p_project_id: input.id ?? null, p_revision: input.revision ?? null,
      p_name: input.name, p_model: input.model,
    });
  }));
  app.post("/api/agency/review", withIdentity((req, userId) => {
    const input = z.object({ id: uuid, revision: z.number().int().positive(), status: z.enum(["draft", "review", "approved"]) }).strict().parse(req.body);
    return agencyRpc("agency_review_project", userId, {
      p_project_id: input.id, p_revision: input.revision, p_status: input.status,
    });
  }));
}
