-- Reuse immutable stored definitions instead of uploading the entire catalog.
-- This is a transport optimization: catalog_stage still checks every canonical
-- row, source revision, asset and index and performs all writes atomically.
BEGIN;
CREATE FUNCTION postspark.catalog_stage_delta(
 p_source_revision bigint,p_base_revision bigint,p_base_hash text,
 p_rows jsonb,p_summary jsonb,p_hash text,p_components jsonb,p_indexes jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET statement_timeout='60s' AS $$
DECLARE base postspark.catalog_revisions%ROWTYPE; full_rows jsonb;
BEGIN
 RAISE LOG 'postspark_catalog_stage_delta phase=entered at=%', clock_timestamp();
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR p_base_hash IS NULL OR p_base_hash !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'catalog_staging_base_invalid'; END IF;
 SELECT * INTO base FROM postspark.catalog_revisions WHERE revision=p_base_revision;
 IF NOT FOUND OR base.source_revision IS DISTINCT FROM p_source_revision OR base.content_hash IS DISTINCT FROM p_base_hash
 THEN RAISE EXCEPTION 'catalog_staging_base_invalid'; END IF;
 IF (SELECT count(*) FROM postspark.catalog_revision_definitions WHERE revision=p_base_revision)
   IS DISTINCT FROM jsonb_array_length(base.snapshot->'rows')::bigint
 THEN RAISE EXCEPTION 'catalog_staging_base_incomplete'; END IF;
 IF (SELECT count(DISTINCT (value->>'component_id')::uuid) FROM jsonb_array_elements(p_rows))
   IS DISTINCT FROM jsonb_array_length(p_rows)::bigint
 THEN RAISE EXCEPTION 'catalog_snapshot_mismatch'; END IF;
 WITH changed AS MATERIALIZED (
   SELECT (value->>'component_id')::uuid AS component_id,value AS payload FROM jsonb_array_elements(p_rows)
 ), merged AS (
   SELECT d.component_id,d.payload-'publicationIndex' AS payload
   FROM postspark.catalog_revision_definitions d
   WHERE d.revision=p_base_revision AND NOT EXISTS(SELECT 1 FROM changed c WHERE c.component_id=d.component_id)
   UNION ALL SELECT component_id,payload FROM changed
 )
 SELECT coalesce(json_agg(payload ORDER BY component_id),'[]'::json)::jsonb INTO full_rows FROM merged;
 RAISE LOG 'postspark_catalog_stage_delta phase=reconstructed at=% rows=% changed=%', clock_timestamp(),jsonb_array_length(full_rows),jsonb_array_length(p_rows);
 -- The inner function locks and rechecks the live source revision. No source
 -- changes can slip between a caller's read and registration/validation/commit.
 RETURN postspark.catalog_stage(p_source_revision,full_rows,p_summary,p_hash,p_components,p_indexes);
END $$;
REVOKE ALL ON FUNCTION postspark.catalog_stage_delta(bigint,bigint,text,jsonb,jsonb,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.catalog_stage_delta(bigint,bigint,text,jsonb,jsonb,text,jsonb,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
