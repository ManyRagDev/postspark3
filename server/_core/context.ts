import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { AuthenticatedUser } from "./sdk";
import { sdk } from "./sdk";

export type TrpcUser = AuthenticatedUser;

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: TrpcUser | null;
};

const DEV_USER: TrpcUser = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Dev User",
  email: "dev@local.dev",
  role: "admin",
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  if (process.env.NODE_ENV === "development" && process.env.BYPASS_AUTH === "true") {
    return { req: opts.req, res: opts.res, user: DEV_USER };
  }

  try {
    const user = await sdk.authenticateRequest(opts.req);
    return {
      req: opts.req,
      res: opts.res,
      user,
    };
  } catch {
    return { req: opts.req, res: opts.res, user: null };
  }
}