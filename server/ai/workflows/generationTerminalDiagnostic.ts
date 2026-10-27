import { ENV } from "../../_core/env";
import { arsenalHash } from "@shared/arsenalContent";
import type { RequestRecord } from "./generationStore";

/** Local operator evidence, emitted after reading the owner-bound durable state. */
export function generationTerminalDiagnostic(
  record: RequestRecord,
  operations: Array<{ operationKey: string; state: string }>
) {
  const config = record.prepared?.reviewExecutionConfig;
  const context = record.prepared?.editorialContext;
  return {
    kind: "generation_terminal",
    at: Date.now(),
    requestId: record.id,
    ownerId: record.ownerId,
    status: record.status,
    configurationHash: config?.configurationHash,
    preparationVersion: record.prepared?.preparationVersion,
    contextVersion: context?.version,
    decisionVersion: record.prepared?.electionReceipt?.version,
    reviewPolicyVersion: record.prepared?.reviewPolicyVersion,
    inputSizes: context ? {sourceCharacters:context.sources.reduce((n,s)=>n+s.text.length,0),contextCharacters:JSON.stringify(context).length} : undefined,
    guidanceVersion:
      (config?.version === 2 || config?.version === 3 || config?.version === 4)
        ? (config.editorialGuidanceVersion ?? 1)
        : undefined,
    recoveryPlanHash:record.prepared?.recoveryPlanHash,
    sourceInventory:record.prepared?.sourceReferences?.map(s=>({id:s.id,kind:s.kind,purpose:s.purpose,origin:s.origin})),
    reconciliationPending:record.status==="awaiting_reconciliation",
    editorialContextHash: record.prepared?.editorialContextHash,
    projectSnapshotHash: record.input.projectSnapshot
      ? arsenalHash(record.input.projectSnapshot)
      : undefined,
    playbookVersion: context?.socialPlaybook?.version,
    playbookHash: context?.socialPlaybook ? arsenalHash(context.socialPlaybook) : undefined,
    sources: context?.sources.map(s => ({origin:s.origin, hash:s.hash})),
    models: {review:config?.resolvedModel, text:(config?.version === 2 || config?.version === 3 || config?.version === 4) ? config.textModel : undefined},
    editorialApproaches: ENV.aiTraceStoreContent ? record.prepared?.editorialApproaches : record.prepared?.editorialApproaches?.map(a=>a?arsenalHash(a):null),
    instructionOrigins: context?.instructionOrigins,
    operations: operations.map(o => ({ key: o.operationKey, state: o.state })),
    proposals: record.proposals.map(p => ({
      proposalId: p.proposalId,
      slot: p.slot,
      revision: p.revision,
      attempt:p.attempt,
      textRecoveries:operations.filter(o=>(o.operationKey.startsWith(p.proposalId+":")||o.operationKey.startsWith(p.proposalId+"-fb"))&&(/:copy_recovery$|:review_correction:/.test(o.operationKey))).length,
      formalRepairs:operations.filter(o=>(o.operationKey.startsWith(p.proposalId+":")||o.operationKey.startsWith(p.proposalId+"-fb"))&&o.operationKey.includes(":review_evidence_repair:")).length,
      status: p.status,
      stage:
        p.failure?.stage ?? (p.status === "ready" ? "delivery" : undefined),
      reason: p.failure?.code ?? p.errorReason,
      findings: p.findings,
      diagnostics: p.diagnostics,
      reviews: p.reviews?.map(r => ({
        status: r.status,
        findings: r.findings,
        ...("factualAudit" in r ? {factualAudit:ENV.aiTraceStoreContent?r.factualAudit:{units:r.factualAudit.units.length,claims:r.factualAudit.claims.length,statuses:r.factualAudit.claims.map(c=>c.status)}} : {}),
      })),
      completedAt: p.completedAt,
    })),
  };
}
