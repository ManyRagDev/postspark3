begin;
create table postspark.mare_speech_jobs (
  id uuid primary key,
  actor uuid not null,
  asset_id uuid not null references postspark.mare_assets(id) on delete cascade,
  seconds integer not null check(seconds between 1 and 60),
  state text not null default 'reserved' check(state in ('reserved','dispatching','running','ready','failed','cancelled','refused')),
  options jsonb not null, response jsonb, mask_key text, next_check timestamptz default now(),lease uuid, lease_until timestamptz,
  processor_token text check(processor_token ~ '^[a-f0-9]{40}$'),
  created_at timestamptz not null default now()
);
create index mare_speech_actor_time on postspark.mare_speech_jobs(actor,created_at desc);
alter table postspark.mare_speech_jobs enable row level security;
revoke all on postspark.mare_speech_jobs from public,anon,authenticated,service_role;
grant select,update,delete on postspark.mare_speech_jobs to service_role;

create function postspark.mare_admit_speech(p_id uuid,p_actor uuid,p_asset uuid,p_seconds integer,p_daily_seconds integer,p_options jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare existing integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('mare:speech:'||p_actor::text,0));
  if not exists(select from postspark.mare_assets a where a.id=p_asset and a.kind='video' and
      ((a.workspace_id is null and a.actor=p_actor) or postspark.agency_workspace_role(p_actor,a.workspace_id) in ('owner','editor'))) then
    raise exception using errcode='PT404',message='Video unavailable';
  end if;
  if p_seconds not between 1 and 60 or p_daily_seconds < 1 then
    raise exception using errcode='PT400',message='Invalid speech duration';
  end if;

  select sum(seconds) into existing from postspark.mare_speech_jobs where actor=p_actor and created_at>=now()-interval '24 hours' and state <> 'refused';
  if coalesce(existing,0)+p_seconds>p_daily_seconds or exists(select from postspark.mare_speech_jobs where actor=p_actor and state in ('reserved','dispatching','running') and created_at>now()-interval '5 minutes') then
    raise exception using errcode='PT429',message='Speech quota reached';
  end if;
  insert into postspark.mare_speech_jobs(id,actor,asset_id,seconds,options) values(p_id,p_actor,p_asset,p_seconds,p_options);
  return true;
end $$;
revoke all on function postspark.mare_admit_speech(uuid,uuid,uuid,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function postspark.mare_admit_speech(uuid,uuid,uuid,integer,integer,jsonb) to service_role;
create table postspark.mare_speech_health(id boolean primary key check(id), ready boolean not null, seen_at timestamptz not null);
alter table postspark.mare_speech_health enable row level security;
revoke all on postspark.mare_speech_health from public,anon,authenticated,service_role;
grant select, insert, update on postspark.mare_speech_health to service_role;
create function postspark.mare_claim_speech() returns setof postspark.mare_speech_jobs language sql security definer set search_path='' as $$
 update postspark.mare_speech_jobs set lease=gen_random_uuid(),lease_until=now()+interval '90 seconds'
 where id=(select id from postspark.mare_speech_jobs where next_check<=now() and (lease is null or lease_until<now())
 order by next_check for update skip locked limit 1) returning *
$$;
revoke all on function postspark.mare_claim_speech() from public,anon,authenticated;
grant execute on function postspark.mare_claim_speech() to service_role;
create index mare_speech_due on postspark.mare_speech_jobs(next_check) where next_check is not null;
notify pgrst,'reload schema';
commit;
