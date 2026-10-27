import {readLocalDiagnosticRecords} from "../../server/ai/localDiagnostics";
/** Deterministic replay of the recorded 97e1 assembly pins; no model/image/billing calls. */
import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "../../server/db";
import { createComponentTextMeasurer, loadComponentFontBytes } from "../../server/ai/componentTextMeasurer";
import { prepareGenerationPlan } from "../../server/ai/generationPipeline";
import { generateComponentAssemblyPostVariations, type ComponentAssemblyOrchestratorInput, type ComponentAssemblyOrchestratorDeps } from "../../server/ai/componentAssemblyOrchestrator";
import { retrieveComponentCardsForGeneration } from "../../server/designCatalog/componentStore";
import type { InvokeResult } from "../../server/_core/llm";
import {
  assemblyIdentity,
  componentDefinitionV1Schema,
  componentHash,
  materializeAssemblySlide,
  compositionFromAssemblyBundle,
  type AssemblyPlanV1,
  type ComponentCardV1,
  type ComponentDefinitionV1,
} from "../../shared/componentAssembly";
import { arsenalHash, contentCoverageIssues } from "../../shared/arsenalContent";
import { resolveArsenalGeometry, arsenalWorldGeometry } from "../../shared/arsenalGeometry";
import { auditAssemblyArtDirection } from "../../server/ai/assemblyArtDirection";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { renderRecipe } from "../designBatch/native";

const runId = "97e1bebf-2f3b-455d-a10f-da8ab041eea6";
const ownerId = "25c1b164-6829-4b88-9f34-052ea8f7b13a";
const outputDir = path.resolve("artifacts/component-arsenal/replay-97e1");

const { data: run, error } = await getDb()
  .from("generation_runs")
  .select("id,user_uuid,status,input_type,input_content,platform,post_mode,creation_mode,prompt_snapshot,output_snapshot,events")
  .eq("id", runId)
  .eq("user_uuid", ownerId)
  .single();
if (error || !run) throw new Error(`run_read_failed:${error?.code ?? "missing"}`);
if (run.status !== "completed" || !Array.isArray(run.output_snapshot))
  throw new Error("completed_output_snapshot_missing");

const localRecords=await readLocalDiagnosticRecords(run.id);
const events = [...(run.events??[]),...localRecords.filter(record=>record.id===run.id).flatMap(record=>record.events??[])] as Array<{ stage: string; data?: Record<string, any> }>;
const offeredEvent = events.find(e => e.stage === "component.retrieve"&&e.data?.cards?.length);
const offered = offeredEvent?.data?.cards as ComponentCardV1[] | undefined;
if (!offered?.length) throw new Error("component_retrieve_cards_missing");
const outputs = run.output_snapshot as Array<Record<string, any>>;
if (outputs.length !== 3 || outputs.some(v => !v.componentAssemblyV1?.slides))
  throw new Error("assembly_output_pins_missing");

const currentCards = await retrieveComponentCardsForGeneration({
  aspectRatio: "4:5",
  postMode: "carousel",
  text: run.input_content,
  styleText: run.input_content,
  slideCount: 5,
  experimental: true,
});
const offeredByUniqueId = new Map<string, ComponentCardV1>();
for (const card of [...offered, ...currentCards]) {
  const previous = offeredByUniqueId.get(card.id);
  if (previous && previous.hash !== card.hash) throw new Error(`offered_hash_conflict:${card.id}`);
  offeredByUniqueId.set(card.id, card);
}
const unionCards = Array.from(offeredByUniqueId.values());
const allIds = Array.from(new Set([
  ...unionCards.map(c => c.id),
  ...outputs.flatMap(v => v.componentAssemblyV1.direction?.typographyComponentId ? [v.componentAssemblyV1.direction.typographyComponentId] : []),
  ...outputs.flatMap(v => v.componentAssemblyV1.slides.flatMap((s: any) => {
    const pin = s.bundle?.candidates?.[0]?.componentAssembly;
    return [...(pin?.componentIds ?? []), ...(pin?.resolution?.requestedComponentIds ?? [])];
  })),
]));
const { data: rows, error: componentError } = await getDb()
  .from("design_components")
  .select("id,definition_hash,definition")
  .in("id", allIds);
if (componentError) throw new Error(`definitions_read_failed:${componentError.code}`);
const definitions = new Map<string, ComponentDefinitionV1>();
for (const row of rows ?? []) {
  const definition = componentDefinitionV1Schema.parse(row.definition);
  if (definition.id !== row.id || definition.hash !== row.definition_hash || componentHash(definition) !== row.definition_hash)
    throw new Error(`definition_hash_mismatch:${row.id}`);
  definitions.set(row.id, definition);
}
const missingDefinitions = allIds.filter(id => !definitions.has(id));
if (missingDefinitions.length)
  throw new Error(`missing_definitions:${missingDefinitions.join(",")}`);
const offeredById = new Map(unionCards.map(card => [card.id, card]));
for (const card of unionCards) {
  const definition = definitions.get(card.id)!;
  if (definition.hash !== card.hash) throw new Error(`offered_hash_mismatch:${card.id}`);
}

// The raw LLM body was not persisted in prompt_snapshot. Reconstruct from the
// saved direction/content and pinned IDs; restore requested content IDs where
// a resolution recorded them, retaining the other delivered IDs and native layout.
const variations = outputs.map((output, slot) => {
  const saved = output.componentAssemblyV1;
  const slides = saved.slides.map((savedSlide: any, index: number) => {
    const bundle = savedSlide.bundle;
    const pin = bundle?.candidates?.[0]?.componentAssembly;
    const pinnedIds = (pin?.componentIds ?? []) as string[];
    const requestedIds = (pin?.resolution?.requestedComponentIds ?? []) as string[];
    const ids = requestedIds.length ? requestedIds : pinnedIds;
    const rhythm = saved.direction.intent?.rhythm?.[index];
    const density = rhythm?.density ?? savedSlide.density;
    return {
      id: savedSlide.id,
      role: savedSlide.role,
      density,
      content: bundle.content,
      components: Array.from(new Set(ids)).map(id => ({ id, hash: definitions.get(id)!.hash })),
      mediaPrompts: [],
    };
  });
  const direction = structuredClone(saved.direction);
  if (direction.intent) direction.intent.rhythm = direction.intent.rhythm.map((r: any, i: number) => ({ ...r, density: slides[i]?.density ?? r.density }));
  return { id: `recorded-${slot}`, direction, caption: saved.caption, hashtags: saved.hashtags, slides };
});
const first = outputs[0].componentAssemblyV1;
const plan: AssemblyPlanV1 = {
  schemaVersion: 1,
  postMode: run.post_mode,
  aspectRatio: outputs[0].aspectRatio ?? first.slides?.[0]?.bundle?.targetAspectRatio,
  variations,
} as AssemblyPlanV1;
const auditIssues = auditAssemblyArtDirection(plan, offered);
const allSelectedIds = Array.from(new Set(plan.variations.flatMap(v => v.slides.flatMap(s => s.components.map(c => c.id)))));
const donorIds = plan.variations.map(v => v.direction.typographyComponentId).filter((id): id is string => !!id);
const allAssets = Array.from(new Map([...unionCards.map(c => c.id), ...allSelectedIds, ...donorIds].flatMap(id => definitions.get(id)!.assets).map(a => [a.id, a])).values());
const byteCache = new Map<string, Buffer>();
const loadBytes = async (asset: (typeof allAssets)[number]) => {
  let bytes = byteCache.get(asset.id);
  if (!bytes) { bytes = await loadComponentFontBytes(asset); byteCache.set(asset.id, bytes); }
  return bytes;
};
const measureText = await createComponentTextMeasurer(allAssets, loadBytes);
const traceId = assemblyIdentity([runId, "recorded-replay"]);
const materialized: any[] = [];
const slideChecks: any[] = [];
for (const [slot, variation] of plan.variations.entries()) {
  const slides: any[] = [];
  for (const [index, slide] of variation.slides.entries()) {
    const originalSlide = outputs[slot].componentAssemblyV1.slides[index];
    const originalPin = originalSlide.bundle.candidates[0].componentAssembly;
    const requested = originalPin.resolution?.requestedComponentIds ?? [];
    const originalContentIds = requested.filter((id: string) => offeredById.get(id)?.kind === "content");
    const deliveredContentIds = (originalPin.componentIds as string[]).filter(id => offeredById.get(id)?.kind === "content");
    const originalSources = new Set<string>(originalContentIds.map((id: string) => offeredById.get(id)?.visualTraits?.sourceKey ?? id));
    const deliveredSources = new Set(deliveredContentIds.map(id => offeredById.get(id)?.visualTraits?.sourceKey ?? id));
    const originalIdentityStillDelivered = originalContentIds.length === 0 || [...originalSources].some(source => deliveredSources.has(source));
    let bundle: any, resolved: any, coverageIssues: string[] = [];
    try {
      bundle = materializeAssemblySlide(plan, slot, index, Array.from(definitions.values()), {
        traceId,
        runId: assemblyIdentity([runId, "recorded-replay", slot]),
        experimental: true,
      });
      const composition = compositionFromAssemblyBundle(bundle);
      resolved = resolveArsenalGeometry(composition, { measureText, allowReduction: true });
      coverageIssues = contentCoverageIssues(slide.content, resolved.base.bindings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      coverageIssues = message.split(";").filter(s => s.startsWith("content_coverage:"));
      if (!coverageIssues.length) coverageIssues = [`materialization:${message}`];
    }
    if (!resolved) {
      slideChecks.push({
        slot, slideId: slide.id, role: slide.role,
        originalDensity: originalSlide.density, replayDensity: slide.density,
        originalRequestedContentIds: originalContentIds,
        replayComponentIds: slide.components.map(c => c.id),
        deliveredComponentIds: originalPin.componentIds,
        resolution: originalPin.resolution?.kind ?? "none",
        resolutionReasons: originalPin.resolution?.reasons ?? [],
        originalIdentityStillDelivered,
        identityPreserved: false,
        coverageIssues,
        geometryIssues: [],
        materialized: false,
      });
      continue;
    }
    const geometryIssues = resolved.issues ?? [];
    const fontSummary = resolved.elements.filter((e: any) => e.kind === "text").map((e: any) => ({
      id: e.id,
      fontSizePx: e.fontSize,
      family: e.fontFamily,
      weight: e.fontWeight,
      source: e.bindingId,
    }));
    slideChecks.push({
      slot,
      slideId: slide.id,
      role: slide.role,
      originalDensity: originalSlide.density,
      replayDensity: slide.density,
      originalRequestedContentIds: originalContentIds,
      replayComponentIds: slide.components.map(c => c.id),
      deliveredComponentIds: originalPin.componentIds,
      resolution: originalPin.resolution?.kind ?? "none",
      resolutionReasons: originalPin.resolution?.reasons ?? [],
      originalIdentityStillDelivered,
      identityPreserved: geometryIssues.length === 0 && originalIdentityStillDelivered,
      textRegions: fontSummary.length,
      textFonts: fontSummary,
      coverageIssues,
      geometryIssues,
      hasOverflow: geometryIssues.some((issue: string) => /overflow|outside|bounds/i.test(issue)),
      planHash: arsenalHash(plan),
      materialized: true,
    });
    slides.push({ bundle, resolved });
  }
  materialized.push({ slot, slides });
}

await fs.mkdir(outputDir, { recursive: true });
const report = {
  schemaVersion: 1,
  source: "generation_runs.output_snapshot + events.component.retrieve + design_components definitions",
  runId,
  ownerFiltered: true,
  replayMode: "reconstructed-pinned-plan",
  exactLlmResponsePersisted: false,
  exactPlacementsPersistedForRawPlan: false,
  normalizations: [
    "use direction and canonical content saved in each pinned slide",
    "use the exact requestedComponentIds set when a slide resolution recorded one; otherwise use that slide's pinned component IDs",
    "resolve the direction typography donor separately from slide component IDs",
    "synchronize rhythm density from the saved per-slide direction rhythm",
    "native placements for components because original request placements were not stored",
  ],
  llmCalls: 0,
  imageCalls: 0,
  billingCalls: 0,
  promptSnapshot: {
    version: (run.prompt_snapshot as any)?.version,
    replayable: (run.prompt_snapshot as any)?.replayable,
    calls: (run.prompt_snapshot as any)?.calls?.map((c: any) => ({ label: c.label, taskRoute: c.taskRoute, promptHash: c.promptHash })),
    responseBodyPresent: false,
  },
  offeredCards: offered.length,
  verifiedDefinitions: definitions.size,
  verifiedAssets: allAssets.length,
  slides: slideChecks,
  totals: {
    slides: slideChecks.length,
    materializedSlides: slideChecks.filter(s => s.materialized).length,
    materializationFailures: slideChecks.filter(s => !s.materialized).length,
    coverageFailures: slideChecks.filter(s => s.coverageIssues.length).length,
    geometryFailureSlides: slideChecks.filter(s => s.geometryIssues.length).length,
    overflowSlides: slideChecks.filter(s => s.hasOverflow).length,
    identityPreserved: slideChecks.filter(s => s.identityPreserved).length,
    identityNotPreserved: slideChecks.filter(s => !s.identityPreserved).length,
    resolutionSlides: slideChecks.filter(s => s.resolution !== "none").length,
  },
  planAuditIssues: auditIssues,
  caveat: "This is a deterministic replay of saved pins and requested IDs, not the original raw LLM plan. It does not reconstruct placements absent from persisted output.",
};
await fs.writeFile(path.join(outputDir, "REPLAY_REPORT.json"), JSON.stringify(report, null, 2) + "\n");
await fs.writeFile(path.join(outputDir, "EXECUTION.md"), [
  "# Replay determinístico da run 97e1",
  "",
  "Fonte: snapshot final da geração e cartões `component.retrieve`; todas as definições selecionadas foram verificadas por hash. O `prompt_snapshot` armazena hashes/metadados das chamadas, não o corpo da resposta LLM. O plano foi reconstruído com conteúdo/direção pinados, IDs solicitados registrados nas resoluções, demais IDs pinados e densidade sincronizada com o ritmo salvo. Placements originais ausentes foram tratados como nativos.",
  "",
  `Slides: ${slideChecks.length}; cobertura com issues: ${report.totals.coverageFailures}; geometria com issues: ${report.totals.geometryFailureSlides}; identidade preservada pela origem de content: ${report.totals.identityPreserved}/${slideChecks.length}.`,
  "",
  "Sem chamadas LLM, imagens ou billing. Ver detalhes por slide em `REPLAY_REPORT.json`.",
  "",
].join("\n"));

// Exercise the production orchestrator with the same saved plan as a local mock
// response. The original input is read but never copied into the report/output.
const orchestratorEvents: Array<{ stage: string; status: string; detail?: string; data?: unknown }> = [];
let mockGenerateCalls = 0, recentPostReads = 0, originalityCalls = 0;
const transportRef = (ref: any, typography = false) => {
  if (!ref) return null;
  const { hash: _hash, ...withoutHash } = ref;
  return typography ? { id: ref.id } : withoutHash;
};
const transportPlan = {
  ...plan,
  variations: plan.variations.map(variation => ({
    ...variation,
    slides: variation.slides.map(slide => {
      const { components, density, ...fields } = slide;
      const byKind = (kind: ComponentDefinitionV1["kind"]) => components
        .filter(ref => definitions.get(ref.id)?.kind === kind)
        .map(ref => transportRef(ref));
      const content = byKind("content");
      if (content.length !== 1) throw new Error(`mock_transport_content_count:${slide.id}`);
      return {
        ...fields,
        components: {
          content: { ...content[0], density },
          background: byKind("background")[0] ?? null,
          media: byKind("media"),
          ornament: byKind("ornament"),
          typography: byKind("typography").map(ref => transportRef(ref, true)),
        },
      };
    }),
  })),
};
const preparedPlan = await prepareGenerationPlan({ sourceContent: run.input_content });
const originalityMock = {
  assessments: [0, 1, 2].map(() => ({ score: 100, maxCandidateSimilarity: 0, maxSiteSimilarity: 0, maxHistorySimilarity: 0, closestSource: "none" as const, fallbackUsed: false })),
  embeddings: [],
  fallbackUsed: false,
};
const orchestratorInput: ComponentAssemblyOrchestratorInput = {
  offered: unionCards,
  resolve: async ids => ids.map(id => {
    const found = definitions.get(id);
    if (!found) throw new Error(`mock_resolve_missing:${id}`);
    return found;
  }),
  slideCount: 5,
  aspectRatio: "4:5",
  experimental: true,
  userUuid: ownerId,
  request: {
    inputType: run.input_type,
    content: run.input_content,
    platform: run.platform,
    postMode: run.post_mode,
    creationMode: run.creation_mode,
  },
  siteIntelligence: null,
  executionBrief: null,
  plan: preparedPlan,
  deadlineMs: null,
};
const orchestratorDeps: ComponentAssemblyOrchestratorDeps = {
  measureText,
  clock: () => 1000,
  trace: {
    id: assemblyIdentity([runId, "orchestrator-mock-replay"]),
    recordEvent: event => { orchestratorEvents.push(event); },
  },
  generate: async () => {
    mockGenerateCalls++;
    return { choices: [{ message: { content: JSON.stringify(transportPlan) } }] } as InvokeResult;
  },
  loadRecentPosts: async () => { recentPostReads++; return []; },
  assessOriginality: async () => { originalityCalls++; return originalityMock; },
};
const orchestratorOutcome = await generateComponentAssemblyPostVariations(orchestratorInput, orchestratorDeps);
const orchestrationSlides: any[] = [];
const approvedSnapshots = orchestratorOutcome.status === "approved" ? orchestratorOutcome.snapshots : [];
for (const [slot, snapshot] of approvedSnapshots.entries()) {
  for (const [index, savedSlide] of (snapshot.componentAssemblyV1?.slides ?? []).entries()) {
    const bundle = savedSlide.bundle;
    const composition = compositionFromAssemblyBundle(bundle);
    const resolved = resolveArsenalGeometry(composition, { measureText, allowReduction: true });
    const inputSlide = plan.variations[slot]?.slides[index];
    const finalContent = bundle.content;
    const contentPreserved = !!inputSlide && arsenalHash(inputSlide.content) === arsenalHash(finalContent);
    const pin = bundle.candidates?.[0]?.componentAssembly;
    const requestedContent = inputSlide?.components.filter(ref => definitions.get(ref.id)?.kind === "content") ?? [];
    const finalContentIds = (pin?.componentIds ?? []).filter((id: string) => offeredById.get(id)?.kind === "content");
    const requestedSources = new Set(requestedContent.map(ref => offeredById.get(ref.id)?.visualTraits?.sourceKey ?? ref.id));
    const finalSources = new Set(finalContentIds.map((id: string) => offeredById.get(id)?.visualTraits?.sourceKey ?? id));
    orchestrationSlides.push({
      slot, slideId: savedSlide.id, role: savedSlide.role,
      inputDensity: inputSlide?.density, outputDensity: savedSlide.density,
      contentPreserved,
      inputContentHash: inputSlide ? arsenalHash(inputSlide.content) : null,
      outputContentHash: arsenalHash(finalContent),
      resolution: pin?.resolution?.kind ?? "none",
      resolutionReasons: pin?.resolution?.reasons ?? [],
      inputComponentIds: requestedContent.map(ref => ref.id),
      outputComponentIds: pin?.componentIds ?? [],
      componentLabels: (pin?.componentIds ?? []).map((id: string) => offeredById.get(id)?.label ?? id),
      identityPreserved: pin?.resolution?.kind !== "editorial-fallback" && (requestedSources.size === 0 || [...requestedSources].some(source => finalSources.has(source))),
      coverageIssues: contentCoverageIssues(finalContent, resolved.base.bindings),
      geometryIssues: resolved.issues ?? [],
      textFonts: resolved.elements.filter((e: any) => e.kind === "text").map((e: any) => ({ family: e.fontFamily, weight: e.fontWeight, fontSizePx: e.fontSize, binding: e.bindingId })),
    });
  }
}
const outcomeEvents = orchestratorEvents.map(event => ({
  stage: event.stage,
  status: event.status,
  ...(event.stage === "assembly.compatible_candidate" || event.stage === "assembly.quiet_candidate" ? {
    slot: (event.data as any)?.slot,
    slideId: (event.data as any)?.slideId,
    componentId: (event.data as any)?.componentId,
    componentLabel: offeredById.get((event.data as any)?.componentId)?.label,
    issues: (event.data as any)?.issues,
    pendingMedia: (event.data as any)?.pendingMedia,
  } : {}),
  ...(event.stage === "assembly.slide_resolution" && event.data && typeof event.data === "object" ? {
    resolution: (event.data as any).kind,
    slot: (event.data as any).slot,
    slideId: (event.data as any).slideId,
    reasons: (event.data as any).reasons,
  } : {}),
}));
const orchestrationReport: Record<string, any> = {
  schemaVersion: 1,
  mode: "production-orchestrator-with-recorded-plan-mock",
  sourceRunId: runId,
  ownerFilteredReads: true,
  retrievalQuery: { aspectRatio: "4:5", postMode: "carousel", slideCount: 5, experimental: true, queryTextSource: "generation_runs.input_content", queryTextHash: arsenalHash(run.input_content) },
  pinnedCards: offered.length,
  currentRetrievedCards: currentCards.length,
  unionCards: unionCards.length,
  verifiedDefinitions: definitions.size,
  verifiedAssetManifests: allAssets.length,
  fontAssetsLoaded: allAssets.filter(a => !!a.family).length,
  calls: { mockGenerateCalls, recentPostReads, originalityCalls, llm: 0, images: 0, billing: 0, databaseWrites: 0 },
  status: orchestratorOutcome.status,
  metrics: orchestratorOutcome.metrics,
  rejection: orchestratorOutcome.status === "rejected" ? { issueCount: orchestratorOutcome.issues.length, issues: orchestratorOutcome.issues.map(i => ({ slot: i.slot, type: i.type })) } : undefined,
  failureKind: orchestratorOutcome.status === "failed" ? orchestratorOutcome.error.kind : undefined,
  snapshots: approvedSnapshots.length,
  sourceBlockLengths: outputs.slice(0, 2).flatMap((output, slot) => output.componentAssemblyV1.slides.slice(0, 1).flatMap((savedSlide: any) => savedSlide.bundle.content.blocks
    .filter((block: any) => ["b-101", "b-102", "b-103", "b-201", "b-202", "b-203"].includes(block.id))
    .map((block: any) => ({ slot, slideId: savedSlide.id, id: block.id, role: block.role, length: typeof block.text === "string" ? block.text.length : null })))),
  coverCompatibleCandidates: outcomeEvents.filter(event => event.stage === "assembly.compatible_candidate" && plan.variations[event.slot as number]?.slides.find(slide => slide.id === event.slideId)?.role === "cover").map(event => ({
    slot: event.slot, slideId: event.slideId, status: event.status,
    componentId: event.componentId, label: event.componentLabel,
    issues: event.issues ?? [],
    selectedResolutionReasons: orchestrationSlides.find(slide => slide.slot === event.slot && slide.slideId === event.slideId && slide.outputComponentIds.includes(event.componentId))?.resolutionReasons ?? [],
  })),
  slides: orchestrationSlides,
  totals: {
    slides: orchestrationSlides.length,
    contentPreserved: orchestrationSlides.filter(s => s.contentPreserved).length,
    contentChanged: orchestrationSlides.filter(s => !s.contentPreserved).length,
    identityPreserved: orchestrationSlides.filter(s => s.identityPreserved && !s.geometryIssues.length && !s.coverageIssues.length).length,
    coverageIssueSlides: orchestrationSlides.filter(s => s.coverageIssues.length).length,
    geometryIssueSlides: orchestrationSlides.filter(s => s.geometryIssues.length).length,
    resolutions: Object.fromEntries(Array.from(new Set(orchestrationSlides.map(s => s.resolution))).map(kind => [kind, orchestrationSlides.filter(s => s.resolution === kind).length])),
  },
  events: outcomeEvents,
  limitation: "The mock returns the reconstructed saved plan for every generation/revision call. No new copy or repair response is fabricated; this tests orchestrator resolution/materialization against the recorded content and pins, not the original LLM response.",
};

const priorReport = JSON.parse(await fs.readFile(path.join(outputDir, "baseline", "ORCHESTRATOR_REPLAY.json"), "utf8"));
const changedCoverSlots = orchestrationSlides.filter(current => {
  if (current.role !== "cover") return false;
  const previous = priorReport.slides?.find((slide: any) => slide.slot === current.slot && slide.role === "cover");
  if (!previous) return true;
  const signature = (slide: any) => JSON.stringify({
    resolution: slide.resolution,
    density: slide.outputDensity,
    components: [...(slide.outputComponentIds ?? [])].sort(),
    geometry: slide.geometryIssues ?? [],
    fonts: slide.textFonts ?? [],
  });
  return signature(current) !== signature(previous);
}).map(slide => slide.slot);
if (orchestratorOutcome.status === "approved" && orchestrationReport.totals.geometryIssueSlides === 0 && orchestrationReport.totals.coverageIssueSlides === 0) {
  const coversDir = path.join(outputDir, "orchestrator-covers-after-text-spacing-flow");
  await fs.mkdir(coversDir, { recursive: true });
  for (const slot of changedCoverSlots) {
    const snapshot = approvedSnapshots[slot];
    if (!snapshot) continue;
    const savedSlide = snapshot.componentAssemblyV1?.slides?.[0];
    if (!savedSlide) continue;
    const composition = resolveArsenalGeometry(compositionFromAssemblyBundle(savedSlide.bundle), { measureText, allowReduction: true });
    const fonts = [];
    for (const asset of allAssets.filter(a => a.family && composition.elements.some((e: any) => e.kind === "text" && e.fontFamily === a.family))) {
      const bytes = await loadBytes(asset);
      fonts.push({ family: asset.family!, weight: asset.weight ?? 400, sourceUrl: null, mimeType: asset.mimeType as any, dataUrl: `data:${asset.mimeType};base64,${bytes.toString("base64")}`, sha256: asset.sha256, license: asset.license as any });
    }
    const sceneLayers = composition.elements.map((element: any) => {
      const world = arsenalWorldGeometry(element, composition.groups);
      return {
        id: element.id, kind: element.kind === "media" ? "rect" : element.kind,
        role: element.bindingId ?? "decoration", zIndex: element.zIndex,
        x: world.x, y: world.y, width: element.width * world.scale, height: element.height * world.scale,
        text: element.kind === "text" ? element.text : null,
        fontFamily: element.fontFamily ?? "Arial", fontWeight: element.fontWeight ?? 400,
        fontSize: element.fontSize * world.scale, lineHeight: element.lineHeight ?? 1.15,
        letterSpacing: element.letterSpacing * world.scale, align: element.align ?? "left",
        fill: element.fill, strokeColor: element.stroke ?? null, strokeWidth: element.strokeWidth * world.scale,
        rotationDeg: world.rotation, opacity: element.opacity, points: element.points.map((n: number) => n * world.scale),
        arc: null, extrusion: element.extrusion ? { ...element.extrusion, offsetX: element.extrusion.offsetX * world.scale, offsetY: element.extrusion.offsetY * world.scale } : null,
        confidenceScore: 1, provenance: "curator", support: "supported", uncertainty: null,
      };
    });
    const recipe: any = {
      format: "postspark.admin2.recipe", version: 1, id: `replay-${runId}-${slot}`, title: `Replay ${slot + 1}`,
      createdAt: new Date(0).toISOString(), model: "recorded-plan-mock", provider: null, usage: { inputTokens: 0, outputTokens: 0 },
      scene: {
        schemaVersion: 2,
        source: { widthPx: composition.artboard.width, heightPx: composition.artboard.height, mimeType: "image/png", preparedHash: null, originalHash: null },
        artboard: { background: composition.artboard.background }, layers: sceneLayers, fonts, warnings: [],
        decoderVersion: "design-dna-v2", rendererVersion: "admin2-konva-1",
      },
      missingElements: [], notes: ["Deterministic local orchestration replay; review only."],
    };
    try {
      const png = renderRecipe(recipe, { wrap: true });
      await fs.writeFile(path.join(coversDir, `variation-${slot + 1}-cover.png`), png);
    } catch (renderError) {
      orchestrationReport.renderError = renderError instanceof Error ? renderError.message.slice(0, 180) : "unknown";
      break;
    }
  }
  orchestrationReport.renderedCovers = (await fs.readdir(coversDir)).filter(name => name.endsWith(".png")).length;
  orchestrationReport.changedCoverSlots = changedCoverSlots;
  orchestrationReport.coverRenderDirectory = path.relative(outputDir, coversDir);
} else {
  orchestrationReport.renderedCovers = 0;
  orchestrationReport.changedCoverSlots = changedCoverSlots;
  orchestrationReport.renderSkipped = "orchestrator not approved or coverage/geometry issue exists";
}
await fs.writeFile(path.join(outputDir, "ORCHESTRATOR_REPLAY.json"), JSON.stringify(orchestrationReport, null, 2) + "\n");
await fs.writeFile(path.join(outputDir, "EXECUTION.md"), [
  "# Replay determinístico da run 97e1",
  "",
  "A resposta bruta da LLM não está persistida: `prompt_snapshot` contém hashes e metadados. O plano reconstruído usa `requestedComponentIds` exatos quando registrados, direção e conteúdo canônicos pinados, e densidade do ritmo salvo. O segundo relatório passa essa reconstrução pela função real do orquestrador com mocks locais. Não é replay byte a byte da chamada LLM.",
  "",
  `Orquestrador: ${orchestrationReport.status}; conteúdo preservado ${orchestrationReport.totals.contentPreserved}/${orchestrationReport.totals.slides}; identidade preservada ${orchestrationReport.totals.identityPreserved}/${orchestrationReport.totals.slides}; resoluções ${JSON.stringify(orchestrationReport.totals.resolutions)}.`,
  `Geometria: ${orchestrationReport.totals.geometryIssueSlides} slides com issues; cobertura: ${orchestrationReport.totals.coverageIssueSlides}. Chamadas LLM/imagem/billing/escritas: 0. A geração mock foi invocada ${mockGenerateCalls} vezes, sempre com o mesmo plano reconstruído.`,
  "",
  `Capas alteradas em relação à baseline: ${changedCoverSlots.map(slot => slot + 1).join(", ") || "nenhuma"}. Somente essas capas foram renderizadas em ${orchestrationReport.coverRenderDirectory ?? "(render ignorado)"}/. ORCHESTRATOR_REPLAY.json contém os comprimentos/roles dos blocos selecionados e eventos de candidatos com IDs, labels e issues, sem copy bruta.`,
].join("\n"));
console.log(JSON.stringify({ outputDir, pinnedCards: offered.length, currentRetrievedCards: currentCards.length, unionCards: unionCards.length, verifiedDefinitions: definitions.size, outcome: orchestrationReport.status, calls: orchestrationReport.calls, totals: orchestrationReport.totals, renderError: orchestrationReport.renderError, renderedCovers: orchestrationReport.renderedCovers }));
