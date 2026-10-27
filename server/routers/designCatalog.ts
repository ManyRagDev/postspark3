import {readCatalogManifest,versionedCatalogEnabled} from "../designCatalog/versionedCatalog";
import { resolveCompleteDesignOffers } from "@shared/completeDesignOffers";
import { z } from "zod";
import { componentDefinitionV1Schema, assemblyVariationBundleV1Schema } from "../../shared/componentAssembly";
import { completeDesignVariationV1Schema } from "../../shared/completeDesignGeneration";
import { prepareComponentDraft, listComponents, componentReviewContext, hydrateComponents, reviewComponent, publishComponent } from "../designCatalog/componentStore";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  catalogBlueprintSchema,
  catalogCompilationSchema,
} from "@shared/designCatalog";
import { getDb, getGenerationRunById } from "../db";
import {
  catalogError,
  changeCatalogStatus,
  getCatalogVersion,
  listCatalog,
  saveCatalogDraft,
} from "../designCatalog/store";
import { traceCatalog } from "../designCatalog/trace";
import { arsenalCompilationReportSchema } from "@shared/arsenalGeneration";
import { catalogBundleV2Schema } from "@shared/designArsenal";
import { retrieveCompleteDesignCards } from "../designCatalog/completeDesignStore";
import { ENV } from "../_core/env";
import { retrieveArsenalForGeneration } from "../designCatalog/arsenalRetrieval";
import { arsenalImportSchema } from "@shared/arsenalCatalog";
import {
  prepareArsenalDraft,
  getArsenalVersion,
  hydrateArsenalCandidates,
  reviewArsenalVariant,
  publishArsenalVersion,
} from "../designCatalog/arsenalStore";
import {
  resolveArsenalAssetUrls,
  uploadArsenalAsset,
  requestArsenalAssetUpload,
  finalizeArsenalAssetUpload,
} from "../designCatalog/arsenalAssets";

import { studioPreferencesSchema } from "../../shared/studioPreferences";
import { readStudioPreferences, writeStudioPreferences, forgetStudioPreferences, preferDeliveredDirection } from "../designCatalog/studioPreferences";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const reportRates = new Map<string, { window: number; count: number }>();
function checkReportRate(actor: string, limit=30) {
  const now = Date.now(),
    r = reportRates.get(actor);
  if (r && now - r.window < 60_000) {
    if (r.count >= limit)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Muitos relatos de materialização",
      });
    r.count++;
  } else reportRates.set(actor, { window: now, count: 1 });
  if (reportRates.size > 5000)
    for (const [key, v] of Array.from(reportRates.entries()))
      if (now - v.window > 60_000) reportRates.delete(key);
}

export const designCatalogRouter = router({
  getStudioPreferences: protectedProcedure.query(({ctx})=>readStudioPreferences(ctx.user.id)),
  saveStudioPreferences: protectedProcedure.input(studioPreferencesSchema).mutation(({input,ctx})=>writeStudioPreferences(ctx.user.id,input)),
  forgetStudioPreferences: protectedProcedure.mutation(({ctx})=>forgetStudioPreferences(ctx.user.id)),
  preferDeliveredDirection: protectedProcedure.input(z.object({runId:z.string().uuid(),slot:z.number().int().min(0).max(2)}).strict()).mutation(({input,ctx})=>preferDeliveredDirection(ctx.user.id,input.runId,input.slot)),
  prepareComponentDraft: adminProcedure.input(componentDefinitionV1Schema).mutation(({input,ctx})=>prepareComponentDraft(input,ctx.user.id)),
  listComponents: adminProcedure.input(z.object({offset:z.number().int().min(0).max(100000).default(0),includeArchived:z.boolean().default(false),kind:z.enum(["content","background","media","ornament","typography"]).optional(),status:z.enum(["draft","approved","archived"]).optional(),search:z.string().max(120).optional()}).strict()).query(({input})=>listComponents(input.offset,input.includeArchived,input)),
  previewComponentContext: adminProcedure.input(z.object({id:z.string().uuid()}).strict()).query(({input})=>componentReviewContext(input.id)),
  previewComponent: adminProcedure.input(z.object({id:z.string().uuid()}).strict()).query(async({input})=>(await hydrateComponents([input.id],true))[0]),
  reviewComponent: adminProcedure.input(z.object({id:z.string().uuid(),hash:sha,pngHash:sha,briefingHash:sha,decision:z.enum(["approved","rejected"]),notes:z.string().max(1000)}).strict()).mutation(({input,ctx})=>reviewComponent(input,ctx.user.id)),
  publishComponent: adminProcedure.input(z.object({id:z.string().uuid(),status:z.enum(["approved","archived"])}).strict()).mutation(({input})=>publishComponent(input.id,input.status)),
  reportComponentCompilation: protectedProcedure.input(z.object({runId:z.string().uuid(),slot:z.number().int().min(0).max(2),slideId:z.string().max(120),report:arsenalCompilationReportSchema}).strict()).mutation(async({input,ctx})=>{
    checkReportRate(`${ctx.user.id}:components`,120);
    if(JSON.stringify(input.report).length>16384)throw new TRPCError({code:"PAYLOAD_TOO_LARGE",message:"Relatório de slide excede os limites"});
    const run=await getGenerationRunById(input.runId,ctx.user.id),output=run?.output_snapshot;
    const variation=Array.isArray(output)?output.find((v:any)=>v?.completeDesignV1?.slot===input.slot)??output[input.slot]:undefined;
    const complete=completeDesignVariationV1Schema.safeParse(variation&&typeof variation==="object"&&!Array.isArray(variation)?variation.completeDesignV1:undefined);
    if(complete.success){
      const slide=complete.data.slides.find(s=>s.id===input.slideId),report=input.report;
      if(!slide||complete.data.runId!==input.runId||complete.data.slot!==input.slot||report.runId!==input.runId||report.traceId!==complete.data.traceId||report.slot!==input.slot||report.userContentHash!==slide.composition.userContentHash)throw new TRPCError({code:"BAD_REQUEST",message:"Slide não oferecido nesta geração"});
      const candidateId=slide.composition.origin.candidateId;
      if([report.selectedCandidateId,...report.attempts.map(a=>a.candidateId)].some(id=>id!==null&&id!==candidateId))throw new TRPCError({code:"BAD_REQUEST",message:"Candidato não oferecido no slide"});
      return {persisted:await traceCatalog(input.runId,ctx.user.id,"complete_design.compile","completed",{...input,source:"client_report"},`complete-design-compile:${input.slot}:${input.slideId}:${report.materializationId}`)};
    }
    const parsed=assemblyVariationBundleV1Schema.safeParse(variation&&typeof variation==="object"&&!Array.isArray(variation)?variation.componentAssemblyV1:undefined);
    const slide=parsed.success?parsed.data.slides.find(s=>s.id===input.slideId):undefined;
    if(!parsed.success||!slide||parsed.data.runId!==input.runId||input.report.runId!==input.runId||input.report.traceId!==slide.bundle.traceId||input.report.slot!==input.slot||input.report.userContentHash!==slide.bundle.userContentHash)throw new TRPCError({code:"BAD_REQUEST",message:"Slide não oferecido nesta geração"});
    const ids=slide.bundle.candidates.map(c=>c.candidateId);
    if([input.report.selectedCandidateId,...input.report.attempts.map(a=>a.candidateId)].some(id=>id!==null&&!ids.includes(id)))throw new TRPCError({code:"BAD_REQUEST",message:"Candidato não oferecido no slide"});
    return {persisted:await traceCatalog(input.runId,ctx.user.id,"component.compile",input.report.selectedCandidateId?"completed":"fallback",{...input,source:"client_report"},`component-compile:${input.slot}:${input.slideId}:${input.report.materializationId}`)};
  }),
  resolveArsenalAssets: protectedProcedure
    .input(z.object({ ids: z.array(z.string().max(160)).max(60) }).strict())
    .query(({ input, ctx }) =>
      resolveArsenalAssetUrls(input.ids, ctx.user.id, ctx.user.role === "admin")
    ),
  uploadArsenalAsset: adminProcedure
    .input(
      z
        .object({
          base64: z.string().max(4 * 1024 * 1024),
          license: z.string().max(1000).optional(),
          weight: z.number().int().min(100).max(900).optional(),
        })
        .strict()
    )
    .mutation(({ input, ctx }) =>
      uploadArsenalAsset(
        Buffer.from(input.base64, "base64"),
        input,
        ctx.user.id
      )
    ),
  requestArsenalAssetUpload: adminProcedure
    .input(z.object({ sha256: sha }).strict())
    .mutation(({ input }) => requestArsenalAssetUpload(input.sha256)),
  finalizeArsenalAssetUpload: adminProcedure
    .input(
      z
        .object({
          sha256: sha,
          license: z.string().max(1000).optional(),
          weight: z.number().int().min(100).max(900).optional(),
        })
        .strict()
    )
    .mutation(({ input, ctx }) =>
      finalizeArsenalAssetUpload(input.sha256, input, ctx.user.id)
    ),
  prepareArsenalDraft: adminProcedure
    .input(arsenalImportSchema)
    .mutation(({ input, ctx }) => prepareArsenalDraft(input, ctx.user.id)),
  listArsenal: adminProcedure
    .input(
      z
        .object({ offset: z.number().int().min(0).max(100000).default(0) })
        .strict()
    )
    .query(async ({ input }) => {
      const r = await getDb()
        .from("design_catalog_versions")
        .select(
          "id,blueprint_id,version,status,content_hash,definition,created_at",
          { count: "exact" }
        )
        .eq("definition->>schemaVersion", "2")
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + 49);
      if (r.error) throw r.error;
      const ids = (r.data ?? []).map((v: { id: string }) => v.id);
      const [index, evidence, assets] = ids.length
        ? await Promise.all([
            getDb()
              .from("design_catalog_search_documents")
              .select("version_id,variant_key,variant_hash,metric_hash")
              .in("version_id", ids),
            getDb()
              .from("design_catalog_evidence")
              .select("version_id,variant_key,kind,decision,source,created_at")
              .in("version_id", ids)
              .order("created_at", { ascending: false }),
            getDb()
              .from("design_catalog_version_assets")
              .select("version_id,asset_id")
              .in("version_id", ids),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ];
      if (index.error || evidence.error || assets.error)
        throw new Error("Pendências do catálogo indisponíveis");
      return {
        total: r.count ?? 0,
        entries: r.data as Array<{
          id: string;
          blueprint_id: string;
          version: number;
          status: string;
          content_hash: string;
          definition: unknown;
          created_at: string;
        }>,
        index: (index.data ?? []) as Array<{
          version_id: string;
          variant_key: string;
          variant_hash: string;
          metric_hash: string;
        }>,
        evidence: (evidence.data ?? []) as Array<{
          version_id: string;
          variant_key: string;
          kind: string;
          decision: string;
          source: string;
          created_at: string;
        }>,
        assets: (assets.data ?? []) as Array<{
          version_id: string;
          asset_id: string;
        }>,
      };
    }),
  previewArsenal: adminProcedure
    .input(
      z
        .object({
          versionId: z.string().uuid(),
          variantKey: z.string().max(160),
        })
        .strict()
    )
    .query(async ({ input }) => {
      return (
        (
          await hydrateArsenalCandidates(
            [`${input.versionId}:${input.variantKey}`],
            AbortSignal.timeout(8000),
            false
          )
        )[0] ?? null
      );
    }),
  reviewArsenal: adminProcedure
    .input(
      z
        .object({
          versionId: z.string().uuid(),
          variantKey: z.string().max(160),
          definitionHash: sha,
          variantHash: sha,
          pngHash: sha,
          briefingHash: sha,
          decision: z.enum(["approved", "rejected"]),
          notes: z.string().max(1000),
        })
        .strict()
    )
    .mutation(({ input, ctx }) => reviewArsenalVariant(input, ctx.user.id)),
  publishArsenal: adminProcedure
    .input(
      z
        .object({
          versionId: z.string().uuid(),
          status: z.enum(["approved", "archived"]),
        })
        .strict()
    )
    .mutation(({ input, ctx }) =>
      publishArsenalVersion(input.versionId, ctx.user.id, input.status)
    ),
  resolveArsenalVariant: protectedProcedure
    .input(
      z
        .object({
          versionId: z.string().uuid(),
          aspectRatio: z.enum(["1:1", "4:5", "5:6", "9:16"]),
        })
        .strict()
    )
    .mutation(async ({ input, ctx }) => {
      const grant = await getDb()
        .from("design_catalog_version_grants")
        .select("definition_hash")
        .eq("user_uuid", ctx.user.id)
        .eq("version_id", input.versionId)
        .maybeSingle();
      if (grant.error || !grant.data)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Esta versão não pertence aos seus posts",
        });
      const entry = await getArsenalVersion(input.versionId);
      if (entry.content_hash !== grant.data.definition_hash)
        throw new Error("Versão divergente do grant");
      const variant = entry.definition.variants.find(
        (v: any) => v.aspectRatio === input.aspectRatio
      );
      if (!variant) return null;
      const offer = (
        await hydrateArsenalCandidates(
          [`${entry.id}:${variant.variantKey}`],
          AbortSignal.timeout(8000),
          false
        )
      )[0];
      if (!offer) return null;
      // Assets are linked to this already-authorized immutable version, even archived.
      const links = await getDb()
        .from("design_catalog_version_assets")
        .select("asset_id")
        .eq("version_id", entry.id)
        .in(
          "asset_id",
          offer.assets.map(a => a.id)
        );
      if (
        links.error ||
        offer.assets.some(
          a => !links.data?.some((l: any) => l.asset_id === a.id)
        )
      )
        throw new Error("Links de assets incompletos");
      if (offer.assets.length) {
        const g = await getDb()
          .from("design_catalog_asset_grants")
          .upsert(
            offer.assets.map(a => ({
              user_uuid: ctx.user.id,
              asset_id: a.id,
              granted_version_id: entry.id,
            })),
            { onConflict: "user_uuid,asset_id", ignoreDuplicates: true }
          );
        if (g.error) throw g.error;
      }
      return offer;
    }),
  generationReadiness: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") return null;
    if(versionedCatalogEnabled()) {
      const m=await readCatalogManifest();
      return {mode:ENV.componentArsenalMode,reason:'ready' as const,candidateCount:m.summary.approved.staticOfferCount,draftCandidateCount:m.summary.experimental.staticOfferCount,carouselCandidateCount:m.summary.approved.carouselOfferCount,draftCarouselCandidateCount:m.summary.experimental.carouselOfferCount,durationMs:0,pipeline:'complete-designs' as const};
    }
    const started=Date.now();
    if(ENV.componentArsenalMode==="off")return {mode:"off" as const,reason:"disabled" as const,candidateCount:0,draftCandidateCount:0,durationMs:0,pipeline:"complete-designs" as const};
    try{
      const query={aspectRatio:"4:5",postMode:"carousel" as const,text:"",slideCount:3};
      const [approved,preview]=await Promise.all([retrieveCompleteDesignCards({...query,experimental:false}),retrieveCompleteDesignCards({...query,experimental:true})]);
      const normalStatic=resolveCompleteDesignOffers(approved,{slideCount:1,contentMode:"compose"}).length, previewStatic=resolveCompleteDesignOffers(preview,{slideCount:1,contentMode:"compose"}).length;
      const normalCarousel=resolveCompleteDesignOffers(approved,{slideCount:3,contentMode:"compose"}).length, previewCarousel=resolveCompleteDesignOffers(preview,{slideCount:3,contentMode:"compose"}).length;
      return {mode:ENV.componentArsenalMode,carouselCandidateCount:normalCarousel,draftCarouselCandidateCount:previewCarousel,reason:normalStatic?"ready" as const:"no_eligible_candidate" as const,candidateCount:normalStatic,draftCandidateCount:previewStatic,durationMs:Date.now()-started,pipeline:"complete-designs" as const};
    }catch{return {mode:ENV.componentArsenalMode,reason:"catalog_unavailable" as const,candidateCount:0,draftCandidateCount:0,durationMs:Date.now()-started,pipeline:"complete-designs" as const};}
  }),
  reportArsenalCompilation: protectedProcedure
    .input(arsenalCompilationReportSchema)
    .mutation(async ({ input, ctx }) => {
      checkReportRate(ctx.user.id);
      if (
        input.traceId !== input.runId ||
        Buffer.byteLength(JSON.stringify(input), "utf8") > 8192
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Relatório V2 inválido.",
        });
      const run = await getGenerationRunById(input.runId, ctx.user.id);
      if (!run)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Geração não encontrada.",
        });
      const output = run.output_snapshot;
      const raw = Array.isArray(output) ? output[input.slot] : undefined;
      const parsed = catalogBundleV2Schema.safeParse(
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? raw.catalogSelectionV2
          : undefined
      );
      if (
        !parsed.success ||
        parsed.data.userContentHash !== input.userContentHash ||
        parsed.data.runId !== input.runId ||
        parsed.data.slot !== input.slot
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Composição não oferecida nesta geração.",
        });
      const offered = parsed.data.candidates;
      if (
        [
          input.selectedCandidateId,
          ...input.attempts.map(a => a.candidateId),
        ].some(id => id !== null && !offered.some(c => c.candidateId === id)) ||
        ["applied", "adapted"].includes(input.status) !==
          (input.selectedCandidateId !== null)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Candidato não pertence ao bundle desta geração.",
        });
      const selected = offered.find(
        c => c.candidateId === input.selectedCandidateId
      );
      for (const [attemptIndex, attempt] of Array.from(
        input.attempts.entries()
      )) {
        const candidate = offered.find(
          c => c.candidateId === attempt.candidateId
        )!;
        const { variant, ...pinned } = candidate;
        await traceCatalog(
          input.traceId,
          ctx.user.id,
          "catalog.attempt",
          attempt.reasons.length ? "rejected" : "completed",
          {
            ...attempt,
            ...pinned,
            attemptIndex,
            slot: input.slot,
            materializationId: input.materializationId,
            assetIds: variant.assetIds,
            aspectRatio: variant.aspectRatio,
            userContentHash: input.userContentHash,
            source: "client_report",
          },
          `attempt-v2:${input.slot}:${input.materializationId}:${attemptIndex}`
        );
      }
      const { variant: _variant, ...identity } = selected ?? {};
      const persisted = await traceCatalog(
        input.traceId,
        ctx.user.id,
        "catalog.compile.v2",
        input.selectedCandidateId ? "completed" : "fallback",
        {
          ...input,
          ...identity,
          source: "client_report",
        },
        `compile-v2:${input.slot}:${input.materializationId}`
      );
      return { persisted };
    }),
  list: adminProcedure
    .input(z.object({ offset: z.number().int().min(0).max(100000).default(0) }))
    .query(({ input }) => listCatalog(false, input.offset)),
  saveDraft: adminProcedure
    .input(
      z
        .object({
          definition: catalogBlueprintSchema,
          blueprintId: z.string().uuid().optional(),
        })
        .strict()
    )
    .mutation(({ input, ctx }) =>
      saveCatalogDraft(input.definition, ctx.user.id, input.blueprintId)
    ),
  setStatus: adminProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
          status: z.enum(["approved", "archived"]),
        })
        .strict()
    )
    .mutation(({ input, ctx }) =>
      changeCatalogStatus(input.id, input.status, ctx.user.id)
    ),
  events: adminProcedure
    .input(z.object({ traceId: z.string().uuid().optional() }).strict())
    .query(async ({ input }) => {
      let query = getDb()
        .from("design_catalog_events")
        .select("id,trace_id,stage,status,data,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (input.traceId) query = query.eq("trace_id", input.traceId);
      const { data, error } = await query;
      if (error) throw catalogError(error);
      return data as Array<{
        id: string;
        trace_id: string;
        stage: string;
        status: string;
        data: unknown;
        created_at: string;
      }>;
    }),
  reportCompilation: protectedProcedure
    .input(
      z
        .object({
          report: catalogCompilationSchema,
          slot: z.number().int().min(0).max(10000),
          durationMs: z.number().min(0).max(300000),
        })
        .strict()
    )
    .mutation(async ({ input, ctx }) => {
      const run = await getGenerationRunById(input.report.traceId, ctx.user.id);
      if (!run)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Geração não encontrada.",
        });
      const { data: selectionEvent, error } = await getDb()
        .from("design_catalog_events")
        .select("id")
        .eq("trace_id", input.report.traceId)
        .eq("actor_id", ctx.user.id)
        .eq("stage", "catalog.select")
        .contains("data", {
          versionId: input.report.versionId,
          slot: input.slot,
        })
        .limit(1);
      if (error) throw catalogError(error);
      if (!selectionEvent?.length)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Blueprint não selecionado nesta geração.",
        });
      const version = await getCatalogVersion(input.report.versionId);
      if (
        version.contentHash !== input.report.contentHash ||
        version.blueprintId !== input.report.blueprintId ||
        version.version !== input.report.version
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Versão de compilação divergente.",
        });
      const persisted = await traceCatalog(
        input.report.traceId,
        ctx.user.id,
        "catalog.compile",
        input.report.status === "fallback" ? "fallback" : "completed",
        {
          ...input.report,
          slot: input.slot,
          durationMs: input.durationMs,
          source: "client_report",
        }
      );
      return { persisted };
    }),
});
