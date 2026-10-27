import { getDb } from "../../db";
import { assertPinnedReviewConfig } from "./pinnedReviewConfig";
import { localDiagnosticsEnabled, writeLocalDiagnostic } from "../localDiagnostics";
import { generationTerminalDiagnostic } from "./generationTerminalDiagnostic";
import { failureFromError, historicalGenerationFailure, GenerationFailureError } from "@shared/generationFailure";
import { createHash } from "node:crypto";
import { completeSourceContext } from "@shared/sourceContext";
import {
  generationCoordinatorSnapshotSchema,
  type GenerationCoordinatorSnapshot,
} from "@shared/generationContracts";
import { type OrchestratedGenerationInput } from "@shared/generationRequest";
import type { SiteIntelligence } from "@shared/postspark";
import { invokeLLM } from "../../_core/llm";
import { loadSiteIntelligence } from "../../siteIntelligence";
import { scrapeUrl } from "../../siteContent";
import { getBrandProjectById } from "../../db";
import {
  createGenerationStore,
  type GenerationStore,
  type RequestRecord,
} from "./generationStore";
import { GenerationCoordinator } from "./generationCoordinator";
import {
  prepareOrchestratedGeneration,
  verifyPreparedEligibility,
  selectionInputReceiptSchema,
  type PreparedGeneration,
} from "./generationPreparation";
import type { ProposalGraphDeps } from "./proposalGraph";
import { generateProposalMediaForSlot } from "./proposalMedia";
import { arsenalHash, arsenalCanonicalJson } from "@shared/arsenalContent";
import {
  getGenerationTrace,
  runWithGenerationTrace,
  persistGenerationTraceMetrics,
  loadPersistedGenerationCalls,
  recordGenerationEvent,
  type GenerationTrace,
} from "../generationTrace";
import {
  isPaidGenerationOperation,
  journalResultWithTrace,
  readJournalResult,
  summarizeGenerationJournal,
} from "./generationJournalTrace";
import { appendOperationalLog } from "../../_core/operationalLog";
import type { GenerationWorkerIdentity } from "./generationWorkerIdentity";
import { ENV } from "../../_core/env";
import { assertReviewExecutionConfigV7 } from "./reviewExecutionConfigV7";

export class ReconciliationRequiredError extends Error {
  constructor(key: string) {
    super(`reconciliation_required:${key}`);
  }
}

export function requestInputHash(input: OrchestratedGenerationInput): string {
  const { idempotencyKey, ...payload } = input;
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function requestSnapshot(
  record: RequestRecord
): GenerationCoordinatorSnapshot {
  const expired = record.deadlineAt <= Date.now();
  const active =
    !expired && (record.status === "queued" || record.status === "running");
  const proposals = record.proposals.map(p =>
    expired &&
    [
      "planned",
      "running",
      "checking",
      "recovering",
      "waiting_input",
      "delivery_pending",
      "awaiting_reconciliation",
    ].includes(p.status)
      ? {
          ...p,
          status: "expired" as const,
          errorReason: "generation_deadline_exceeded",
        }
      : {...p, ...(p.failure ? {} : historicalGenerationFailure(p.errorReason) || historicalGenerationFailure(p.reviews?.at(-1)?.limitation) ? {failure:historicalGenerationFailure(p.errorReason) ?? historicalGenerationFailure(p.reviews?.at(-1)?.limitation)} : {})}
  );
  const ready = proposals.filter(p => p.status === "ready").length;
  return generationCoordinatorSnapshotSchema.parse({
    requestId: record.id,
    runId: record.id,
    overallStatus:
      record.status === "cancelled"
        ? "cancelled"
        : record.status==="awaiting_reconciliation"&&!expired ? "awaiting_reconciliation" : active
          ? "running"
          : ready === 3
            ? "completed"
            : ready
              ? "partial"
              : "failed",
    proposals,
    updatedAt: Date.now(),
  });
}

/** Journal first, external effect second. Uncertain effects require reconciliation, never replay. */
export function durableOperations(
  store: GenerationStore,
  record: RequestRecord,
  leaseToken: string,
  signal: AbortSignal,
  prefix = "",
  replaySafe = false
) {
  return async <T>(key: string, work: () => Promise<T>): Promise<T> => {
    signal.throwIfAborted();
    if (Date.now() >= record.deadlineAt)
      throw new Error("generation_deadline_exceeded");
    const operationKey = `${prefix}${key}`;
    console.info(
      `[runtime:op] ⏳ [${record.id.slice(0, 8)}] Iniciando ${operationKey}...`
    );
    const existing = await store.beginOperation(
      record.id,
      leaseToken,
      operationKey,
      replaySafe
    );
    if (existing.state === "completed") {
      console.info(
        `[runtime:op] ⏭️ [${record.id.slice(0, 8)}] ${operationKey} já concluída anteriormente no journal.`
      );
      return readJournalResult<T>(existing.result);
    }
    if (existing.state === "uncertain") {
      console.warn(
        `[runtime:op] ⚠️ [${record.id.slice(0, 8)}] ${operationKey} está em estado incerto. Requer reconciliação.`
      );
      throw new ReconciliationRequiredError(operationKey);
    }
    const parent = getGenerationTrace();
    const operationTrace: GenerationTrace | undefined = parent
      ? { ...parent, calls: [], events: [] }
      : undefined;
    try {
      const result = await (operationTrace
        ? runWithGenerationTrace(operationTrace, work)
        : work());
      // Persist returned output even if cancellation just arrived: it must never be purchased twice.
      await store.persistOperationResult(
        record.id,
        leaseToken,
        operationKey,
        operationTrace ? journalResultWithTrace(result, operationTrace) : result
      );
      signal.throwIfAborted();
      console.info(
        `[runtime:op] ✅ [${record.id.slice(0, 8)}] ${operationKey} concluída com sucesso.`
      );
      return result;
    } catch (error) {
      console.error(
        `[runtime:op] ❌ [${record.id.slice(0, 8)}] ${operationKey} falhou:`,
        error instanceof Error ? error.message : error
      );
      // A successful provider receipt can precede a local/storage failure. Keep
      // it in the run summary even though the effect remains uncertain in the journal.
      if (parent && operationTrace) {
        parent.calls.push(
          ...operationTrace.calls.map(call => ({ ...call, operationKey }))
        );
        parent.events.push(...operationTrace.events);
      }
      await store
        .markOperationUncertain(record.id, leaseToken, operationKey)
        .catch(() => undefined);
      throw error;
    }
  };
}

export function validateSiteIntelligenceSnapshot(site: unknown): asserts site is SiteIntelligence {
  if (!site || typeof site !== "object" || Array.isArray(site)) {
    throw new Error("Snapshot de inteligência de site inválido ou malformado: esperado objeto");
  }
  const s = site as Record<string, any>;
  if (typeof s.id !== "string" || !s.id.trim()) {
    throw new Error("Snapshot de inteligência de site sem identificador válido");
  }
  if (!Array.isArray(s.evidence)) {
    throw new Error("Snapshot de inteligência de site com lista de evidências inválida: esperado array");
  }
  const validKinds = new Set(["title", "description", "heading", "body", "visual"]);
  for (let index = 0; index < s.evidence.length; index++) {
    const e = s.evidence[index];
    if (!e || typeof e !== "object" || Array.isArray(e)) {
      throw new Error(`Evidência [${index}] malformada no snapshot: esperado objeto`);
    }
    if (typeof e.id !== "string" || !e.id.trim()) {
      throw new Error(`Evidência [${index}] sem identificador válido`);
    }
    if (typeof e.kind !== "string" || !validKinds.has(e.kind)) {
      throw new Error(`Evidência [${index}] com tipo inválido: ${String(e.kind)}`);
    }
    if (typeof e.text !== "string" || !e.text.trim()) {
      throw new Error(`Evidência [${index}] sem texto válido ou com conteúdo em branco`);
    }
    if (e.sourceUrl !== undefined && typeof e.sourceUrl !== "string") {
      throw new Error(`Evidência [${index}] com sourceUrl inválido: esperado string`);
    }
  }

  // Metadata strings
  if (s.sourceUrl !== undefined && typeof s.sourceUrl !== "string") {
    throw new Error("Campo sourceUrl inválido no snapshot: esperado string");
  }
  if (s.normalizedUrl !== undefined && typeof s.normalizedUrl !== "string") {
    throw new Error("Campo normalizedUrl inválido no snapshot: esperado string");
  }
  if (s.fingerprint !== undefined && typeof s.fingerprint !== "string") {
    throw new Error("Campo fingerprint inválido no snapshot: esperado string");
  }
  if (s.extractedAt !== undefined && typeof s.extractedAt !== "string") {
    throw new Error("Campo extractedAt inválido no snapshot: esperado string");
  }

  // Quality
  if (s.quality !== undefined) {
    if (!s.quality || typeof s.quality !== "object" || Array.isArray(s.quality)) {
      throw new Error("Campo quality inválido no snapshot: esperado objeto");
    }
    if (s.quality.fallbackUsed !== undefined && typeof s.quality.fallbackUsed !== "boolean") {
      throw new Error("Campo quality.fallbackUsed inválido no snapshot: esperado booleano");
    }
    if (s.quality.warnings !== undefined) {
      if (!Array.isArray(s.quality.warnings)) {
        throw new Error("Campo quality.warnings inválido no snapshot: esperado array");
      }
      for (let i = 0; i < s.quality.warnings.length; i++) {
        const w = s.quality.warnings[i];
        if (typeof w !== "string" || !w.trim()) {
          throw new Error(`Item [${i}] de quality.warnings inválido no snapshot: esperado string não vazia`);
        }
      }
    }
  }

  // Brand
  if (s.brand !== undefined) {
    if (!s.brand || typeof s.brand !== "object" || Array.isArray(s.brand)) {
      throw new Error("Campo brand inválido no snapshot: esperado objeto");
    }
    if (s.brand.brandName !== undefined && typeof s.brand.brandName !== "string") {
      throw new Error("Campo brand.brandName inválido no snapshot: esperado string");
    }
    if (s.brand.industry !== undefined && typeof s.brand.industry !== "string") {
      throw new Error("Campo brand.industry inválido no snapshot: esperado string");
    }
    if (s.brand.colors !== undefined) {
      if (!s.brand.colors || typeof s.brand.colors !== "object" || Array.isArray(s.brand.colors)) {
        throw new Error("Campo brand.colors inválido no snapshot: esperado objeto");
      }
      const colorFields = ["primary", "secondary", "background", "text", "accent"] as const;
      for (const f of colorFields) {
        const val = s.brand.colors[f];
        if (val !== undefined && typeof val !== "string") {
          throw new Error(`Campo brand.colors.${f} inválido no snapshot: esperado string`);
        }
      }
      if (s.brand.colors.palette !== undefined) {
        if (!Array.isArray(s.brand.colors.palette)) {
          throw new Error("Campo brand.colors.palette inválido no snapshot: esperado array");
        }
        for (let i = 0; i < s.brand.colors.palette.length; i++) {
          if (typeof s.brand.colors.palette[i] !== "string") {
            throw new Error(`Item [${i}] de brand.colors.palette inválido no snapshot: esperado string`);
          }
        }
      }
    }
  }

  // Business
  if (s.business !== undefined) {
    if (!s.business || typeof s.business !== "object" || Array.isArray(s.business)) {
      throw new Error("Campo business inválido no snapshot: esperado objeto");
    }
    if (s.business.summary !== undefined && typeof s.business.summary !== "string") {
      throw new Error("Campo business.summary inválido no snapshot: esperado string");
    }
    if (s.business.valueProposition !== undefined && typeof s.business.valueProposition !== "string") {
      throw new Error("Campo business.valueProposition inválido no snapshot: esperado string");
    }
    const stringArrayFields = ["products", "services", "audiences", "audienceProblems", "differentiators"] as const;
    for (const f of stringArrayFields) {
      const arr = s.business[f];
      if (arr !== undefined) {
        if (!Array.isArray(arr)) {
          throw new Error(`Campo business.${f} inválido no snapshot: esperado array`);
        }
        for (let i = 0; i < arr.length; i++) {
          if (typeof arr[i] !== "string") {
            throw new Error(`Item [${i}] de business.${f} inválido no snapshot: esperado string`);
          }
        }
      }
    }
    if (s.business.goals !== undefined) {
      if (!Array.isArray(s.business.goals)) {
        throw new Error("Campo business.goals inválido no snapshot: esperado array");
      }
      const validGoals = new Set(["educate", "authority", "sell", "engage", "lead"]);
      for (let i = 0; i < s.business.goals.length; i++) {
        const g = s.business.goals[i];
        if (typeof g !== "string" || !validGoals.has(g)) {
          throw new Error(`Item [${i}] de business.goals inválido no snapshot: esperado um dos objetivos válidos (educate, authority, sell, engage, lead)`);
        }
      }
    }
  }

  // Editorial
  if (s.editorial !== undefined) {
    if (!s.editorial || typeof s.editorial !== "object" || Array.isArray(s.editorial)) {
      throw new Error("Campo editorial inválido no snapshot: esperado objeto");
    }
    const editorialArrayFields = ["pillars", "priorityTopics", "toneGuidelines", "prohibitedClaims"] as const;
    for (const f of editorialArrayFields) {
      const arr = s.editorial[f];
      if (arr !== undefined) {
        if (!Array.isArray(arr)) {
          throw new Error(`Campo editorial.${f} inválido no snapshot: esperado array`);
        }
        for (let i = 0; i < arr.length; i++) {
          if (typeof arr[i] !== "string") {
            throw new Error(`Item [${i}] de editorial.${f} inválido no snapshot: esperado string`);
          }
        }
      }
    }
  }

  // Anchors
  if (s.anchors !== undefined) {
    if (!s.anchors || typeof s.anchors !== "object" || Array.isArray(s.anchors)) {
      throw new Error("Campo anchors inválido no snapshot: esperado objeto");
    }
    if (s.anchors.facts !== undefined) {
      if (!Array.isArray(s.anchors.facts)) {
        throw new Error("Campo anchors.facts inválido no snapshot: esperado array");
      }
      for (let i = 0; i < s.anchors.facts.length; i++) {
        const fact = s.anchors.facts[i];
        if (!fact || typeof fact !== "object" || Array.isArray(fact) || typeof fact.text !== "string" || !fact.text.trim()) {
          throw new Error(`Item [${i}] de anchors.facts inválido no snapshot: esperado objeto com text string não vazia`);
        }
        if (fact.id !== undefined && typeof fact.id !== "string") {
          throw new Error(`Item [${i}] de anchors.facts com id inválido: esperado string`);
        }
      }
    }
    for (const f of ["proprietaryTerms", "objections"] as const) {
      const arr = s.anchors[f];
      if (arr !== undefined) {
        if (!Array.isArray(arr)) {
          throw new Error(`Campo anchors.${f} inválido no snapshot: esperado array`);
        }
        for (let i = 0; i < arr.length; i++) {
          if (typeof arr[i] !== "string") {
            throw new Error(`Item [${i}] de anchors.${f} inválido no snapshot: esperado string`);
          }
        }
      }
    }
  }
}

export function projectSiteIntelligenceSnapshot(site: SiteIntelligence): string {
  validateSiteIntelligenceSnapshot(site);

  const id = site.id;
  const originUrl =
    (typeof site.sourceUrl === "string" && site.sourceUrl.trim() ? site.sourceUrl : undefined) ??
    (typeof site.normalizedUrl === "string" && site.normalizedUrl.trim() ? site.normalizedUrl : undefined) ??
    "desconhecido";
  const fingerprint =
    typeof site.fingerprint === "string" && site.fingerprint.trim()
      ? site.fingerprint
      : "desconhecido";
  const extractedAt =
    typeof site.extractedAt === "string" && site.extractedAt.trim()
      ? site.extractedAt
      : "desconhecido";
  const fallbackUsed =
    site.quality?.fallbackUsed !== undefined
      ? (site.quality.fallbackUsed ? "true" : "false")
      : "desconhecido";
  const warnings =
    site.quality?.warnings !== undefined
      ? (site.quality.warnings.length > 0 ? site.quality.warnings.join("; ") : "nenhum")
      : "desconhecido";

  const brandName = (typeof site.brand?.brandName === "string" && site.brand.brandName.trim()) || "desconhecido";
  const industry = (typeof site.brand?.industry === "string" && site.brand.industry.trim()) || "desconhecido";
  const summary = (typeof site.business?.summary === "string" && site.business.summary.trim()) || "não informado";
  const valueProposition = (typeof site.business?.valueProposition === "string" && site.business.valueProposition.trim()) || "não informado";
  const products = site.business?.products?.length ? site.business.products.join("; ") : "não confirmados";
  const services = site.business?.services?.length ? site.business.services.join("; ") : "não confirmados";
  const audiences = site.business?.audiences?.length ? site.business.audiences.join("; ") : "não confirmados";
  const audienceProblems = site.business?.audienceProblems?.length ? site.business.audienceProblems.join("; ") : "não confirmados";
  const differentiators = site.business?.differentiators?.length ? site.business.differentiators.join("; ") : "não confirmados";
  const goals = site.business?.goals?.length ? site.business.goals.join(", ") : "não informados";

  const anchorsText = site.anchors
    ? [
        site.anchors.facts?.length
          ? `Fatos observados: ${site.anchors.facts.map(f => f.text).join("; ")}`
          : "",
        site.anchors.proprietaryTerms?.length
          ? `Termos proprietários: ${site.anchors.proprietaryTerms.join(", ")}`
          : "",
        site.anchors.objections?.length
          ? `Objeções observadas: ${site.anchors.objections.join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const pillars = site.editorial?.pillars?.length ? site.editorial.pillars.join("; ") : "não informados";
  const priorityTopics = site.editorial?.priorityTopics?.length ? site.editorial.priorityTopics.join("; ") : "não informados";
  const toneGuidelines = site.editorial?.toneGuidelines?.length ? site.editorial.toneGuidelines.join("; ") : "não informados";
  const prohibitedClaims = site.editorial?.prohibitedClaims?.length ? site.editorial.prohibitedClaims.join("; ") : "não informados";
  const palette =
    site.brand?.colors?.palette?.length
      ? site.brand.colors.palette.join(", ")
      : [
          site.brand?.colors?.primary,
          site.brand?.colors?.secondary,
          site.brand?.colors?.background,
          site.brand?.colors?.text,
          site.brand?.colors?.accent,
        ]
          .filter((c): c is string => typeof c === "string" && Boolean(c.trim()))
          .join(", ") || "não informada";

  const metadataSection = [
    "METADADOS DO SNAPSHOT (evidências salvas; não constitui leitura integral do website):",
    `- Identificador: ${id}`,
    `- Origem: ${originUrl}`,
    `- Fingerprint: ${fingerprint}`,
    `- Data da extração: ${extractedAt}`,
    `- Fallback utilizado na coleta: ${fallbackUsed}`,
    `- Avisos da coleta: ${warnings}`,
  ].join("\n");

  const synthesisSection = [
    "SÍNTESE DO SITE (material sintetizado; não substitui evidências brutas):",
    `- Marca/setor: ${brandName} (${industry})`,
    `- Resumo do negócio: ${summary}`,
    `- Proposta de valor: ${valueProposition}`,
    `- Produtos: ${products}`,
    `- Serviços: ${services}`,
    `- Públicos observados: ${audiences}`,
    `- Problemas do público: ${audienceProblems}`,
    `- Diferenciais: ${differentiators}`,
    `- Objetivos observados: ${goals}`,
    ...(anchorsText ? [`- Âncoras extraídas:\n${anchorsText}`] : []),
  ].join("\n");

  const editorialSection = [
    "ORIENTAÇÕES CONTEXTUAIS DO SITE (referência; não sobrepõem o pedido do usuário):",
    `- Pilares editoriais: ${pillars}`,
    `- Temas prioritários: ${priorityTopics}`,
    `- Tom observado no site: ${toneGuidelines}`,
    `- Alegações proibidas no site: ${prohibitedClaims}`,
    `- Paleta observada: ${palette}`,
  ].join("\n");

  const evidenceSection = [
    "EVIDÊNCIAS SALVAS DO SITE (texto bruto com identificação e origem):",
    ...site.evidence.map(e => {
      const evUrl = typeof e.sourceUrl === "string" && e.sourceUrl.trim() ? e.sourceUrl : "desconhecida";
      return `[evidência:${e.id}] [tipo:${e.kind}] [origem:${evUrl}]\n${e.text}`;
    }),
  ].join("\n\n");

  return [metadataSection, synthesisSection, editorialSection, evidenceSection].join("\n\n");
}

export async function loadGenerationSources(
  input: OrchestratedGenerationInput,
  ownerId: string
): Promise<import("@shared/generationSourceBundle").GenerationSourceBundle> {
  const sections:import("@shared/generationSourceBundle").GenerationContextSource[]=[];
  const add=(kind:import("@shared/generationSourceBundle").GenerationContextSource["kind"],origin:string,text:string,url?:string)=>sections.push({id:`source-${sections.length+1}`,kind,purpose:"content",origin,text,url});
  if(input.projectDossier?.trim()) add("project","frozen_project",input.projectDossier);
  else if(input.projectSnapshot) {
    const {name,niche,structuredData}=input.projectSnapshot;
    const {compileProjectDossier}=await import("@shared/brandProjects");
    add("project","frozen_project",compileProjectDossier(name,niche,structuredData));
  } else if(input.projectId) {
    const project=await getBrandProjectById(input.projectId,ownerId);
    if(!project)throw new Error("Projeto indisponível para este usuário");
    add("project","owned_project",project.compiled_document);
  }
  if(input.siteIntelligenceId){
    const site=await loadSiteIntelligence(input.siteIntelligenceId,ownerId);if(!site)throw new Error("Inteligência de site indisponível para este usuário");
    const full=projectSiteIntelligenceSnapshot(site);
    const synthesisStart=full.indexOf("SÍNTESE DO SITE"),editorialStart=full.indexOf("ORIENTAÇÕES CONTEXTUAIS DO SITE"),evidenceStart=full.indexOf("EVIDÊNCIAS SALVAS DO SITE");
    const synthesis=full.slice(synthesisStart,editorialStart),lines=synthesis.split("\n");
    const isGuidance=(line:string)=>/^- (Públicos observados|Problemas do público|Objetivos observados|Objeções observadas)/.test(line);
    const addSite=(origin:string,text:string,purpose:"content"|"guidance")=>sections.push({id:`source-${sections.length+1}`,kind:"site_snapshot",purpose,origin,text});
    addSite("site_capture_metadata",full.slice(0,synthesisStart),"guidance");
    addSite("site_capture_synthesis",lines.filter(line=>!isGuidance(line)).join("\n"),"content");
    addSite("site_capture_guidance",[full.slice(editorialStart,evidenceStart),...lines.filter(isGuidance)].join("\n"),"guidance");
    addSite("site_capture_evidence",full.slice(evidenceStart),"content");
  }
  const urls = new Set<string>([
    ...(input.inputType==="url"?[input.content]:[]),
    ...(input.sources??[]).filter(s=>s.kind==="url"&&s.purpose==="content").map(s=>s.value),
    ...(input.inputType==="text"?Array.from(input.content.matchAll(/https?:\/\/[^\s<>]+/g),m=>m[0].replace(/[),.;]+$/,"")):[]),
    ...(input.executionBrief?.brandInput?.websiteUrl?[input.executionBrief.brandInput.websiteUrl]:[])
  ]);
  for(const url of Array.from(urls)){const page=await scrapeUrl(url,{requireComplete:true});if(!page.content?.trim())throw new GenerationFailureError("source_limitation","copy");add("page","content_page",`Título: ${page.title}\nDescrição: ${page.description}\n${page.content}`,url);}
  if(input.inputType!=="url")add("request","piece_request",input.content);
  return {version:1,sources:sections,text:completeSourceContext(sections.map(s=>`ORIGEM: ${s.origin}${s.url?" "+s.url:""}\n${s.text}`).join("\n\n"))};
}

export async function loadGenerationContext(input:OrchestratedGenerationInput,owner:string):Promise<string>{return (await loadGenerationSources(input,owner)).text;}

export interface RuntimeDeps {
  shutdownSignal?: AbortSignal;
  store: GenerationStore;
  workerIdentity?: GenerationWorkerIdentity;
  prepare: typeof prepareOrchestratedGeneration;
  graphDeps?: Partial<ProposalGraphDeps>;
  verifyPrepared: typeof verifyPreparedEligibility;
  loadContext: import("./generationPreparation").PreparationDeps["loadContext"];
  persistTrace: typeof persistGenerationTraceMetrics;
  loadTraceCalls: typeof loadPersistedGenerationCalls;
}

/** Any prior repair effect consumes the proposal budget, including an uncertain one. */
export async function proposalRecoveryOperationKeys(
  store: GenerationStore,
  record: RequestRecord,
  proposalId: string,
  attemptId=proposalId
): Promise<string[]> {
  const prefix = `${proposalId}:`;
  // Real stores always implement this; historical adapters without an operation reader retain compatibility.
  const operations = store.listOperations
    ? await store.listOperations(record.id, record.ownerId)
    : [];
  return operations.filter(o=>o.operationKey.startsWith(prefix)||o.operationKey.startsWith(`${proposalId}-fb`)).flatMap(o=>{
    const relative=o.operationKey.replace(new RegExp(`^${proposalId}(?:-fb[1-3])?:`),"");
    if(relative!=="copy_recovery"&&!relative.startsWith("review_correction:"))return [];
    return [o.operationKey.startsWith(`${attemptId}:`)?relative:`previous_attempt:${relative}`];
  });
}

/** A separate worker owns invocation; HTTP handlers only admit/read/cancel durable requests. */
export async function executeClaimedGeneration(
  record: RequestRecord,
  leaseToken: string,
  overrides: Partial<RuntimeDeps> = {}
): Promise<GenerationCoordinatorSnapshot> {
  const store = overrides.store ?? createGenerationStore();
  const trace: GenerationTrace = {
    id: record.id,
    userUuid: record.ownerId,
    inputType: record.input.inputType,
    inputContent: record.input.content,
    platform: record.input.platform,
    postMode: record.input.postMode,
    creationMode: record.input.creationMode,
    requestedModel: record.input.model ?? "default",
    siteIntelligenceId: record.input.siteIntelligenceId,
    startedAt: record.createdAt ?? Date.now(),
    calls: [],
    events: [],
  };
  return runWithGenerationTrace(trace, async () => {
    recordGenerationEvent({
      stage: "generation_worker",
      status: "started",
      detail: "durable_worker",
      data: {
        requestId: record.id,
        resumed: Boolean(record.prepared),
        ...overrides.workerIdentity,
      },
    });
    try {
      return await executeClaimedGenerationWithinTrace(record, leaseToken, {
        ...overrides,
        store,
      });
    } finally {
      try {
        // Legacy test adapters may omit the new read API; the real store always provides it.
        if (store.listOperations) {
          const latest = await store.get(record.id, record.ownerId);
          if (!latest?.leaseToken || latest.leaseToken === leaseToken) {
            const operations = await store.listOperations(
              record.id,
              record.ownerId
            );
            if (localDiagnosticsEnabled() && latest) {
              await writeLocalDiagnostic(record.id, generationTerminalDiagnostic(latest, operations))
                .catch(error => console.warn("[generationRuntime] Local terminal diagnostic unavailable", error));
            }
            const summary = summarizeGenerationJournal(operations);
            const completedKeys = new Set(
              operations
                .filter(op => op.state === "completed")
                .map(op => op.operationKey)
            );
            const currentFailedKeys = new Set(
              trace.calls.map(call => call.operationKey)
            );
            const priorCalls = await (
              overrides.loadTraceCalls ?? loadPersistedGenerationCalls
            )(record.id, record.ownerId);
            trace.calls = [
              ...summary.calls,
              ...priorCalls.filter(
                call =>
                  call.operationKey &&
                  !completedKeys.has(call.operationKey) &&
                  !currentFailedKeys.has(call.operationKey)
              ),
              ...trace.calls.filter(
                call =>
                  call.operationKey && !completedKeys.has(call.operationKey)
              ),
            ];
            const savedEventHashes = new Set(summary.events.map(event => arsenalHash(event)));
            trace.events = [...summary.events, ...trace.events.filter(event => !savedEventHashes.has(arsenalHash(event)))];
            recordGenerationEvent({
              stage: "generation_metrics",
              status: "completed",
              detail: "journal_summary",
              data: {
                requestId: record.id,
                status: latest?.status,
                calls: trace.calls.length,
                effectiveModels: Array.from(
                  new Set(
                    trace.calls
                      .filter(call => call.effectiveModelReported !== false)
                      .map(call => call.effectiveModel)
                  )
                ),
                totalTokens: trace.calls.reduce(
                  (sum, call) => sum + call.totalTokens,
                  0
                ),
                knownOrEstimatedCostUsd: trace.calls.reduce(
                  (sum, call) => sum + call.estimatedCostUsd,
                  0
                ),
                costComplete: summary.unknownCostOperations.length === 0,
                unknownCostOperations: summary.unknownCostOperations,
                source: "durable_operation_journal",
                attemptsAreSummedOncePerOperation: true,
              },
            });
            await (overrides.persistTrace ?? persistGenerationTraceMetrics)(
              trace
            );
            if(latest?.status==="awaiting_reconciliation"&&store.persistReviewExpectation){
              const recovered=await (await import("./generationReconciliation")).reconcileGenerationReviews(record.id,record.ownerId);
              (await import("./generationEvents")).publishGenerationRecord(recovered);
            }
          }
        }
      } catch {
        await appendOperationalLog("GENERATION_TRACE_METRICS_PERSIST_FAILED", {
          generationRunId: record.id,
        }).catch(() => undefined);
      }
    }
  });
}

async function executeClaimedGenerationWithinTrace(
  record: RequestRecord,
  leaseToken: string,
  overrides: Partial<RuntimeDeps> = {}
): Promise<GenerationCoordinatorSnapshot> {
  const deps: RuntimeDeps = {
    store: overrides.store ?? createGenerationStore(),
    prepare: prepareOrchestratedGeneration,
    verifyPrepared: verifyPreparedEligibility,
    loadContext: loadGenerationSources,
    persistTrace: persistGenerationTraceMetrics,
    loadTraceCalls: loadPersistedGenerationCalls,
    ...overrides,
  };
  console.info(
    `[generationRuntime] 🚀 [${record.id.slice(0, 8)}] Iniciando execução (user: ${record.ownerId.slice(0, 8)}... | modo: ${record.input.postMode} | ratio: ${record.input.aspectRatio ?? "auto"})`
  );
  const controller = new AbortController();
  const shutdown=()=>controller.abort(new Error('local_executor_shutdown'));
  deps.shutdownSignal?.addEventListener('abort',shutdown,{once:true});
  if(deps.shutdownSignal?.aborted)shutdown();
  const remaining = record.deadlineAt - Date.now();
  if (remaining <= 0)
    return requestSnapshot(
      await deps.store.finish(
        record.id,
        leaseToken,
        "failed",
        "generation_deadline_exceeded"
      )
    );
  const timer = setTimeout(
    () => controller.abort(new Error("generation_deadline_exceeded")),
    remaining
  );
  let pulsing = false;
  const heartbeat = setInterval(async () => {
    if (pulsing) return;
    pulsing = true;
    try {
      const latest = await deps.store.heartbeat(record.id, leaseToken);
      if (latest.status === "cancelled")
        controller.abort(new Error("generation_cancelled"));
    } catch (error) {
      controller.abort(error);
    } finally {
      pulsing = false;
    }
  }, 10000);
  try {
    const operation = async <T>(key: string, work: () => Promise<T>) =>
      durableOperations(
        deps.store,
        record,
        leaseToken,
        controller.signal,
        "prepare:",
        [
          "context",
          "preferences",
          "catalog",
          "definitions",
          "recent_selections",
        ].includes(key)
      )(key, work);
    let resumeReviewPolicyVersion:import("./generationPreparation").PreparationDeps["resumeReviewPolicyVersion"];
    if (!record.prepared) {
      if (!deps.store.listOperations) {
        throw new GenerationFailureError("preparation_contract_incompatible", "selection", false);
      }
      let operations: Array<{ operationKey: string; state: string; result?: unknown }>;
      try {
        operations = await deps.store.listOperations(record.id, record.ownerId);
      } catch {
        throw new GenerationFailureError("preparation_contract_incompatible", "selection", false);
      }
      const validStates = new Set(["started", "completed", "failed", "uncertain"]);
      if (operations.some(op => !validStates.has(op.state))) {
        throw new GenerationFailureError("preparation_contract_incompatible", "selection", false);
      }

      const hasPaidPrepEffect = operations.some(op =>
        op.operationKey.startsWith("prepare:design-shortlist:") ||
        op.operationKey === "prepare:selection"
      );
      const selectionInputOp = operations.find(op => op.operationKey === "prepare:selection_input");

      let hasValidCompletedSelectionInput = false;
      if (selectionInputOp) {
        if (selectionInputOp.state !== "completed") {
          throw new GenerationFailureError("preparation_contract_incompatible", "selection", false);
        }
        try {
          const raw = readJournalResult(selectionInputOp.result);
          const parsed = selectionInputReceiptSchema.parse(raw);
          assertPinnedReviewConfig(parsed.reviewExecutionConfig);
          hasValidCompletedSelectionInput = true;
          resumeReviewPolicyVersion=parsed.reviewExecutionConfig.policyVersion;
        } catch {
          throw new GenerationFailureError("preparation_contract_incompatible", "selection", false);
        }
      }

      if (hasPaidPrepEffect && !hasValidCompletedSelectionInput) {
        throw new GenerationFailureError("preparation_contract_incompatible", "selection", false);
      }
    }
    const prepared = (record.prepared ??
      (await deps.prepare(
        record.input,
        record.ownerId,
        record.experimental,
        record.deadlineAt,
        {
          loadContext: deps.loadContext,
          resumeReviewPolicyVersion,
          signal: controller.signal,
          operation,
          recentSelections: () =>
            deps.store.recentSelections(record.ownerId, record.id),
          generate: params =>
            invokeLLM({
              ...params,
              signal: controller.signal,
              disableFallback: true,
            }),
        }
      ))) as PreparedGeneration;
    if (!record.prepared)
      await deps.store.savePrepared(record.id, leaseToken, prepared);
    const currentProposals=[...record.proposals];
    for (const proposal of record.proposals) {
      if (["ready","failed","cancelled","expired","waiting_input"].includes(proposal.status)) continue;
      try { await deps.verifyPrepared(prepared,record.experimental,undefined,[proposal.slot]); }
      catch(error) {
        if(deps.shutdownSignal?.aborted)throw new Error("local_executor_shutdown");
        const failure=failureFromError(error,"catalog");
        const failed={...proposal,status:"failed" as const,failure,errorReason:failure.code,completedAt:Date.now()};
        await deps.store.checkpointProposal(record.id,leaseToken,failed);
        currentProposals[proposal.slot]=failed;
      }
    }
    controller.signal.throwIfAborted();
    const coordinator = new GenerationCoordinator(
      {
        requestId: record.id,
        runId: record.id,
        actor: record.ownerId,
        prompt: record.input.content,
        reviewPolicyVersion: prepared.reviewPolicyVersion,
        reviewExecutionConfig: prepared.reviewExecutionConfig,
        editorialContextHash: prepared.editorialContextHash,
        editorialContext: prepared.editorialContext,
        projectSnapshot: record.input.projectSnapshot,
        projectDossier: record.input.projectDossier ?? (record.input.projectId ? prepared.contextContent : undefined),
        contextContent: prepared.contextContent,
        sourceImages: prepared.imageSourceReading?.images,
        sourceReferences: prepared.sourceReferences,
        selectedDefinitions: prepared.selectedDefinitions,
        alternativeDefinitions: prepared.alternativeDefinitions,
        selectionReasons: prepared.selectionReasons,
        editorialApproaches: prepared.editorialApproaches,
        experimental: record.experimental,
        visualPreference: prepared.visualPreference,
        imageObligation: prepared.imageObligation,
        perProposalImageObligations: prepared.perProposalImageObligations,
        executionBrief: record.input.executionBrief,
        creationMode: record.input.creationMode,
        platform: record.input.platform,
        tone: record.input.tone,
        model: record.input.model,
        postMode: record.input.postMode,
        deadlineMs: record.deadlineAt,
        signal: controller.signal,
        savedProposals: currentProposals,
        referenceImages: [
          record.input.imageUrl,
          ...(record.input.sources??[]).filter(s=>s.kind==="image"&&s.purpose==="visual_reference").map(s=>s.value),
          record.input.executionBrief?.brandInput?.referenceImageUrl,
        ].filter((v): v is string => Boolean(v)),
      },
      {
        actor: record.ownerId,
        generateText: params =>
          invokeLLM({
            ...params,
            signal: params.signal
              ? AbortSignal.any([controller.signal, params.signal])
              : controller.signal,
            disableFallback: true,
          }),
        mediaAdapter: {
          generate: request =>
            generateProposalMediaForSlot(request, {
              // The proposal graph wraps this entire adapter call in its durable operation.
              runIdempotent: async (_key, work) => work(),
            }),
        },
        ...deps.graphDeps,
        reviewOperations: async proposalId => (await deps.store.listOperations(record.id, record.ownerId))
          .filter(o => o.operationKey.startsWith(`${proposalId}:review:`) || o.operationKey.startsWith(`${proposalId}:review_evidence_repair:`))
          .map(o => ({ ...o, operationKey: o.operationKey.slice(proposalId.length + 1), result: readJournalResult(o.result) })),
        reviewRepairOperationKeys: async proposalId => (deps.store.listOperations ? await deps.store.listOperations(record.id,record.ownerId) : []).map(o => o.operationKey).filter(k=>k.startsWith(`${proposalId}:review_evidence_repair:`)||new RegExp(`^${proposalId}-fb[1-3]:review_evidence_repair:`).test(k)).map(k=>k.slice(proposalId.length+1)),
        recoveryOperationKeys: (proposalId,attemptId) =>
          proposalRecoveryOperationKeys(deps.store, record, proposalId,attemptId),
        persistUpdate: async delivery => {
          if(deps.shutdownSignal?.aborted)throw new Error("local_executor_shutdown");
          await deps.store.checkpointProposal(record.id, leaseToken, delivery);
        },
        deliver: async delivery => {
          try {
            await deps.store.commitDelivery(record.id, leaseToken, delivery);
          } catch (error) {
            // A lost HTTP response is not proof that the transaction rolled back.
            const latest = await deps.store
              .get(record.id, record.ownerId)
              .catch(() => null);
            const committed = latest?.proposals.find(
              p =>
                p.proposalId === delivery.proposalId &&
                p.revision === delivery.revision
            );
            if (
              committed?.status === "ready" &&
              arsenalHash(committed.bundle) === arsenalHash(delivery.bundle)
            )
              return;
            throw error;
          }
        },
        uncertainOperations:async proposalId=>(await deps.store.listOperations(record.id,record.ownerId)).some(o=>(o.operationKey.startsWith(`${proposalId}:`)||o.operationKey.startsWith(`${proposalId}-fb`))&&o.state!=="completed"&&isPaidGenerationOperation(o.operationKey)),
        expectationForProposal:deps.store.persistReviewExpectation ? (proposalId,key,expectation)=>deps.store.persistReviewExpectation!(record.id,leaseToken,`${proposalId}:${key}`,expectation) : undefined,
        operationForProposal: proposalId => async (params, work) =>
          durableOperations(
            deps.store,
            record,
            leaseToken,
            controller.signal,
            `${proposalId}:`,
            params.operationKey==="candidate"
          )(params.operationKey, work),
      }
    );
    const snapshot = await coordinator.start();
    if(deps.shutdownSignal?.aborted)throw new Error("local_executor_shutdown");
    console.info(
      `[generationRuntime] 🏁 [${record.id.slice(0, 8)}] Coordenador finalizou geração com status: ${snapshot.overallStatus}`
    );
    if (
      snapshot.overallStatus !== "running" &&
      snapshot.overallStatus !== "cancelled"
    )
      await deps.store.finish(record.id, leaseToken, snapshot.overallStatus);

    return snapshot;
  } catch (error) {
    console.error(
      `[generationRuntime] 💥 [${record.id.slice(0, 8)}] Erro fatal na geração:`,
      error instanceof Error ? error.message : error
    );
    if(deps.shutdownSignal?.aborted)throw new Error('local_executor_shutdown');
    const latest = await deps.store.get(record.id, record.ownerId);
    if (latest && !["queued", "running"].includes(latest.status))
      return requestSnapshot(latest);
    const failure = failureFromError(error);
    for (const proposal of latest?.proposals ?? []) {
      if (["ready","failed","cancelled","expired"].includes(proposal.status)) continue;
      await deps.store.checkpointProposal(record.id,leaseToken,{...proposal,status:"failed",failure,errorReason:failure.code,completedAt:Date.now()});
    }
    const message = failure.code;
    const readyCount =
      latest?.proposals.filter(p => p.status === "ready").length ?? 0;
    // A lost lease cannot finalize another worker's request; the fence rejects this update.
    return requestSnapshot(
      await deps.store.finish(
        record.id,
        leaseToken,
        readyCount > 0 ? "partial" : "failed",
        message
      )
    );
  } finally {
    deps.shutdownSignal?.removeEventListener('abort',shutdown);
    clearTimeout(timer);
    clearInterval(heartbeat);
  }
}
