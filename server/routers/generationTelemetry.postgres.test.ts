import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { generationReleasePostgresFixture, releaseOwner, releaseOther } from "../ai/workflows/generationReleasePostgres.fixture";

let pg: PGlite;
const requestId = randomUUID(), exposureId = randomUUID();
const event = { eventId: randomUUID(), exposureId, requestId, proposalId: "proposal-1", revision: 1, kind: "exposure", position: 0 };
beforeAll(async () => {
  pg = await generationReleasePostgresFixture();
  await pg.exec(readFileSync(new URL("../../drizzle/0066_generation_telemetry.sql", import.meta.url), "utf8"));
  await pg.query(`insert into postspark.generation_runs(id,user_uuid,status,input_type,input_content,platform,post_mode,creation_mode,requested_model)
    values($1,$2,'running','text','private','instagram','static','ideation','test')`, [requestId,releaseOwner]);
  await pg.query(`insert into postspark.generation_v5_requests(id,owner_id,idempotency_key,input_hash,input,status,experimental,deadline_at,proposals)
    values($1,$2,'telemetry',$3,'{}','completed',false,now(),$4::jsonb)`, [requestId,releaseOwner,"a".repeat(64),JSON.stringify([1,2,3].map(index => ({proposalId:`proposal-${index}`,revision:1,status:"ready"})))]);
});
afterAll(() => pg?.close());
const record = async (owner: string, events: unknown[]) => (await pg.query<{ n: number }>("select postspark.generation_record_telemetry($1,$2::jsonb) n", [owner,JSON.stringify(events)])).rows[0].n;
describe("generation telemetry storage isolation", () => {
  it("accepts owned ready proposals, discards duplicates and rejects foreign requests/proposals", async () => {
    expect(await record(releaseOther,[event])).toBe(0);
    expect(await record(releaseOwner,[{...event,proposalId:"unknown"}])).toBe(0);
    expect(await record(releaseOwner,[event])).toBe(1);
    expect(await record(releaseOwner,[event])).toBe(0);
    expect(await record(releaseOwner,[{...event,eventId:randomUUID()}])).toBe(0);
    await pg.exec("set role authenticated");
    await expect(record(releaseOwner,[event])).rejects.toMatchObject({code:"42501"});
    await pg.exec("reset role");
  });
  it("bounds batch size, expires analysis without touching generations or billing", async () => {
    expect(await record(releaseOwner,Array.from({length:21},()=>({...event,eventId:randomUUID()})))).toBe(0);
    await pg.exec("update postspark.generation_telemetry set created_at=now()-interval '31 days'");
    expect((await pg.query<{ n: number }>("select postspark.generation_prune_telemetry() n")).rows[0].n).toBe(1);
    expect((await pg.query("select id from postspark.generation_v5_requests where id=$1",[requestId])).rows).toHaveLength(1);
  });
  it("never exceeds 120 accepted events per owner per minute, including a partial last batch", async () => {
    const batch = (length: number) => Array.from({length},()=>({...event,eventId:randomUUID(),kind:"choice"}));
    for (let i=0;i<5;i++) expect(await record(releaseOwner,batch(20))).toBe(20);
    expect(await record(releaseOwner,batch(19))).toBe(19);
    expect(await record(releaseOwner,batch(20))).toBe(1);
    expect(await record(releaseOwner,batch(1))).toBe(0);
    expect((await pg.query<{n:number}>("select count(*)::integer n from postspark.generation_telemetry")).rows[0].n).toBe(120);
  });
});
