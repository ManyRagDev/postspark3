begin;
-- Private immutable video files and project packages. Only the authenticated API
-- (service role) can reach the registry; browser reads are authorized per request.
create table postspark.mare_assets (
 id uuid primary key default gen_random_uuid(),
 actor uuid not null, workspace_id uuid references postspark.agency_workspaces(id) on delete cascade,
 kind text not null check(kind in ('project','video','image','audio')), object_key text not null unique,
 original_mime text, playback_key text, playback_bytes bigint not null default 0, mime text not null, size_bytes bigint not null check(size_bytes>0),
 composition_ids text[] not null default array[]::text[], sha256 text not null, duration double precision, width int, height int,
 created_at timestamptz not null default now()
);
create unique index mare_assets_personal_sha on postspark.mare_assets(actor,kind,sha256) where workspace_id is null;
create unique index mare_assets_team_sha on postspark.mare_assets(workspace_id,kind,sha256) where workspace_id is not null;
create index mare_assets_actor on postspark.mare_assets(actor,created_at);
create index mare_assets_workspace on postspark.mare_assets(workspace_id) where workspace_id is not null;
-- The private API measures proxied response bytes. The Storage gateway owns
-- actual egress for redirects, so those grants have a separate counter.
create table postspark.mare_delivery_daily (
 day date not null,actor uuid not null,scope uuid not null,is_workspace boolean not null,
 signed_reads bigint not null default 0,proxied_reads bigint not null default 0,proxied_bytes bigint not null default 0,
 primary key(day,actor,scope,is_workspace)
);
alter table postspark.mare_delivery_daily enable row level security;
revoke all on postspark.mare_delivery_daily from public,anon,authenticated,service_role;
grant select on postspark.mare_delivery_daily to service_role;
create function postspark.mare_record_delivery(p_actor uuid,p_workspace uuid,p_signed boolean,p_bytes bigint)
returns void language sql security definer set search_path='' as $$
 insert into postspark.mare_delivery_daily(day,actor,scope,is_workspace,signed_reads,proxied_reads,proxied_bytes)
 values((now() at time zone 'UTC')::date,p_actor,coalesce(p_workspace,p_actor),p_workspace is not null,p_signed::int,(not p_signed)::int,case when p_signed then 0 else greatest(0,p_bytes) end)
 on conflict(day,actor,scope,is_workspace) do update set signed_reads=mare_delivery_daily.signed_reads+excluded.signed_reads,
   proxied_reads=mare_delivery_daily.proxied_reads+excluded.proxied_reads,proxied_bytes=mare_delivery_daily.proxied_bytes+excluded.proxied_bytes
$$;
revoke all on function postspark.mare_record_delivery(uuid,uuid,boolean,bigint) from public,anon,authenticated;
grant execute on function postspark.mare_record_delivery(uuid,uuid,boolean,bigint) to service_role;
create table postspark.mare_projects (
 id uuid primary key, actor uuid not null, workspace_id uuid references postspark.agency_workspaces(id) on delete cascade,name text not null,
 revision_id uuid not null references postspark.mare_assets(id), updated_at timestamptz not null default now()
);
create index mare_projects_owner on postspark.mare_projects(actor,updated_at desc);
create table postspark.mare_anchors (
 id uuid primary key default gen_random_uuid(), actor uuid not null,
 post_id bigint references postspark.posts(id) on delete cascade,
 agency_project_id uuid references postspark.agency_projects(id) on delete cascade,
 workspace_id uuid references postspark.agency_workspaces(id) on delete cascade,
 document_id text not null, slide_id text not null, slot_id text not null, expected_revision int not null,
 original_source jsonb, project_id uuid not null default gen_random_uuid(),
 revision_id uuid references postspark.mare_assets(id),video_asset_id uuid references postspark.mare_assets(id),
 scope text not null default 'montage' check(scope in ('composition','montage')),composition_id text,
 pending boolean not null default false,applied_revision int,created_at timestamptz not null default now(),
 check ((post_id is not null and agency_project_id is null and workspace_id is null) or
        (post_id is null and agency_project_id is not null and workspace_id is not null))
);
create index mare_anchors_owner on postspark.mare_anchors(actor,created_at desc);
alter table postspark.mare_assets enable row level security;
alter table postspark.mare_projects enable row level security;
alter table postspark.mare_anchors enable row level security;
revoke all on postspark.mare_assets,postspark.mare_projects,postspark.mare_anchors from public,anon,authenticated,service_role;
grant select,insert on postspark.mare_assets to service_role;
grant select,insert,update on postspark.mare_projects,postspark.mare_anchors to service_role;

-- Retain the latest package when the Canvas design is later removed. A
-- detached copy explicitly saved by the author keeps its own revision.
create function postspark.mare_keep_project() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.revision_id is not null and old.revision_id is distinct from new.revision_id then
   insert into postspark.mare_projects(id,actor,workspace_id,name,revision_id) values(new.project_id,new.actor,new.workspace_id,'Edição vinculada',new.revision_id)
   on conflict(id) do update set revision_id=excluded.revision_id, updated_at=now()
   where (new.workspace_id is not null or mare_projects.actor=new.actor) and mare_projects.workspace_id is not distinct from new.workspace_id and mare_projects.revision_id=old.revision_id;
 end if;
 return new;
end $$;
revoke all on function postspark.mare_keep_project() from public,anon,authenticated;
create trigger mare_keep_project after update of revision_id on postspark.mare_anchors for each row execute function postspark.mare_keep_project();

create function postspark.mare_list_projects(p_actor uuid)
returns table(id uuid,name text,"revisionId" uuid,"anchorId" uuid,"workspaceId" uuid)
language sql stable security definer set search_path='' as $$
 select q.id,q.name,q.revision_id,q.anchor_id,q.workspace_id from (
   select p.id,p.name,p.revision_id,null::uuid anchor_id,p.workspace_id,p.updated_at stamp
   from postspark.mare_projects p where (p.workspace_id is null and p.actor=p_actor) or
     (p.workspace_id is not null and postspark.agency_workspace_role(p_actor,p.workspace_id) is not null)
   union all
   select a.project_id,'Edição vinculada',a.revision_id,a.id,a.workspace_id,a.created_at from postspark.mare_anchors a
   where a.actor=p_actor and a.revision_id is not null and
     (exists(select from postspark.posts p where p.id=a.post_id and p.user_uuid=p_actor) or
      exists(select from postspark.agency_projects p where p.id=a.agency_project_id and p.workspace_id=a.workspace_id and postspark.agency_workspace_role(p_actor,p.workspace_id) is not null))
 ) q order by stamp desc limit 400
$$;
revoke all on function postspark.mare_list_projects(uuid) from public,anon,authenticated;
grant execute on function postspark.mare_list_projects(uuid) to service_role;
create function postspark.mare_save_project(p_actor uuid,p_id uuid,p_name text,p_package uuid,p_expected uuid,p_workspace uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
 if p_workspace is not null and coalesce(postspark.agency_workspace_role(p_actor,p_workspace),'') not in ('owner','editor') then raise exception 'Editor required' using errcode='PT403'; end if;
 if not exists(select from postspark.mare_assets where id=p_package and kind='project' and workspace_id is not distinct from p_workspace and (p_workspace is not null or actor=p_actor)) then raise exception 'Invalid source' using errcode='PT403'; end if;
 if p_expected is null then
   insert into postspark.mare_projects(id,actor,workspace_id,name,revision_id) values(p_id,p_actor,p_workspace,p_name,p_package) on conflict do nothing returning id into saved;
 else
   update postspark.mare_projects set name=p_name,revision_id=p_package,updated_at=now() where id=p_id and revision_id=p_expected and workspace_id is not distinct from p_workspace and (p_workspace is not null or actor=p_actor) returning id into saved;
 end if;
 if saved is null and not exists(select from postspark.mare_projects where id=p_id and name=p_name and revision_id=p_package and workspace_id is not distinct from p_workspace and (p_workspace is not null or actor=p_actor)) then raise exception 'Project changed' using errcode='PT409';end if;
 return p_id;
end $$;
revoke all on function postspark.mare_save_project(uuid,uuid,text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function postspark.mare_save_project(uuid,uuid,text,uuid,uuid,uuid) to service_role;

-- The client provides only an expected revision. The server calculates the patch
-- against the authorized current document and this transaction guards publication.
create function postspark.mare_apply_return(p_actor uuid,p_anchor uuid,p_package uuid,p_revision int,p_model jsonb,p_slide text,p_slot text,p_original jsonb)
returns int language plpgsql security definer set search_path='' as $$
declare a postspark.mare_anchors%rowtype; saved int;
begin
 select * into a from postspark.mare_anchors where id=p_anchor and actor=p_actor for update;
 if not found or a.revision_id is distinct from p_package then raise exception 'Destination unavailable' using errcode='PT404'; end if;
 if a.workspace_id is not null and coalesce(postspark.agency_workspace_role(p_actor,a.workspace_id),'') not in ('owner','editor') then raise exception 'Workspace permission required' using errcode='PT403'; end if;
 if a.applied_revision is not null then return a.applied_revision; end if;
 if a.slide_id is distinct from p_slide or a.slot_id is distinct from p_slot or a.original_source is distinct from p_original then raise exception 'Destination changed' using errcode='PT409'; end if;
 if not a.pending then raise exception 'No pending return' using errcode='PT409'; end if;
 if a.post_id is not null then
   update postspark.posts set canvas_model=p_model,gallery_preview=null where id=a.post_id and user_uuid=p_actor and revision=p_revision returning revision into saved;
 else
   update postspark.agency_projects set canvas_model=p_model,revision=revision+1,updated_at=now()
   where id=a.agency_project_id and workspace_id=a.workspace_id and revision=p_revision and status='draft' returning revision into saved;
 end if;
 if saved is null then raise exception 'Destination changed' using errcode='PT409'; end if;
 update postspark.mare_anchors set applied_revision=saved,expected_revision=saved,pending=false,
   original_source=jsonb_set(original_source,'{temporal}',(
     select slide->'temporalMedia'->a.slot_id from jsonb_array_elements(p_model->'slides') slide where slide->>'id'=a.slide_id
   )) where id=a.id;
 return saved;
end $$;
revoke all on function postspark.mare_apply_return(uuid,uuid,uuid,int,jsonb,text,text,jsonb) from public,anon,authenticated;
grant execute on function postspark.mare_apply_return(uuid,uuid,uuid,int,jsonb,text,text,jsonb) to service_role;

create function postspark.mare_check_media() returns trigger language plpgsql security definer set search_path='' as $$
declare s jsonb; m jsonb; personal uuid; workspace uuid;
begin
 if tg_op='UPDATE' then
   if new.canvas_model is not distinct from old.canvas_model then return new; end if;
   if jsonb_path_exists(old.canvas_model,'$.slides[*].temporalMedia.*') and (new.canvas_model->>'temporalMediaVersion') is distinct from '1' then
     raise exception 'Atualize o editor antes de salvar este documento' using errcode='PT409';
   end if;
 end if;
 if not coalesce(jsonb_path_exists(new.canvas_model,'$.slides[*].temporalMedia.*'),false) then return new; end if;
 if tg_table_name='posts' then personal:=new.user_uuid; else workspace:=new.workspace_id; end if;
 for s in select value from jsonb_array_elements(new.canvas_model->'slides') loop
   for m in select value from jsonb_each(coalesce(s->'temporalMedia','{}')) loop
     if (m->>'kind') is null or (m->>'kind') not in ('video','mare') or not exists(select 1 from postspark.mare_assets
       where id=(m->>'assetId')::uuid and kind='video' and workspace_id is not distinct from workspace and (workspace is not null or actor=personal)) then
       raise exception 'Invalid media reference' using errcode='PT403';
     end if;
     if m->>'kind'='mare' and not exists(select 1 from postspark.mare_assets where id=(m->>'revisionId')::uuid and kind='project' and (m->>'scope'='montage' or (m->>'scope'='composition' and m->>'compositionId'=any(composition_ids)))
       and workspace_id is not distinct from workspace and (workspace is not null or actor=personal)) then
       raise exception 'Invalid project reference' using errcode='PT403';
     end if;
   end loop;
 end loop;
 return new;
end $$;
revoke all on function postspark.mare_check_media() from public,anon,authenticated;
create trigger mare_media_check before insert or update of canvas_model on postspark.posts for each row execute function postspark.mare_check_media();
create trigger mare_media_check before insert or update of canvas_model on postspark.agency_projects for each row execute function postspark.mare_check_media();

insert into storage.buckets(id,name,public,file_size_limit) values('postspark-mare','postspark-mare',false,134217728);

create function postspark.mare_workspace_role(p_actor uuid,p_workspace uuid) returns text
language sql stable security definer set search_path='' as $$
 select postspark.agency_workspace_role(p_actor,p_workspace)
$$;
revoke all on function postspark.mare_workspace_role(uuid,uuid) from public,anon,authenticated;
grant execute on function postspark.mare_workspace_role(uuid,uuid) to service_role;
create table postspark.mare_uploads (
 id uuid primary key default gen_random_uuid(), actor uuid not null, workspace_id uuid references postspark.agency_workspaces(id) on delete cascade,
 kind text not null check(kind in ('video','project','image','audio')), sha256 text not null, size_bytes bigint not null check(size_bytes between 1 and 134217728),
 phase text not null default 'receiving' check(phase in ('receiving','queued','running','failed')), reason text, lease uuid, lease_until timestamptz, attempts int not null default 0, reserved_extra bigint not null default 0, asset_id uuid references postspark.mare_assets(id), expires_at timestamptz not null default now()+interval '24 hours'
);
create index mare_uploads_scope on postspark.mare_uploads(actor,workspace_id,expires_at);
alter table postspark.mare_uploads enable row level security;
revoke all on postspark.mare_uploads from public,anon,authenticated,service_role;
grant select,update,delete on postspark.mare_uploads to service_role;
create function postspark.mare_begin_upload(p_actor uuid,p_workspace uuid,p_kind text,p_hash text,p_size bigint,p_quota bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare used bigint; pending bigint; session postspark.mare_uploads%rowtype; asset uuid;
begin
 if p_workspace is not null and coalesce(postspark.agency_workspace_role(p_actor,p_workspace),'') not in ('owner','editor') then
   raise exception 'Editor required' using errcode='PT403'; end if;
 perform pg_advisory_xact_lock(hashtextextended('mare-upload:'||coalesce(p_workspace,p_actor)::text,0));
 select id into asset from postspark.mare_assets where workspace_id is not distinct from p_workspace
   and (p_workspace is not null or actor=p_actor) and kind=p_kind and sha256=p_hash and size_bytes=p_size;
 if asset is not null then return jsonb_build_object('assetId',asset); end if;
 select * into session from postspark.mare_uploads where actor=p_actor and workspace_id is not distinct from p_workspace
   and kind=p_kind and sha256=p_hash and size_bytes=p_size and expires_at>now() and asset_id is null limit 1;
 if found then return jsonb_build_object('id',session.id); end if;
 select coalesce(sum(size_bytes+playback_bytes),0) into used from postspark.mare_assets where workspace_id is not distinct from p_workspace and (p_workspace is not null or actor=p_actor);
 select coalesce(sum(size_bytes+reserved_extra),0) into pending from postspark.mare_uploads where workspace_id is not distinct from p_workspace and (p_workspace is not null or actor=p_actor) and expires_at>now() and asset_id is null;
 if p_size+used+pending>p_quota then raise exception 'Cota de armazenamento excedida' using errcode='PT413'; end if;
 insert into postspark.mare_uploads(actor,workspace_id,kind,sha256,size_bytes) values(p_actor,p_workspace,p_kind,p_hash,p_size) returning * into session;
 return jsonb_build_object('id',session.id);
end $$;
revoke all on function postspark.mare_begin_upload(uuid,uuid,text,text,bigint,bigint) from public,anon,authenticated;
grant execute on function postspark.mare_begin_upload(uuid,uuid,text,text,bigint,bigint) to service_role;
create function postspark.mare_resize_upload(p_session uuid,p_actor uuid,p_extra bigint,p_quota bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare a postspark.mare_uploads%rowtype; used bigint; waiting bigint;
begin
 select * into strict a from postspark.mare_uploads where id=p_session and actor=p_actor;
 perform pg_advisory_xact_lock(hashtextextended('mare-upload:'||coalesce(a.workspace_id,a.actor)::text,0));
 select coalesce(sum(size_bytes+playback_bytes),0) into used from postspark.mare_assets where workspace_id is not distinct from a.workspace_id and (a.workspace_id is not null or actor=p_actor);
 select coalesce(sum(size_bytes+case when id=p_session then 0 else reserved_extra end),0) into waiting from postspark.mare_uploads
 where workspace_id is not distinct from a.workspace_id and (a.workspace_id is not null or actor=p_actor) and expires_at>now() and asset_id is null;
 if used+waiting+p_extra>p_quota then raise exception 'Cota de armazenamento excedida' using errcode='PT413'; end if;
 update postspark.mare_uploads set reserved_extra=p_extra where id=p_session;
 return true;
end $$;
revoke all on function postspark.mare_resize_upload(uuid,uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function postspark.mare_resize_upload(uuid,uuid,bigint,bigint) to service_role;
create function postspark.mare_claim_upload() returns setof postspark.mare_uploads
language sql security definer set search_path='' as $$
 update postspark.mare_uploads set phase='running',lease=gen_random_uuid(),lease_until=now()+interval '15 minutes',expires_at=greatest(expires_at,now()+interval '20 minutes'),attempts=attempts+1
 where id=(select id from postspark.mare_uploads where asset_id is null and expires_at>now()
 and (phase='queued' or (phase='running' and lease_until<now())) order by expires_at for update skip locked limit 1)
 returning *
$$;
revoke all on function postspark.mare_claim_upload() from public,anon,authenticated;
grant execute on function postspark.mare_claim_upload() to service_role;
notify pgrst,'reload schema';
commit;
