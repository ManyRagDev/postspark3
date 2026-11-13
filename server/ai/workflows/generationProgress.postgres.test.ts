import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { generationReleasePostgresFixture, releaseOwner, releaseOther } from './generationReleasePostgres.fixture';
import { generationProgressSchema } from '@shared/generationProgress';

let pg: PGlite;
const id = randomUUID(), token = randomUUID();
const proposals = [0,1,2].map(slot => ({ proposalId: `proposal-${slot}`, revision: 1,
  status: slot === 0 ? 'ready' : 'running', bundle: { privateDocument: 'x'.repeat(300_000) } }));
beforeAll(async () => {
  pg = await generationReleasePostgresFixture();
  await pg.exec(readFileSync(new URL('../../../drizzle/0044_generation_model_config.sql', import.meta.url), 'utf8'));
  await pg.exec("alter table postspark.generation_runs add column latency_ms integer, add column total_tokens integer, add column estimated_cost_usd numeric");
  await pg.exec(readFileSync(new URL('../../../drizzle/0064_generation_progress_reads.sql', import.meta.url), 'utf8'));
  await pg.query(`insert into postspark.generation_runs(id,user_uuid,status,input_type,input_content,platform,post_mode,creation_mode,requested_model,created_at)
    values($1,$2,'running','text','private brief','instagram','static','ideation','test','2020-01-02T03:04:05Z')`, [id,releaseOwner]);
  await pg.query(`insert into postspark.generation_v5_requests(id,owner_id,idempotency_key,input_hash,input,status,experimental,
      deadline_at,proposals,prepared,lease_token,lease_until)
    values($1,$2,'progress-test',$3,$7::jsonb,'running',false,now()+interval '10 minutes',
      $4::jsonb,$5::jsonb,$6,now()+interval '60 seconds')`,
    [id,releaseOwner,'a'.repeat(64),JSON.stringify(proposals),JSON.stringify({ privateReceipts: 'y'.repeat(1_000_000) }),token,JSON.stringify({content:'private brief',ownerId:releaseOwner,idempotencyKey:'private-key',pinnedDesign:{privateDocument:'z'.repeat(100_000)},imageUrl:'data:image/png;base64,'+'a'.repeat(100_000)})]);
},30_000);
afterAll(async () => { await pg?.close(); });
const progress = async (owner = releaseOwner) => (await pg.query<{ result: unknown }>(
  'select postspark.generation_progress($1,$2) result',[id,owner])).rows[0].result;

describe('bounded generation traffic in PostgreSQL', () => {
  it('reads progress below 1KB even with megabytes of documents, without exposing other owners', async () => {
    const full = (await pg.query<{ size: number }>('select octet_length(to_jsonb(r)::text) size from postspark.generation_v5_requests r where id=$1',[id])).rows[0].size;
    expect(full).toBeGreaterThan(1_800_000);
    for (let i=0;i<20;i++) {
      const value = generationProgressSchema.parse(await progress());
      expect(value.proposals).toEqual(proposals.map(({bundle: _bundle,...summary})=>summary));
      expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThan(1000);
      expect(JSON.stringify(value)).not.toMatch(/privateDocument|privateReceipts|private brief/);
    }
    expect(await progress(releaseOther)).toBeNull();
    await pg.exec('set role authenticated');
    await expect(progress()).rejects.toMatchObject({code:'42501'});
    await pg.exec('reset role');
  });
  it('reads only the client delivery, stripping private preparation and inline input in SQL', async () => {
    const result = (await pg.query<{ result: any }>('select postspark.generation_client_request($1,$2) result',[id,releaseOwner])).rows[0].result;
    expect(result.input).toEqual({content:'private brief'});
    expect(result.proposals).toEqual(proposals);
    expect(result.prepared).toEqual({imageSourceReading:{reading:{uncertainties:[]}}});
    expect(JSON.stringify(result)).not.toContain('privateReceipts');
    expect((await pg.query<{ result: unknown }>('select postspark.generation_client_request($1,$2) result',[id,releaseOther])).rows[0].result).toBeNull();
  });
  it('lists history without loading full output snapshots and keeps original committed counts', async () => {
    await pg.query('update postspark.generation_runs set output_snapshot=$2::jsonb where id=$1', [id,JSON.stringify([null,proposals[0],proposals[1]])]);
    const result = (await pg.query<{ result: any[] }>('select postspark.generation_history_summaries($1,100,0) result',[releaseOwner])).rows[0].result;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({id,variation_count:2,input_content:'private brief'});
    expect(Date.parse(result[0].created_at)).toBe(Date.parse('2020-01-02T03:04:05Z'));
    expect(result[0]).not.toHaveProperty('createdAt');
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(1000);
    expect(JSON.stringify(result)).not.toContain('privateDocument');
    expect((await pg.query<{ result: any[] }>('select postspark.generation_history_summaries($1,100,0) result',[releaseOther])).rows[0].result).toEqual([]);
  });
  it('paginates normalized history by timestamp then ID, retaining object snapshots and owner isolation', async () => {
    const second = '00000000-0000-4000-8000-000000000002';
    const third = '00000000-0000-4000-8000-000000000003';
    await pg.exec('begin');
    try {
      for (const [rowId, owner] of [[second, releaseOwner], [third, releaseOwner], [randomUUID(), releaseOther]]) {
        await pg.query(`insert into postspark.generation_runs(id,user_uuid,status,input_type,input_content,platform,post_mode,creation_mode,requested_model,created_at,output_snapshot)
          values($1,$2,'completed','text','history entry','instagram','static','ideation','test','2024-01-01T00:00:00Z',$3::jsonb)`,
          [rowId, owner, JSON.stringify({variations:[null, {headline:'Saved proposal'}]})]);
      }
      const all = (await pg.query<{ result: any[] }>('select postspark.generation_history_summaries($1,100,0) result', [releaseOwner])).rows[0].result;
      expect(all.map(row => row.id)).toEqual([third, second, id]);
      const page = (await pg.query<{ result: any[] }>('select postspark.generation_history_summaries($1,1,1) result', [releaseOwner])).rows[0].result;
      expect(page).toHaveLength(1);
      expect(page[0]).toMatchObject({id:second,variation_count:1});
      expect(Date.parse(page[0].created_at)).toBe(Date.parse('2024-01-01T00:00:00Z'));
    } finally { await pg.exec('rollback'); }
  });
  it('renews only a valid lease and returns status without documents', async () => {
    await pg.exec('set role service_role');
    const renewed = await pg.query<{ result: unknown }>('select postspark.generation_renew_lease($1,$2) result',[id,token]);
    expect(renewed.rows[0].result).toEqual({status:'running'});
    await expect(pg.query('select postspark.generation_renew_lease($1,$2)',[id,randomUUID()])).rejects.toMatchObject({code:'PT409'});
    await pg.exec('reset role');
    await pg.query("update postspark.generation_v5_requests set lease_until=now()-interval '1 second' where id=$1",[id]);
    await expect(pg.query('select postspark.generation_renew_lease($1,$2)',[id,token])).rejects.toMatchObject({code:'PT409'});
  });
});
