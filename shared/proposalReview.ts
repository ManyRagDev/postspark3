import { proposalReviewRecordV9Schema } from "./proposalReviewV9";
import { proposalReviewRecordV8Schema } from "./proposalReviewV8";
import { proposalReviewRecordV7Schema } from "./proposalReviewV7";
import { z } from "zod";

/** A detector's assertion is not evidence of correctness. Authority is assigned locally. */
export const proposalReviewFindingSchema = z
  .object({
    category: z.enum([
      "factual_contradiction",
      "explicit_requirement",
      "visible_text_loss",
      "media_missing",
      "contrast",
      "aesthetic",
      "entity_changed",
      "fact_omission",
      "narrative_gap",
      "narrative_structure",
      "unsupported_claim",
    ]),
    slideIndex: z.number().int().min(0).max(9),
    fieldId: z.string().max(120).nullable(),
    // An omitted fact can target an existing, currently empty optional field.
    observed: z.string().max(1500),
    expected: z.string().max(1500),
    sourceQuote: z.string().max(1500),
    explanation: z.string().min(1).max(1500),
    action: z.enum(["none", "replace_text"]),
  })
  .strict()
  .refine(
    finding =>
      Boolean(finding.observed) ||
      (finding.category === "fact_omission" && finding.action === "none"),
    {
      path: ["observed"],
      message: "Valor observado vazio só é válido para omissão em campo vazio",
    }
  );
export type ProposalReviewFinding = z.infer<typeof proposalReviewFindingSchema>;

export const reviewExecutionConfigV1Schema = z.object({
  version: z.literal(1), policyVersion: z.literal(6),
  resolvedModel: z.string().min(1).max(200),
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
  contractHash: z.string().regex(/^[a-f0-9]{64}$/),
  reasoningEffort: z.literal("medium"), temperature: z.literal(0.1),
  timeoutMs: z.number().int().min(1).max(300_000),
  profiles: z.object({
    standard: z.object({ maxCompletionTokens: z.literal(9216), maxSlides: z.literal(4), maxFacts: z.literal(8), maxAnchors: z.literal(20) }).strict(),
    extended: z.object({ maxCompletionTokens: z.literal(12288) }).strict(),
  }).strict(),
}).strict();
export type ReviewExecutionConfigV1 = z.infer<typeof reviewExecutionConfigV1Schema>;

/** Evidence anchors are checked against current native fields by the application.
 * Their existence is not an independent proof of semantic equivalence. */
export const proposalFactCoverageSchema = z
  .object({
    factId: z.string().min(1).max(80),
    status: z.enum(["covered", "partial", "missing", "uncertain"]),
    evidence: z
      .array(
        z
          .object({
            slideIndex: z.number().int().min(0).max(9),
            fieldId: z.string().min(1).max(120),
            quote: z.string().min(1).max(500),
          })
          .strict()
      )
      .max(4),
    missingSourceQuote: z.string().max(1500),
    explanation: z.string().min(1).max(1000),
  })
  .strict();
export type ProposalFactCoverage = z.infer<typeof proposalFactCoverageSchema>;

/** Independently enumerated from the source, not copied from the writer's plan.
 * Literal anchors remain provenance checks, not proof of semantic entailment. */
export const proposalSourceCoverageSchema = proposalFactCoverageSchema.extend({
  sourceQuote: z.string().min(1).max(1500),
  meaning: z.string().min(1).max(1000),
});
export type ProposalSourceCoverage = z.infer<
  typeof proposalSourceCoverageSchema
>;

export const narrativeCriteria = [
  "cover_hook",
  "progression",
  "cohesion",
  "closing",
] as const;
export const narrativeCheckSchema = z
  .object({
    criterion: z.enum(narrativeCriteria),
    status: z.enum(["met", "needs_revision", "user_directed", "uncertain"]),
    revisionSlides: z.array(z.number().int().min(0).max(9)).max(10),
    evidence: z
      .array(
        z
          .object({
            slideIndex: z.number().int().min(0).max(9),
            fieldId: z.string().min(1).max(120),
            quote: z.string().min(1).max(500),
          })
          .strict()
      )
      .min(1)
      .max(20),
    instructionQuote: z.string().max(1500),
    explanation: z.string().min(1).max(1000),
  })
  .strict()
  .refine(
    check =>
      check.status === "needs_revision"
        ? check.revisionSlides.length > 0 &&
          new Set(check.revisionSlides).size === check.revisionSlides.length
        : check.revisionSlides.length === 0,
    {
      path: ["revisionSlides"],
      message: "Somente needs_revision autoriza slides específicos para reparo",
    }
  );
export type NarrativeCheck = z.infer<typeof narrativeCheckSchema>;

export const proposalReviewResponseSchema = z
  .object({
    outcome: z.enum(["reviewed", "inconclusive"]),
    reviewedSlides: z.array(z.number().int().min(0).max(9)).max(10),
    findings: z.array(proposalReviewFindingSchema).max(20),
    limitation: z.string().max(1500),
    factCoverage: z.array(proposalFactCoverageSchema).max(16).optional(),
    sourceCoverage: z.array(proposalSourceCoverageSchema).max(16).optional(),
    narrativeChecks: z.array(narrativeCheckSchema).length(4).optional(),
  })
  .strict();

/** New compose reviews require coverage; the legacy shape remains readable. */
export const proposalReviewResponseV2Schema =
  proposalReviewResponseSchema.extend({
    factCoverage: z.array(proposalFactCoverageSchema).max(16),
  });

export const proposalReviewResponseV3Schema =
  proposalReviewResponseV2Schema.extend({
    sourceCoverage: z.array(proposalSourceCoverageSchema).min(1).max(16),
  });
export const proposalReviewResponseV4Schema =
  proposalReviewResponseV3Schema.extend({
    narrativeChecks: z.array(narrativeCheckSchema).length(4),
  });

export const legacyProposalReviewRecordSchema = z
  .object({
    policyVersion: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ]),
    round: z.enum(["initial", "recheck"]),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["passed", "correction_required", "inconclusive"]),
    reviewedSlides: z.array(z.number().int().min(0).max(9)).max(10),
    findings: z
      .array(
        proposalReviewFindingSchema
          .safeExtend({
            authority: z.enum([
              "diagnostic",
              "corroborated",
              "source_grounded",
              "contract_grounded",
            ]),
          })
          .strict()
      )
      .max(20),
    limitation: z.string().max(1500),
    factCoverage: z.array(proposalFactCoverageSchema).max(16).optional(),
    sourceCoverage: z.array(proposalSourceCoverageSchema).max(16).optional(),
    narrativeChecks: z.array(narrativeCheckSchema).length(4).optional(),
  })
  .strict()
  .superRefine((record, ctx) => {
    if (
      record.policyVersion >= 2 &&
      (!record.factCoverage ||
        (record.status === "passed" &&
          (record.factCoverage.some(
            f =>
              f.status !== "covered" ||
              !f.evidence.length ||
              f.missingSourceQuote.trim()
          ) ||
            new Set(record.factCoverage.map(f => f.factId)).size !==
              record.factCoverage.length)))
    )
      ctx.addIssue({
        code: "custom",
        path: ["factCoverage"],
        message: "Política 2 exige cobertura explícita para aprovação",
      });
    if (record.policyVersion >= 3) {
      const source = record.sourceCoverage;
      if (
        !source ||
        (record.status === "passed" &&
          ((Boolean(record.factCoverage?.length) && !source.length) ||
            source.some(
              f =>
                f.status !== "covered" ||
                !f.evidence.length ||
                f.missingSourceQuote.trim()
            ) ||
            new Set(source.map(f => f.factId)).size !== source.length))
      )
        ctx.addIssue({
          code: "custom",
          path: ["sourceCoverage"],
          message:
            "Política 3 exige auditoria explícita da fonte para aprovação",
        });
    }
    if (record.policyVersion === 4 && record.status !== "inconclusive") {
      const checks = record.narrativeChecks;
      if (
        !checks ||
        new Set(checks.map(c => c.criterion)).size !== 4 ||
        checks.some(c => c.status === "uncertain") ||
        (record.status === "passed" &&
          checks.some(c => c.status === "needs_revision"))
      )
        ctx.addIssue({
          code: "custom",
          path: ["narrativeChecks"],
          message:
            "Política 4 exige conferência completa da narrativa para aprovação",
        });
    }
    const corroborated = record.findings.some(
      finding => finding.authority !== "diagnostic"
    );
    if (
      (record.status === "passed" && corroborated) ||
      (record.status === "correction_required" && !corroborated)
    )
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Estado da revisão diverge da evidência corroborada",
      });
    if (record.status === "inconclusive" && !record.limitation.trim())
      ctx.addIssue({
        code: "custom",
        path: ["limitation"],
        message: "Revisão inconclusiva exige motivo explícito",
      });
  });

const effect = z.enum(["blocking", "advisory"]);
const materiality = { materiality: z.enum(["essential", "supporting"]), materialityReason: z.string().min(1).max(1000) };
export const reviewEvidenceAnchorV1Schema = z.object({ anchorId: z.string().regex(/^[a-f0-9]{64}$/), slideIndex: z.number().int().min(0).max(9), fieldId: z.string().min(1).max(120), itemIndex: z.number().int().min(0).nullable(), start: z.number().int().min(0), end: z.number().int().positive(), quote: z.string().min(1).max(500), textHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const reviewDurableContextV1Schema = z.object({
  version: z.literal(1), policyVersion: z.literal(6),
  requestId: z.string().uuid(), proposalId: z.string().min(1), revision: z.number().int().positive(),
  round: z.enum(["initial", "recheck"]),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
  renderHashes: z.array(z.object({ slideIndex: z.number().int().min(0).max(9), hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(10),
  anchorInventory: z.array(reviewEvidenceAnchorV1Schema.extend({ alias: z.string().regex(/^e[1-9]\d*$/) }).strict()),
  aliasMap: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  profile: z.enum(["standard", "extended"]),
}).strict();
export type ProposalReviewDurableContextV1 = z.infer<typeof reviewDurableContextV1Schema>;

export type ReviewEvidenceAnchorV1 = z.infer<typeof reviewEvidenceAnchorV1Schema>;
const evidenceIds = z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(20);
const coverageTransport = proposalFactCoverageSchema.omit({ evidence: true }).extend({ evidenceIds, ...materiality });
const findingTransport = z.object({ ...proposalReviewFindingSchema.shape, effect, evidenceIds }).omit({ observed: true }).strict();
const narrativeTransport = z.object({ ...narrativeCheckSchema.shape, effect }).omit({ evidence: true }).extend({ evidenceIds }).strict();
/** Static/literal schemas do not even advertise narrativeChecks. */
export function proposalReviewResponseV5Schema(narrative: boolean) {
  const base = z.object({ outcome: z.enum(["reviewed", "inconclusive"]), reviewedSlides: z.array(z.number().int().min(0).max(9)).max(10), findings: z.array(findingTransport).max(20), limitation: z.string().max(1500), factCoverage: z.array(coverageTransport).max(16), sourceCoverage: z.array(coverageTransport.extend({ sourceQuote: z.string().min(1).max(1500), meaning: z.string().min(1).max(1000) })).max(16) }).strict();
  return narrative ? base.extend({ narrativeChecks: z.array(narrativeTransport).length(4) }) : base;
}
export const proposalReviewRecordV5Schema = z.object({
  policyVersion: z.literal(5), round: z.enum(["initial", "recheck"]), inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["passed", "correction_required", "inconclusive"]), reviewedSlides: z.array(z.number().int().min(0).max(9)).max(10),
  findings: z.array(proposalReviewFindingSchema.safeExtend({ effect, authority: z.enum(["diagnostic", "corroborated", "source_grounded", "contract_grounded"]) })).max(20),
  factCoverage: z.array(proposalFactCoverageSchema.extend({...materiality,evidence:proposalFactCoverageSchema.shape.evidence.max(20)})).max(16), sourceCoverage: z.array(proposalSourceCoverageSchema.extend({...materiality,evidence:proposalFactCoverageSchema.shape.evidence.max(20)})).max(16),
  narrativeChecks: z.array(narrativeCheckSchema.safeExtend({ effect })).length(4).optional(),
  operationKeys: z.array(z.string().min(1).max(500)).max(2), limitation: z.string().max(1500),
}).strict().superRefine((record, ctx) => {
  const blocking = record.findings.some(f => f.effect === "blocking");
  if (new Set(record.reviewedSlides).size!==record.reviewedSlides.length || (record.status==="passed"&&!record.reviewedSlides.length) ||
      new Set(record.factCoverage.map(c=>c.factId)).size!==record.factCoverage.length || new Set(record.sourceCoverage.map(c=>c.factId)).size!==record.sourceCoverage.length ||
      (record.narrativeChecks && new Set(record.narrativeChecks.map(c=>c.criterion)).size!==4) ||
      (record.status==="passed" && ((record.factCoverage.length>0&&!record.sourceCoverage.length) || [...record.factCoverage,...record.sourceCoverage].some(c=>(c.status==="covered"&&(!c.evidence.length||c.missingSourceQuote.trim())) || (c.status==="partial"&&(!c.evidence.length||!c.missingSourceQuote.trim()))))) ||
      record.findings.some(f=>f.authority==="diagnostic"&&f.effect==="blocking")) ctx.addIssue({code:"custom",path:["status"],message:"Revisão V5 incompleta ou contraditória"});
  if(record.operationKeys.some((key,i)=>i===0 ? !key.endsWith(`:review:${record.round}:${record.inputHash}`) : !new RegExp(`:review_evidence_repair:${record.round}:[a-f0-9]{64}$`).test(key))) ctx.addIssue({code:"custom",path:["operationKeys"],message:"Recibo não corresponde à rodada/hash"});
  if ((record.status === "passed" && (blocking || record.operationKeys.length < 1 || [...record.factCoverage, ...record.sourceCoverage].some(c => c.materiality === "essential" && (c.status !== "covered" || !c.evidence.length || c.missingSourceQuote.trim())) || record.narrativeChecks?.some(c => c.status === "uncertain" || (c.effect === "blocking" && c.status === "needs_revision")))) || (record.status === "correction_required" && !blocking))
    ctx.addIssue({code:"custom", path:["status"], message:"Política 5 exige revisão completa sem pendência essencial ou achado bloqueante para aprovar"});
  if (record.status === "inconclusive" && !record.limitation.trim()) ctx.addIssue({code:"custom",path:["limitation"],message:"Revisão inconclusiva exige motivo"});
  if (new Set(record.operationKeys).size !== record.operationKeys.length) ctx.addIssue({code:"custom",path:["operationKeys"],message:"Recibos duplicados"});
});

const v6EvidenceIds = z.array(z.string().regex(/^e\d+$/)).max(20);
const coverageTransportV6Base = z.object({
  factId: z.string().min(1).max(80),
  status: z.enum(["covered", "partial", "missing", "uncertain"]),
  evidenceIds: v6EvidenceIds,
  materiality: z.enum(["essential", "supporting"]),
  materialityReason: z.string().max(1000).optional().default(""),
  missingSourceQuote: z.string().max(1500).optional().default(""),
  explanation: z.string().max(1000).optional().default(""),
}).strict();

const refineCoverage = (val: z.infer<typeof coverageTransportV6Base>, ctx: z.RefinementCtx) => {
  if (val.status === "covered" && val.materiality === "essential") return;
  if (val.materiality === "supporting" && !val.materialityReason.trim()) {
    ctx.addIssue({ code: "custom", path: ["materialityReason"], message: "materialityReason é obrigatória para supporting" });
  }
  if ((val.status !== "covered" || val.materiality === "supporting") && !val.explanation.trim()) {
    ctx.addIssue({ code: "custom", path: ["explanation"], message: "explanation é obrigatória para status não covered" });
  }
  if ((val.status === "partial" || val.status === "missing") && !val.missingSourceQuote.trim()) {
    ctx.addIssue({ code: "custom", path: ["missingSourceQuote"], message: "missingSourceQuote é obrigatória para partial ou missing" });
  }
};

const coverageTransportV6 = coverageTransportV6Base.superRefine(refineCoverage);

const sourceCoverageTransportV6 = coverageTransportV6Base.extend({
  sourceQuote: z.string().min(1).max(1500),
  meaning: z.string().min(1).max(1000),
}).strict().superRefine(refineCoverage);

const findingTransportV6 = z.object({
  ...proposalReviewFindingSchema.shape,
  effect,
  evidenceIds: v6EvidenceIds,
}).omit({ observed: true }).strict();

const narrativeTransportV6 = z.object({
  ...narrativeCheckSchema.shape,
  effect,
  explanation: z.string().max(1000).optional().default(""),
}).omit({ evidence: true }).extend({
  evidenceIds: v6EvidenceIds,
}).strict().superRefine((val, ctx) => {
  if (val.status !== "met" && !val.explanation.trim()) {
    ctx.addIssue({ code: "custom", path: ["explanation"], message: "explanation é obrigatória para narrativa não met" });
  }
  if (val.status === "user_directed" && !val.instructionQuote.trim()) {
    ctx.addIssue({ code: "custom", path: ["instructionQuote"], message: "instructionQuote é obrigatória quando status é user_directed" });
  }
});

export function proposalReviewResponseV6Schema(narrative: boolean) {
  const base = z.object({
    outcome: z.enum(["reviewed", "inconclusive"]),
    reviewedSlides: z.array(z.number().int().min(0).max(9)).max(10),
    findings: z.array(findingTransportV6).max(20),
    limitation: z.string().max(1500).optional().default(""),
    factCoverage: z.array(coverageTransportV6).max(16),
    sourceCoverage: z.array(sourceCoverageTransportV6).max(16),
  }).strict();
  return narrative ? base.extend({ narrativeChecks: z.array(narrativeTransportV6).length(4) }) : base;
}

export const proposalReviewRecordV6Schema = z.object({
  policyVersion: z.literal(6),
  round: z.enum(["initial", "recheck"]),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["passed", "correction_required", "inconclusive"]),
  reviewedSlides: z.array(z.number().int().min(0).max(9)).max(10),
  findings: z.array(proposalReviewFindingSchema.safeExtend({ effect, authority: z.enum(["diagnostic", "corroborated", "source_grounded", "contract_grounded"]) })).max(20),
  factCoverage: z.array(proposalFactCoverageSchema.extend({
    materiality: z.enum(["essential", "supporting"]),
    materialityReason: z.string().max(1000),
    explanation: z.string().max(1000),
    evidence: proposalFactCoverageSchema.shape.evidence.max(20),
  })).max(16),
  sourceCoverage: z.array(proposalSourceCoverageSchema.extend({
    materiality: z.enum(["essential", "supporting"]),
    materialityReason: z.string().max(1000),
    explanation: z.string().max(1000),
    evidence: proposalFactCoverageSchema.shape.evidence.max(20),
  })).max(16),
  narrativeChecks: z.array(narrativeCheckSchema.safeExtend({
    effect,
    explanation: z.string().max(1000),
  })).length(4).optional(),
  operationKeys: z.array(z.string().min(1).max(500)).max(2),
  limitation: z.string().max(1500),
}).strict().superRefine((record, ctx) => {
  const blocking = record.findings.some(f => f.effect === "blocking");
  if (
    new Set(record.reviewedSlides).size !== record.reviewedSlides.length ||
    (record.status === "passed" && !record.reviewedSlides.length) ||
    new Set(record.factCoverage.map(c => c.factId)).size !== record.factCoverage.length ||
    new Set(record.sourceCoverage.map(c => c.factId)).size !== record.sourceCoverage.length ||
    (record.narrativeChecks && new Set(record.narrativeChecks.map(c => c.criterion)).size !== 4) ||
    (record.status === "passed" && (
      (record.factCoverage.length > 0 && !record.sourceCoverage.length) ||
      [...record.factCoverage, ...record.sourceCoverage].some(c =>
        (c.status === "covered" && (!c.evidence.length || c.missingSourceQuote.trim())) ||
        (c.status === "partial" && (!c.evidence.length || !c.missingSourceQuote.trim()))
      )
    )) ||
    record.findings.some(f => f.authority === "diagnostic" && f.effect === "blocking")
  ) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Revisão V6 incompleta ou contraditória" });
  }
  if (
    record.operationKeys.some((key, i) =>
      i === 0
        ? !key.endsWith(`:review:${record.round}:${record.inputHash}`)
        : !new RegExp(`:review_evidence_repair:${record.round}:[a-f0-9]{64}$`).test(key)
    )
  ) {
    ctx.addIssue({ code: "custom", path: ["operationKeys"], message: "Recibo não corresponde à rodada/hash" });
  }
  if (
    (record.status === "passed" && (
      blocking ||
      record.operationKeys.length < 1 ||
      [...record.factCoverage, ...record.sourceCoverage].some(c =>
        c.materiality === "essential" &&
        (c.status !== "covered" || !c.evidence.length || c.missingSourceQuote.trim())
      ) ||
      record.narrativeChecks?.some(c => c.status === "uncertain" || (c.effect === "blocking" && c.status === "needs_revision"))
    )) ||
    (record.status === "correction_required" && !blocking)
  ) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Política 6 exige revisão completa sem pendência essencial ou achado bloqueante para aprovar" });
  }
  if (record.status === "inconclusive" && !record.limitation.trim()) {
    ctx.addIssue({ code: "custom", path: ["limitation"], message: "Revisão inconclusiva exige motivo" });
  }
  if (new Set(record.operationKeys).size !== record.operationKeys.length) {
    ctx.addIssue({ code: "custom", path: ["operationKeys"], message: "Recibos duplicados" });
  }
});

export const proposalReviewRecordSchema = z.union([
  legacyProposalReviewRecordSchema,
  proposalReviewRecordV5Schema,
  proposalReviewRecordV6Schema,
  proposalReviewRecordV7Schema,
  proposalReviewRecordV8Schema,
  proposalReviewRecordV9Schema,
]);
export type ProposalReviewRecord = z.infer<typeof proposalReviewRecordSchema>;
export function isBlockingReviewFinding(finding: ProposalReviewRecord["findings"][number]) {
  return "effect" in finding ? finding.effect === "blocking" : finding.authority !== "diagnostic";
}
