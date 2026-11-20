begin;

create table postspark.start_pilot_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation_id uuid unique,
  draft jsonb,
  finalized jsonb,
  uploaded_bytes int not null default 0,
  enrolled_at timestamptz not null default now(),
  finalized_at timestamptz
);
alter table postspark.start_pilot_accounts enable row level security;
revoke all on postspark.start_pilot_accounts from public,anon,authenticated,service_role;

create function postspark.start_pilot_enroll(p_user_id uuid,p_seats int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if p_seats is null or p_seats <= 0 then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(76001);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,74));
  if postspark.has_app_access(p_user_id) or exists (
    select 1 from postspark.app_access where user_id=p_user_id and revoked_at is not null
  ) or exists (select 1 from postspark.pro_paid_periods where user_id=p_user_id) then return false; end if;

  select email into v_email from auth.users where id=p_user_id and email_confirmed_at is not null;
  if v_email is null then return false; end if;
  if exists (select 1 from postspark.start_pilot_accounts where user_id=p_user_id) then return true; end if;
  if (select count(*) from postspark.start_pilot_accounts)>=p_seats then return false; end if;
  insert into postspark.start_pilot_accounts(user_id) values(p_user_id);
  insert into postspark.profiles(id,email,plan,sparks) values(p_user_id,v_email,'START',40)
  on conflict(id) do update set plan='START',sparks=40 where profiles.plan='FREE';
  if not found then raise exception 'Profile not eligible for START' using errcode='PT409'; end if;
  return true;
end $$;

create function postspark.start_pilot_state(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('requestId',s.generation_id,'draft',s.draft,'finalized',s.finalized)
    from postspark.start_pilot_accounts s
    where s.user_id=p_user_id and not exists (
      select 1 from postspark.app_access where user_id=p_user_id and revoked_at is not null
    );
$$;

create function postspark.has_start_pilot(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from postspark.start_pilot_accounts where user_id=p_user_id)
    and not exists(select 1 from postspark.app_access where user_id=p_user_id and revoked_at is not null)
    and not exists(select 1 from postspark.pro_paid_periods where user_id=p_user_id);
$$;

create function postspark.start_pilot_limit_generation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from postspark.profiles where id=new.owner_id and plan='START') then return new; end if;
  if not postspark.has_start_pilot(new.owner_id) then
    raise exception 'START access unavailable' using errcode='PT403';
  end if;
  if new.input->>'inputType' is distinct from 'text' or new.input->'allowAiImages' is distinct from 'false'::jsonb
     or new.input ? 'generationParentRequestId' or new.input ? 'fixedDesign' then
    raise exception 'Generation unavailable in START' using errcode='PT403';
  end if;
  update postspark.start_pilot_accounts set generation_id=new.id
    where user_id=new.owner_id and generation_id is null;
  if not found then raise exception 'start_round_already_used' using errcode='PT409'; end if;
  return new;
end $$;

create function postspark.start_pilot_reserve_upload(p_user_id uuid,p_bytes int)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_bytes is null or p_bytes<=0 or p_bytes>12*1024*1024 then return false; end if;
  update postspark.start_pilot_accounts set uploaded_bytes=uploaded_bytes+p_bytes
    where user_id=p_user_id and finalized is null and uploaded_bytes+p_bytes<=24*1024*1024
      and postspark.has_start_pilot(p_user_id);
  return found;
end $$;

create trigger start_pilot_limit_generation before insert on postspark.generation_v5_requests
  for each row execute function postspark.start_pilot_limit_generation();

create function postspark.limit_entry_brand_projects()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from postspark.profiles where id=new.user_uuid and plan in ('START','SOLO')) then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_uuid::text,76));
  if exists(select 1 from postspark.brand_projects where user_uuid=new.user_uuid and id is distinct from new.id) then
    raise exception 'Seu plano permite uma marca.' using errcode='PT409';
  end if;
  return new;
end $$;

create trigger entry_brand_project_count before insert on postspark.brand_projects
  for each row execute function postspark.limit_entry_brand_projects();

create function postspark.start_pilot_save_piece(p_user_id uuid,p_request_id uuid,p_model jsonb,p_finalize boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_piece jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,76));
  if p_model is null or pg_catalog.jsonb_typeof(p_model)<>'object' or pg_catalog.pg_column_size(p_model)>2000000
     or p_model#>>'{provenance,journey,requestId}' is distinct from p_request_id::text then
    raise exception 'Invalid START piece' using errcode='22023';
  end if;
  select finalized into v_piece from postspark.start_pilot_accounts
    where user_id=p_user_id and generation_id=p_request_id;
  if not found then raise exception 'Unrecognized START project' using errcode='PT403'; end if;
  if v_piece is not null then return v_piece; end if;
  if not postspark.has_start_pilot(p_user_id) or not exists (
    select 1 from postspark.generation_v5_requests r
    cross join lateral jsonb_array_elements(r.proposals) proposal
    where r.id=p_request_id and r.owner_id=p_user_id and proposal->>'status'='ready'
      and proposal->>'proposalId'=p_model#>>'{provenance,journey,proposalId}'
      and proposal->>'revision'=p_model#>>'{provenance,journey,revision}'
  ) then
    raise exception 'Select a delivered START proposal' using errcode='PT403';
  end if;

  if p_finalize then
    update postspark.start_pilot_accounts set finalized=p_model,finalized_at=now(),draft=null where user_id=p_user_id;
  else
    update postspark.start_pilot_accounts set draft=p_model where user_id=p_user_id;
  end if;
  return p_model;
end $$;

revoke all on function postspark.start_pilot_enroll(uuid,int),postspark.start_pilot_state(uuid),
  postspark.has_start_pilot(uuid),postspark.start_pilot_reserve_upload(uuid,int),
  postspark.start_pilot_save_piece(uuid,uuid,jsonb,boolean),postspark.start_pilot_limit_generation(),
  postspark.limit_entry_brand_projects() from public,anon,authenticated,service_role;
grant execute on function postspark.start_pilot_enroll(uuid,int),postspark.start_pilot_state(uuid),
  postspark.has_start_pilot(uuid),postspark.start_pilot_reserve_upload(uuid,int),
  postspark.start_pilot_save_piece(uuid,uuid,jsonb,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
