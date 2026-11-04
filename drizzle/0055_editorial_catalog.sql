-- Editorial annotations have their own immutable revisions. Publishing them
-- never changes a design release, component geometry, hash, index or live head.
BEGIN;

CREATE TABLE postspark.editorial_catalog_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 catalog_revision bigint NOT NULL REFERENCES postspark.catalog_revisions(revision),
 hash text NOT NULL CHECK (hash ~ '^[a-f0-9]{64}$'),
 document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (catalog_revision, hash),
 UNIQUE (catalog_revision, id)
);
CREATE TABLE postspark.editorial_catalog_heads (
 catalog_revision bigint PRIMARY KEY REFERENCES postspark.catalog_revisions(revision),
 editorial_revision uuid NOT NULL,
 FOREIGN KEY (catalog_revision, editorial_revision)
   REFERENCES postspark.editorial_catalog_revisions(catalog_revision, id)
);
ALTER TABLE postspark.editorial_catalog_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE postspark.editorial_catalog_heads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON postspark.editorial_catalog_revisions, postspark.editorial_catalog_heads FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON postspark.editorial_catalog_revisions, postspark.editorial_catalog_heads TO service_role;
CREATE POLICY editorial_revision_service_read ON postspark.editorial_catalog_revisions FOR SELECT TO service_role USING (true);
CREATE POLICY editorial_head_service_read ON postspark.editorial_catalog_heads FOR SELECT TO service_role USING (true);

CREATE FUNCTION postspark.editorial_catalog_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'editorial_catalog_revision_immutable'; END $$;
CREATE TRIGGER editorial_revision_immutable BEFORE UPDATE OR DELETE ON postspark.editorial_catalog_revisions
FOR EACH ROW EXECUTE FUNCTION postspark.editorial_catalog_immutable();

-- Matches arsenalCanonicalJson for this document's string keys, integers and
-- arrays. Array order is normalized explicitly by editorial_catalog_publish.
CREATE FUNCTION postspark.editorial_canonical_json(value jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
DECLARE result text;
BEGIN
 IF jsonb_typeof(value) = 'object' THEN
  SELECT '{' || coalesce(string_agg(to_jsonb(e.key)::text || ':' || postspark.editorial_canonical_json(e.value), ',' ORDER BY e.key COLLATE "C"), '') || '}'
    INTO result FROM jsonb_each(value) e;
 ELSIF jsonb_typeof(value) = 'array' THEN
  SELECT '[' || coalesce(string_agg(postspark.editorial_canonical_json(e.value), ',' ORDER BY e.ordinality), '') || ']'
    INTO result FROM jsonb_array_elements(value) WITH ORDINALITY e(value, ordinality);
 ELSE result := value::text;
 END IF;
 RETURN result;
END $$;

-- Character bounds match JS/Zod UTF-16 length, including astral characters.
CREATE FUNCTION postspark.editorial_utf16_length(value text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
 SELECT coalesce(sum(CASE WHEN c = '' THEN 0 WHEN octet_length(c) > 3 THEN 2 ELSE 1 END), 0)::integer
 FROM regexp_split_to_table(value, '') c;
$$;

CREATE FUNCTION postspark.editorial_catalog_head(p_catalog_revision bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT jsonb_build_object('revision', r.id::text, 'hash', r.hash)
 FROM postspark.editorial_catalog_heads h
 JOIN postspark.editorial_catalog_revisions r ON r.catalog_revision = h.catalog_revision AND r.id = h.editorial_revision
 WHERE h.catalog_revision = p_catalog_revision;
$$;

-- Only this service-only function can insert revisions or change the pointer.
-- SECURITY DEFINER is limited to this administrative write; direct table writes
-- remain revoked so callers cannot bypass validation or immutability.
CREATE FUNCTION postspark.editorial_catalog_publish(p_catalog_revision bigint, p_document jsonb, p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE snapshot jsonb; item jsonb; expected jsonb; canonical jsonb;
DECLARE intents jsonb; designs jsonb; digest text; revision_id uuid;
BEGIN
 IF p_catalog_revision IS NULL OR p_catalog_revision <= 0 OR p_document IS NULL OR p_hash IS NULL
   OR jsonb_typeof(p_document) IS DISTINCT FROM 'object'
   OR p_document->'version' IS DISTINCT FROM '1'::jsonb
   OR (p_document - ARRAY['version','intents','designs']::text[]) <> '{}'::jsonb
   OR jsonb_typeof(p_document->'intents') IS DISTINCT FROM 'array'
   OR jsonb_typeof(p_document->'designs') IS DISTINCT FROM 'array'
   OR p_hash !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'editorial_catalog_document_invalid'; END IF;
 IF jsonb_array_length(p_document->'intents') > 500 OR jsonb_array_length(p_document->'designs') > 2000
 THEN RAISE EXCEPTION 'editorial_catalog_document_invalid'; END IF;

 FOR item IN SELECT value FROM jsonb_array_elements(p_document->'intents') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR (item - ARRAY['id','label','description']::text[]) <> '{}'::jsonb
    OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR coalesce(item->>'id', '') !~ '^[a-z][a-z0-9_]{0,79}$'
    OR jsonb_typeof(item->'label') IS DISTINCT FROM 'string' OR postspark.editorial_utf16_length(item->>'label') NOT BETWEEN 1 AND 120
    OR jsonb_typeof(item->'description') IS DISTINCT FROM 'string' OR postspark.editorial_utf16_length(item->>'description') NOT BETWEEN 1 AND 800
  THEN RAISE EXCEPTION 'editorial_catalog_document_invalid'; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_document->'intents')) <> jsonb_array_length(p_document->'intents')
 THEN RAISE EXCEPTION 'editorial_catalog_duplicate_intent'; END IF;

 -- Locks only the relevant immutable release row, serializing editorial
 -- publication for that release without modifying the design catalog state.
 SELECT r.snapshot INTO snapshot FROM postspark.catalog_revisions r WHERE r.revision = p_catalog_revision FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'editorial_catalog_revision_missing'; END IF;
 IF jsonb_typeof(snapshot->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'editorial_catalog_source_invalid'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_document->'designs') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR (item - ARRAY['sourceId','sourceHash','intentIds','rationale']::text[]) <> '{}'::jsonb
    OR jsonb_typeof(item->'sourceId') IS DISTINCT FROM 'string'
    OR coalesce(item->>'sourceId', '') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    OR jsonb_typeof(item->'sourceHash') IS DISTINCT FROM 'string' OR coalesce(item->>'sourceHash', '') !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(item->'intentIds') IS DISTINCT FROM 'array'
    OR jsonb_typeof(item->'rationale') IS DISTINCT FROM 'string' OR postspark.editorial_utf16_length(item->>'rationale') NOT BETWEEN 1 AND 1200
  THEN RAISE EXCEPTION 'editorial_catalog_document_invalid'; END IF;
  IF jsonb_array_length(item->'intentIds') NOT BETWEEN 1 AND 50
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(item->'intentIds') e
      WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string' OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_document->'intents') i WHERE i.value->'id' = e.value))
  THEN RAISE EXCEPTION 'editorial_catalog_unknown_intent'; END IF;
  IF (SELECT count(DISTINCT value) FROM jsonb_array_elements(item->'intentIds')) <> jsonb_array_length(item->'intentIds')
  THEN RAISE EXCEPTION 'editorial_catalog_duplicate_design_intent'; END IF;
  -- A source must be an actual original card in the pinned release. A derived
  -- carousel variant cannot acquire an unrelated family's editorial annotation.
  SELECT r.value->'card' INTO expected FROM jsonb_array_elements(snapshot->'rows') r
    WHERE r.value->>'component_id' = item->>'sourceId'
      AND r.value->>'definition_hash' = item->>'sourceHash'
      AND r.value->'card'->>'id' = item->>'sourceId'
      AND r.value->'card'->>'hash' = item->>'sourceHash'
      AND jsonb_typeof(r.value->'card'->'completeDesign') = 'object'
      AND coalesce(r.value->'card'->'completeDesign'->'designGuidance'->'carouselVariant', 'null'::jsonb) = 'null'::jsonb;
  IF NOT FOUND THEN RAISE EXCEPTION 'editorial_catalog_source_mismatch'; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'sourceId') FROM jsonb_array_elements(p_document->'designs')) <> jsonb_array_length(p_document->'designs')
 THEN RAISE EXCEPTION 'editorial_catalog_duplicate_design'; END IF;

 SELECT coalesce(jsonb_agg(value ORDER BY value->>'id' COLLATE "C"), '[]'::jsonb)
   INTO intents FROM jsonb_array_elements(p_document->'intents');
 SELECT coalesce(jsonb_agg(d.value || jsonb_build_object('intentIds', (
     SELECT jsonb_agg(i.value ORDER BY i.value #>> '{}' COLLATE "C") FROM jsonb_array_elements(d.value->'intentIds') i
   )) ORDER BY d.value->>'sourceId' COLLATE "C"), '[]'::jsonb)
   INTO designs FROM jsonb_array_elements(p_document->'designs') d;
 canonical := jsonb_build_object('version', 1, 'intents', intents, 'designs', designs);
 digest := encode(sha256(convert_to(postspark.editorial_canonical_json(canonical), 'UTF8')), 'hex');
 IF digest IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'editorial_catalog_hash_mismatch'; END IF;

 SELECT id INTO revision_id FROM postspark.editorial_catalog_revisions WHERE catalog_revision = p_catalog_revision AND hash = digest;
 IF NOT FOUND THEN
  INSERT INTO postspark.editorial_catalog_revisions(catalog_revision, hash, document)
    VALUES(p_catalog_revision, digest, canonical) RETURNING id INTO revision_id;
 END IF;
 INSERT INTO postspark.editorial_catalog_heads(catalog_revision, editorial_revision) VALUES(p_catalog_revision, revision_id)
   ON CONFLICT (catalog_revision) DO UPDATE SET editorial_revision = EXCLUDED.editorial_revision;
 RETURN jsonb_build_object('version', 1, 'catalogRevision', p_catalog_revision::text, 'revision', revision_id::text, 'hash', digest, 'document', canonical);
END $$;

REVOKE ALL ON FUNCTION postspark.editorial_catalog_immutable(), postspark.editorial_canonical_json(jsonb), postspark.editorial_utf16_length(text), postspark.editorial_catalog_head(bigint), postspark.editorial_catalog_publish(bigint,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION postspark.editorial_catalog_head(bigint), postspark.editorial_catalog_publish(bigint,jsonb,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
