BEGIN;

CREATE TABLE IF NOT EXISTS postspark.content_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid uuid NOT NULL,
  generation_run_id uuid,
  source_type varchar(32) NOT NULL,
  source_id text NOT NULL,
  text_hash varchar(64) NOT NULL,
  embedding jsonb NOT NULL,
  metadata jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_fingerprints_user_created
  ON postspark.content_fingerprints (user_uuid, "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_content_fingerprints_generation
  ON postspark.content_fingerprints (generation_run_id);

ALTER TABLE postspark.content_fingerprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_fingerprints_select_own
  ON postspark.content_fingerprints;
CREATE POLICY content_fingerprints_select_own
  ON postspark.content_fingerprints
  FOR SELECT
  USING (user_uuid = auth.uid());

DROP POLICY IF EXISTS content_fingerprints_insert_own
  ON postspark.content_fingerprints;
CREATE POLICY content_fingerprints_insert_own
  ON postspark.content_fingerprints
  FOR INSERT
  WITH CHECK (user_uuid = auth.uid());

COMMIT;
