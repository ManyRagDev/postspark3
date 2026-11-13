import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
const a='00000000-0000-4000-8000-000000000001', b='00000000-0000-4000-8000-000000000002';
let pg:PGlite;
const migration=(n:string)=>readFileSync(new URL(`../../drizzle/${n}`,import.meta.url),'utf8');
const identity=(id:string)=>pg.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
beforeAll(async()=>{
 pg=new PGlite();
 await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key, raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
 create schema postspark; grant usage on schema postspark to authenticated,anon,service_role;
 create table postspark.posts(id int primary key,user_uuid uuid); create table postspark.background_assets(id int primary key,user_uuid uuid);
 create table postspark.users(id int primary key,"openId" text);
 alter table postspark.posts enable row level security; alter table postspark.background_assets enable row level security; alter table postspark.users enable row level security;
 grant select,insert,update,delete on postspark.posts,postspark.background_assets to authenticated; grant select on postspark.users to authenticated;
 insert into auth.users(id) values ('${a}'),('${b}'); insert into postspark.posts values (1,'${a}'),(2,'${b}');
 insert into postspark.background_assets values (1,'${a}'),(2,'${b}'); insert into postspark.users values (1,'supabase:${a}'),(2,'supabase:${b}');`);
 await pg.exec(migration('0068_app_access.sql')); await pg.exec(migration('0069_app_access_policies.sql'));
 await pg.query('insert into postspark.app_access(user_id,reason) values ($1,$2),($3,$2)',[a,'approved',b]);
},30000);
afterAll(async()=>{await pg?.close()});
it('isolates both users and rejects cross-owner writes',async()=>{
 await pg.exec('set role authenticated');
 for(const [id,row] of [[a,1],[b,2]] as const){
  await identity(id);
  for(const table of ['posts','background_assets','users']) expect((await pg.query<{id:number}>(`select id from postspark.${table}`)).rows.map(r=>r.id)).toEqual([row]);
  await expect(pg.query('insert into postspark.posts values ($1,$2)',[row+10,id===a?b:a])).rejects.toMatchObject({code:'42501'});
  expect((await pg.query('update postspark.background_assets set user_uuid=$1 where id=$2 returning id',[id,row===1?2:1])).rows).toHaveLength(0);
 }
 await pg.exec('reset role');
});
it('revocation ignores metadata and denies arbitrary-user checks',async()=>{
 await pg.query("update auth.users set raw_app_meta_data='{\"role\":\"admin\"}' where id=$1",[a]);
 await pg.query('update postspark.app_access set revoked_at=now() where user_id=$1',[a]);
 await pg.exec('set role authenticated'); await identity(a);
 expect((await pg.query('select id from postspark.posts')).rows).toHaveLength(0);
 expect((await pg.query<{ok:boolean}>('select postspark.has_current_app_access() ok')).rows[0].ok).toBe(false);
 await expect(pg.query('select postspark.has_app_access($1)',[b])).rejects.toMatchObject({code:'42501'});
 await expect(pg.query('select postspark.has_current_app_access($1)',[b])).rejects.toMatchObject({code:'42883'});
 await expect(pg.query('select * from postspark.app_access')).rejects.toMatchObject({code:'42501'});
 await pg.exec('reset role; set role anon'); await expect(pg.query('select postspark.has_current_app_access()')).rejects.toMatchObject({code:'42501'}); await pg.exec('reset role');
});
