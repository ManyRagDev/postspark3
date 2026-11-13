-- Own application authorization; Supabase Auth remains the identity provider.
-- Apply before the matching API. No users are enrolled by this migration.
begin;
create schema if not exists postspark;
create table if not exists postspark.app_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  reason text not null check (length(trim(reason)) > 0)
);
alter table postspark.app_access enable row level security;
-- Override broad default grants inherited from older schema baselines.
revoke all on postspark.app_access from public, anon, authenticated, service_role;

create or replace function postspark.has_app_access(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from postspark.app_access a
    where a.user_id = p_user_id and a.revoked_at is null
  );
$$;
revoke all on function postspark.has_app_access(uuid) from public, anon, authenticated;
grant usage on schema postspark to service_role;
grant execute on function postspark.has_app_access(uuid) to service_role;
comment on table postspark.app_access is
  'Explicit operator-managed app access. Login is read-only; no plan or billing entitlement.';
comment on function postspark.has_app_access(uuid) is
  'Server-only access check, called after Supabase Auth validates the session.';
notify pgrst, 'reload schema';
commit;
