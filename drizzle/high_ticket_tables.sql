BEGIN;

-- ============================================================
-- High Ticket Pipeline — base idempotente
-- Schema: postspark
-- ============================================================

CREATE TABLE IF NOT EXISTS postspark.brand_kits (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_uuid uuid NOT NULL REFERENCES postspark.profiles(id) ON DELETE CASCADE,
  tone varchar(32) NOT NULL DEFAULT 'professional',
  formatting_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  forbidden_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  must_include jsonb NOT NULL DEFAULT '[]'::jsonb,
  dictionary jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual_palette jsonb NOT NULL DEFAULT '[]'::jsonb,
  font_family text DEFAULT 'Inter',
  border_radius text DEFAULT '16px',
  box_shadow text DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_kits_user_uuid_key UNIQUE (user_uuid)
);

ALTER TABLE postspark.brand_kits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_kits_select_own ON postspark.brand_kits;
CREATE POLICY brand_kits_select_own
  ON postspark.brand_kits
  FOR SELECT
  USING (user_uuid = (select auth.uid()));

DROP POLICY IF EXISTS brand_kits_insert_own ON postspark.brand_kits;
CREATE POLICY brand_kits_insert_own
  ON postspark.brand_kits
  FOR INSERT
  WITH CHECK (user_uuid = (select auth.uid()));

DROP POLICY IF EXISTS brand_kits_update_own ON postspark.brand_kits;
CREATE POLICY brand_kits_update_own
  ON postspark.brand_kits
  FOR UPDATE
  USING (user_uuid = (select auth.uid()))
  WITH CHECK (user_uuid = (select auth.uid()));

DROP POLICY IF EXISTS brand_kits_delete_own ON postspark.brand_kits;
CREATE POLICY brand_kits_delete_own
  ON postspark.brand_kits
  FOR DELETE
  USING (user_uuid = (select auth.uid()));

CREATE TABLE IF NOT EXISTS postspark.personas (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_uuid uuid NOT NULL REFERENCES postspark.profiles(id) ON DELETE CASCADE,
  audience text NOT NULL DEFAULT 'publico geral',
  pains jsonb NOT NULL DEFAULT '[]'::jsonb,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  language_style text DEFAULT 'direto e profissional',
  objections jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personas_user_uuid_key UNIQUE (user_uuid)
);

ALTER TABLE postspark.personas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personas_select_own ON postspark.personas;
CREATE POLICY personas_select_own
  ON postspark.personas
  FOR SELECT
  USING (user_uuid = (select auth.uid()));

DROP POLICY IF EXISTS personas_insert_own ON postspark.personas;
CREATE POLICY personas_insert_own
  ON postspark.personas
  FOR INSERT
  WITH CHECK (user_uuid = (select auth.uid()));

DROP POLICY IF EXISTS personas_update_own ON postspark.personas;
CREATE POLICY personas_update_own
  ON postspark.personas
  FOR UPDATE
  USING (user_uuid = (select auth.uid()))
  WITH CHECK (user_uuid = (select auth.uid()));

DROP POLICY IF EXISTS personas_delete_own ON postspark.personas;
CREATE POLICY personas_delete_own
  ON postspark.personas
  FOR DELETE
  USING (user_uuid = (select auth.uid()));

ALTER TABLE postspark.generation_runs
  ADD COLUMN IF NOT EXISTS graph_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS spark_cost integer,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'generation_runs_spark_cost_nonnegative'
      AND conrelid = 'postspark.generation_runs'::regclass
  ) THEN
    ALTER TABLE postspark.generation_runs
      ADD CONSTRAINT generation_runs_spark_cost_nonnegative
      CHECK (spark_cost IS NULL OR spark_cost >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_generation_runs_user_status_created
  ON postspark.generation_runs (user_uuid, status, created_at DESC);

DROP INDEX IF EXISTS postspark.idx_brand_kits_user_uuid;
DROP INDEX IF EXISTS postspark.idx_personas_user_uuid;

COMMIT;
