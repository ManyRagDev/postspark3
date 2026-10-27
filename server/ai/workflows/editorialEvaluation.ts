import { z } from "zod";

const verdict = z.enum(["passed", "correction_required", "inconclusive"]);
export const editorialRecordedVerdictSchema = z
  .object({
    status: verdict,
    policyVersion: z.number().int().positive(),
    model: z.string().min(1),
    evidenceKind: z.enum(["provider_record", "test_fixture"]),
    inputHash: z.string().optional(),
  })
  .strict();
export const editorialCorpusSchema = z
  .object({
    version: z.literal(1),
    scope: z.string(),
    cases: z
      .array(
        z
          .object({
            id: z.string().min(1),
            origin: z.enum(["recorded-case", "synthetic"]),
            mode: z.enum(["compose", "literal"]),
            source: z.string().min(1),
            renderedSlides: z.array(z.string()).min(1),
            caption: z.string(),
            expectedVerdict: z.enum(["passed", "correction_required"]),
            rationale: z.string().min(1),
            recordedReview: editorialRecordedVerdictSchema.optional(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();
export type EditorialCorpus = z.infer<typeof editorialCorpusSchema>;
export type EditorialRecordedVerdict = z.infer<
  typeof editorialRecordedVerdictSchema
>;

/** Scores externally recorded verdicts against independent manual labels.
 * Never calls a model or infers semantics from keywords. Test fixtures are excluded
 * from model metrics, and absence/inconclusion must not be reported as success. */
export function evaluateEditorialReplay(
  rawCorpus: unknown,
  supplied?: Record<string, EditorialRecordedVerdict>
) {
  const corpus = editorialCorpusSchema.parse(rawCorpus);
  const ids = new Set(corpus.cases.map(c => c.id));
  if (ids.size !== corpus.cases.length)
    throw new Error("duplicate_editorial_case");
  if (supplied && Object.keys(supplied).some(id => !ids.has(id)))
    throw new Error("unknown_editorial_case");
  const rows = corpus.cases.map(c => {
    // Explicit supplied results replace the baseline; never fill their gaps with
    // older model/policy results and pretend it is one comparison.
    const raw = supplied ? supplied[c.id] : c.recordedReview;
    const review = raw ? editorialRecordedVerdictSchema.parse(raw) : undefined;
    const result = !review
      ? "unmeasured"
      : review.evidenceKind === "test_fixture"
        ? "fixture_only"
        : review.status === "inconclusive"
          ? "inconclusive"
          : review.status === c.expectedVerdict
            ? "correct"
            : review.status === "passed"
              ? "false_approval"
              : "false_rejection";
    return { caseId: c.id, expected: c.expectedVerdict, result, review };
  });
  const groups: Record<
    string,
    {
      measured: number;
      correct: number;
      falseApproval: number;
      falseRejection: number;
      inconclusive: number;
    }
  > = {};
  for (const row of rows) {
    if (!row.review || row.review.evidenceKind !== "provider_record") continue;
    const key = `${row.review.model}/policy-${row.review.policyVersion}`;
    const counts = (groups[key] ??= {
      measured: 0,
      correct: 0,
      falseApproval: 0,
      falseRejection: 0,
      inconclusive: 0,
    });
    counts.measured++;
    if (row.result === "correct") counts.correct++;
    if (row.result === "false_approval") counts.falseApproval++;
    if (row.result === "false_rejection") counts.falseRejection++;
    if (row.result === "inconclusive") counts.inconclusive++;
  }
  return {
    mode: "offline-recorded-verdicts" as const,
    newProviderCalls: 0,
    scope: corpus.scope,
    limitation:
      "Replay does not predict a new model response. Protocol/unit tests are not semantic homologation.",
    totalCases: rows.length,
    unmeasured: rows.filter(r => r.result === "unmeasured").length,
    fixtureOnly: rows.filter(r => r.result === "fixture_only").length,
    groups,
    rows,
  };
}
