import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // Propaga `GenerationFailureMetadata` estruturado até o cliente sem
    // depender da mensagem textual. Nunca expõe stack trace em produção.
    const failure = (error as { failure?: unknown }).failure;
    return {
      ...shape,
      data: {
        ...shape.data,
        ...(failure ? { generationFailure: failure } : {}),
        ...(ENV.isProduction ? { stack: undefined } : {}),
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const startProcedures = new Set([
  "billing.getProfile", "startPilot.state", "startPilot.save",
  "generation.capabilities", "generation.start", "generation.get", "generation.progress",
  "generation.resume", "generation.cancel", "generationTelemetry.record",
  "catalog.acervo", "catalog.acervo82Directory", "catalog.manifest", "catalog.snapshot", "designCatalog.generationReadiness",
  "designCatalog.getStudioPreferences", "designCatalog.reportArsenalCompilation",
  "designCatalog.reportCompilation", "designCatalog.reportComponentCompilation",
  "designCatalog.resolveArsenalVariant",
  "brandProjects.list", "brandProjects.getById", "brandProjects.upsert", "brandProjects.saveIdentity", "post.saveMediaAsset",
]);

const requireUser = t.middleware(async opts => {
  const { ctx, next, path } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (ctx.user.access === "start" && !startProcedures.has(path)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Escolha uma assinatura para usar este recurso." });
  }

  if (ctx.user.access === "agency" && !["imageEditor.capabilities", "imageEditor.preview", "imageEditor.publish", "post.saveMediaAsset", "post.generateImage"].includes(path)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Este recurso pertence ao Studio pessoal." });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.access || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
