BEGIN;

ALTER TABLE postspark.generation_runs
  ADD COLUMN IF NOT EXISTS candidate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepted_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_quality_score numeric(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategy_fallback_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS originality_fallback_used boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_generation_runs_status_created
  ON postspark.generation_runs (status, "createdAt" DESC);

COMMIT;
