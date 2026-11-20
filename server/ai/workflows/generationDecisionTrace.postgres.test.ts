import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import {
  generationReleasePostgresFixture,
  releaseOwner,
} from "./generationReleasePostgres.fixture";
import { isPaidGenerationOperation } from "./generationJournalTrace";
import { inspectGenerationDecisionTrace } from "../../generationDecisionTrace";

it("reopens the original reviewer observation through the existing replay-safe PostgreSQL journal", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "postspark-decision-journal-")
  );
  let pg: PGlite | undefined;
  try {
    pg = await generationReleasePostgresFixture({ dataDir: directory });
    const value = async (sql: string, params: unknown[] = []) =>
      (await pg!.query<{ value: any }>(sql, params)).rows[0]?.value;
    const id = randomUUID(),
      hash = "a".repeat(64);
    const admitted = await value(
      "SELECT postspark.generation_admit($1,$2,$3,$4,$5::jsonb,false,now()+interval '5 minutes') AS value",
      [
        id,
        releaseOwner,
        id,
        hash,
        JSON.stringify({
          ownerId: releaseOwner,
          inputType: "text",
          content: "Café",
          platform: "instagram",
          postMode: "static",
          creationMode: "ideation",
          idempotencyKey: id,
        }),
      ]
    );
    const lease = await value(
      "SELECT postspark.generation_v5_claim('decision-trace-test') AS value"
    );
    const proposalId = admitted.proposals[0].proposalId;
    const key = `${proposalId}:review_observation:initial:${hash}:candidate`;
    const observation = {
      kind: "review_observation_v1",
      data: {
        version: 1,
        requestId: id,
        proposalId,
        slot: 0,
        family: "coffee",
        review: {
          status: "correction_required",
          round: "initial",
          inputHash: hash,
          findings: [
            {
              category: "unsupported_claim",
              explanation: "Promessa sem suporte",
            },
          ],
        },
      },
    };
    expect(isPaidGenerationOperation(key)).toBe(false);
    const operation = (action: string, result: unknown = null) =>
      value(
        "SELECT postspark.generation_v5_operation($1,$2,$3,$4,$5::jsonb) AS value",
        [id, lease.leaseToken, key, action, JSON.stringify(result)]
      );
    expect(await operation("begin_safe")).toMatchObject({ state: "new" });
    await operation("complete", observation);
    await pg.close();
    pg = new PGlite(directory);
    expect(await operation("begin_safe")).toEqual({
      state: "completed",
      result: observation,
    });
    const request = (
      await pg.query(
        "SELECT * FROM postspark.generation_v5_requests WHERE id=$1",
        [id]
      )
    ).rows[0];
    const operations = (
      await pg.query(
        "SELECT operation_key,state,result FROM postspark.generation_v5_operations WHERE request_id=$1",
        [id]
      )
    ).rows;
    const report = inspectGenerationDecisionTrace({
      request: request as any,
      operations: operations as any,
    });
    expect(report.generatedPosts[0].reviewerOutcome).toBe(
      "correction_required"
    );
    expect(report.observationReceipts[0].valid).toBe(true);
  } finally {
    await pg?.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
