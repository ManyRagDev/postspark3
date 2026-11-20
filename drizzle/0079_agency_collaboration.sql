begin;

create table postspark.agency_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid unique not null references auth.users(id) on delete cascade,
  name text not null check(char_length(name) between 1 and 120)
);
create table postspark.agency_members (
  workspace_id uuid not null references postspark.agency_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('editor','reviewer')),
  primary key(workspace_id,user_id)
);
create index agency_member_user on postspark.agency_members(user_id,workspace_id);

create table postspark.agency_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references postspark.agency_workspaces(id) on delete cascade,
  email text not null,
  role text not null check(role in ('editor','reviewer')),
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_at timestamptz
);
create table postspark.agency_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references postspark.agency_workspaces(id) on delete cascade,
  name text not null check(char_length(name) between 1 and 120),
  canvas_model jsonb not null,
  status text not null default 'draft' check(status in ('draft','review','approved')),
  revision int not null default 1,
  updated_at timestamptz not null default now()
);
create index agency_projects_workspace on postspark.agency_projects(workspace_id,updated_at desc);
alter table postspark.agency_workspaces enable row level security;
alter table postspark.agency_members enable row level security;
alter table postspark.agency_invites enable row level security;
alter table postspark.agency_projects enable row level security;
revoke all on postspark.agency_workspaces,postspark.agency_members,postspark.agency_invites,postspark.agency_projects
  from public,anon,authenticated,service_role;

create function postspark.agency_owner_eligible(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select postspark.has_app_access(p_user_id) and exists(
    select 1 from postspark.pro_paid_periods p join postspark.pro_checkout_attempts c on c.id=p.checkout_id
    where p.user_id=p_user_id and c.offer='AGENCY' and p.period_start<=now() and p.usable_until>now()
  );
$$;

create function postspark.agency_workspace_role(p_user_id uuid,p_workspace_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select case when w.owner_id=p_user_id then 'owner' else m.role end
  from postspark.agency_workspaces w left join postspark.agency_members m on m.workspace_id=w.id and m.user_id=p_user_id
  where w.id=p_workspace_id and postspark.agency_owner_eligible(w.owner_id)
  and not exists(select 1 from postspark.app_access a where a.user_id=p_user_id and a.revoked_at is not null);
$$;

create function postspark.agency_billing_owner(p_user_id uuid,p_workspace_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select owner_id from postspark.agency_workspaces
    where id=p_workspace_id and postspark.agency_workspace_role(p_user_id,p_workspace_id) in ('owner','editor');
$$;

create function postspark.has_agency_access(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from postspark.agency_members m
    where m.user_id=p_user_id and postspark.agency_workspace_role(p_user_id,m.workspace_id) is not null
  );
$$;

create function postspark.has_agency_editor_access(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from postspark.agency_members where user_id=p_user_id and role='editor'
      and postspark.agency_workspace_role(p_user_id,workspace_id)='editor');
$$;

create function postspark.agency_overview(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('canCreate',postspark.agency_owner_eligible(p_user_id),
    'workspaces',coalesce((
      select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'role',roles.role))
      from postspark.agency_workspaces w
      cross join lateral (select postspark.agency_workspace_role(p_user_id,w.id) as role) roles
      where (w.owner_id=p_user_id or exists(select 1 from postspark.agency_members m where m.workspace_id=w.id and m.user_id=p_user_id))
        and roles.role is not null
    ),'[]'::jsonb));
$$;

create function postspark.agency_create_workspace(p_user_id uuid,p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not postspark.agency_owner_eligible(p_user_id) then raise exception 'AGENCY required' using errcode='PT403'; end if;
  insert into postspark.agency_workspaces(owner_id,name) values(p_user_id,p_name)
    on conflict(owner_id) do nothing returning id into v_id;
  if v_id is null then select id into v_id from postspark.agency_workspaces where owner_id=p_user_id; end if;
  return v_id;
end $$;

create function postspark.agency_invite(p_user_id uuid,p_workspace_id uuid,p_email text,p_role text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if postspark.agency_workspace_role(p_user_id,p_workspace_id) is distinct from 'owner' then
    raise exception 'Workspace owner required' using errcode='PT403';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,79));
  if (select count(*) from postspark.agency_members where workspace_id=p_workspace_id)>=2 then
    raise exception 'AGENCY pilot seats exhausted' using errcode='PT409';
  end if;
  select id into v_id from postspark.agency_invites where workspace_id=p_workspace_id and email=lower(p_email)
    and role=p_role and accepted_at is null and expires_at>now() limit 1;
  if v_id is not null then return v_id; end if;
  if (select count(*) from postspark.agency_invites where workspace_id=p_workspace_id and accepted_at is null and expires_at>now())>=4 then
    raise exception 'Pending invite limit' using errcode='PT409';
  end if;
  insert into postspark.agency_invites(workspace_id,email,role) values(p_workspace_id,lower(p_email),p_role) returning id into v_id;
  return v_id;
end $$;

create function postspark.agency_accept_invite(p_user_id uuid,p_invite_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_invite postspark.agency_invites%rowtype;
begin
  select * into v_invite from postspark.agency_invites where id=p_invite_id for update;
  if not found or not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null and lower(email)=v_invite.email)
     or exists(select 1 from postspark.app_access where user_id=p_user_id and revoked_at is not null)
     or not exists(select 1 from postspark.agency_workspaces where id=v_invite.workspace_id and owner_id<>p_user_id and postspark.agency_owner_eligible(owner_id)) then
    raise exception 'Invalid invitation' using errcode='PT403';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_invite.workspace_id::text,79));
  if exists(select 1 from postspark.agency_members where workspace_id=v_invite.workspace_id and user_id=p_user_id) then return v_invite.workspace_id; end if;
  if v_invite.accepted_at is not null or v_invite.expires_at<=now() then raise exception 'Expired invitation' using errcode='PT403'; end if;
  if (select count(*) from postspark.agency_members where workspace_id=v_invite.workspace_id)>=2 then
    raise exception 'AGENCY pilot seats exhausted' using errcode='PT409';
  end if;
  insert into postspark.agency_members(workspace_id,user_id,role) values(v_invite.workspace_id,p_user_id,v_invite.role);
  update postspark.agency_invites set accepted_at=now() where id=p_invite_id;
  return v_invite.workspace_id;
end $$;

create function postspark.agency_list_projects(p_user_id uuid,p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if postspark.agency_workspace_role(p_user_id,p_workspace_id) is null then
    raise exception 'Workspace access required' using errcode='PT403';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(list))
    from (select id,name,status,revision from postspark.agency_projects where workspace_id=p_workspace_id
      order by updated_at desc limit 100) list),'[]'::jsonb);
end $$;

create function postspark.agency_get_project(p_user_id uuid,p_project_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(p) from postspark.agency_projects p
  where p.id=p_project_id and postspark.agency_workspace_role(p_user_id,p.workspace_id) is not null;
$$;

create function postspark.agency_can_read_media(p_user_id uuid,p_media_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from postspark.agency_projects p
    where postspark.agency_workspace_role(p_user_id,p.workspace_id) is not null
      and pg_catalog.strpos(p.canvas_model::text,p_media_path)>0);
$$;

create function postspark.agency_save_project(
  p_user_id uuid,p_workspace_id uuid,p_project_id uuid,p_revision int,p_name text,p_model jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_project postspark.agency_projects%rowtype;
begin
  if coalesce(postspark.agency_workspace_role(p_user_id,p_workspace_id),'') not in ('owner','editor') then
    raise exception 'Workspace editor required' using errcode='PT403';
  end if;
  if jsonb_typeof(p_model) is distinct from 'object' or pg_catalog.pg_column_size(p_model)>2000000 then
    raise exception 'Invalid project' using errcode='22023';
  end if;
  if p_project_id is not null then
    select * into v_project from postspark.agency_projects where id=p_project_id and workspace_id=p_workspace_id for update;
    if not found or v_project.status<>'draft' or v_project.revision is distinct from p_revision then
      raise exception 'Project changed or is under review' using errcode='PT409';
    end if;
  end if;
  if exists (
    select 1 from regexp_matches(p_model::text,'(/api/post-media/([0-9a-fA-F-]{36})/[0-9a-fA-F]{64})','g') r
    where lower(r[2])<>p_user_id::text and pg_catalog.strpos(coalesce(v_project.canvas_model::text,''),r[1])=0
  ) then raise exception 'Unshared media reference' using errcode='PT403'; end if;
  if p_project_id is null then
    insert into postspark.agency_projects(workspace_id,name,canvas_model) values(p_workspace_id,p_name,p_model) returning * into v_project;
  else
    update postspark.agency_projects set name=p_name,canvas_model=p_model,revision=revision+1,updated_at=now()
      where id=p_project_id returning * into v_project;
  end if;
  return to_jsonb(v_project);
end $$;

create function postspark.agency_review_project(p_user_id uuid,p_project_id uuid,p_revision int,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_project postspark.agency_projects%rowtype;
declare v_role text;
begin
  select * into v_project from postspark.agency_projects where id=p_project_id for update;
  v_role:=postspark.agency_workspace_role(p_user_id,v_project.workspace_id);
  if v_role is null or v_project.revision is distinct from p_revision then
    raise exception 'Project unavailable or changed' using errcode='PT409';
  end if;
  if not ((v_project.status='draft' and p_status='review' and v_role in ('owner','editor'))
    or (v_project.status='review' and p_status in ('approved','draft') and v_role in ('owner','reviewer'))
    or (v_project.status='approved' and p_status='draft' and v_role='owner')) then
    raise exception 'Approval not allowed' using errcode='PT403';
  end if;
  update postspark.agency_projects set status=p_status,revision=revision+1,updated_at=now()
    where id=p_project_id returning * into v_project;
  return to_jsonb(v_project);
end $$;

revoke all on function postspark.agency_billing_owner(uuid,uuid),postspark.agency_owner_eligible(uuid),postspark.agency_workspace_role(uuid,uuid),
  postspark.has_agency_access(uuid),postspark.has_agency_editor_access(uuid),postspark.agency_overview(uuid),postspark.agency_create_workspace(uuid,text),
  postspark.agency_invite(uuid,uuid,text,text),postspark.agency_accept_invite(uuid,uuid),postspark.agency_list_projects(uuid,uuid),
  postspark.agency_get_project(uuid,uuid),postspark.agency_can_read_media(uuid,text),
  postspark.agency_save_project(uuid,uuid,uuid,int,text,jsonb),postspark.agency_review_project(uuid,uuid,int,text)
  from public,anon,authenticated,service_role;
grant execute on function postspark.agency_billing_owner(uuid,uuid),postspark.has_agency_access(uuid),postspark.has_agency_editor_access(uuid),postspark.agency_overview(uuid),postspark.agency_create_workspace(uuid,text),
  postspark.agency_invite(uuid,uuid,text,text),postspark.agency_accept_invite(uuid,uuid),postspark.agency_list_projects(uuid,uuid),
  postspark.agency_get_project(uuid,uuid),postspark.agency_can_read_media(uuid,text),
  postspark.agency_save_project(uuid,uuid,uuid,int,text,jsonb),postspark.agency_review_project(uuid,uuid,int,text)
  to service_role;
notify pgrst, 'reload schema';
commit;
