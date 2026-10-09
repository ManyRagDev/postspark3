-- Catálogo privado: acesso somente pelo backend tRPC (service_role).
-- O projeto mantém migrations SQL em drizzle/, sem Drizzle em runtime.
BEGIN;
CREATE TABLE IF NOT EXISTS postspark.design_catalog_pieces (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS postspark.design_catalog_versions (
  id uuid PRIMARY KEY,
  blueprint_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  UNIQUE (blueprint_id, version),
  UNIQUE (blueprint_id, content_hash)
);
CREATE UNIQUE INDEX IF NOT EXISTS design_catalog_one_approved ON postspark.design_catalog_versions (blueprint_id) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS design_catalog_status_created ON postspark.design_catalog_versions (status, created_at DESC, id);
CREATE TABLE IF NOT EXISTS postspark.design_catalog_version_pieces (
  version_id uuid NOT NULL REFERENCES postspark.design_catalog_versions(id),
  piece_key text NOT NULL,
  piece_id text NOT NULL REFERENCES postspark.design_catalog_pieces(id),
  PRIMARY KEY (version_id, piece_key)
);
CREATE INDEX IF NOT EXISTS design_catalog_piece_versions ON postspark.design_catalog_version_pieces(piece_id);
CREATE TABLE IF NOT EXISTS postspark.design_catalog_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  event_key text,
  stage text NOT NULL,
  status text NOT NULL CHECK (status IN ('started','completed','fallback','failed','rejected')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trace_id, event_key)
);
CREATE INDEX IF NOT EXISTS design_catalog_events_trace ON postspark.design_catalog_events(trace_id, created_at);
CREATE INDEX IF NOT EXISTS design_catalog_events_recent ON postspark.design_catalog_events(created_at DESC);
-- No client-role policies: curator access is checked by adminProcedure, generation by protectedProcedure.
ALTER TABLE postspark.design_catalog_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE postspark.design_catalog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE postspark.design_catalog_version_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE postspark.design_catalog_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON postspark.design_catalog_pieces, postspark.design_catalog_versions, postspark.design_catalog_version_pieces, postspark.design_catalog_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON postspark.design_catalog_pieces, postspark.design_catalog_version_pieces TO service_role;
GRANT SELECT, INSERT, UPDATE ON postspark.design_catalog_versions TO service_role;
GRANT SELECT, INSERT ON postspark.design_catalog_events TO service_role;

CREATE OR REPLACE FUNCTION postspark.design_catalog_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (to_jsonb(NEW) - 'status' - 'approved_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'approved_at') THEN
    RAISE EXCEPTION 'Catalog versions are immutable; create a new version';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION postspark.design_catalog_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS design_catalog_immutable ON postspark.design_catalog_versions;
CREATE TRIGGER design_catalog_immutable BEFORE UPDATE ON postspark.design_catalog_versions FOR EACH ROW EXECUTE FUNCTION postspark.design_catalog_immutable();

-- Locks serialize version allocation and promotion for one blueprint. Content + links + audit commit together.
CREATE OR REPLACE FUNCTION postspark.design_catalog_create(
  p_id uuid, p_blueprint_id uuid, p_hash text, p_definition jsonb, p_pieces jsonb, p_actor uuid, p_trace uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE existing_id uuid; next_version integer; piece jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_blueprint_id::text, 0));
  SELECT id INTO existing_id FROM postspark.design_catalog_versions WHERE blueprint_id = p_blueprint_id AND content_hash = p_hash;
  IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;
  SELECT COALESCE(max(version),0) + 1 INTO next_version FROM postspark.design_catalog_versions WHERE blueprint_id = p_blueprint_id;
  INSERT INTO postspark.design_catalog_versions(id,blueprint_id,version,content_hash,definition,created_by)
    VALUES(p_id,p_blueprint_id,next_version,p_hash,p_definition,p_actor);
  FOR piece IN SELECT value FROM pg_catalog.jsonb_array_elements(p_pieces) LOOP
    INSERT INTO postspark.design_catalog_pieces(id,definition) VALUES(piece->>'hash',piece->'definition') ON CONFLICT DO NOTHING;
    INSERT INTO postspark.design_catalog_version_pieces(version_id,piece_key,piece_id) VALUES(p_id,piece->>'key',piece->>'hash');
  END LOOP;
  INSERT INTO postspark.design_catalog_events(trace_id,actor_id,stage,status,data)
    VALUES(p_trace,p_actor,'catalog.draft','completed',jsonb_build_object('versionId',p_id,'blueprintId',p_blueprint_id,'version',next_version,'contentHash',p_hash));
  RETURN p_id;
END $$;
CREATE OR REPLACE FUNCTION postspark.design_catalog_status(p_id uuid, p_status text, p_actor uuid, p_trace uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE target postspark.design_catalog_versions;
BEGIN
  SELECT * INTO target FROM postspark.design_catalog_versions WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catalog version not found'; END IF;
  IF p_status NOT IN ('approved','archived') THEN RAISE EXCEPTION 'Invalid transition'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target.blueprint_id::text,0));
  SELECT * INTO target FROM postspark.design_catalog_versions WHERE id = p_id FOR UPDATE;
  IF target.status = p_status THEN RETURN; END IF;
  IF target.status = 'archived' THEN RAISE EXCEPTION 'Archived versions cannot be promoted'; END IF;
  IF p_status = 'approved' THEN
    WITH previous AS (
      UPDATE postspark.design_catalog_versions SET status = 'archived' WHERE blueprint_id = target.blueprint_id AND status = 'approved' RETURNING id
    ) INSERT INTO postspark.design_catalog_events(trace_id,actor_id,stage,status,data)
      SELECT p_trace,p_actor,'catalog.superseded','completed',jsonb_build_object('versionId',id,'replacedBy',p_id) FROM previous;
  END IF;
  UPDATE postspark.design_catalog_versions SET status = p_status, approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END WHERE id = p_id;
  INSERT INTO postspark.design_catalog_events(trace_id,actor_id,stage,status,data)
    VALUES(p_trace,p_actor,'catalog.' || p_status,'completed',jsonb_build_object('versionId',p_id,'blueprintId',target.blueprint_id,'version',target.version));
END $$;
REVOKE ALL ON FUNCTION postspark.design_catalog_create(uuid,uuid,text,jsonb,jsonb,uuid,uuid), postspark.design_catalog_status(uuid,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION postspark.design_catalog_create(uuid,uuid,text,jsonb,jsonb,uuid,uuid), postspark.design_catalog_status(uuid,text,uuid,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
