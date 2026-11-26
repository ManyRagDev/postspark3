import type { Express, Request, Response } from "express";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  checkout: vi.fn(),
}));
vi.mock("./env", () => ({
  ENV: { supabaseUrl: "https://auth.example.invalid", supabaseServiceRoleKey: "test", isProduction: true },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("../membership", async importOriginal => ({
  ...await importOriginal<typeof import("../membership")>(),
  startMembershipCheckout: mocks.checkout,
}));

import { registerMembershipRoutes } from "./membershipRoutes";
import { issueSessionPlan, PLAN_COOKIE, sessionPlanScope } from "./planImpersonation";

const verifiedId = "00000000-0000-4000-8000-000000000001";
const verifiedUser = { id: verifiedId, email: "check@example.invalid", email_confirmed_at: "2026-11-18" };
type Handler = (req: Request, res: Response) => Promise<void>;
const posts = new Map<string, Handler>();
registerMembershipRoutes({ get: () => {}, post: (path: string, handler: Handler) => posts.set(path, handler) } as unknown as Express);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: verifiedUser }, error: null });
  mocks.checkout.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_test_example" });
});

async function checkout(body: object, token?: string, headers: Record<string,string> = {}, path = "/api/membership/checkout") {
  const req = { body, headers, get: (key: string) => key === "authorization" && token ? `Bearer ${token}` : undefined };
  const reply = { status: 200, headers: new Map<string, string>(), body: undefined as unknown };
  const res = {
    set: (key: string, value: string) => reply.headers.set(key.toLowerCase(), value),
    status: (status: number) => { reply.status = status; return res; },
    json: (value: unknown) => { reply.body = value; },
  };
  await new Promise<void>((resolve, reject) => sessionPlanScope(req as Request, res as unknown as Response, () => {
    posts.get(path)!(req as Request, res as unknown as Response).then(resolve, reject);
  }));
  return reply;
}

it("requires a valid bearer and a confirmed email before requesting checkout", async () => {
  expect((await checkout({ cycle: "monthly" })).status).toBe(401);
  mocks.getUser.mockResolvedValueOnce({ data: { user: { ...verifiedUser, email_confirmed_at: null } }, error: null });
  expect((await checkout({ cycle: "monthly" }, "unconfirmed")).status).toBe(403);
  expect(mocks.checkout).not.toHaveBeenCalled();
});

it("derives the owner from Supabase and requires the advertised cycle", async () => {
  expect((await checkout({ cycle: "annual", userId: "someone-else" }, "credential")).status).toBe(400);
  expect(mocks.checkout).not.toHaveBeenCalled();
  const response = await checkout({ cycle: "annual" }, "credential");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.getUser).toHaveBeenCalledWith("credential");
  expect(mocks.checkout).toHaveBeenCalledWith(verifiedId, "annual", "https://postspark.com.br");
});

it("prevents a simulated session from changing billing or exercising owner-only features on a personal tier", async () => {
  const payload = Buffer.from(JSON.stringify({ session_id: "00000000-0000-4000-8000-000000000099" })).toString("base64url");
  const token = ["header", payload, "signature"].join(".");
  mocks.getUser.mockResolvedValue({ data: { user: { ...verifiedUser, app_metadata: { role: "admin" } } } });
  const headers = { cookie: PLAN_COOKIE + "=" + issueSessionPlan("test", verifiedId, token, "SOLO") };

  expect((await checkout({cycle: "monthly"}, token, headers)).status).toBe(403);
  expect((await checkout({name: "Equipe"}, token, headers, "/api/agency/workspace")).status).toBe(403);
  expect(mocks.checkout).not.toHaveBeenCalled();
  expect((await checkout({cycle: "monthly"}, token)).status).toBe(200);
});
