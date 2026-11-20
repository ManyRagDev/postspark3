import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { AuthenticatedUser } from "./sdk";
import { sdk } from "./sdk";

export type TrpcUser = AuthenticatedUser;

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: TrpcUser | null;
};

export async function createContext(
  opts: Pick<CreateExpressContextOptions, "req" | "res">
): Promise<TrpcContext> {
  try {
    const user = await sdk.authenticateRequest(opts.req, { allowStart: true, allowAgency: true });
    return {
      req: opts.req,
      res: opts.res,
      user,
    };
  } catch {
    return { req: opts.req, res: opts.res, user: null };
  }
}
