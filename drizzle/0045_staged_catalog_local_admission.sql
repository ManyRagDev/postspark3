-- Opt-in immutable staging for local validation. No revision is activated here.
-- Registry rows/asset ownership remain shared; new search cards become live only
-- on explicit activation. Stage registration and its source marker commit together.
BEGIN;
CREATE FUNCTION postspark.catalog_stage(
 p_source_revision bigint,p_rows jsonb,p_summary jsonb,p_hash text,
 p_components jsonb,p_indexes jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_source bigint; result bigint; item jsonb; definition jsonb; asset jsonb;
DECLARE actual postspark.design_components%ROWTYPE; v_component_id uuid; actor uuid;
DECLARE canonical jsonb; expected jsonb; provided jsonb; cards jsonb; indexed jsonb;
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
 SELECT coalesce(jsonb_agg(value-'card' ORDER BY value->>'component_id'),'[]'::jsonb) INTO expected FROM jsonb_array_elements(canonical);
 SELECT coalesce(jsonb_agg(value-'card' ORDER BY value->>'component_id'),'[]'::jsonb) INTO provided FROM jsonb_array_elements(p_rows);
 IF expected IS DISTINCT FROM provided THEN RAISE EXCEPTION 'catalog_snapshot_mismatch'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF item->'card'->>'id' IS DISTINCT FROM item->>'component_id' OR item->'card'->>'hash' IS DISTINCT FROM item->>'definition_hash'
  THEN RAISE EXCEPTION 'catalog_snapshot_identity_mismatch'; END IF;
  SELECT value->'card' INTO indexed FROM jsonb_array_elements(canonical) WHERE value->>'component_id'=item->>'component_id';
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

CREATE FUNCTION postspark.catalog_activate(p_revision bigint) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_state postspark.catalog_state%ROWTYPE; release postspark.catalog_revisions%ROWTYPE;
DECLARE item jsonb; old_card jsonb; index_record postspark.design_component_search_documents%ROWTYPE;
BEGIN
 SELECT * INTO current_state FROM postspark.catalog_state WHERE id=true FOR UPDATE;
 SELECT * INTO release FROM postspark.catalog_revisions WHERE revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'catalog_revision_invalid'; END IF;
 IF current_state.active_revision=p_revision AND current_state.source_revision=current_state.published_source_revision THEN RETURN p_revision; END IF;
 IF current_state.source_revision IS DISTINCT FROM release.source_revision OR current_state.published_source_revision IS DISTINCT FROM release.source_revision
 THEN RAISE EXCEPTION 'catalog_publication_conflict'; END IF;
 FOR item IN SELECT payload FROM postspark.catalog_revision_definitions WHERE revision=p_revision ORDER BY component_id LOOP
  IF NOT EXISTS(SELECT 1 FROM postspark.design_components c WHERE c.id=(item->>'component_id')::uuid AND c.definition_hash=item->>'definition_hash' AND c.definition=item->'definition')
  THEN RAISE EXCEPTION 'catalog_snapshot_mismatch'; END IF;
  SELECT card INTO old_card FROM postspark.design_component_search_documents WHERE component_id=(item->>'component_id')::uuid;
  IF FOUND THEN
   IF old_card IS DISTINCT FROM item->'card' THEN RAISE EXCEPTION 'catalog_activation_index_conflict'; END IF;
  ELSE
   IF item->'publicationIndex' IS NULL THEN RAISE EXCEPTION 'catalog_staged_index_invalid'; END IF;
   SELECT * INTO index_record FROM jsonb_populate_record(NULL::postspark.design_component_search_documents,
    (item->'publicationIndex')||jsonb_build_object('component_id',item->>'component_id','definition_hash',item->>'definition_hash','card',item->'card'));
   INSERT INTO postspark.design_component_search_documents(component_id,definition_hash,descriptor_version,projected,descriptor,card)
    VALUES(index_record.component_id,index_record.definition_hash,index_record.descriptor_version,index_record.projected,index_record.descriptor,index_record.card);
  END IF;
 END LOOP;
 UPDATE postspark.catalog_state SET active_revision=p_revision,published_source_revision=source_revision WHERE id=true;
 RETURN p_revision;
END $$;

-- Preserve ordinary publication. A staged release requires explicit activation;
-- it must not make the historical early-return silently claim it was activated.
CREATE OR REPLACE FUNCTION postspark.catalog_publish(p_source_revision bigint,p_rows jsonb,p_summary jsonb,p_hash text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_source bigint; current_published bigint; result bigint; cards jsonb;
BEGIN
 SELECT source_revision,published_source_revision,active_revision INTO current_source,current_published,result FROM postspark.catalog_state WHERE id=true FOR UPDATE;
 IF current_source<>p_source_revision THEN RAISE EXCEPTION 'catalog_publication_conflict'; END IF;
 IF current_published=current_source THEN
  IF EXISTS(SELECT 1 FROM postspark.catalog_revisions WHERE source_revision=current_source AND revision IS DISTINCT FROM result) THEN RAISE EXCEPTION 'catalog_staged_activation_required'; END IF;
  RETURN result;
 END IF;
 IF p_rows IS DISTINCT FROM (postspark.catalog_staged_snapshot()->'rows') THEN RAISE EXCEPTION 'catalog_snapshot_mismatch'; END IF;
 SELECT coalesce(jsonb_agg(item-'definition'-'assets' ORDER BY item->>'component_id'),'[]'::jsonb) INTO cards FROM jsonb_array_elements(p_rows) item;
 INSERT INTO postspark.catalog_revisions(source_revision,snapshot,summary,content_hash) VALUES(current_source,jsonb_build_object('rows',cards),p_summary,p_hash) RETURNING revision INTO result;
 INSERT INTO postspark.catalog_revision_definitions(revision,component_id,definition_hash,payload)
 SELECT result,(item->>'component_id')::uuid,item->>'definition_hash',item FROM jsonb_array_elements(p_rows) item;
 UPDATE postspark.catalog_state SET active_revision=result,published_source_revision=current_source WHERE id=true;
 RETURN result;
END $$;

CREATE FUNCTION postspark.generation_admit_staged_local(
 p_id uuid,p_owner uuid,p_idempotency_key text,p_input_hash text,p_input jsonb,
 p_experimental boolean,p_deadline_at timestamptz,p_scope text,p_revision bigint,
 p_generation_config jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE; admitted jsonb;
BEGIN
 IF p_scope IS NULL OR length(p_scope) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid executor scope'; END IF;
 IF p_generation_config IS NOT NULL AND (jsonb_typeof(p_generation_config) IS DISTINCT FROM 'object'
  OR p_generation_config->>'version' IS DISTINCT FROM '1'
  OR coalesce(p_generation_config->>'choice','') NOT IN ('gemini','gpt')
  OR coalesce(p_generation_config->>'generationStrategyVersion','') NOT IN ('1','2')
  OR coalesce(p_generation_config->>'model','')='' OR coalesce(p_generation_config->>'configurationHash','') !~ '^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'Invalid generation configuration' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 SELECT * INTO req FROM postspark.generation_v5_requests WHERE owner_id=p_owner AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF FOUND THEN
  IF req.execution_mode<>'local-demand' OR req.executor_scope IS DISTINCT FROM p_scope THEN RAISE EXCEPTION 'generation_executor_scope_mismatch'; END IF;
  IF req.input_hash<>p_input_hash THEN RAISE EXCEPTION 'Idempotency key reused with different input' USING ERRCODE='23505'; END IF;
  RETURN to_jsonb(req)||jsonb_build_object('created',false);
 END IF;
 PERFORM 1 FROM postspark.catalog_revisions WHERE revision=p_revision FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'catalog_revision_invalid'; END IF;
 admitted:=postspark.generation_admit(p_id,p_owner,p_idempotency_key,p_input_hash,p_input,p_experimental,p_deadline_at);
 UPDATE postspark.generation_v5_requests SET execution_mode='local-demand',executor_scope=p_scope,catalog_revision=p_revision,generation_config=p_generation_config
  WHERE id=p_id RETURNING * INTO req;
 RETURN to_jsonb(req)||jsonb_build_object('created',true);
END $$;

REVOKE ALL ON FUNCTION postspark.catalog_stage(bigint,jsonb,jsonb,text,jsonb,jsonb),postspark.catalog_activate(bigint),postspark.generation_admit_staged_local(uuid,uuid,text,text,jsonb,boolean,timestamptz,text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.catalog_stage(bigint,jsonb,jsonb,text,jsonb,jsonb),postspark.catalog_activate(bigint),postspark.generation_admit_staged_local(uuid,uuid,text,text,jsonb,boolean,timestamptz,text,bigint,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
