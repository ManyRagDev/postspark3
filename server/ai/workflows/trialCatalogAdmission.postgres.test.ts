import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { resolveGenerationModelConfig } from '../generationModel';
import { generationReleasePostgresFixture, releaseOwner, releaseOther } from './generationReleasePostgres.fixture';

let pg: PGlite;
let active: number, trial: number, alternate: number, archivedOnly: number, empty: number;
const component = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const historical = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const hash = 'a'.repeat(64);
const definition = { id: component, completeDesign: { familyId: 'fixture' } };
const config = resolveGenerationModelConfig({ generationModel: 'auto', postMode: 'static' });
const migration = (file: string) => readFileSync(new URL(`../../../drizzle/${file}`, import.meta.url), 'utf8');
async function scalar(sql: string, args: unknown[] = []) {
  return (await pg.query<{ value: any }>(sql, args)).rows[0]?.value;
}
async function admit(options: { owner?: string; key?: string; inputHash?: string; content?: string; experimental?: boolean | null; revision?: number; config?: unknown; expired?: boolean } = {}) {
  const owner = options.owner ?? releaseOwner, key = options.key ?? 'trial';
  const input = { ownerId: owner, idempotencyKey: key, inputType: 'text', content: options.content ?? 'Frozen catalog trial', platform: 'instagram', postMode: 'static', creationMode: 'ideation' };
  return scalar(`SELECT postspark.generation_admit_trial_external($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6,now()+$7::interval,$8::bigint,$9::jsonb) value`, [
    randomUUID(), owner, key, options.inputHash ?? hash, JSON.stringify(input), options.experimental === undefined ? true : options.experimental,
    options.expired ? '-1 minute' : '1 hour', options.revision ?? trial,
    JSON.stringify(options.config === undefined ? config : options.config),
  ]);
}
async function unchanged() {
  return scalar(`SELECT jsonb_build_object(
    'state',(SELECT to_jsonb(s) FROM postspark.catalog_state s),
    'components',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM postspark.design_components c),
    'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]') FROM postspark.design_component_search_documents i),
    'grants',(SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]') FROM postspark.design_component_asset_grants g)
  ) value`);
}
async function counts() {
  return scalar(`SELECT jsonb_build_array(
    (SELECT count(*) FROM postspark.generation_v5_requests),
    (SELECT count(*) FROM postspark.generation_runs),
    (SELECT count(*) FROM postspark.next_spark_reservations),
    (SELECT count(*) FROM postspark.spark_transactions)
  ) value`);
}
beforeAll(async () => {
  pg = await generationReleasePostgresFixture();
  // Auth fixture extension stays local to this suite; claims use the real column.
  await pg.exec("ALTER TABLE auth.users ADD COLUMN raw_app_meta_data jsonb DEFAULT '{}', ADD COLUMN raw_user_meta_data jsonb DEFAULT '{}'");
  for (const file of ['0044_generation_model_config.sql', '0045_staged_catalog_local_admission.sql', '0052_generation_preparation_reconciliation.sql', '0053_generation_model_choices.sql', '0057_generation_task_routing.sql', '0060_generation_task_routing_v2.sql', '0068_app_access.sql', '0070_trial_catalog_admission.sql']) await pg.exec(migration(file));
  await pg.query("INSERT INTO postspark.design_components(id,definition_hash,definition,kind,status,actor_id) VALUES($1,$2,$3,'content','draft',$4),($5,$2,'{}','content','archived',$4)", [component, hash, JSON.stringify(definition), releaseOwner, historical]);
  const revisions: number[] = [];
  for (let source = 100; source < 105; source++) revisions.push(await scalar("INSERT INTO postspark.catalog_revisions(source_revision,snapshot,summary,content_hash) VALUES($1,'{}','{}',$2) RETURNING revision value", [source, hash]));
  [active, trial, alternate, archivedOnly, empty] = revisions;
  for (const revision of [trial, alternate]) {
    await pg.query('INSERT INTO postspark.catalog_revision_definitions(revision,component_id,definition_hash,payload) VALUES($1,$2,$3,$4)', [revision, component, hash, JSON.stringify({ component_id: component, definition_hash: hash, definition, design_components: { status: 'draft' } })]);
  }
  for (const revision of [trial, archivedOnly]) await pg.query('INSERT INTO postspark.catalog_revision_definitions(revision,component_id,definition_hash,payload) VALUES($1,$2,$3,$4)', [revision, historical, hash, JSON.stringify({ definition: {}, design_components: { status: 'archived' } })]);
  await pg.query("INSERT INTO postspark.app_access(user_id,reason) VALUES($1,'fixture'),($2,'fixture')", [releaseOwner, releaseOther]);
}, 30_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec('DELETE FROM postspark.generation_v5_requests; DELETE FROM postspark.generation_runs; DELETE FROM postspark.next_spark_reservations; DELETE FROM postspark.spark_transactions; UPDATE postspark.app_access SET revoked_at=NULL');
  await pg.query("UPDATE auth.users SET raw_app_meta_data=CASE WHEN id=$1 THEN '{\"role\":\"admin\"}'::jsonb ELSE '{}'::jsonb END,raw_user_meta_data='{}'", [releaseOwner]);
  await pg.query("UPDATE postspark.design_components SET definition_hash=$2,definition=$3,status='draft' WHERE id=$1", [component, hash, JSON.stringify(definition)]);
  await pg.query('UPDATE postspark.catalog_state SET active_revision=$1', [active]);
});

describe('restricted external trial catalog admission', () => {
  it('denies anon/authenticated SQL execution and admits only through service_role', async () => {
    for (const role of ['anon', 'authenticated']) {
      await pg.exec(`SET ROLE ${role}`);
      try { await expect(admit()).rejects.toMatchObject({ code: '42501' }); }
      finally { await pg.exec('RESET ROLE'); }
    }
    await pg.exec('SET ROLE service_role');
    try { expect((await admit()).created).toBe(true); }
    finally { await pg.exec('RESET ROLE'); }
  });
  it('requires operator-owned admin metadata, active app access and experimental=true before billing', async () => {
    await pg.query("UPDATE auth.users SET raw_user_meta_data='{\"role\":\"admin\"}' WHERE id=$1", [releaseOther]);
    await expect(admit({ owner: releaseOther })).rejects.toThrow(/trial_catalog_forbidden/);
    await pg.query('UPDATE postspark.app_access SET revoked_at=now() WHERE user_id=$1', [releaseOwner]);
    await expect(admit()).rejects.toThrow(/trial_catalog_forbidden/);
    await pg.query('DELETE FROM postspark.app_access WHERE user_id=$1', [releaseOwner]);
    await expect(admit()).rejects.toThrow(/trial_catalog_forbidden/);
    await pg.query("INSERT INTO postspark.app_access(user_id,reason) VALUES($1,'fixture')", [releaseOwner]);
    for (const experimental of [false, null]) await expect(admit({ experimental })).rejects.toThrow(/trial_catalog_forbidden/);
    expect(await counts()).toEqual([0, 0, 0, 0]);
  });
  it('pins the trial and requested model without changing global head, statuses, indexes or grants', async () => {
    const before = await unchanged();
    const result = await admit();
    expect(result).toMatchObject({ created: true, execution_mode: 'external', executor_scope: null, catalog_revision: trial, experimental: true, generation_config: config, billing_mode: 'reserved', billing_reserved: 10 });
    expect(await scalar('SELECT requested_model value FROM postspark.generation_runs WHERE id=$1', [result.id])).toBe(config.model);
    expect(await counts()).toEqual([1, 1, 1, 0]);
    expect(await unchanged()).toEqual(before);
    expect(Date.parse(result.deadline_at) - Date.now()).toBeLessThan(601_000);
  });
  it('replays one receipt and one hold; conflicts on input, configuration, revision and mode', async () => {
    const first = await admit();
    const second = await admit();
    expect(second).toEqual({ ...first, created: false });
    for (const options of [{ inputHash: 'b'.repeat(64) }, { content: 'changed despite same supplied hash' }, { config: { ...config, configurationHash: 'b'.repeat(64) } }, { revision: alternate }]) await expect(admit(options)).rejects.toMatchObject({ code: '23505' });
    await pg.query("UPDATE postspark.generation_v5_requests SET execution_mode='local-demand',executor_scope='other' WHERE id=$1", [first.id]);
    await expect(admit()).rejects.toMatchObject({ code: '23505' });
    expect(await counts()).toEqual([1, 1, 1, 0]);
  });
  it('rejects active, absent, empty and archived-only releases without reserving', async () => {
    const before = await unchanged();
    for (const revision of [active, 999999, empty, archivedOnly]) await expect(admit({ revision })).rejects.toThrow(/trial_catalog_(revision_invalid|definition_unavailable)/);
    expect(await counts()).toEqual([0, 0, 0, 0]);
    expect(await unchanged()).toEqual(before);
  });
  it('rejects newly archived or divergent canonical definitions, also on replay', async () => {
    const first = await admit();
    await pg.query("UPDATE postspark.design_components SET status='archived' WHERE id=$1", [component]);
    await expect(admit()).rejects.toThrow(/definition_unavailable/);
    await pg.query("UPDATE postspark.design_components SET status='draft',definition_hash=$2 WHERE id=$1", [component, 'b'.repeat(64)]);
    await expect(admit()).rejects.toThrow(/definition_unavailable/);
    await pg.query("UPDATE postspark.design_components SET definition_hash=$2,definition='{}' WHERE id=$1", [component, hash]);
    await expect(admit()).rejects.toThrow(/definition_unavailable/);
    expect(await counts()).toEqual([1, 1, 1, 0]);
    expect(await scalar('SELECT catalog_revision value FROM postspark.generation_v5_requests WHERE id=$1', [first.id])).toBe(trial);
  });
  it('rechecks access for existing receipts', async () => {
    await admit();
    await pg.query('UPDATE postspark.app_access SET revoked_at=now() WHERE user_id=$1', [releaseOwner]);
    await expect(admit()).rejects.toThrow(/trial_catalog_forbidden/);
    expect(await counts()).toEqual([1, 1, 1, 0]);
  });
  it('applies current task routing validation before any reservation', async () => {
    for (const invalid of [null, {}, { ...config, configurationHash: 'bad' }, { ...config, taskRouting: { ...config.taskRouting, policy: 'bypassed' } }]) await expect(admit({ config: invalid })).rejects.toThrow(/Invalid generation configuration/);
    expect(await counts()).toEqual([0, 0, 0, 0]);
  });
  it('inherits deadline and two active request limits', async () => {
    await expect(admit({ expired: true })).rejects.toThrow(/deadline/);
    expect(await counts()).toEqual([0, 0, 0, 0]);
    await admit({ key: 'first' }); await admit({ key: 'second' });
    await expect(admit({ key: 'third' })).rejects.toMatchObject({ code: '54000' });
    expect(await counts()).toEqual([2, 2, 2, 0]);
  });
  it('rolls the hold, run and request back if pinning fails after reservation', async () => {
    const before = await unchanged();
    await pg.exec(`CREATE FUNCTION postspark.trial_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected_pin_failure'; END $$;
      CREATE TRIGGER trial_test_fail BEFORE UPDATE OF catalog_revision ON postspark.generation_v5_requests FOR EACH ROW EXECUTE FUNCTION postspark.trial_test_fail()`);
    try { await expect(admit()).rejects.toThrow(/injected_pin_failure/); }
    finally { await pg.exec('DROP TRIGGER trial_test_fail ON postspark.generation_v5_requests; DROP FUNCTION postspark.trial_test_fail()'); }
    expect(await counts()).toEqual([0, 0, 0, 0]);
    expect(await unchanged()).toEqual(before);
  });
});
