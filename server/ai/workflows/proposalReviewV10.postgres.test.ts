import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  generationReleasePostgresFixture,
  releaseOwner,
  releaseOther,
} from "./generationReleasePostgres.fixture";
import { resolveReviewExecutionConfigV10 } from "./reviewExecutionConfigV10";
import {
  proposalReviewRecordV10Schema,
  reviewDurableContextV5Schema,
} from "@shared/proposalReviewV10";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { arsenalHash } from "@shared/arsenalContent";
import { validateRecoveredReview } from "./generationReconciliation";

let pg: PGlite;
const definition = completeDesignTestDefinitions()[0],
  config = resolveReviewExecutionConfigV10("writer"),
  inputHash = "a".repeat(64);
const editorialContext = { version: 3, requirements: [] },
  sourceContextHash = arsenalHash(editorialContext);
const messages = [{ role: "user", content: "frozen review data" }];
async function value<T = any>(sql: string, params: unknown[] = []): Promise<T> {
  return (await pg.query<{ value: T }>(sql, params)).rows[0]?.value;
}
async function rejected(
  sql: string,
  params: unknown[],
  message: string | RegExp
) {
  await pg.exec("SAVEPOINT expected_failure");
  try {
    await expect(pg.query(sql, params)).rejects.toThrow(message);
  } finally {
    await pg.exec(
      "ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure"
    );
  }
}
beforeAll(async () => {
  pg = await generationReleasePostgresFixture();
  for (const migration of [
    "0044_generation_model_config.sql",
    "0046_generation_review_v10.sql",
    "0054_generation_execution_requirements.sql",
  ])
    await pg.exec(
      readFileSync(
        new URL(`../../../drizzle/${migration}`, import.meta.url),
        "utf8"
      )
    );
  await pg.query(
    "INSERT INTO postspark.design_components(id,definition_hash,definition,kind,status,actor_id) VALUES($1,$2,$3::jsonb,'content','approved',$4)",
    [definition.id, definition.hash, JSON.stringify(definition), releaseOwner]
  );
}, 30000);
afterAll(async () => {
  await pg?.close();
});
beforeEach(async () => {
  await pg.exec("BEGIN");
});
afterEach(async () => {
  await pg.exec("ROLLBACK");
});

async function setup(attempt = 0) {
  const id = randomUUID(),
    key = randomUUID();
  const request = await value(
    "SELECT postspark.generation_admit($1,$2,$3,$4,$5::jsonb,false,now()+interval '5 minutes') AS value",
    [
      id,
      releaseOwner,
      key,
      "b".repeat(64),
      JSON.stringify({
        ownerId: releaseOwner,
        inputType: "text",
        content: "Conheça",
        platform: "instagram",
        postMode: "static",
        creationMode: "ideation",
        idempotencyKey: key,
      }),
    ]
  );
  const claim = await value(
      "SELECT postspark.generation_v5_claim('review-test-worker') AS value"
    ),
    canonical = request.proposals[0].proposalId,
    prefix = canonical + (attempt ? `-fb${attempt}` : "");
  const prepared = {
    reviewPolicyVersion: 10,
    reviewExecutionConfig: config,
    editorialContextHash: sourceContextHash,
    editorialContext,
    planning: { intent: { requirements: [] } },
  };
  await value(
    "SELECT postspark.generation_v5_lease_update($1,$2,'prepared',$3::jsonb) AS value",
    [id, claim.leaseToken, JSON.stringify(prepared)]
  );
  const running = {
    ...request.proposals[0],
    status: "running",
    attempt: { index: attempt, id: prefix },
  };
  await value(
    "SELECT postspark.generation_v5_lease_update($1,$2,'checkpoint',$3::jsonb) AS value",
    [id, claim.leaseToken, JSON.stringify({ delivery: running })]
  );
  const unit = {
    id: "u1",
    scope: "art",
    slideIndex: 0,
    fieldId: "field-0",
    itemIndex: null,
    text: "Conheça",
    textHash: arsenalHash("Conheça"),
    visibleAliases: [],
  };
  const context = reviewDurableContextV5Schema.parse({
    version: 5,
    policyVersion: 10,
    requestId: id,
    proposalId: canonical,
    revision: 1,
    round: "initial",
    inputHash,
    configurationHash: config.configurationHash,
    sourceContextHash,
    renderHashes: [{ slideIndex: 0, hash: "c".repeat(64) }],
    anchorInventory: [],
    aliasMap: {},
    textUnitInventory: [unit],
    evidenceInventory: [],
    profile: "standard",
  });
  const expectation = {
    ...context,
    transport: {
      model: config.resolvedModel,
      configurationHash: config.configurationHash,
      messagesHash: arsenalHash(messages),
    },
  };
  const record = proposalReviewRecordV10Schema.parse({
    policyVersion: 10,
    round: "initial",
    inputHash,
    status: "passed",
    outcome: "reviewed",
    limitation: "",
    reviewedSlides: [0],
    checkedTextUnits: ["u1"],
    requirementChecks: [],
    messageAssessment: { status: "preserved", explanation: "" },
    findings: [],
    factCoverage: [],
    sourceCoverage: [],
    operationKeys: [`${canonical}:review:initial:${inputHash}`],
    discardedFields: [],
    factualAudit: {
      units: [{ unitId: "u1", classification: "non_factual", claimIds: [] }],
      claims: [],
    },
    evidenceInventory: [],
    unitChecks: [
      {
        unitId: "u1",
        meaning: "Convite para conhecer",
        verdict: "editorial",
        evidenceIds: [],
        editorialBasis: "invitation",
        explanation: "Convite sem afirmação factual neste cenário controlado.",
      },
    ],
    intentRequirements: [],
    intentChecks: [],
    findingEvidence: [],
    sequenceAssessment: { status: "coherent", explanation: "", promises: [] },
  });
  const result = {
    id: "provider-result",
    model: config.resolvedModel,
    choices: [
      {
        message: { role: "assistant", content: '{"outcome":"reviewed"}' },
        finish_reason: "stop",
      },
    ],
    __proposalReview: context,
  };
  const delivery = {
    ...running,
    status: "ready",
    contractVersion: 1,
    findings: [],
    diagnostics: [],
    reviews: [record],
    bundle: {
      runId: id,
      traceId: id,
      slot: 0,
      family: definition.completeDesign!.family,
      slides: [
        {
          id: "slide",
          role: "static",
          composition: {
            origin: {
              componentAssembly: {
                completeDesign: {
                  family: definition.completeDesign!.family,
                  baselineVerified: true,
                },
                componentIds: [definition.id],
                componentHashes: [definition.hash],
              },
            },
            assets: [],
          },
        },
      ],
    },
  };
  return {
    id,
    claim,
    canonical,
    prefix,
    prepared,
    context,
    expectation,
    record,
    result,
    delivery,
    key: `${prefix}:review:initial:${inputHash}`,
  };
}
type Scenario = Awaited<ReturnType<typeof setup>>;
async function expectReview(
  s: Scenario,
  key = s.key,
  expectation: any = s.expectation
) {
  await value(
    "SELECT postspark.generation_review_expectation($1,$2,$3,$4::jsonb) AS value",
    [s.id, s.claim.leaseToken, key, JSON.stringify(expectation)]
  );
}
async function completeReview(s: Scenario, key = s.key) {
  await expectReview(s, key);
  await value(
    "SELECT postspark.generation_v5_operation($1,$2,$3,'complete',$4::jsonb) AS value",
    [s.id, s.claim.leaseToken, key, JSON.stringify(s.result)]
  );
}
const commitSql =
  "SELECT postspark.generation_v5_lease_update($1,$2,'commit',$3::jsonb) AS value";
const commitArgs = (s: Scenario, delivery: any = s.delivery) => [
  s.id,
  s.claim.leaseToken,
  JSON.stringify({ delivery, projection: { id: "reviewed-projection" } }),
];

describe("V10 durable review PostgreSQL integration", () => {
  it("commits the material projection of a classified intent but still requires every content obligation", async () => {
    const s = await setup();
    const content = { id: "content", description: "Convite na arte", surface: "art", origin: "explicit", requestQuote: "Conheça", itemCount: null };
    const prepared = { ...s.prepared, planning: { intent: {
      requirements: [
        { ...content, kind: "content" },
        { id: "execution", kind: "execution", description: "Sem fotografia", surface: "art", origin: "explicit", requestQuote: "Sem fotografia", itemCount: null },
      ],
    } } };
    await value("SELECT postspark.generation_v5_lease_update($1,$2,'prepared',$3::jsonb) AS value", [s.id,s.claim.leaseToken,JSON.stringify(prepared)]);
    await completeReview(s);
    await rejected(commitSql, commitArgs(s), /Valid V10 review required/);
    const record = {
      ...s.record, intentRequirements: [content],
      intentChecks: [{ requirementId: "content", status: "met", explanation: "Convite visível", deliveries: [{ contentId: "c1", unitIds: ["u1"] }] }],
    };
    await rejected(commitSql, commitArgs(s, { ...s.delivery, reviews: [{ ...record, intentChecks: [] }] }), /Incomplete V10 review/);
    const stored = await value(commitSql, commitArgs(s, { ...s.delivery, reviews: [record] }));
    expect(stored.proposals[0].status).toBe("ready");
    expect(stored.prepared).toEqual(prepared);
  });
  it("persists version5 expectation and commits a V10 review bound to its completed receipt", async () => {
    const s = await setup();
    await completeReview(s);
    const stored = await value(commitSql, commitArgs(s));
    expect(stored.proposals[0].status).toBe("ready");
    expect(
      await value(
        "SELECT output_snapshot->0->>'id' AS value FROM postspark.generation_runs WHERE id=$1",
        [s.id]
      )
    ).toBe("reviewed-projection");
    expect(
      await value(
        "SELECT expectation AS value FROM postspark.generation_v5_operations WHERE request_id=$1 AND operation_key=$2",
        [s.id, s.key]
      )
    ).toEqual(s.expectation);
  });
  it("refuses ready without a passed final review or with divergent hash/identity/slides/units", async () => {
    const s = await setup();
    await completeReview(s);
    const variants = [
      { ...s.delivery, reviews: [] },
      ...[
        { ...s.record, status: "inconclusive" },
        { ...s.record, inputHash: "f".repeat(64) },
        { ...s.record, reviewedSlides: [1] },
        { ...s.record, checkedTextUnits: [] },
        { ...s.record, unitChecks: [] },
        { ...s.record, operationKeys: [`other:review:initial:${inputHash}`] },
      ].map(record => ({ ...s.delivery, reviews: [record] })),
      {
        ...s.delivery,
        bundle: {
          ...s.delivery.bundle,
          slides: [...s.delivery.bundle.slides, ...s.delivery.bundle.slides],
        },
      },
    ];
    for (const delivery of variants)
      await rejected(commitSql, commitArgs(s, delivery), /V10 review/);
    expect(
      await value(
        "SELECT proposals->0->>'status' AS value FROM postspark.generation_v5_requests WHERE id=$1",
        [s.id]
      )
    ).toBe("running");
  });
  it("rejects malformed model/config/request/proposal identity before persisting an expectation", async () => {
    const s = await setup();
    for (const expectation of [
      { ...s.expectation, version: 4 },
      { ...s.expectation, requestId: randomUUID() },
      { ...s.expectation, proposalId: "other" },
      { ...s.expectation, revision: 2 },
      { ...s.expectation, configurationHash: "d".repeat(64) },
      {
        ...s.expectation,
        renderHashes: [{ slideIndex: 1, hash: "c".repeat(64) }],
      },
      {
        ...s.expectation,
        transport: { ...s.expectation.transport, model: "other" },
      },
    ])
      await rejected(
        "SELECT postspark.generation_review_expectation($1,$2,$3,$4::jsonb)",
        [s.id, s.claim.leaseToken, s.key, JSON.stringify(expectation)],
        /review expectation/
      );
    expect(
      await value(
        "SELECT count(*)::int AS value FROM postspark.generation_v5_operations WHERE request_id=$1",
        [s.id]
      )
    ).toBe(0);
    await expectReview(s);
    await rejected(
      "SELECT postspark.generation_review_expectation($1,$2,$3,$4::jsonb)",
      [
        s.id,
        s.claim.leaseToken,
        s.key,
        JSON.stringify({
          ...s.expectation,
          transport: {
            ...s.expectation.transport,
            messagesHash: "f".repeat(64),
          },
        }),
      ],
      "Immutable review expectation"
    );
  });
  it("maps canonical review keys to fb1 DB receipts and cannot approve a fallback using attempt0", async () => {
    const s = await setup(1),
      initialKey = `${s.canonical}:review:initial:${inputHash}`;
    await completeReview(s, initialKey);
    await rejected(commitSql, commitArgs(s), "V10 review receipt mismatch");
    await completeReview(s);
    await rejected(
      commitSql,
      commitArgs(s, {
        ...s.delivery,
        reviews: [{ ...s.record, operationKeys: [s.key] }],
      }),
      "Invalid V10 review operation"
    );
    expect((await value(commitSql, commitArgs(s))).proposals[0].status).toBe(
      "ready"
    );
  });
  it("accepts one formal repair receipt in the same fallback without accepting different render evidence", async () => {
    const s = await setup(1),
      repairHash = "e".repeat(64),
      repairKey = `${s.prefix}:review_evidence_repair:initial:${repairHash}`;
    await completeReview(s);
    const divergentContext = {
      ...s.context,
      renderHashes: [{ slideIndex: 0, hash: "f".repeat(64) }],
    };
    const divergentKey = `${s.prefix}:review_evidence_repair:initial:${"d".repeat(64)}`;
    await expectReview(s, divergentKey, {
      ...divergentContext,
      transport: s.expectation.transport,
    });
    await value(
      "SELECT postspark.generation_v5_operation($1,$2,$3,'complete',$4::jsonb) AS value",
      [
        s.id,
        s.claim.leaseToken,
        divergentKey,
        JSON.stringify({ ...s.result, __proposalReview: divergentContext }),
      ]
    );
    await rejected(
      commitSql,
      commitArgs(s, {
        ...s.delivery,
        reviews: [
          {
            ...s.record,
            operationKeys: [
              ...s.record.operationKeys,
              `${s.canonical}:review_evidence_repair:initial:${"d".repeat(64)}`,
            ],
          },
        ],
      }),
      "V10 review receipt mismatch"
    );
    await completeReview(s, repairKey);
    const record = {
      ...s.record,
      operationKeys: [
        ...s.record.operationKeys,
        `${s.canonical}:review_evidence_repair:initial:${repairHash}`,
      ],
    };
    expect(
      (
        await value(
          commitSql,
          commitArgs(s, { ...s.delivery, reviews: [record] })
        )
      ).proposals[0].status
    ).toBe("ready");
  });
  it("recovers an uncertain fb1 response for the same owner, then queues replay without inventing approval", async () => {
    const s = await setup(1);
    await expectReview(s);
    await value(
      "SELECT postspark.generation_v5_operation($1,$2,$3,'uncertain',null) AS value",
      [s.id, s.claim.leaseToken, s.key]
    );
    const current = await value(
      "SELECT to_jsonb(r) AS value FROM postspark.generation_v5_requests r WHERE id=$1",
      [s.id]
    );
    for (const p of current.proposals)
      await value(
        "SELECT postspark.generation_v5_lease_update($1,$2,'checkpoint',$3::jsonb) AS value",
        [
          s.id,
          s.claim.leaseToken,
          JSON.stringify({
            delivery: { ...p, status: "awaiting_reconciliation" },
          }),
        ]
      );
    await value(
      "SELECT postspark.generation_v5_finish($1,$2,'awaiting_reconciliation') AS value",
      [s.id, s.claim.leaseToken]
    );
    const recoverSql =
      "SELECT postspark.generation_recover_review($1,$2,$3,$4::jsonb,$5::jsonb) AS value";
    await rejected(
      recoverSql,
      [
        s.id,
        releaseOther,
        s.key,
        JSON.stringify(s.expectation),
        JSON.stringify(s.result),
      ],
      "Request not awaiting reconciliation"
    );
    await rejected(
      recoverSql,
      [
        s.id,
        releaseOwner,
        s.key,
        JSON.stringify(s.expectation),
        JSON.stringify({
          ...s.result,
          __proposalReview: { ...s.context, inputHash: "f".repeat(64) },
        }),
      ],
      "Recovered review mismatch"
    );
    const recovered = await value(recoverSql, [
      s.id,
      releaseOwner,
      s.key,
      JSON.stringify(s.expectation),
      JSON.stringify(s.result),
    ]);
    expect(recovered.status).toBe("queued");
    expect(recovered.proposals[0].status).toBe("planned");
    expect(
      await value(
        "SELECT state AS value FROM postspark.generation_v5_operations WHERE request_id=$1 AND operation_key=$2",
        [s.id, s.key]
      )
    ).toBe("completed");
    const appRecord: any = {
      id: s.id,
      prepared: s.prepared,
      proposals: recovered.proposals,
    };
    const decoded = validateRecoveredReview(
      appRecord,
      { operationKey: s.key, state: "uncertain", expectation: s.expectation },
      {
        id: "provider-result",
        model: config.resolvedModel,
        messages,
        completion: '{"outcome":"reviewed"}',
      }
    );
    expect(decoded.__proposalReview).toEqual(s.context);
    for (const operation of [
      {
        operationKey: `unrelated:review:initial:${inputHash}`,
        expectation: s.expectation,
      },
      { operationKey: s.key, expectation: { ...s.expectation, revision: 2 } },
      { operationKey: s.key, expectation: { ...s.expectation, version: 4 } },
    ])
      expect(() =>
        validateRecoveredReview(
          appRecord,
          { ...operation, state: "uncertain" },
          {
            id: "provider-result",
            model: config.resolvedModel,
            messages,
            completion: '{"outcome":"reviewed"}',
          }
        )
      ).toThrow();
  });
  it("preserves the existing V9 expectation and commit guard", async () => {
    const s = await setup();
    const prepared = {
      reviewPolicyVersion: 9,
      reviewExecutionConfig: {
        configurationHash: "legacy-config",
        resolvedModel: "legacy-model",
      },
      editorialContextHash: "legacy-context",
    };
    await value(
      "SELECT postspark.generation_v5_lease_update($1,$2,'prepared',$3::jsonb) AS value",
      [s.id, s.claim.leaseToken, JSON.stringify(prepared)]
    );
    const expectation = {
      requestId: s.id,
      proposalId: s.canonical,
      configurationHash: "legacy-config",
      sourceContextHash: "legacy-context",
      transport: { model: "legacy-model" },
    };
    await expectReview(s, s.key, expectation);
    await rejected(
      commitSql,
      commitArgs(s, { ...s.delivery, reviews: [] }),
      "Valid review required"
    );
  });
});
