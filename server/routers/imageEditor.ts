import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  IMAGE_EDITOR_TOOLS,
  imageEditInputSchema,
  imageEditPublishSchema,
} from "../../shared/imageEditor";
import {
  advancedImageEdit,
  advancedImageCapabilities,
  imageEditorConfigured,
} from "../imageEditing/client";
import { decodeImageData, ImageEditorError } from "../imageEditing/raster";
import { saveUserMediaAsset } from "../mediaAssets";
import type { TrpcContext } from "../_core/context";
import { irisReleaseChannel, readAnnualFeatures, requireIrisAccess } from "../annualFeatures";
import { requireProfessionalEditor } from "../studioAccess";

async function withCancellation<T>(
  ctx: TrpcContext,
  work: (signal: AbortSignal) => Promise<T>
) {
  const controller = new AbortController();
  const abort = () => {
    if (!ctx.res.writableEnded) controller.abort();
  };
  ctx.req.once("aborted", abort);
  ctx.res.once("close", abort);
  try {
    return await work(controller.signal);
  } catch (error) {
    if (error instanceof ImageEditorError)
      throw new TRPCError({
        code: (
          {
            INVALID: "BAD_REQUEST",
            BUSY: "TOO_MANY_REQUESTS",
            UNAVAILABLE: "PRECONDITION_FAILED",
            TIMEOUT: "TIMEOUT",
            CANCELLED: "CLIENT_CLOSED_REQUEST",
            FAILED: "UNPROCESSABLE_CONTENT",
          } as const
        )[error.code],
        message: error.message,
      });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Não foi possível concluir a edição. Tente novamente.",
    });
  } finally {
    ctx.req.removeListener("aborted", abort);
    ctx.res.removeListener("close", abort);
  }
}

export function createImageEditorRouter(
  deps: {
    process: typeof advancedImageEdit;
    configured: typeof imageEditorConfigured;
    save: typeof saveUserMediaAsset;
    capabilities?: typeof advancedImageCapabilities;
  } = {
    process: advancedImageEdit,
    configured: imageEditorConfigured,
    save: saveUserMediaAsset,
    capabilities: advancedImageCapabilities,
  }
) {
  return router({
    capabilities: protectedProcedure.query(async ({ ctx }) => {
      await requireProfessionalEditor(ctx.user);
      const capability = deps.capabilities
        ? await deps.capabilities()
        : {
            available: deps.configured(),
            tools: IMAGE_EDITOR_TOOLS.slice(0, 6),
          };
      if (irisReleaseChannel() === "general" || !capability.tools.some(tool => tool.kind === "iris"))
        return capability;
      const { irisAllowed } = await readAnnualFeatures(ctx.user.id);
      return irisAllowed ? capability : { ...capability, tools: capability.tools.filter(tool => tool.kind !== "iris") };
    }),
    preview: protectedProcedure
      .input(imageEditInputSchema)
      .mutation(async ({ input, ctx }) => {
        await requireProfessionalEditor(ctx.user);
        if (input.operation.kind === "iris") await requireIrisAccess(ctx.user.id);
        return withCancellation(ctx, signal =>
          deps.process(input, ctx.user.id, signal)
        );
      }),
    publish: protectedProcedure
      .input(imageEditPublishSchema)
      .mutation(async ({ input, ctx }) => {
        await requireProfessionalEditor(ctx.user);
        if (input.operation.kind === "iris") await requireIrisAccess(ctx.user.id);
        return withCancellation(ctx, async signal => {
          if (!deps.configured())
            throw new ImageEditorError(
              "UNAVAILABLE",
              "A edição avançada está temporariamente indisponível."
            );
          const source = decodeImageData(input.imageData),
            output = decodeImageData(input.result.imageData);
          if (
            input.requestId !== input.result.requestId ||
            source.sha256 !== input.result.sourceSha256 ||
            output.sha256 !== input.result.resultSha256 ||
            input.format !== input.result.format ||
            source.width !== input.result.sourceDimensions.width ||
            source.height !== input.result.sourceDimensions.height ||
            output.width !== input.result.resultDimensions.width ||
            output.height !== input.result.resultDimensions.height ||
            output.mimeType !== `image/${input.format}`
          )
            throw new ImageEditorError(
              "INVALID",
              "A prévia mudou. Gere uma nova prévia antes de aplicar."
            );
          const original = await deps.save(
            input.imageData,
            ctx.user.id,
            signal
          );
          if (signal.aborted)
            throw new ImageEditorError("CANCELLED", "Edição cancelada.");
          const edited = await deps.save(
            input.result.imageData,
            ctx.user.id,
            signal
          );
          return { inputUrl: original.url, resultUrl: edited.url };
        });
      }),
  });
}
export const imageEditorRouter = createImageEditorRouter();
