BEGIN;

DROP INDEX IF EXISTS postspark.idx_brand_kits_user_uuid;
DROP INDEX IF EXISTS postspark.idx_personas_user_uuid;

DROP POLICY IF EXISTS "Users can insert own generation runs" ON postspark.generation_runs;
CREATE POLICY "Users can insert own generation runs"
  ON postspark.generation_runs
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_uuid);

DROP POLICY IF EXISTS "Users can update own generation runs" ON postspark.generation_runs;
CREATE POLICY "Users can update own generation runs"
  ON postspark.generation_runs
  FOR UPDATE
  USING ((select auth.uid()) = user_uuid);

DROP POLICY IF EXISTS "Users can view own generation runs" ON postspark.generation_runs;
CREATE POLICY "Users can view own generation runs"
  ON postspark.generation_runs
  FOR SELECT
  USING ((select auth.uid()) = user_uuid);

COMMIT;
