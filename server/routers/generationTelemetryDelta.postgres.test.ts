import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { generationTelemetryBatchSchema } from "@shared/generationTelemetry";
import {
  generationReleasePostgresFixture,
  releaseOwner,
} from "../ai/workflows/generationReleasePostgres.fixture";

let pg: PGlite;
const requestId = randomUUID();
const exposureA = randomUUID();
const exposureB = randomUUID();

beforeAll(async () => {
  pg = await generationReleasePostgresFixture();
  await pg.exec(
    readFileSync(new URL("../../drizzle/0066_generation_telemetry.sql", import.meta.url), "utf8")
  );
  await pg.exec(
    readFileSync(new URL("../../drizzle/0071_generation_telemetry_delta.sql", import.meta.url), "utf8")
  );
  await pg.query(
    `insert into postspark.generation_runs(id,user_uuid,status,input_type,input_content,platform,post_mode,creation_mode,requested_model)
     values($1,$2,'running','text','brief','instagram','static','ideation','test')`,
    [requestId, releaseOwner]
  );
  await pg.query(
    `insert into postspark.generation_v5_requests(id,owner_id,idempotency_key,input_hash,input,status,experimental,deadline_at,proposals)
     values($1,$2,'telemetry-delta',$3,'{}','completed',false,now(),$4::jsonb)`,
    [
      requestId,
      releaseOwner,
      "b".repeat(64),
      JSON.stringify([
        { proposalId: "proposal-1", revision: 2, status: "ready" },
        { proposalId: "proposal-2", revision: 1, status: "ready" },
        { proposalId: "proposal-3", revision: 1, status: "ready" },
      ]),
    ]
  );
});

afterAll(() => pg?.close());

const record = async (owner: string, events: unknown[]) => {
  const parsed = generationTelemetryBatchSchema.parse({ events });
  const result = await pg.query<{ n: number }>(
    "select postspark.generation_record_telemetry($1,$2::jsonb) n",
    [owner, JSON.stringify(parsed.events)]
  );
  return result.rows[0].n;
};

describe("Gap 6: telemetria delta e originalPosition em PostgreSQL local (0071)", () => {
  it("persiste e lê original_position e delta via RPC compativel, mantendo suporte a eventos legados sem delta", async () => {
    const exposureLegacy = {
      eventId: randomUUID(),
      exposureId: exposureA,
      requestId,
      proposalId: "proposal-2",
      revision: 1,
      kind: "exposure" as const,
      position: 0,
    };
    const shiftedExposureAndChoiceAndEdit = [
      {
        eventId: randomUUID(),
        exposureId: exposureB,
        requestId,
        proposalId: "proposal-1",
        revision: 2,
        kind: "exposure" as const,
        position: 1,
        originalPosition: 2,
      },
      {
        eventId: randomUUID(),
        exposureId: exposureB,
        requestId,
        proposalId: "proposal-1",
        revision: 2,
        kind: "choice" as const,
        position: 1,
        originalPosition: 2,
      },
      {
        eventId: randomUUID(),
        exposureId: exposureB,
        requestId,
        proposalId: "proposal-1",
        revision: 2,
        kind: "edit" as const,
        changes: 3,
        delta: { fieldId: "extra-txt-1", property: "text", changeType: "text" },
      },
      {
        eventId: randomUUID(),
        exposureId: exposureB,
        requestId,
        proposalId: "proposal-1",
        revision: 2,
        kind: "edit" as const,
        changes: 1,
        delta: { fieldId: "shape-1", property: "style", changeType: "color" },
      },
    ];

    expect(await record(releaseOwner, [exposureLegacy])).toBe(1);
    expect(await record(releaseOwner, shiftedExposureAndChoiceAndEdit)).toBe(4);
    // Dedupe: segunda exposição com mesmo exposure_id/request_id/proposal_id/revision deve ser descartada
    expect(
      await record(releaseOwner, [
        { ...shiftedExposureAndChoiceAndEdit[0], eventId: randomUUID() },
      ])
    ).toBe(0);

    const rows = (
      await pg.query<{
        exposure_id: string;
        revision: number;
        kind: string;
        position: number | null;
        original_position: number | null;
        changes: number | null;
        delta: { fieldId?: string; property?: string; changeType?: string } | null;
      }>(
        `select exposure_id, revision, kind, position, original_position, changes, delta
         from postspark.generation_telemetry
         where request_id = $1
         order by created_at asc, kind asc`,
        [requestId]
      )
    ).rows;

    expect(rows).toHaveLength(5);
    const legacyRow = rows.find(r => r.exposure_id === exposureA)!;
    expect(legacyRow.position).toBe(0);
    expect(legacyRow.original_position).toBeNull();
    expect(legacyRow.delta).toBeNull();

    const rev2Exposure = rows.find(
      r => r.exposure_id === exposureB && r.kind === "exposure"
    )!;
    expect(rev2Exposure.position).toBe(1);
    expect(rev2Exposure.original_position).toBe(2);

    const rev2Choice = rows.find(
      r => r.exposure_id === exposureB && r.kind === "choice"
    )!;
    expect(rev2Choice.position).toBe(1);
    expect(rev2Choice.original_position).toBe(2);

    const edits = rows.filter(r => r.kind === "edit");
    expect(edits).toHaveLength(2);
    expect(edits.map(e => e.delta)).toEqual(
      expect.arrayContaining([
        { fieldId: "extra-txt-1", property: "text", changeType: "text" },
        { fieldId: "shape-1", property: "style", changeType: "color" },
      ])
    );
  });
});
