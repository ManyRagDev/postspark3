-- Runtime writes UUID ownership directly; legacy integer ownership is optional.
alter table postspark.posts alter column "userId" drop not null;
alter table postspark.posts alter column user_uuid set not null;
alter table postspark.posts add constraint local_posts_owner
  foreign key (user_uuid) references auth.users(id) on delete cascade;
alter table postspark.posts
  add column if not exists image_settings jsonb,
  add column if not exists layout_settings jsonb,
  add column if not exists bg_value jsonb,
  add column if not exists bg_overlay jsonb,
  add column if not exists copy_angle jsonb;

-- The application uses service_role behind its authenticated tRPC boundary.
-- Preserve selective grants from the catalogue migrations (immutable releases
-- must NOT receive blanket write grants). Direct browser DB access stays closed.
grant select, insert, update, delete on
  postspark.posts, postspark.users, postspark.profiles, postspark.background_assets,
  postspark.site_intelligence, postspark.generation_runs, postspark.content_fingerprints,
  postspark.brand_kits, postspark.personas, postspark.spark_reservations,
  postspark.analytics_pageviews, postspark.analytics_events, postspark.privacy_logs,
  postspark.brand_projects, postspark.subscriptions, postspark.topup_packages
to service_role;
grant usage, select on all sequences in schema postspark to service_role;
revoke all on all tables in schema postspark from public, anon, authenticated;
revoke all on all sequences in schema postspark from public, anon, authenticated;
revoke all on all functions in schema postspark from public, anon, authenticated;
grant execute on all functions in schema postspark to service_role;
do $$
declare item record;
begin
  for item in select tablename from pg_tables where schemaname='postspark' loop
    execute format('alter table postspark.%I enable row level security', item.tablename);
  end loop;
  for item in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='postspark' and not exists (
      select 1 from unnest(p.proconfig) c where c like 'search_path=%'
    ) loop
    execute format('alter function %s set search_path = %L', item.signature, '');
  end loop;
end $$;
notify pgrst, 'reload schema';
