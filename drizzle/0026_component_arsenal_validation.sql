BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE postspark.design_components ADD CONSTRAINT component_definition_identity_present CHECK(
 jsonb_typeof(definition)='object' AND definition ?& ARRAY['schemaVersion','id','hash','fragment','pieces','assets','source']
);
DO $install$
DECLARE vs text;
BEGIN
 SELECT n.nspname INTO STRICT vs FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector';
 EXECUTE pg_catalog.format($ddl$
 CREATE FUNCTION postspark.design_component_search_v2(p_kind text,p_aspect text,p_roles text[],p_density text,p_experimental boolean,p_anchor %1$I.vector(48),p_limit integer DEFAULT 5)
 RETURNS TABLE(component_id uuid,definition_hash text,card jsonb,distance double precision)
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
 BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5 OR p_kind IS NULL OR p_aspect IS NULL OR p_roles IS NULL THEN RAISE EXCEPTION 'Invalid component query'; END IF;
  RETURN QUERY WITH eligible AS (
   SELECT s.*,c.source_key FROM postspark.design_component_search_documents s
   JOIN postspark.design_components c ON c.id=s.component_id AND c.definition_hash=s.definition_hash
   WHERE c.kind=p_kind AND p_aspect=ANY(c.aspect_ratios) AND c.roles && p_roles
    AND (p_density IS NULL OR p_density=ANY(c.densities))
    AND (c.status='approved' OR p_experimental AND c.status='draft')
  ),scored AS (
   SELECT e.*,CASE WHEN p_anchor IS NULL THEN NULL ELSE (
    SELECT sum(abs(a.value::double precision-b.value::double precision))
    FROM pg_catalog.jsonb_array_elements_text(e.projected::text::jsonb) WITH ORDINALITY a(value,i)
    JOIN pg_catalog.jsonb_array_elements_text(p_anchor::text::jsonb) WITH ORDINALITY b(value,i) USING(i)) END d FROM eligible e
  ),deduplicated AS (
   SELECT s.*,row_number() OVER(PARTITION BY s.source_key ORDER BY s.d ASC NULLS LAST,s.component_id) rank FROM scored s
  ) SELECT d.component_id,d.definition_hash,d.card,d.d FROM deduplicated d WHERE d.rank=1
    ORDER BY d.d ASC NULLS LAST,d.component_id LIMIT p_limit;
 END $fn$;
 REVOKE ALL ON FUNCTION postspark.design_component_search_v2(text,text,text[],text,boolean,%1$I.vector,integer) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION postspark.design_component_search_v2(text,text,text[],text,boolean,%1$I.vector,integer) TO service_role;
 $ddl$,vs);
END $install$;
CREATE FUNCTION postspark.design_component_validate_delivery(p_output jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v jsonb; s jsonb; n integer;
BEGIN
 IF p_output IS NULL OR jsonb_typeof(p_output)<>'array' OR jsonb_array_length(p_output)<>3 THEN RAISE EXCEPTION 'Three complete proposals required'; END IF;
 FOR v IN SELECT value FROM pg_catalog.jsonb_array_elements(p_output) LOOP
  IF jsonb_typeof(v->'componentAssemblyV1') IS DISTINCT FROM 'object' OR v->'componentAssemblyV1'->>'schemaVersion' IS DISTINCT FROM '1'
   OR jsonb_typeof(v->'componentAssemblyV1'->'slides') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Assembly document required'; END IF;
  n:=jsonb_array_length(v->'componentAssemblyV1'->'slides');
  IF n NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid slide count'; END IF;
  FOR s IN SELECT value FROM pg_catalog.jsonb_array_elements(v->'componentAssemblyV1'->'slides') LOOP
   IF jsonb_typeof(s->'bundle'->'candidates') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'bundle'->'candidates')<>1
    OR jsonb_typeof(s->'bundle'->'assets') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Complete slide bundle required'; END IF;
  END LOOP;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION postspark.design_component_validate_delivery(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.design_component_validate_delivery(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION postspark.design_component_deliver_v1(p_run uuid,p_actor uuid,p_output jsonb,p_experimental boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE variation jsonb; slide jsonb; bundle jsonb; candidate jsonb; cid uuid; chash text; asset jsonb; k integer;
BEGIN
 PERFORM postspark.design_component_validate_delivery(p_output);
 IF p_experimental IS NULL THEN RAISE EXCEPTION 'Explicit publication mode required'; END IF;
 PERFORM 1 FROM postspark.generation_runs WHERE id=p_run AND user_uuid=p_actor AND status='completed' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owned completed run required'; END IF;
 IF jsonb_array_length(p_output)<>3 THEN RAISE EXCEPTION 'Three proposals required'; END IF;
 FOR variation IN SELECT value FROM pg_catalog.jsonb_array_elements(p_output) LOOP
  IF variation->'componentAssemblyV1'->>'runId' IS DISTINCT FROM p_run::text THEN RAISE EXCEPTION 'Assembly run mismatch'; END IF;
  FOR slide IN SELECT value FROM pg_catalog.jsonb_array_elements(variation->'componentAssemblyV1'->'slides') LOOP
   bundle:=slide->'bundle';
   IF bundle->>'runId' IS DISTINCT FROM p_run::text OR bundle->>'traceId' IS DISTINCT FROM p_run::text THEN RAISE EXCEPTION 'Slide run mismatch'; END IF;
   FOR candidate IN SELECT value FROM pg_catalog.jsonb_array_elements(bundle->'candidates') LOOP
    IF candidate->'componentAssembly'->>'planHash' IS DISTINCT FROM variation->'componentAssemblyV1'->>'planHash' THEN RAISE EXCEPTION 'Assembly plan mismatch'; END IF;
    IF jsonb_array_length(candidate->'componentAssembly'->'componentIds')<1 OR jsonb_array_length(candidate->'componentAssembly'->'componentIds')<>jsonb_array_length(candidate->'componentAssembly'->'componentHashes') THEN RAISE EXCEPTION 'Component provenance required'; END IF;
    FOR k IN 0..jsonb_array_length(candidate->'componentAssembly'->'componentIds')-1 LOOP
     cid:=(candidate->'componentAssembly'->'componentIds'->>k)::uuid;
     chash:=candidate->'componentAssembly'->'componentHashes'->>k;
     IF NOT EXISTS(SELECT 1 FROM postspark.design_components c WHERE c.id=cid AND c.definition_hash=chash AND (c.status='approved' OR p_experimental AND c.status='draft')) THEN RAISE EXCEPTION 'Component not eligible'; END IF;
     FOR asset IN SELECT value FROM pg_catalog.jsonb_array_elements(bundle->'assets') LOOP
      IF asset->>'kind'<>'catalog' THEN RAISE EXCEPTION 'Components require catalog assets'; END IF;
      IF EXISTS(SELECT 1 FROM postspark.design_component_assets l JOIN postspark.design_catalog_assets a ON a.id=l.asset_id WHERE l.component_id=cid AND a.id=asset->>'id' AND a.manifest=asset) THEN
       INSERT INTO postspark.design_component_asset_grants(user_uuid,asset_id,component_id) VALUES(p_actor,asset->>'id',cid) ON CONFLICT DO NOTHING;
      END IF;
     END LOOP;
    END LOOP;
   END LOOP;
   FOR asset IN SELECT value FROM pg_catalog.jsonb_array_elements(bundle->'assets') LOOP
    IF NOT EXISTS(SELECT 1 FROM postspark.design_component_asset_grants g JOIN postspark.design_catalog_assets a ON a.id=g.asset_id WHERE g.user_uuid=p_actor AND g.asset_id=asset->>'id' AND a.manifest=asset) THEN RAISE EXCEPTION 'Slide asset not granted'; END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 UPDATE postspark.generation_runs SET output_snapshot=p_output WHERE id=p_run AND user_uuid=p_actor;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
