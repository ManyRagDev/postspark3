BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS postspark.studio_preferences (
 owner_id uuid PRIMARY KEY REFERENCES postspark.profiles(id) ON DELETE CASCADE,
 preferences jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT studio_preferences_shape CHECK (coalesce((
  jsonb_typeof(preferences)='object' AND preferences ?& ARRAY['enabled','language','intensity']
  AND jsonb_typeof(preferences->'enabled')='boolean'
  AND (preferences->'language'='null'::jsonb OR preferences->>'language' IN ('editorial','graphic','typographic','organic','restrained'))
  AND preferences->>'intensity' IN ('auto','quiet','balanced','expressive')
  AND preferences-ARRAY['enabled','language','intensity']='{}'::jsonb
 ),false))
);
ALTER TABLE postspark.studio_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON postspark.studio_preferences FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON postspark.studio_preferences TO service_role;
COMMIT;
