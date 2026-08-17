BEGIN;

-- Add events column to generation_runs for shadow graph persistence
-- This enables historical analysis of shadow graph divergences and metrics

ALTER TABLE postspark.generation_runs
ADD COLUMN IF NOT EXISTS events jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE postspark.generation_runs
ADD COLUMN IF NOT EXISTS events_version integer NOT NULL DEFAULT 1;

UPDATE postspark.generation_runs SET events = '[]'::jsonb WHERE events IS NULL;
ALTER TABLE postspark.generation_runs ALTER COLUMN events SET DEFAULT '[]'::jsonb;
ALTER TABLE postspark.generation_runs ALTER COLUMN events SET NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN postspark.generation_runs.events IS
'Shadow graph and pipeline events for operational analysis and divergence tracking';

COMMENT ON COLUMN postspark.generation_runs.events_version IS
'Version of the generation debug event array contract';

-- Create index for efficient querying of shadow graph events
CREATE INDEX IF NOT EXISTS idx_generation_runs_shadow_events
ON postspark.generation_runs
USING GIN (events jsonb_path_ops)
WHERE (jsonb_array_length(events) > 0));

COMMIT;
