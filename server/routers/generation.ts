import { designFrequencyInput, readDesignFrequency } from "../designFrequency";
import { selectionPolicyForNewRequest } from "@shared/selectionPolicy";
import { extractUrlsFromText } from "@shared/creationBrief";
import { requireProfessionalStudio } from "../studioAccess";
import { getBrandProjectById } from "../db";
import { getRealBillingProfile, isUnlimitedPlan } from "../billing";
import { freezeGenerationProject } from "@shared/projectEditorial";
import { reconcileGenerationReviews } from "../ai/workflows/generationReconciliation";
import {arsenalHash} from "@shared/arsenalContent";
import {readCatalogManifest,withCatalogRevision} from "../designCatalog/versionedCatalog";
import {localCatalogRevisionOverride} from "../designCatalog/localCatalogOverride";
import { assertTrialCatalogEditorialReady, trialCatalogRevisionForUser } from "../designCatalog/trialCatalog";
import {enqueueLocal,localExecutorScope} from "../ai/workflows/localDemandSupervisor";
import { readDemandWorkerReadiness } from "../ai/workflows/workerReadiness";
import { ENV } from "../_core/env";
import { GenerationFailureError } from "../_core/generationError";
import { toFailureMetadata } from "@shared/generationFailure";
import { resolveGenerationModelConfig } from "../ai/generationModel";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import {
  STUDIO_SELECTION_STRATEGY,
  orchestratedGenerationInputSchema,
  normalizeExecutionBrief,
} from "@shared/generationRequest";
import { retrieveCompleteDesignCards } from "../designCatalog/completeDesignStore";
import { eligibleCompleteDesignCardsForRequest } from "../ai/workflows/generationPreparation";
import { hasFormatMismatch } from "@shared/formatIntent";
import { pinFixedDesign } from "../ai/workflows/fixedDesignSource";
import { createGenerationStore } from "../ai/workflows/generationStore";
import { saveUserMediaAsset } from "../mediaAssets";
import { resolveProposalMediaReferences } from "../ai/workflows/proposalMedia";
import {
  requestInputHash,
  requestSnapshot,
} from "../ai/workflows/generationRuntime";

type AdmissionPauseReason = "maintenance" | "manual_session_limit" | "pipeline_reconfiguration_required";

async function admissionPauseReason(actor: string): Promise<AdmissionPauseReason | null> {
  if (ENV.generationAdmissionPaused) return "maintenance";
  if (ENV.generationWorkerMode !== "local-demand") return null;
  const guard = (globalThis as typeof globalThis & {
    __acervo82ManualAdmissionReason?: (actor: string) => Promise<AdmissionPauseReason | null>;
  }).__acervo82ManualAdmissionReason;
  return guard ? guard(actor).catch(() => "maintenance") : null;
}

function admissionPaused(reason: AdmissionPauseReason) {
  const failure = toFailureMetadata({ generationRunId: "not-admitted", reason: "generation_paused" });
  if (reason === "manual_session_limit") {
    failure.userMessage = "A sessão de testes manuais atingiu seu limite. Nenhum Spark foi reservado.";
  } else if (reason === "pipeline_reconfiguration_required") {
    failure.userMessage = "O serviço local de geração precisa ser reiniciado após uma atualização. Seu briefing foi preservado.";
  }
  return new GenerationFailureError({ code: "PRECONDITION_FAILED", failure });
}

async function artworkCarouselPrice(user: { id: string; email?: string | null }) {
  const profile = await getRealBillingProfile(user.email ?? "", user.id);
  if (isUnlimitedPlan(profile.plan)) return 0;
  const price = ENV.artworkCarouselSparks;
  return Number.isInteger(price) && price > 0 && price <= 99_999 ? price : null;
}

export const generationRouter = router({
  designFrequency: adminProcedure.input(designFrequencyInput).query(({ input }) => readDesignFrequency(input)),
  debugger: adminProcedure.input(z.object({ requestId: z.string().uuid(), ownerId: z.string().uuid() })).query(async ({ ctx, input }) => {
    if (input.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
    const { readStudioDebugger } = await import("../studioDebugger");
    return readStudioDebugger(input.requestId, ctx.user.id);
  }),
  artworkCarouselQuote: protectedProcedure.query(async ({ ctx }) => {
    if (!ENV.openRouterApiKey || await admissionPauseReason(ctx.user.id))
      return { status: "unavailable" as const };
    const [workerReady, databaseReady] = await Promise.all([
      ENV.generationWorkerMode === "local-demand"
        ? ENV.localDemandEnabled
        : readDemandWorkerReadiness().then(worker => worker?.supportsArtworkCarousel === true),
      createGenerationStore().isArtworkCarouselAvailable?.(),
    ]);
    if (!workerReady || !databaseReady) return { status: "unavailable" as const };
    const sparks = await artworkCarouselPrice(ctx.user);
    return sparks === null ? { status: "price_pending" as const } : { status: "ready" as const, sparks };
  }),
  capabilities: protectedProcedure.query(async ({ ctx }) => {
    const configured=Boolean(ENV.openRouterApiKey&&ENV.openRouterProposalReviewModel&&ENV.openRouterVisionModel);
    const supported={platforms:["instagram","twitter","linkedin","facebook"] as const,inputTypes:configured?["text","url","image"] as const:[],brandCapture:ENV.aiSiteIntelligenceEnabled};
    const paused = await admissionPauseReason(ctx.user.id);
    if (paused) {
      return {
        ...supported, ownerId: ctx.user.id, selectable: true, enabled: false,
        contractVersion: 6 as const, reason: paused,
        ...(ENV.generationWorkerMode === "local-demand" ? { progressTransport: "events" as const } : {}),
      };
    }
    if(!configured)return {...supported,ownerId:ctx.user.id,selectable:true,enabled:false,contractVersion:6 as const,reason:"provider_configuration_required"};
    const identityStore = createGenerationStore();
    const identityReady = async () => Boolean(await identityStore.isIdentityAvailable?.().catch(() => false)) &&
      (ENV.generationWorkerMode === "local-demand" ? ENV.localDemandEnabled : await identityStore.isAvailable().catch(() => false));
    if(ENV.generationWorkerMode==='local-demand') {
      const base={...supported,ownerId:ctx.user.id,selectable:true,contractVersion:6 as const,progressTransport:'events' as const};
      if(!ENV.localDemandEnabled)return {...base,enabled:false,reason:'local_activation_required'};
      try{await (await import('../ai/workflows/proposalRenderer')).assertReviewRendererConfigured();}catch{return {...base,enabled:false,reason:'renderer_configuration_required'};}
      const identityEnabled = await identityReady();
      try {
        const manifest = await readCatalogManifest(localCatalogRevisionOverride());
        const catalogScope = ctx.user.role === "admin" ? "experimental" as const : "approved" as const;
        const counts = manifest.summary[catalogScope];
        const catalogCount = counts.staticOfferCount + counts.carouselOfferCount;
        return { ...base, identityEnabled, ...counts, catalogRevision: manifest.revision, catalogScope,
          catalogProject: arsenalHash(ENV.supabaseUrl), catalogCount, enabled: catalogCount > 0,
          reason: catalogCount > 0 ? "ready" : "catalogue_required" };
      }
      catch{return {...base,identityEnabled,enabled:false,reason:'catalog_publication_required'};}
    }
    try {
      const trialRevision = trialCatalogRevisionForUser(ctx.user);
      if (trialRevision) await assertTrialCatalogEditorialReady(trialRevision);
      const [worker, manifest] = await Promise.all([
        readDemandWorkerReadiness(),
        readCatalogManifest(trialRevision),
      ]);
      const available = worker?.supportsEditorialSelection === true;
      // Publication owns the advisory counts (including V3 repertoires).
      // start still checks the exact request against this pinned revision.
      const scope = ctx.user.role === "admin" ? "experimental" : "approved";
      const { staticOfferCount, carouselOfferCount } = manifest.summary[scope];
      const catalogCount=staticOfferCount+carouselOfferCount;
      return {
        ...supported,ownerId: ctx.user.id,
        ...(trialRevision ? { catalogRevision: manifest.revision, catalogScope: scope, catalogProject: arsenalHash(ENV.supabaseUrl) } : {}),
        selectable: true,
        enabled: available && catalogCount > 0,
        identityEnabled: await identityReady(),
        catalogCount,staticOfferCount,carouselOfferCount,
        contractVersion: 6 as const,
        reason: !available
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
        identityEnabled: await identityReady(),
        contractVersion: 6 as const,
        reason: "catalog_publication_required",
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
      // The technical policy is server-pinned for both Studio routes.
      const { selectionPolicy: _clientPolicy, ...requestInput } = input;
      input = requestInput;
      const readsWebsite = input.inputType === "url" || Boolean(input.siteIntelligenceId) ||
        Boolean(input.executionBrief?.brandInput?.websiteUrl) ||
        input.sources?.some(source => source.kind === "url") ||
        (input.inputType === "text" && (extractUrlsFromText(input.content).length > 0 || /https?:\/\/[^\s<>]+/.test(input.content)));
      if (ctx.user.access === "start") {
        if (input.inputType !== "text" || input.imageUrl || input.fixedDesign || input.generationParentRequestId ||
            input.siteIntelligenceId || input.sources?.length ||
            input.executionBrief?.brandInput?.referenceImageUrl) {
          throw new TRPCError({ code: "FORBIDDEN", message: "O START inclui um briefing em texto e uma rodada de propostas." });
        }
        input = { ...input, allowAiImages: false, includeDraftDesigns: false, model: undefined, generationModel: undefined };
      }
      if (readsWebsite) await requireProfessionalStudio(ctx.user, "A extração de URL");
      console.info(
        `[trpc:generation.start] 📩 Requisição recebida | user=${ctx.user.id.slice(0, 8)}... | modo=${input.postMode} | ratio=${input.aspectRatio ?? "auto"} | rota=${input.postMode === "carousel" ? "carousel_generation" : "static_generation"} | ${(input.generationModel ?? "auto") === "auto" ? "escolha=auto" : "modelo_configurado=" + resolveGenerationModelConfig(input).model}`
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
      const paused = await admissionPauseReason(ctx.user.id);
      if (paused) throw admissionPaused(paused);
      if (input.fixedDesign && !(await store.isFixedDesignAvailable?.()))
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A geração com design escolhido ainda está indisponível. Nenhum Spark foi reservado." });
      if (input.fixedDesign?.kind === "identity" && !(await store.isIdentityAvailable?.()))
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A criação com identidade visual ainda não está disponível neste ambiente. Nenhum Spark foi reservado." });
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
      if (input.fixedDesign && input.fixedDesign.kind !== "identity" && references.length)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Este modo preenche os textos da peça salva. Retire os anexos de imagem para continuar." });
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
      const worker = ENV.generationWorkerMode === "local-demand"
        ? (ENV.localDemandEnabled ? { supportsTextRecovery: true, supportsFinalFitRepair: true, supportsTrioDelivery: true as const, supportsEditorialTeam: true as const, supportsEditorialSelection: true as const, supportsArtworkCarousel: true as const } : null)
        : await readDemandWorkerReadiness();
      if (!worker)
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
      if (input.artworkCarousel) {
        if (!worker.supportsArtworkCarousel || !(await store.isArtworkCarouselAvailable?.()))
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A criação de slides para esta arte está indisponível." });
        const currentPrice = await artworkCarouselPrice(ctx.user);
        if (currentPrice === null || currentPrice !== input.artworkCarousel.confirmedSparks)
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Confira o custo atual em Sparks na revisão do briefing antes de gerar." });
      }
      const parent = input.generationParentRequestId
        ? await store.get(input.generationParentRequestId, ctx.user.id)
        : null;
      if (input.generationParentRequestId && !parent)
        throw new TRPCError({ code: "NOT_FOUND", message: "A geração de origem não foi encontrada nesta conta." });
      if (parent?.input.artworkCarousel)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Revise e confirme um novo briefing para criar outra versão deste carrossel." });
      const selectionStrategy = parent ? parent.input.selectionStrategy : STUDIO_SELECTION_STRATEGY;
      if (selectionStrategy && !input.fixedDesign && !worker.supportsEditorialSelection)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "O executor precisa ser atualizado para a seleção editorial do Studio. Nenhum Spark foi reservado.",
        });
      if (parent?.generationConfig?.editorialTeam && !worker.supportsEditorialTeam)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O executor precisa suportar a equipe editorial desta geração." });
      if ((parent?.generationConfig?.textRecoveryVersion && !worker.supportsTextRecovery) ||
          (parent?.generationConfig?.finalFitRepairVersion && !worker.supportsFinalFitRepair) ||
          (parent?.generationConfig?.trioDeliveryVersion && !worker.supportsTrioDelivery))
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O executor disponível ainda não suporta a versão de ajuste de texto desta geração. Seu briefing foi preservado." });
      const generationConfig = parent?.generationConfig ?? resolveGenerationModelConfig(
        input, worker.supportsTextRecovery, worker.supportsFinalFitRepair === true, worker.supportsTrioDelivery === true,
        !parent && worker.supportsEditorialTeam === true && process.env.POSTSPARK_EDITORIAL_TEAM !== "legacy",
      );
      if (selectionStrategy && !input.fixedDesign && generationConfig.generationStrategyVersion !== 2)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A seleção editorial do Studio requer a versão atual do motor. Nenhum Spark foi reservado.",
        });
      const selectionPolicy = parent ? (parent.input.selectionPolicy ?? "legacy")
        : selectionPolicyForNewRequest(process.env.POSTSPARK_SELECTION_POLICY);
      // Hash the submitted request for idempotency. Store the effective strategy for execution and continuations.
      const policyInput = { ...input, selectionPolicy, selectionStrategy };
      if (generationConfig.preparationBudget && store.isPreparationAvailable && !(await store.isPreparationAvailable()))
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A preparação de geração está em atualização. Nenhum Spark foi reservado." });
      if (generationConfig.taskRouting && (!store.isTaskRoutingAvailable || !(await store.isTaskRoutingAvailable())))
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A geração automática está em atualização. Nenhum Spark foi reservado." });
      if (generationConfig.taskRouting && (!store.isReviewExceptionsAvailable || !(await store.isReviewExceptionsAvailable())))
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A revisão de geração está em atualização. Nenhum Spark foi reservado." });
      if (parent?.generationConfig && input.generationModel && input.generationModel !== parent.generationConfig.choice)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Gerar mais mantém o modelo do pedido anterior. Inicie uma nova criação para trocar." });
      const trialRevision = input.fixedDesign?.kind === "identity" ? undefined : trialCatalogRevisionForUser(ctx.user);
      if (trialRevision && !input.includeDraftDesigns)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O catálogo de ensaio requer a opção de composições experimentais." });
      if (trialRevision) {
        try { await assertTrialCatalogEditorialReady(trialRevision); }
        catch (cause) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O catálogo editorial do ensaio ainda precisa ser publicado. Nenhum Spark foi reservado.", cause }); }
      }
      const catalogOverride=input.fixedDesign?.kind === "identity" ? undefined : trialRevision ?? localCatalogRevisionOverride();
      const manifest=input.fixedDesign?.kind === "identity" ? undefined : await readCatalogManifest(catalogOverride);
      const executorScope=ENV.localDemandEnabled?await localExecutorScope():undefined;
      // General capability counts are advisory. Admission checks the exact same
      // authored revisions, format, roles, brand and media requirements as preparation.
      if (!input.fixedDesign) try {
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
          brandColors: generationConfig.taskRouting ? undefined : brief?.brandInput?.brandColors,
          brandFonts: !generationConfig.taskRouting && brief?.brandInput?.fontHint
            ? [brief.brandInput.fontHint]
            : [],
        });
        const cards=await (manifest?withCatalogRevision(manifest.revision,loadCards):loadCards());
        if (!eligibleCompleteDesignCardsForRequest(cards, policyInput, generationConfig.generationStrategyVersion, Boolean(generationConfig.taskRouting)).length)
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
      const storedInput: typeof input & { pinnedDesign?: Awaited<ReturnType<typeof pinFixedDesign>> } = structuredClone(policyInput);
      const frozenParent = parent?.input.projectId === input.projectId && parent?.input.projectSnapshot;
      const requestsExtractedIdentity = input.projectSnapshot?.version === 3 && input.projectSnapshot.visualIdentity.extractedFrom;
      if (frozenParent) {
        storedInput.projectSnapshot = frozenParent;
      } else if (input.projectId) {
        const project = await getBrandProjectById(input.projectId, ctx.user.id);
        const needsSnapshot = !input.projectDossier && !input.projectSnapshot;
        if (!project && (needsSnapshot || requestsExtractedIdentity))
          throw new TRPCError({ code: "NOT_FOUND", message: "Projeto indisponível nesta conta." });
        if (project && (needsSnapshot || project.visual_identity?.extractedFrom || requestsExtractedIdentity)) {
          storedInput.projectDossier = project.compiled_document;
          storedInput.projectSnapshot = freezeGenerationProject({ name: project.name, niche: project.niche,
            compiledDocument: project.compiled_document, structuredData: project.structured_data, capture: project.capture,
            visualPreferences: project.visual_preferences, visualIdentity: project.visual_identity });
        }
      } else if (requestsExtractedIdentity) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione o projeto da identidade visual." });
      }
      if (input.fixedDesign) {
        const previous = parent?.input.pinnedDesign;
        if (parent?.input.fixedDesign && parent.input.projectId === input.projectId && previous &&
          arsenalHash(parent.input.fixedDesign) === arsenalHash(input.fixedDesign) &&
          parent.input.aspectRatio === input.aspectRatio && parent.input.postMode === input.postMode &&
          parent.input.slideCount === input.slideCount) {
          storedInput.pinnedDesign = previous;
        } else {
          storedInput.pinnedDesign = await pinFixedDesign(storedInput, ctx.user.id);
        }
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
          generationConfig,
          executorScope,catalogRevision:manifest?.revision,
          stagedCatalog: Boolean(catalogOverride) && !trialRevision,
          trialCatalog: Boolean(trialRevision),
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
        if (message.includes("start_round_already_used"))
          throw new TRPCError({ code: "PAYMENT_REQUIRED", message: "Sua rodada START já foi usada. Escolha uma assinatura para criar outra peça." });
        if (message.includes("acervo82_session_budget_exhausted")) throw admissionPaused("manual_session_limit");
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
  progress: protectedProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const progress = await createGenerationStore().progress!(input.requestId, ctx.user.id);
      if (!progress) throw new TRPCError({ code: "NOT_FOUND", message: "Geração não encontrada." });
      return progress;
    }),
  get: protectedProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const store = createGenerationStore();
      const record = await (store.getForClient ?? store.get)(input.requestId, ctx.user.id);
      if (!record)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Geração não encontrada.",
        });
      return {
        snapshot: requestSnapshot(record),
        requestStatus: record.status,
        generationConfig: record.generationConfig,
        errorReason: record.errorReason,
        sourceWarnings:record.prepared?.imageSourceReading?.reading.uncertainties??[],
        dispatchError:record.dispatchError,
        billingPending:record.billingMode==='reserved'&&!record.billingSettledAt,
        progressTransport:record.executionMode==='local-demand'?'events' as const:'poll' as const,
        input: {
          ...record.input,
          pinnedDesign: undefined,
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
