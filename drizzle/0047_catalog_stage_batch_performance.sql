-- Stage the real catalog as one atomic transaction, without changing role/global
-- timeouts. PostgREST hoists this function setting before the main RPC query.
-- https://docs.postgrest.org/en/stable/references/transactions.html#hoisted-function-settings
BEGIN;
CREATE OR REPLACE FUNCTION postspark.catalog_stage(
 p_source_revision bigint,p_rows jsonb,p_summary jsonb,p_hash text,
 p_components jsonb,p_indexes jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='60s' AS $$
DECLARE current_source bigint; result bigint; item jsonb; definition jsonb; asset jsonb;
DECLARE actual postspark.design_components%ROWTYPE; v_component_id uuid; actor uuid;
DECLARE canonical jsonb; canonical_cards jsonb; expected jsonb; provided jsonb; cards jsonb; indexed jsonb;
BEGIN
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
 canonical:=postspark.catalog_staged_snapshot()->'rows';
 -- Build the small indexed-card lookup once. Re-expanding the full definitions
 -- for each of hundreds of rows made validation quadratic in snapshot size.
 SELECT coalesce(jsonb_object_agg(value->>'component_id',value->'card'),'{}'::jsonb)
 INTO canonical_cards FROM jsonb_array_elements(canonical);
 SELECT coalesce(jsonb_agg(value-'card' ORDER BY value->>'component_id'),'[]'::jsonb) INTO expected FROM jsonb_array_elements(canonical);
 SELECT coalesce(jsonb_agg(value-'card' ORDER BY value->>'component_id'),'[]'::jsonb) INTO provided FROM jsonb_array_elements(p_rows);
 IF expected IS DISTINCT FROM provided THEN RAISE EXCEPTION 'catalog_snapshot_mismatch'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF item->'card'->>'id' IS DISTINCT FROM item->>'component_id' OR item->'card'->>'hash' IS DISTINCT FROM item->>'definition_hash'
  THEN RAISE EXCEPTION 'catalog_snapshot_identity_mismatch'; END IF;
  indexed:=canonical_cards->(item->>'component_id');
  IF indexed IS NOT NULL AND indexed<>'null'::jsonb AND indexed IS DISTINCT FROM item->'card' THEN RAISE EXCEPTION 'catalog_snapshot_mismatch'; END IF;
  indexed:=p_indexes->(item->>'component_id');
  IF indexed->>'descriptor_version' IS DISTINCT FROM 'component-structural-v1' OR jsonb_array_length(indexed->'descriptor'->'structure') IS DISTINCT FROM 48
    OR (indexed->>'projected')::jsonb IS DISTINCT FROM indexed->'descriptor'->'structure'
  THEN RAISE EXCEPTION 'catalog_staged_index_invalid'; END IF;
 END LOOP;
 SELECT source_revision INTO current_source FROM postspark.catalog_state WHERE id=true;
 SELECT revision INTO result FROM postspark.catalog_revisions WHERE source_revision=current_source;
 IF FOUND THEN
  IF NOT EXISTS(SELECT 1 FROM postspark.catalog_revisions WHERE revision=result AND content_hash=p_hash AND summary=p_summary)
  THEN RAISE EXCEPTION 'catalog_snapshot_mismatch'; END IF;
 ELSE
  SELECT coalesce(jsonb_agg(value-'definition'-'assets' ORDER BY value->>'component_id'),'[]'::jsonb) INTO cards FROM jsonb_array_elements(p_rows);
  INSERT INTO postspark.catalog_revisions(source_revision,snapshot,summary,content_hash)
   VALUES(current_source,jsonb_build_object('rows',cards),p_summary,p_hash) RETURNING revision INTO result;
  INSERT INTO postspark.catalog_revision_definitions(revision,component_id,definition_hash,payload)
   SELECT result,(value->>'component_id')::uuid,value->>'definition_hash',value||jsonb_build_object('publicationIndex',p_indexes->(value->>'component_id')) FROM jsonb_array_elements(p_rows);
 END IF;
 -- This marks the last validated source snapshot, not activation. Existing active
 -- releases remain readable/admissible and old workers see none of the new cards.
 UPDATE postspark.catalog_state SET published_source_revision=current_source WHERE id=true;
 RETURN result;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
