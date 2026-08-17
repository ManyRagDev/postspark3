BEGIN;

ALTER TABLE postspark.generation_runs
  ADD COLUMN IF NOT EXISTS events jsonb;

ALTER TABLE postspark.generation_runs
  ADD COLUMN IF NOT EXISTS events_version integer NOT NULL DEFAULT 1;

UPDATE postspark.generation_runs
SET events = '[]'::jsonb
WHERE events IS NULL OR jsonb_typeof(events) <> 'array';

ALTER TABLE postspark.generation_runs
  ALTER COLUMN events SET DEFAULT '[]'::jsonb,
  ALTER COLUMN events SET NOT NULL;

DROP INDEX IF EXISTS postspark.idx_generation_runs_shadow_events;
CREATE INDEX idx_generation_runs_shadow_events
  ON postspark.generation_runs
  USING GIN (events jsonb_path_ops)
  WHERE jsonb_array_length(events) > 0;

COMMENT ON COLUMN postspark.generation_runs.events IS
  'Versioned generation debug events used for shadow/pipeline baseline analysis';
COMMENT ON COLUMN postspark.generation_runs.events_version IS
  'Version of the generation debug event array contract';

COMMIT;
