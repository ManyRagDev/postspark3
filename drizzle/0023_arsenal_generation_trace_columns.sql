-- Additive trace prerequisites for Arsenal V2. Do not replay historical 0012/0015
-- or change the independent billing/Next reservation system.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE postspark.generation_runs
  ADD COLUMN IF NOT EXISTS events jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS events_version integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS failure_reason text;
COMMENT ON COLUMN postspark.generation_runs.events IS
  'Versioned generation events, including Arsenal retrieval, offer and selection.';
COMMENT ON COLUMN postspark.generation_runs.events_version IS
  'Generation event contract version; 2 is the canonical orchestrator.';
COMMENT ON COLUMN postspark.generation_runs.failure_reason IS
  'Normalized terminal generation failure reason, independent of optional diagnostic content.';
NOTIFY pgrst, 'reload schema';
COMMIT;
