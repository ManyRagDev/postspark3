-- Variable-content compiler; V2 hashes, approvals, RLS and exact L1 metric unchanged.
-- SQL CHECK treats NULL as passing: explicitly require V2 publication evidence.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION postspark.design_catalog_guard_v2() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE variant jsonb; aid text; doc postspark.design_catalog_search_documents; piece_hash text; decision text;
BEGIN
 IF NEW.definition->>'schemaVersion' IS DISTINCT FROM '2' OR NEW.status<>'approved' THEN RETURN NEW; END IF;
 IF COALESCE(NEW.definition->>'compilerVersion','') NOT IN ('arsenal-v2.0.0','arsenal-v3.0.0') OR jsonb_typeof(NEW.definition->'variants') IS DISTINCT FROM 'array' OR COALESCE(jsonb_array_length(NEW.definition->'variants'),0)<1 THEN RAISE EXCEPTION 'Unsupported or empty V2 definition'; END IF;
 FOR variant IN SELECT value FROM pg_catalog.jsonb_array_elements(NEW.definition->'variants') LOOP
  IF jsonb_typeof(variant->'instances') IS DISTINCT FROM 'array' OR COALESCE(jsonb_array_length(variant->'instances'),0)<1 OR jsonb_typeof(variant->'assetIds') IS DISTINCT FROM 'array' OR jsonb_typeof(variant->'bindings') IS DISTINCT FROM 'array' OR variant->>'compilerVersion' IS DISTINCT FROM NEW.definition->>'compilerVersion' OR (NEW.definition->>'compilerVersion'='arsenal-v2.0.0' AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(variant->'bindings') b WHERE b->>'source'='headline' AND b->>'required'='true')) OR (NEW.definition->>'compilerVersion'='arsenal-v3.0.0' AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(variant->'bindings') b WHERE b->>'kind' IN ('text','list'))) OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(variant->'bindings') b WHERE b->>'source' LIKE 'content:%') THEN RAISE EXCEPTION 'Empty or unbound V2 variant'; END IF;
  SELECT * INTO doc FROM postspark.design_catalog_search_documents
    WHERE version_id=NEW.id AND variant_key=variant->>'variantKey' AND definition_hash=NEW.content_hash
      AND descriptor_version='structural-v1' AND metric_version='structural-weighted-l1-v1';
  IF doc.metric_hash IS DISTINCT FROM '668bf91179186afbf14915abfe5d206240689a901b0c767cda9a8e3bd214054a' THEN RAISE EXCEPTION 'Inactive descriptor metric'; END IF;
  IF NOT FOUND OR NOT EXISTS(
      SELECT 1 FROM postspark.design_catalog_evidence e WHERE e.version_id=NEW.id AND e.variant_key=doc.variant_key
        AND e.definition_hash=NEW.content_hash AND e.variant_hash=doc.variant_hash AND e.kind='technical'
        AND e.policy_version='arsenal-eligibility-v1' AND e.decision='verified' AND e.source='server' AND e.metrics->>'metricHash'=doc.metric_hash
        AND e.metrics->>'graphVerified'='true' AND e.metrics->>'piecesVerified'='true' AND e.metrics->>'assetsVerified'='true'
        AND jsonb_typeof(e.metrics->'projected')='array' AND jsonb_array_length(e.metrics->'projected')=48
        AND e.metrics->'variant'=variant AND e.metrics->'card'=doc.card AND e.metrics->'descriptor'=doc.descriptor
        AND (SELECT sum(abs(a.value::double precision-b.value::double precision)) FROM
           pg_catalog.jsonb_array_elements_text(doc.projected::text::jsonb) WITH ORDINALITY a(value,i)
           JOIN pg_catalog.jsonb_array_elements_text(e.metrics->'projected') WITH ORDINALITY b(value,i) USING(i))<0.000001
  ) THEN RAISE EXCEPTION 'Missing verified V2 index'; END IF;
  SELECT e.decision INTO decision FROM postspark.design_catalog_evidence e WHERE e.version_id=NEW.id AND e.variant_key=doc.variant_key
    AND e.definition_hash=NEW.content_hash AND e.variant_hash=doc.variant_hash AND e.policy_version='arsenal-eligibility-v1'
    AND e.kind='human' AND e.source='admin_review' ORDER BY e.created_at DESC,e.id DESC LIMIT 1;
  IF decision IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Missing human variant approval'; END IF;
  FOR piece_hash IN SELECT DISTINCT value->>'pieceHash' FROM pg_catalog.jsonb_array_elements(variant->'instances') LOOP
   IF NOT EXISTS(SELECT 1 FROM postspark.design_catalog_version_pieces WHERE version_id=NEW.id AND piece_id=piece_hash) THEN RAISE EXCEPTION 'Missing piece link'; END IF;
  END LOOP;
  FOR aid IN SELECT value FROM pg_catalog.jsonb_array_elements_text(variant->'assetIds') LOOP
   IF NOT EXISTS(SELECT 1 FROM postspark.design_catalog_version_assets l JOIN postspark.design_catalog_assets a ON a.id=l.asset_id
      WHERE l.version_id=NEW.id AND l.asset_id=aid AND a.verified_at IS NOT NULL
        AND EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(NEW.definition->'assets') m WHERE m=a.manifest)) THEN RAISE EXCEPTION 'Unverified asset'; END IF;
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;


CREATE OR REPLACE FUNCTION postspark.design_catalog_semantic_source(p_source text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path='' AS $semantic$
SELECT CASE WHEN p_source LIKE 'block:%' THEN
 CASE pg_catalog.split_part(p_source,':',2)
 WHEN 'text' THEN 'body' WHEN 'list' THEN 'items'
 WHEN 'metric' THEN 'metric.'||pg_catalog.split_part(p_source,':',4)
 WHEN 'quote' THEN 'attribution.'||CASE WHEN pg_catalog.split_part(p_source,':',4)='text' THEN 'quote' ELSE 'author' END
 WHEN 'comparison' THEN 'comparison.'||pg_catalog.split_part(p_source,':',4)
 ELSE pg_catalog.split_part(p_source,':',2) END ELSE p_source END;
$semantic$;
REVOKE ALL ON FUNCTION postspark.design_catalog_semantic_source(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.design_catalog_semantic_source(text) TO service_role;
DO $install$ DECLARE vs text; BEGIN
 SELECT n.nspname INTO STRICT vs FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector';
 EXECUTE pg_catalog.format('GRANT USAGE ON SCHEMA %I TO service_role',vs);
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
        WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(s.card->'fields') b WHERE postspark.design_catalog_semantic_source(b->>'source')=f.value))
      AND (NOT COALESCE((p_profile->>'variable')::boolean,false) OR NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(s.card->'fields') b WHERE b->>'required'='true' AND NOT COALESCE(p_profile->'available','[]') ? postspark.design_catalog_semantic_source(b->>'source')))
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(s.card->'fields') b
        WHERE b->>'required'='true' AND postspark.design_catalog_semantic_source(b->>'source') IN ('metric.value','metric.label','attribution.quote','attribution.author','comparison.left.text','comparison.right.text')
          AND NOT COALESCE(p_profile->'available','[]') ? postspark.design_catalog_semantic_source(b->>'source'))
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(s.card->'fields') b
        WHERE b->>'kind'='list' AND p_profile ? 'items' AND
          ((p_profile->>'items')::integer < (b->'cardinality'->>'min')::integer OR (p_profile->>'items')::integer > (b->'cardinality'->>'max')::integer))
  ), scored AS (
    SELECT e.*,CASE WHEN p_anchor IS NULL THEN NULL ELSE
      e.projected OPERATOR(%1$I.<+>) p_anchor END d,
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
