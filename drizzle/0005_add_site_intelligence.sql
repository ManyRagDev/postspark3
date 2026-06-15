BEGIN;

CREATE TABLE IF NOT EXISTS postspark.site_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid uuid NOT NULL,
  source_url text NOT NULL,
  normalized_url text NOT NULL,
  fingerprint varchar(64) NOT NULL,
  snapshot jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_intelligence_user_url_fingerprint_key
    UNIQUE (user_uuid, normalized_url, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_site_intelligence_user_url
  ON postspark.site_intelligence (user_uuid, normalized_url, "updatedAt" DESC);

ALTER TABLE postspark.site_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_intelligence_select_own
  ON postspark.site_intelligence;
CREATE POLICY site_intelligence_select_own
  ON postspark.site_intelligence
  FOR SELECT
  USING (user_uuid = auth.uid());

DROP POLICY IF EXISTS site_intelligence_insert_own
  ON postspark.site_intelligence;
CREATE POLICY site_intelligence_insert_own
  ON postspark.site_intelligence
  FOR INSERT
  WITH CHECK (user_uuid = auth.uid());

DROP POLICY IF EXISTS site_intelligence_update_own
  ON postspark.site_intelligence;
CREATE POLICY site_intelligence_update_own
  ON postspark.site_intelligence
  FOR UPDATE
  USING (user_uuid = auth.uid())
  WITH CHECK (user_uuid = auth.uid());

COMMIT;
