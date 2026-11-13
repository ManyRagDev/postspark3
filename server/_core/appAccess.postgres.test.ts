import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';

let pg: PGlite;
const a='00000000-0000-4000-8000-000000000001';
const b='00000000-0000-4000-8000-000000000002';
const migration=readFileSync(new URL('../../drizzle/0068_app_access.sql',import.meta.url),'utf8');
beforeAll(async()=>{
  pg=new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create schema postspark; grant usage on schema postspark to anon,authenticated,service_role;
    alter default privileges in schema postspark grant all on tables to anon,authenticated,service_role;
    insert into auth.users values ('${a}'),('${b}');`);
  await pg.exec(migration);
},30_000);
afterAll(async()=>{await pg?.close();});
async function allowed(id:string){
  return (await pg.query<{allowed:boolean}>('select postspark.has_app_access($1) allowed',[id])).rows[0].allowed;
}
it('requires an explicit grant, separates users and revokes immediately without login writes',async()=>{
  expect(await allowed(a)).toBe(false);
  await pg.query('insert into postspark.app_access(user_id,reason) values($1,$2)',[a,'verified migration grant']);
  await pg.exec('set role service_role');
  expect(await allowed(a)).toBe(true);
  expect(await allowed(b)).toBe(false);
  await expect(pg.query('insert into postspark.app_access(user_id,reason) values($1,$2)',[b,'self enrollment'])).rejects.toMatchObject({code:'42501'});
  await pg.exec('reset role');
  await pg.query('update postspark.app_access set revoked_at=now() where user_id=$1',[a]);
  await pg.exec('set role service_role');
  expect(await allowed(a)).toBe(false);
  await pg.exec('reset role');
  expect((await pg.query('select * from postspark.app_access')).rows).toHaveLength(1);
});
it('denies browser reads, writes and arbitrary-user RPC checks despite permissive defaults',async()=>{
  for(const role of ['anon','authenticated']){
    await pg.exec(`set role ${role}`);
    await expect(allowed(a)).rejects.toMatchObject({code:'42501'});
    await expect(pg.exec('select * from postspark.app_access')).rejects.toMatchObject({code:'42501'});
    await expect(pg.exec('update postspark.app_access set revoked_at=null')).rejects.toMatchObject({code:'42501'});
    await pg.exec('reset role');
  }
});
it('reapplying schema does not reactivate a revoked grant; unknown identities cannot be enrolled',async()=>{
  await pg.exec(migration);
  expect(await allowed(a)).toBe(false);
  await expect(pg.query('insert into postspark.app_access(user_id,reason) values($1,$2)',
    ['00000000-0000-4000-8000-000000000099','unknown'])).rejects.toMatchObject({code:'23503'});
  expect((await pg.query<{enabled:boolean}>("select relrowsecurity enabled from pg_class where oid='postspark.app_access'::regclass")).rows[0].enabled).toBe(true);
});
