-- Local test fixture, NOT a production ManyLabs migration.
-- Applied only by the guarded acervo82 auth setup command.
do $$
declare
  signature text;
  object_id oid;
begin
  if to_regnamespace('acervo82_private') is not null
    and obj_description(to_regnamespace('acervo82_private'), 'pg_namespace')
      is distinct from 'postspark.acervo82.local-auth.v1' then
    raise exception 'Unrecognized existing local auth schema';
  end if;
  foreach signature in array array[
    'postspark.has_manylabs_app_access(uuid)',
    'postspark.ensure_manylabs_app_access(uuid,text,text)'
  ] loop
    object_id := to_regprocedure(signature);
    if object_id is not null and obj_description(object_id, 'pg_proc')
      is distinct from 'postspark.acervo82.local-auth.v1' then
      raise exception 'Refusing to replace existing access function: %', signature;
    end if;
  end loop;
end $$;

create schema if not exists postspark;
create schema if not exists acervo82_private;
comment on schema acervo82_private is 'postspark.acervo82.local-auth.v1';
revoke all on schema acervo82_private from public, anon, authenticated;
grant usage on schema postspark, acervo82_private to service_role;

create table if not exists acervo82_private.access_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table acervo82_private.access_grants enable row level security;
revoke all on table acervo82_private.access_grants from public, anon, authenticated;
grant select on table acervo82_private.access_grants to service_role;

create or replace function postspark.has_manylabs_app_access(p_user_id uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists(select 1 from acervo82_private.access_grants where user_id = p_user_id);
$$;
-- Preserve the application's RPC signature. This fixture never auto-enrolls a
-- signup: email, display name and editable user_metadata cannot grant access.
create or replace function postspark.ensure_manylabs_app_access(
  p_user_id uuid, p_email text, p_display_name text
)
returns boolean language sql stable security invoker set search_path = ''
as $$ select postspark.has_manylabs_app_access(p_user_id); $$;

comment on function postspark.has_manylabs_app_access(uuid) is 'postspark.acervo82.local-auth.v1';
comment on function postspark.ensure_manylabs_app_access(uuid,text,text) is 'postspark.acervo82.local-auth.v1';
revoke all on function postspark.has_manylabs_app_access(uuid) from public, anon, authenticated;
revoke all on function postspark.ensure_manylabs_app_access(uuid,text,text) from public, anon, authenticated;
grant execute on function postspark.has_manylabs_app_access(uuid) to service_role;
grant execute on function postspark.ensure_manylabs_app_access(uuid,text,text) to service_role;
notify pgrst, 'reload schema';
