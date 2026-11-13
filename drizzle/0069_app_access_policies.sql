-- Self-only RLS check. Identity comes from the verified Auth request context.
begin;
create or replace function postspark.has_current_app_access()
returns boolean language sql stable security definer
set search_path = pg_catalog
as $$
  select exists (select 1 from postspark.app_access a
    where a.user_id = auth.uid() and a.revoked_at is null);
$$;
revoke all on function postspark.has_current_app_access() from public, anon, authenticated, service_role;
grant execute on function postspark.has_current_app_access() to authenticated;

DROP POLICY IF EXISTS "PostSpark users can create own background assets" ON postspark.background_assets;
CREATE POLICY "PostSpark users can create own background assets" ON postspark.background_assets FOR INSERT TO authenticated WITH CHECK (((user_uuid = ( SELECT auth.uid() AS uid)) AND ( SELECT postspark.has_current_app_access() )));

DROP POLICY IF EXISTS "PostSpark users can create own posts" ON postspark.posts;
CREATE POLICY "PostSpark users can create own posts" ON postspark.posts FOR INSERT TO authenticated WITH CHECK (((user_uuid = ( SELECT auth.uid() AS uid)) AND ( SELECT postspark.has_current_app_access() )));

DROP POLICY IF EXISTS "PostSpark users can delete own background assets" ON postspark.background_assets;
CREATE POLICY "PostSpark users can delete own background assets" ON postspark.background_assets FOR DELETE TO authenticated USING (((user_uuid = ( SELECT auth.uid() AS uid)) AND ( SELECT postspark.has_current_app_access() )));

DROP POLICY IF EXISTS "PostSpark users can delete own posts" ON postspark.posts;
CREATE POLICY "PostSpark users can delete own posts" ON postspark.posts FOR DELETE TO authenticated USING (((user_uuid = ( SELECT auth.uid() AS uid)) AND ( SELECT postspark.has_current_app_access() )));

DROP POLICY IF EXISTS "PostSpark users can update own background assets" ON postspark.background_assets;
CREATE POLICY "PostSpark users can update own background assets" ON postspark.background_assets FOR UPDATE TO authenticated USING (((user_uuid = ( SELECT auth.uid() AS uid)) AND ( SELECT postspark.has_current_app_access() ))) WITH CHECK (((user_uuid = ( SELECT auth.uid() AS uid)) AND ( SELECT postspark.has_current_app_access() )));

DROP POLICY IF EXISTS "PostSpark users can update own posts" ON postspark.posts;
CREATE POLICY "PostSpark users can update own posts" ON postspark.posts FOR UPDATE TO authenticated USING (((user_uuid = ( SELECT auth.uid() AS uid)) AND ( SELECT postspark.has_current_app_access() ))) WITH CHECK (((user_uuid = ( SELECT auth.uid() AS uid)) AND ( SELECT postspark.has_current_app_access() )));

DROP POLICY IF EXISTS "PostSpark users can view own background assets" ON postspark.background_assets;
CREATE POLICY "PostSpark users can view own background assets" ON postspark.background_assets FOR SELECT TO authenticated USING (((user_uuid = ( SELECT auth.uid() AS uid)) AND ( SELECT postspark.has_current_app_access() )));

DROP POLICY IF EXISTS "PostSpark users can view own legacy user row" ON postspark.users;
CREATE POLICY "PostSpark users can view own legacy user row" ON postspark.users FOR SELECT TO authenticated USING (((("openId")::text = ('supabase:'::text || (( SELECT auth.uid() AS uid))::text)) AND ( SELECT postspark.has_current_app_access() )));

DROP POLICY IF EXISTS "PostSpark users can view own posts" ON postspark.posts;
CREATE POLICY "PostSpark users can view own posts" ON postspark.posts FOR SELECT TO authenticated USING (((user_uuid = ( SELECT auth.uid() AS uid)) AND ( SELECT postspark.has_current_app_access() )));

notify pgrst, 'reload schema';
commit;
