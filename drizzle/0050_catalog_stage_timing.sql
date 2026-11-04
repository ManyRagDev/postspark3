-- Administrative staging timings. Log phase, clock time, elapsed milliseconds,
-- and counts only; never component IDs, user IDs, definitions, or other content.
-- The final phase means function completion, not proof of transaction commit.
-- Retain the exact validation, privilege boundary and scoped 60-second deadline.
BEGIN;
CREATE OR REPLACE FUNCTION postspark.catalog_stage(
 p_source_revision bigint,p_rows jsonb,p_summary jsonb,p_hash text,
 p_components jsonb,p_indexes jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='60s' AS $$
DECLARE current_source bigint; result bigint; item jsonb; definition jsonb; asset jsonb;
DECLARE actual postspark.design_components%ROWTYPE; v_component_id uuid; actor uuid;
DECLARE expected jsonb; indexed jsonb; expected_count bigint; supplied_count bigint;
DECLARE profile_started timestamptz := clock_timestamp();
BEGIN
 RAISE LOG 'postspark_catalog_stage_profile phase=entered at=% elapsed_ms=0', clock_timestamp();
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_typeof(p_components) IS DISTINCT FROM 'array'
   OR jsonb_typeof(p_indexes) IS DISTINCT FROM 'object' OR p_hash !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'catalog_snapshot_invalid'; END IF;
 SELECT source_revision INTO current_source FROM postspark.catalog_state WHERE id=true FOR UPDATE;
 IF current_source IS DISTINCT FROM p_source_revision THEN RAISE EXCEPTION 'catalog_publication_conflict'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_components) LOOP
  definition:=item->'definition'; v_component_id:=(definition->>'id')::uuid; actor:=(item->>'actor')::uuid;
  IF definition->>'schemaVersion' IS DISTINCT FROM '1' OR definition->>'kind' IS DISTINCT FROM 'content'
    OR jsonb_typeof(definition->'completeDesign') IS DISTINCT FROM 'object'
    OR coalesce(definition->>'hash','') !~ '^[a-f0-9]{64}$'
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor)
  THEN RAISE EXCEPTION 'catalog_staged_component_invalid'; END IF;
  SELECT * INTO actual FROM postspark.design_components WHERE id=v_component_id;
  IF FOUND THEN
   IF actual.definition_hash IS DISTINCT FROM definition->>'hash' OR actual.definition IS DISTINCT FROM definition
   THEN RAISE EXCEPTION 'catalog_staged_component_conflict'; END IF;
  ELSE
   INSERT INTO postspark.design_components(id,definition_hash,definition,status,kind,source_key,roles,densities,aspect_ratios,actor_id)
   VALUES(v_component_id,definition->>'hash',definition,'draft','content',
    CASE WHEN definition->'source'->>'kind'='recipe' THEN 'recipe:'||(definition->'source'->>'referenceId')
      ELSE 'catalog:'||(definition->'source'->>'versionId')||':'||(definition->'source'->>'variantKey') END,
    ARRAY(SELECT jsonb_array_elements_text(definition->'roles')),
    ARRAY(SELECT jsonb_array_elements_text(definition->'densities')),
    ARRAY(SELECT jsonb_array_elements_text(definition->'aspectRatios')),actor);
  END IF;
  FOR asset IN SELECT value FROM jsonb_array_elements(coalesce(definition->'assets','[]'::jsonb)) LOOP
   IF asset->>'kind' IS DISTINCT FROM 'catalog' OR NOT EXISTS(SELECT 1 FROM postspark.design_catalog_assets a WHERE a.id=asset->>'id' AND a.manifest=asset)
   THEN RAISE EXCEPTION 'catalog_snapshot_assets_mismatch'; END IF;
   IF NOT EXISTS(SELECT 1 FROM postspark.design_component_assets l WHERE l.component_id=v_component_id AND l.asset_id=asset->>'id') THEN
    INSERT INTO postspark.design_component_assets(component_id,asset_id) VALUES(v_component_id,asset->>'id');
   END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM postspark.design_component_evidence e WHERE e.component_id=v_component_id AND e.definition_hash=definition->>'hash' AND e.kind='technical') THEN
   INSERT INTO postspark.design_component_evidence(component_id,definition_hash,kind,decision,actor_id,metrics)
   VALUES(v_component_id,definition->>'hash','technical','verified',actor,jsonb_build_object('descriptorVersion','component-structural-v1','piecesVerified',true,'assetsVerified',true,'graphVerified',true,'source','catalog_stage'));
  END IF;
 END LOOP;
 RAISE LOG 'postspark_catalog_stage_profile phase=registered at=% elapsed_ms=% rows=% components=%', clock_timestamp(), round(extract(epoch from (clock_timestamp()-profile_started))*1000), jsonb_array_length(p_rows), jsonb_array_length(p_components);
 -- Cardinality plus unique UUIDs and an exact match for every row prove set
 -- equality, including omissions, additions, duplicates, and extra JSON keys.
 SELECT count(*) INTO expected_count FROM postspark.design_components c
 WHERE c.kind='content' AND c.definition->'completeDesign' IS NOT NULL
   AND c.definition->'completeDesign'<>'null'::jsonb;
 SELECT count(DISTINCT (value->>'component_id')::uuid) INTO supplied_count FROM jsonb_array_elements(p_rows);
 IF jsonb_array_length(p_rows) IS DISTINCT FROM expected_count OR supplied_count IS DISTINCT FROM expected_count
 THEN RAISE EXCEPTION 'catalog_snapshot_mismatch'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  SELECT jsonb_build_object('component_id',c.id,'definition_hash',c.definition_hash,
    'design_components',jsonb_build_object('status',c.status,'definition_hash',c.definition_hash,'source',c.definition->'source'),
    'definition',c.definition,'assets',coalesce((
      SELECT jsonb_agg(a.manifest ORDER BY a.id)
      FROM postspark.design_component_assets l JOIN postspark.design_catalog_assets a ON a.id=l.asset_id
      WHERE l.component_id=c.id),'[]'::jsonb)), d.card
  INTO expected,indexed
  FROM postspark.design_components c LEFT JOIN postspark.design_component_search_documents d ON d.component_id=c.id
  WHERE c.id=(item->>'component_id')::uuid AND c.kind='content'
    AND c.definition->'completeDesign' IS NOT NULL AND c.definition->'completeDesign'<>'null'::jsonb;
  IF NOT FOUND OR expected IS DISTINCT FROM item-'card' THEN RAISE EXCEPTION 'catalog_snapshot_mismatch'; END IF;
  IF item->'card'->>'id' IS DISTINCT FROM item->>'component_id' OR item->'card'->>'hash' IS DISTINCT FROM item->>'definition_hash'
  THEN RAISE EXCEPTION 'catalog_snapshot_identity_mismatch'; END IF;
  IF indexed IS NOT NULL AND indexed<>'null'::jsonb AND indexed IS DISTINCT FROM item->'card' THEN RAISE EXCEPTION 'catalog_snapshot_mismatch'; END IF;
  indexed:=p_indexes->(item->>'component_id');
  IF indexed->>'descriptor_version' IS DISTINCT FROM 'component-structural-v1' OR jsonb_array_length(indexed->'descriptor'->'structure') IS DISTINCT FROM 48
    OR (indexed->>'projected')::jsonb IS DISTINCT FROM indexed->'descriptor'->'structure'
  THEN RAISE EXCEPTION 'catalog_staged_index_invalid'; END IF;
 END LOOP;
 RAISE LOG 'postspark_catalog_stage_profile phase=canonical_validated at=% elapsed_ms=% rows=% components=%', clock_timestamp(), round(extract(epoch from (clock_timestamp()-profile_started))*1000), jsonb_array_length(p_rows), jsonb_array_length(p_components);
 SELECT source_revision INTO current_source FROM postspark.catalog_state WHERE id=true;
 SELECT revision INTO result FROM postspark.catalog_revisions WHERE source_revision=current_source;
 IF FOUND THEN
  IF NOT EXISTS(SELECT 1 FROM postspark.catalog_revisions WHERE revision=result AND content_hash=p_hash AND summary=p_summary)
  THEN RAISE EXCEPTION 'catalog_snapshot_mismatch'; END IF;
 ELSE
  INSERT INTO postspark.catalog_revisions(source_revision,snapshot,summary,content_hash)
   SELECT current_source,json_build_object('rows',coalesce(json_agg(value-'definition'-'assets' ORDER BY value->>'component_id'),'[]'::json))::jsonb,p_summary,p_hash
   FROM jsonb_array_elements(p_rows) RETURNING revision INTO result;
 RAISE LOG 'postspark_catalog_stage_profile phase=revision_inserted at=% elapsed_ms=% rows=% components=%', clock_timestamp(), round(extract(epoch from (clock_timestamp()-profile_started))*1000), jsonb_array_length(p_rows), jsonb_array_length(p_components);
  INSERT INTO postspark.catalog_revision_definitions(revision,component_id,definition_hash,payload)
   SELECT result,(value->>'component_id')::uuid,value->>'definition_hash',value||jsonb_build_object('publicationIndex',p_indexes->(value->>'component_id')) FROM jsonb_array_elements(p_rows);
 RAISE LOG 'postspark_catalog_stage_profile phase=definitions_inserted at=% elapsed_ms=% rows=% components=%', clock_timestamp(), round(extract(epoch from (clock_timestamp()-profile_started))*1000), jsonb_array_length(p_rows), jsonb_array_length(p_components);
 END IF;
 -- This marks the last validated source snapshot, not activation. Existing active
 -- releases remain readable/admissible and old workers see none of the new cards.
 UPDATE postspark.catalog_state SET published_source_revision=current_source WHERE id=true;
 RAISE LOG 'postspark_catalog_stage_profile phase=completed at=% elapsed_ms=% rows=% components=%', clock_timestamp(), round(extract(epoch from (clock_timestamp()-profile_started))*1000), jsonb_array_length(p_rows), jsonb_array_length(p_components);
 RETURN result;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
