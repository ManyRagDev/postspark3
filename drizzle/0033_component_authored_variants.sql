-- Prefer authored assembly revisions within one eligible source; no publication or eligibility change.
-- Return source identity so the backend reserves quiet alternatives without duplicate variants.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $install$
DECLARE vs text;
BEGIN
 SELECT n.nspname INTO STRICT vs FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector';
 EXECUTE pg_catalog.format($ddl$
 CREATE OR REPLACE FUNCTION postspark.design_component_search_v4(p_kind text,p_aspect text,p_roles text[],p_density text,p_experimental boolean,p_anchor %1$I.vector(48),p_limit integer DEFAULT 5,p_fonts text[] DEFAULT NULL)
 RETURNS TABLE(component_id uuid,definition_hash text,card jsonb,distance double precision,source_key text)
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
 BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5 OR p_kind IS NULL OR p_aspect IS NULL OR p_roles IS NULL THEN RAISE EXCEPTION 'Invalid component query'; END IF;
  RETURN QUERY WITH eligible AS (
   SELECT s.*,c.source_key FROM postspark.design_component_search_documents s
   JOIN postspark.design_components c ON c.id=s.component_id AND c.definition_hash=s.definition_hash
   WHERE c.kind=p_kind AND p_aspect=ANY(c.aspect_ratios) AND c.roles && p_roles
    AND (p_density IS NULL OR p_density=ANY(c.densities))
    AND (p_fonts IS NULL OR cardinality(p_fonts)=0 OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements_text(coalesce(s.card->'fontFamilies','[]'::jsonb) || coalesce(s.card->'sourceFontFamilies','[]'::jsonb)) f(family)
      JOIN pg_catalog.unnest(p_fonts) wanted(family) ON pg_catalog.lower(pg_catalog.btrim(f.family))=pg_catalog.lower(pg_catalog.btrim(wanted.family))
    ))
    AND (c.status='approved' OR p_experimental AND c.status='draft')
  ),scored AS (
   SELECT e.*,CASE WHEN p_anchor IS NULL THEN NULL ELSE (
    SELECT sum(abs(a.value::double precision-b.value::double precision))
    FROM pg_catalog.jsonb_array_elements_text(e.projected::text::jsonb) WITH ORDINALITY a(value,i)
    JOIN pg_catalog.jsonb_array_elements_text(p_anchor::text::jsonb) WITH ORDINALITY b(value,i) USING(i)) END d FROM eligible e
  ),deduplicated AS (
   SELECT s.*,row_number() OVER(PARTITION BY s.source_key ORDER BY CASE WHEN coalesce(s.visual_traits,s.card->'visualTraits')->'treatments' ? 'assembly-authored' THEN 0 ELSE 1 END,s.d ASC NULLS LAST,s.component_id) rank FROM scored s
  ) SELECT d.component_id,d.definition_hash,d.card,d.d,d.source_key FROM deduplicated d WHERE d.rank=1
    ORDER BY d.d ASC NULLS LAST,d.component_id LIMIT p_limit;
 END $fn$;
 REVOKE ALL ON FUNCTION postspark.design_component_search_v4(text,text,text[],text,boolean,%1$I.vector,integer,text[]) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION postspark.design_component_search_v4(text,text,text[],text,boolean,%1$I.vector,integer,text[]) TO service_role;
 $ddl$,vs);
END $install$;
COMMIT;

-- Optional explicit personal taste ranks eligible components; it never grants or publishes them.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $install$
DECLARE vs text;
BEGIN
 SELECT n.nspname INTO STRICT vs FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector';
 EXECUTE pg_catalog.format($ddl$
 CREATE OR REPLACE FUNCTION postspark.design_component_search_v5(p_kind text,p_aspect text,p_roles text[],p_density text,p_experimental boolean,p_anchor %1$I.vector(48),p_limit integer DEFAULT 5,p_fonts text[] DEFAULT NULL,p_language text DEFAULT NULL,p_intensity text DEFAULT NULL)
 RETURNS TABLE(component_id uuid,definition_hash text,card jsonb,distance double precision,source_key text)
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
 BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5 OR p_kind IS NULL OR p_aspect IS NULL OR p_roles IS NULL THEN RAISE EXCEPTION 'Invalid component query'; END IF;
  IF p_language IS NOT NULL AND p_language NOT IN ('editorial','graphic','typographic','organic','restrained') THEN RAISE EXCEPTION 'Invalid preferred language'; END IF;
  IF p_intensity IS NOT NULL AND p_intensity NOT IN ('quiet','balanced','expressive') THEN RAISE EXCEPTION 'Invalid preferred intensity'; END IF;
  RETURN QUERY WITH eligible AS (
   SELECT s.*,c.source_key,c.densities FROM postspark.design_component_search_documents s
   JOIN postspark.design_components c ON c.id=s.component_id AND c.definition_hash=s.definition_hash
   WHERE c.kind=p_kind AND p_aspect=ANY(c.aspect_ratios) AND c.roles && p_roles
    AND (p_density IS NULL OR p_density=ANY(c.densities))
    AND (p_fonts IS NULL OR cardinality(p_fonts)=0 OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements_text(coalesce(s.card->'fontFamilies','[]'::jsonb) || coalesce(s.card->'sourceFontFamilies','[]'::jsonb)) f(family)
      JOIN pg_catalog.unnest(p_fonts) wanted(family) ON pg_catalog.lower(pg_catalog.btrim(f.family))=pg_catalog.lower(pg_catalog.btrim(wanted.family))
    ))
    AND (c.status='approved' OR p_experimental AND c.status='draft')
  ),scored AS (
   SELECT e.*,CASE WHEN p_anchor IS NULL THEN NULL ELSE (
    SELECT sum(abs(a.value::double precision-b.value::double precision))
    FROM pg_catalog.jsonb_array_elements_text(e.projected::text::jsonb) WITH ORDINALITY a(value,i)
    JOIN pg_catalog.jsonb_array_elements_text(p_anchor::text::jsonb) WITH ORDINALITY b(value,i) USING(i)) END d FROM eligible e
  ),deduplicated AS (
   SELECT s.*,CASE WHEN p_language IS NULL OR coalesce(s.visual_traits,s.card->'visualTraits')->'languages' ? p_language THEN 0 ELSE 1 END language_rank,
    CASE WHEN p_intensity IS NULL OR p_intensity=ANY(s.densities) THEN 0 ELSE 1 END intensity_rank,
    row_number() OVER(PARTITION BY s.source_key ORDER BY
     CASE WHEN p_language IS NULL OR coalesce(s.visual_traits,s.card->'visualTraits')->'languages' ? p_language THEN 0 ELSE 1 END,
     CASE WHEN p_intensity IS NULL OR p_intensity=ANY(s.densities) THEN 0 ELSE 1 END,CASE WHEN coalesce(s.visual_traits,s.card->'visualTraits')->'treatments' ? 'assembly-authored' THEN 0 ELSE 1 END,s.d ASC NULLS LAST,s.component_id) rank FROM scored s
  ) SELECT d.component_id,d.definition_hash,d.card,d.d,d.source_key FROM deduplicated d WHERE d.rank=1
    ORDER BY d.language_rank,d.intensity_rank,d.d ASC NULLS LAST,d.component_id LIMIT p_limit;
 END $fn$;
 REVOKE ALL ON FUNCTION postspark.design_component_search_v5(text,text,text[],text,boolean,%1$I.vector,integer,text[],text,text) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION postspark.design_component_search_v5(text,text,text[],text,boolean,%1$I.vector,integer,text[],text,text) TO service_role;
 $ddl$,vs);
END $install$;
COMMIT;
