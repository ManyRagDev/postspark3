import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { summarizeDesignFrequency } from "./designFrequency";

it("reads terminal receipts under READ ONLY, deduplicates slots, and separates recoveries and missing data", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema postspark;
      create role anon; create role authenticated; create role service_role;
      create table postspark.generation_v5_requests (id int primary key, input jsonb, prepared jsonb,
        proposals jsonb, status text, catalog_revision bigint, created_at timestamptz);
      create table postspark.generation_v5_operations (request_id int, operation_key text, state text, result jsonb,
        primary key (request_id, operation_key));
      grant usage on schema postspark to anon, authenticated, service_role;
      grant select on all tables in schema postspark to service_role;
    `);
    await db.exec(readFileSync("drizzle/0081_design_frequency.sql", "utf8"));
    const familyElection = {version: 3, candidates: [
      { id: "id-a", family: "A", memberIds: ["offer-a"] }, { id: "id-b", family: "B", memberIds: ["offer-b"] },
    ], ranking: [{id: "id-a"}, {id: "id-b"}]};
    const prepared = {planning: {proposalSelectionVersion: 1, familyElection, slots: [
      {slot: 0, candidateId: "offer-a", status: "viable"}, {slot: 1, candidateId: "offer-a", status: "viable"},
      {slot: 2, candidateId: "offer-b", status: "viable"},
    ]}};
    const proposals = [{ slot: 0, status: "ready", bundle: {family: "A"} },
      { slot: 1, status: "ready", bundle: {family: "C"} }, { slot: 2, status: "failed" }];
    const catalog = { coverage: {entries: ["A", "A", "B", "C", "D"].map(family => ({family}))} };
    for (const [id,status,revision] of [[1,"partial",1],[2,"completed",2],[3,"failed",1],[4,"running",1]] as const) {
      await db.query("insert into postspark.generation_v5_requests values ($1,$2,$3,$4,$5,$6,$7)", [
        id, { postMode: "static", allowAiImages: false }, id === 3 ? null : prepared, JSON.stringify(proposals),
        status, revision, `2026-11-0${id}T12:00:00Z`,
      ]);
      await db.query("insert into postspark.generation_v5_operations values ($1,'prepare:catalog','completed',$2)", [id,catalog]);
    }
    const sql = "select * from postspark.design_frequency_receipts($1,$2)";
    await db.exec("set role authenticated");
    await expect(db.query(sql, [100, null])).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role service_role; begin read only");
    const snapshot = async () => (await db.query("select * from postspark.generation_v5_requests order by id")).rows;
    const before = await snapshot();
    const read = async (n: number, until: string) => summarizeDesignFrequency(
      (await db.query<{receipt: unknown}>(sql, [n, until])).rows);
    const report = await read(100, "2026-11-05");
    expect(report).toEqual(await read(100, "2026-11-05"));
    expect(report).toMatchObject({sampled: 3, skipped: 1});
    expect(report.cohorts).toHaveLength(2);
    for (const cohort of report.cohorts) {
      expect(cohort.rounds).toBe(1);
      expect(cohort.families).toEqual([
        {family:"A", registered:1, eligible:1, evaluated:1, selected:1, retained:1, delivered:1},
        {family:"B", registered:1, eligible:1, evaluated:1, selected:1, retained:0, delivered:0},
        {family:"C", registered:1, eligible:0, evaluated:0, selected:0, retained:0, delivered:1},
        {family:"D", registered:1, eligible:0, evaluated:0, selected:0, retained:0, delivered:0},
      ]);
    }
    expect(await read(1, "2026-11-05")).toEqual({sampled:1, skipped:1, cohorts:[]});
    expect((await read(100, "2026-11-02")).sampled).toBe(1);
    expect(await snapshot()).toEqual(before);
    await db.exec("rollback");
  } finally { await db.close(); }
});
