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
    // A long-lived editor may outlive a logout and a different person's login.
    // The header only narrows access; the verified cookie establishes identity.
    const editorOwner = opts.req.headers["x-postspark-editor-owner"];
    return {
      req: opts.req,
      res: opts.res,
      user: editorOwner === undefined || editorOwner === user.id ? user : null,
    };
  } catch {
    return { req: opts.req, res: opts.res, user: null };
  }
}
