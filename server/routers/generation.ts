import { getBrandProjectById } from "../db";
import { freezeGenerationProject } from "@shared/projectEditorial";
import { reconcileGenerationReviews } from "../ai/workflows/generationReconciliation";
import {arsenalHash} from "@shared/arsenalContent";
import {readCatalogManifest,withCatalogRevision} from "../designCatalog/versionedCatalog";
import {enqueueLocal,localExecutorScope} from "../ai/workflows/localDemandSupervisor";
import { resolveCompleteDesignOffers } from "@shared/completeDesignOffers";
import { ENV } from "../_core/env";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  orchestratedGenerationInputSchema,
  normalizeExecutionBrief,
} from "@shared/generationRequest";
import { retrieveCompleteDesignCards } from "../designCatalog/completeDesignStore";
import { eligibleCompleteDesignCardsForRequest } from "../ai/workflows/generationPreparation";
import { hasFormatMismatch } from "@shared/formatIntent";
import { createGenerationStore } from "../ai/workflows/generationStore";
import { saveUserMediaAsset } from "../mediaAssets";
import { resolveProposalMediaReferences } from "../ai/workflows/proposalMedia";
import {
  requestInputHash,
  requestSnapshot,
} from "../ai/workflows/generationRuntime";

export const generationRouter = router({
  capabilities: protectedProcedure.query(async ({ ctx }) => {
    const configured=Boolean(ENV.openRouterApiKey&&ENV.openRouterProposalReviewModel&&ENV.openRouterVisionModel);
    const supported={platforms:["instagram","twitter","linkedin","facebook"] as const,inputTypes:configured?["text","url","image"] as const:[],brandCapture:ENV.aiSiteIntelligenceEnabled};
    if(!configured)return {...supported,ownerId:ctx.user.id,selectable:true,enabled:false,contractVersion:6 as const,reason:"provider_configuration_required"};
    if(ENV.generationWorkerMode==='local-demand') {
      const base={...supported,ownerId:ctx.user.id,selectable:true,contractVersion:6 as const,progressTransport:'events' as const};
      if(!ENV.localDemandEnabled||ENV.generationAdmissionPaused)return {...base,enabled:false,reason:ENV.generationAdmissionPaused?'maintenance':'local_activation_required'};
      try{await (await import('../ai/workflows/proposalRenderer')).assertReviewRendererConfigured();}catch{return {...base,enabled:false,reason:'renderer_configuration_required'};}
      try{const m=await readCatalogManifest(),counts=m.summary[ctx.user.role==='admin'?'experimental':'approved'];return {...base,...counts,catalogRevision:m.revision,catalogScope:ctx.user.role==='admin'?'experimental' as const:'approved' as const,catalogProject:arsenalHash(ENV.supabaseUrl),catalogCount:counts.staticOfferCount+counts.carouselOfferCount,enabled:counts.staticOfferCount+counts.carouselOfferCount>0,reason:'ready'};}
      catch{return {...base,enabled:false,reason:'catalog_publication_required'};}
    }
    if (ENV.generationAdmissionPaused) return {ownerId:ctx.user.id,selectable:true,enabled:false,contractVersion:6 as const,reason:"maintenance"};
    try {
      const store = createGenerationStore();
      const [available, cards] = await Promise.all([
        store.isAvailable(),
        retrieveCompleteDesignCards({aspectRatio:"4:5",postMode:"carousel",slideCount:3,text:"",experimental:ctx.user.role === "admin"}),
      ]);
      const staticOfferCount=resolveCompleteDesignOffers(cards,{slideCount:1,contentMode:"compose"}).length;
      const carouselOfferCount=resolveCompleteDesignOffers(cards,{slideCount:3,contentMode:"compose"}).length;
      const catalogCount=staticOfferCount+carouselOfferCount;
      return {
        ...supported,ownerId: ctx.user.id,
        selectable: true,
        enabled: !ENV.generationAdmissionPaused && available && catalogCount > 0,
        catalogCount,staticOfferCount,carouselOfferCount,
        contractVersion: 6 as const,
        reason: ENV.generationAdmissionPaused ? "maintenance" : !available
          ? "durable_worker_required"
          : catalogCount > 0
            ? "ready"
            : "catalogue_required",
      };
    } catch {
      return {
        ...supported,ownerId: ctx.user.id,
        selectable: true,
        enabled: false as const,
        contractVersion: 6 as const,
        reason: "durable_worker_required",
      };
    }
  }),
  start: protectedProcedure
    .use(async ({ next }) => {
      const result = await next();
      if (!result.ok) {
        // tRPC streams responses without res.json/send. Record the public error
        // explicitly so early admission failures remain visible in the file log.
        console.error("[trpc:generation.start] Pedido recusado", {
          code: result.error.code,
          message: result.error.message,
        });
      }
      return result;
    })
    .input(orchestratedGenerationInputSchema)
    .mutation(async ({ ctx, input }) => {
      console.info(
        `[trpc:generation.start] 📩 Requisição recebida | user=${ctx.user.id.slice(0, 8)}... | modo=${input.postMode} | ratio=${input.aspectRatio ?? "auto"} | rota=${input.postMode === "carousel" ? "carousel_generation" : "static_generation"} | modelo_configurado=${input.postMode === "carousel" ? ENV.openRouterCarouselModel : ENV.openRouterStaticModel}`
      );
      if (input.ownerId !== ctx.user.id)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Este pedido pertence a outra sessão. Inicie uma nova geração nesta conta.",
        });
      const store = createGenerationStore();
      // An admitted request remains readable even while the worker/catalog or
      // its original media are temporarily unavailable. Never reserve twice.
      const existing = await store.getByIdempotencyKey(
        ctx.user.id,
        input.idempotencyKey
      );
      if (existing) {
        if (existing.inputHash !== requestInputHash(input))
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta chave já foi utilizada para outro pedido.",
          });
        if(ENV.generationWorkerMode==='local-demand'&&existing.executionMode==='local-demand')await enqueueLocal(existing);
        return { snapshot: requestSnapshot(existing), created: false };
      }
      if (ENV.generationAdmissionPaused) throw new TRPCError({code:"PRECONDITION_FAILED",message:"A geração está em manutenção. Seus pedidos existentes continuam disponíveis. Nenhum Spark foi reservado."});
      if (input.includeDraftDesigns && ctx.user.role !== "admin")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Designs em rascunho exigem acesso administrativo.",
        });
      if (
        !input.formatIntentConfirmed &&
        hasFormatMismatch(input.content, input.postMode)
      )
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Confirme o formato do post antes de gerar.",
        });
      const references = Array.from(
        new Set(
          [
            input.imageUrl,
            ...(input.sources??[]).filter(s=>s.kind==="image").map(s=>s.value),
            input.executionBrief?.brandInput?.referenceImageUrl,
            input.executionBrief?.brandInput?.logoUrl,
          ].filter((v): v is string => Boolean(v))
        )
      );
      try {
        await resolveProposalMediaReferences(
          references.map(ref =>
            ref.startsWith("data:") ? { dataUri: ref } : { url: ref }
          ),
          ctx.user.id,
          undefined,
          {}
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Não foi possível validar a imagem ou o logo. Use PNG, JPEG ou WebP válido enviado à sua biblioteca privada.",
          cause: error,
        });
      }
      if (ENV.generationWorkerMode==='local-demand' ? !ENV.localDemandEnabled : !(await store.isAvailable()))
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "O executor persistente de geração está indisponível. Nenhuma geração foi iniciada.",
        });
      if(ENV.generationWorkerMode==='local-demand'){
        try{if(!ENV.openRouterApiKey)throw new Error('generation_provider_not_configured');await (await import('../ai/workflows/proposalRenderer')).assertReviewRendererConfigured();}
        catch{throw new TRPCError({code:'PRECONDITION_FAILED',message:'Prepare o renderer e o Chromium local antes de gerar.'});}
      }
      if(!ENV.openRouterApiKey)throw new TRPCError({code:"PRECONDITION_FAILED",message:"O serviço de geração precisa ser configurado antes de gerar. Nenhum Spark foi reservado."});
      const manifest=await readCatalogManifest();
      const executorScope=ENV.localDemandEnabled?await localExecutorScope():undefined;
      // General capability counts are advisory. Admission checks the exact same
      // authored revisions, format, roles, brand and media requirements as preparation.
      try {
        const brief = input.executionBrief
          ? normalizeExecutionBrief(input.executionBrief)
          : null;
        const loadCards=()=>retrieveCompleteDesignCards({
          aspectRatio: input.aspectRatio,
          postMode: input.postMode,
          text: input.content,
          styleText: input.content,
          slideCount: input.postMode === "static" ? 1 : (input.slideCount ?? 5),
          experimental: input.includeDraftDesigns,
          brandColors: brief?.brandInput?.brandColors,
          brandFonts: brief?.brandInput?.fontHint
            ? [brief.brandInput.fontHint]
            : [],
        });
        const cards=await (manifest?withCatalogRevision(manifest.revision,loadCards):loadCards());
        if (!eligibleCompleteDesignCardsForRequest(cards, input).length)
          throw new Error("complete_design_catalog_empty");
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Não foi possível confirmar composições completas compatíveis com este pedido. Nenhum Spark foi reservado.",
          cause: error,
        });
      }
      const inputHash = requestInputHash(input);
      const storedInput = structuredClone(input);
      if(input.projectId&&!input.projectDossier&&!input.projectSnapshot){
        const project=await getBrandProjectById(input.projectId,ctx.user.id);if(!project)throw new TRPCError({code:"NOT_FOUND",message:"Projeto não encontrado."});
        storedInput.projectDossier=project.compiled_document;
        storedInput.projectSnapshot=freezeGenerationProject({name:project.name,niche:project.niche,compiledDocument:project.compiled_document,structuredData:project.structured_data,capture:project.capture,visualPreferences:project.visual_preferences});
      }
      // Content addressing makes concurrent/retried first admissions share the
      // same private bytes. Polling and restoration can use stable private URLs.
      const savedReferences = new Map<string, string>(
        await Promise.all(
          references
            .filter(ref => ref.startsWith("data:"))
            .map(
              async ref =>
                [ref, (await saveUserMediaAsset(ref, ctx.user.id)).url] as const
            )
        )
      );
      if (storedInput.imageUrl)
        storedInput.imageUrl =
          savedReferences.get(storedInput.imageUrl) ?? storedInput.imageUrl;
      if(storedInput.sources)storedInput.sources=storedInput.sources.map(s=>({...s,value:s.kind==="image"?savedReferences.get(s.value)??s.value:s.value}));
      const brand = storedInput.executionBrief?.brandInput;
      if (brand?.referenceImageUrl)
        brand.referenceImageUrl =
          savedReferences.get(brand.referenceImageUrl) ??
          brand.referenceImageUrl;
      if (brand?.logoUrl)
        brand.logoUrl = savedReferences.get(brand.logoUrl) ?? brand.logoUrl;
      try {
        const admitted = await store.admission({
          executorScope,catalogRevision:manifest?.revision,
          ownerId: ctx.user.id,
          idempotencyKey: input.idempotencyKey,
          inputHash,
          input: storedInput,
          experimental: input.includeDraftDesigns,
          deadlineAt: Date.now() + 600000,
        });
        if(executorScope)await enqueueLocal(admitted.record);
        console.info(
          `[trpc:generation.start] 🟢 Pedido admitido com sucesso: ID=${admitted.record.id} (criado=${admitted.created})`
        );
        return {
          snapshot: requestSnapshot(admitted.record),
          created: admitted.created,
        };
      } catch (error) {
        console.error(
          `[trpc:generation.start] 🔴 Erro ao registrar pedido:`,
          error instanceof Error ? error.message : error
        );
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível iniciar a geração";
        if ((error as { code?: string }).code === "PT402")
          throw new TRPCError({
            code: "PAYMENT_REQUIRED",
            message:
              "Sparks insuficientes. Faça upgrade ou adquira uma recarga.",
          });
        if ((error as { code?: string }).code === "PT412")
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Não foi possível validar seu perfil de cobrança. Tente novamente.",
          });
        if (message.toLowerCase().includes("idempotency"))
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta chave já foi utilizada para outro pedido.",
          });
        if (message.toLowerCase().includes("active generation limit"))
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "Aguarde seus pedidos em andamento antes de iniciar outro.",
          });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível registrar a geração persistente.",
          cause: error,
        });
      }
    }),
  get: protectedProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const record = await createGenerationStore().get(
        input.requestId,
        ctx.user.id
      );
      if (!record)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Geração não encontrada.",
        });
      return {
        snapshot: requestSnapshot(record),
        errorReason: record.errorReason,
        sourceWarnings:record.prepared?.imageSourceReading?.reading.uncertainties??[],
        dispatchError:record.dispatchError,
        billingPending:record.billingMode==='reserved'&&!record.billingSettledAt,
        progressTransport:record.executionMode==='local-demand'?'events' as const:'poll' as const,
        input: {
          ...record.input,
          // Transport identity and inline bytes are not needed to reopen the
          // briefing. Owner-scoped private URLs retain normal media protection.
          idempotencyKey: undefined,
          ownerId: undefined,
          imageUrl: record.input.imageUrl?.startsWith("data:")
            ? undefined
            : record.input.imageUrl,
          executionBrief: record.input.executionBrief
            ? {
                ...record.input.executionBrief,
                brandInput: record.input.executionBrief.brandInput
                  ? {
                      ...record.input.executionBrief.brandInput,
                      referenceImageUrl:
                        record.input.executionBrief.brandInput.referenceImageUrl?.startsWith(
                          "data:"
                        )
                          ? undefined
                          : record.input.executionBrief.brandInput
                              .referenceImageUrl,
                      logoUrl:
                        record.input.executionBrief.brandInput.logoUrl?.startsWith(
                          "data:"
                        )
                          ? undefined
                          : record.input.executionBrief.brandInput.logoUrl,
                    }
                  : undefined,
              }
            : undefined,
        },
      };
    }),
  reconcile:protectedProcedure.input(z.object({requestId:z.string().uuid()})).mutation(async({ctx,input})=>{const record=await reconcileGenerationReviews(input.requestId,ctx.user.id);if(record.status==="queued"&&record.executionMode==="local-demand")await enqueueLocal(record);return {snapshot:requestSnapshot(record)};}),
  resume:protectedProcedure.input(z.object({requestId:z.string().uuid()})).mutation(async({ctx,input})=>{
   const record=await createGenerationStore().get(input.requestId,ctx.user.id);
   if(!record)throw new TRPCError({code:'NOT_FOUND'});
   if(record.executionMode!=='local-demand')throw new TRPCError({code:'PRECONDITION_FAILED'});
   await enqueueLocal(record);return {snapshot:requestSnapshot(record)};
  }),
  cancel: protectedProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const record = await createGenerationStore().cancel(
        input.requestId,
        ctx.user.id
      );
      if (!record)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Geração não encontrada.",
        });
      return { snapshot: requestSnapshot(record) };
    }),
});
