-- Idempotent migration: normalize generation_runs timestamp column to created_at
-- Pre-requisite: 0006_add_generation_runs.sql

DO $$
DECLARE
  has_created_at boolean;
  has_createdAt boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'postspark' AND table_name = 'generation_runs' AND column_name = 'created_at'
  ) INTO has_created_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'postspark' AND table_name = 'generation_runs' AND column_name = 'createdAt'
  ) INTO has_createdAt;

  IF has_createdAt AND NOT has_created_at THEN
    ALTER TABLE postspark.generation_runs RENAME COLUMN "createdAt" TO created_at;
  ELSIF NOT has_createdAt AND NOT has_createdAt THEN
    ALTER TABLE postspark.generation_runs ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
END$$;

-- Recreate index with the canonical column name
DROP INDEX IF EXISTS postspark.idx_generation_runs_user_created;
CREATE INDEX IF NOT EXISTS idx_generation_runs_user_created
  ON postspark.generation_runs (user_uuid, created_at DESC);
