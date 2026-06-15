BEGIN;

CREATE TABLE IF NOT EXISTS postspark.generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid uuid NOT NULL,
  site_intelligence_id uuid,
  status varchar(32) NOT NULL,
  input_type varchar(16) NOT NULL,
  input_content text NOT NULL,
  platform varchar(32) NOT NULL,
  post_mode varchar(32) NOT NULL,
  creation_mode varchar(32) NOT NULL,
  requested_model varchar(64) NOT NULL,
  effective_models jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_snapshot jsonb,
  strategy_snapshot jsonb,
  evaluation_snapshot jsonb,
  output_snapshot jsonb,
  revision_count integer NOT NULL DEFAULT 0,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  error_message text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_runs_user_created
  ON postspark.generation_runs (user_uuid, "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_generation_runs_site_intelligence
  ON postspark.generation_runs (site_intelligence_id);

ALTER TABLE postspark.generation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS generation_runs_select_own
  ON postspark.generation_runs;
CREATE POLICY generation_runs_select_own
  ON postspark.generation_runs
  FOR SELECT
  USING (user_uuid = auth.uid());

DROP POLICY IF EXISTS generation_runs_insert_own
  ON postspark.generation_runs;
CREATE POLICY generation_runs_insert_own
  ON postspark.generation_runs
  FOR INSERT
  WITH CHECK (user_uuid = auth.uid());

COMMIT;
