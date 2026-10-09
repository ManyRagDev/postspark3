-- Preserve an explicitly authorized SET of brand fonts (heading/body), before L1 ranking.
-- Additive correction to 0019; same RPC signature, structural-v1 axes and metric hash.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $install$ DECLARE vs text; BEGIN
 SELECT n.nspname INTO STRICT vs FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector';
 EXECUTE pg_catalog.format($ddl$
 CREATE OR REPLACE FUNCTION postspark.design_catalog_search_v2(
   p_anchor %1$I.vector(48), p_aspect text, p_capabilities text[], p_has_media boolean,
   p_profile jsonb, p_descriptor text, p_metric text, p_metric_hash text,
   p_limit integer, p_terms text[] DEFAULT '{}'
 ) RETURNS TABLE(version_id uuid,blueprint_id uuid,version integer,variant_key text,
   definition_hash text,variant_hash text,distance double precision,card jsonb)
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
 BEGIN
  IF p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid search limit'; END IF;
  RETURN QUERY
  WITH eligible AS (
    SELECT s.*,v.blueprint_id,v.version FROM postspark.design_catalog_search_documents s
      JOIN postspark.design_catalog_versions v ON v.id=s.version_id
    WHERE v.status='approved' AND s.definition_hash=v.content_hash
      AND s.descriptor_version=p_descriptor AND s.metric_version=p_metric AND s.metric_hash=p_metric_hash
      AND (p_aspect IS NULL OR s.card->>'aspectRatio'=p_aspect)
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(s.card->'capabilities') c WHERE NOT(c.value=ANY(p_capabilities)))
      AND (p_has_media OR s.card->>'hasMedia'='false')
      AND (NOT COALESCE((p_profile->>'brand')::boolean,false) OR s.card->'brandPolicy' IS NOT NULL AND s.card->'brandPolicy'<>'null'::jsonb)
      AND (jsonb_array_length(COALESCE(p_profile->'fonts','[]'))=0 OR NOT EXISTS(
        SELECT 1 FROM pg_catalog.jsonb_array_elements_text(s.card->'fontFamilies') f
        WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_profile->'fonts') allowed WHERE lower(allowed.value)=lower(f.value))))
      AND (s.card->'brandPolicy'->>'fonts' IS DISTINCT FROM 'require-brand' OR jsonb_array_length(COALESCE(p_profile->'fonts','[]'))>0)
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_profile->'present','[]')) f
        WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(s.card->'fields') b WHERE b->>'source'=f.value))
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(s.card->'fields') b
        WHERE b->>'required'='true' AND b->>'source' IN ('metric.value','metric.label','attribution.quote','attribution.author','comparison.left.text','comparison.right.text')
          AND NOT COALESCE(p_profile->'available','[]') ? (b->>'source'))
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(s.card->'fields') b
        WHERE b->>'kind'='list' AND p_profile ? 'items' AND
          ((p_profile->>'items')::integer < (b->'cardinality'->>'min')::integer OR (p_profile->>'items')::integer > (b->'cardinality'->>'max')::integer))
  ), scored AS (
    SELECT e.*,CASE WHEN p_anchor IS NULL THEN NULL ELSE
      (SELECT sum(abs(a.value::double precision-b.value::double precision)) FROM
        pg_catalog.jsonb_array_elements_text(e.projected::text::jsonb) WITH ORDINALITY a(value,i)
        JOIN pg_catalog.jsonb_array_elements_text(p_anchor::text::jsonb) WITH ORDINALITY b(value,i) USING(i)) END d,
      (SELECT count(*) FROM pg_catalog.unnest(p_terms) term WHERE lower(e.card::text) LIKE '%%'||lower(term)||'%%') score
    FROM eligible e
  ) SELECT s.version_id,s.blueprint_id,s.version,s.variant_key,s.definition_hash,s.variant_hash,s.d,s.card
    FROM scored s ORDER BY s.d ASC NULLS LAST,
      CASE WHEN p_anchor IS NULL THEN s.score ELSE 0 END DESC,s.version_id::text||':'||s.variant_key
    LIMIT p_limit;
 END $fn$;
 REVOKE ALL ON FUNCTION postspark.design_catalog_search_v2(%1$I.vector,text,text[],boolean,jsonb,text,text,text,integer,text[]) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION postspark.design_catalog_search_v2(%1$I.vector,text,text[],boolean,jsonb,text,text,text,integer,text[]) TO service_role;
 $ddl$,vs);
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
