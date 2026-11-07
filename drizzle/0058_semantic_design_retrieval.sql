-- Immutable 384d compact-English design index. Provisioned by an administrative
-- connection; service_role can only read. No customer prompts are stored here.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
DO $extension$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname='vector') THEN
  CREATE EXTENSION vector WITH SCHEMA extensions;
 END IF;
END $extension$;

CREATE TABLE postspark.design_semantic_indexes (
 index_hash text PRIMARY KEY CHECK(index_hash ~ '^[a-f0-9]{64}$'),
 catalog_revision bigint NOT NULL REFERENCES postspark.catalog_revisions(revision),
 editorial_hash text CHECK(editorial_hash ~ '^[a-f0-9]{64}$'),
 profile_version text NOT NULL CHECK(profile_version='compact-design-en-v1'),
 model_fingerprint text NOT NULL CHECK(model_fingerprint ~ '^[a-f0-9]{64}$'),
 model_metadata jsonb NOT NULL CHECK((model_metadata->>'modelId'='Xenova/multilingual-e5-small' AND
  model_metadata->>'revision'='761b726dd34fb83930e26aab4e9ac3899aa1fa78' AND
  model_metadata->>'dimensions'='384' AND model_metadata->>'dtype'='q8' AND
  model_metadata->>'fingerprint'=model_fingerprint) IS TRUE),
 calibration_hash text NOT NULL CHECK(calibration_hash ~ '^[a-f0-9]{64}$'),
 calibration_version text NOT NULL,
 calibration_metadata jsonb NOT NULL CHECK(((calibration_metadata->>'count')::integer=80 AND
  (calibration_metadata->>'grandMean')::double precision BETWEEN -1 AND 1 AND
  calibration_metadata->>'hash'=calibration_hash AND calibration_metadata->>'version'=calibration_version) IS TRUE),
 document_count integer NOT NULL CHECK(document_count BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX design_semantic_compatible_index ON postspark.design_semantic_indexes
 (catalog_revision,model_fingerprint,profile_version,created_at DESC,index_hash);

DO $install$
DECLARE vs text;
BEGIN
 SELECT n.nspname INTO STRICT vs FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector';
 EXECUTE format($ddl$
 CREATE TABLE postspark.design_semantic_documents (
  index_hash text NOT NULL REFERENCES postspark.design_semantic_indexes(index_hash),
  source_id uuid NOT NULL,
  source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  source_text_hash text NOT NULL CHECK(source_text_hash ~ '^[a-f0-9]{64}$'),
  profile_hash text NOT NULL CHECK(profile_hash ~ '^[a-f0-9]{64}$'),
  row_hash text NOT NULL CHECK(row_hash ~ '^[a-f0-9]{64}$'),
  profile_text text NOT NULL CHECK(length(profile_text) BETWEEN 1 AND 1800),
  embedding %1$I.vector(384) NOT NULL CHECK((embedding OPERATOR(%1$I.<#>) embedding) BETWEEN -1.002 AND -0.998),
  mean_affinity double precision NOT NULL CHECK(mean_affinity BETWEEN -1 AND 1),
  generic_excess double precision NOT NULL CHECK(generic_excess BETWEEN 0 AND 2),
  PRIMARY KEY(index_hash,source_id)
 );
 -- Exact scoring is intentional for tens/hundreds of designs. A raw-cosine
 -- HNSW prelimit would silently drop candidates reordered by the prior discount.
 CREATE FUNCTION postspark.design_semantic_search_v1(
  p_catalog_revision bigint,p_editorial_hash text,p_model_fingerprint text,
  p_profile_version text,p_query %1$I.vector,p_sources jsonb,
  p_alpha double precision DEFAULT 0.25,p_index_hash text DEFAULT NULL
 ) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $function$
 DECLARE chosen postspark.design_semantic_indexes; answer jsonb;
 BEGIN
  IF p_query IS NULL OR %1$I.vector_dims(p_query)<>384 OR
     (p_query OPERATOR(%1$I.<#>) p_query) NOT BETWEEN -1.002 AND -0.998 OR
     p_sources IS NULL OR jsonb_typeof(p_sources)<>'array' OR jsonb_array_length(p_sources)>2000 OR
     p_alpha IS DISTINCT FROM 0.25::double precision
  THEN RAISE EXCEPTION 'semantic_design_query_invalid'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_sources) s WHERE
      jsonb_typeof(s)<>'object' OR s->>'familyId' IS NULL OR s->>'sourceId' IS NULL OR
      s->>'sourceHash' IS NULL OR s->>'sourceTextHash' IS NULL)
  THEN RAISE EXCEPTION 'semantic_design_query_invalid'; END IF;
  SELECT * INTO chosen FROM postspark.design_semantic_indexes i
   WHERE i.catalog_revision=p_catalog_revision AND i.editorial_hash IS NOT DISTINCT FROM p_editorial_hash
     AND i.model_fingerprint=p_model_fingerprint AND i.profile_version=p_profile_version
     AND (p_index_hash IS NULL OR i.index_hash=p_index_hash)
     AND i.document_count=(SELECT count(*) FROM postspark.design_semantic_documents d WHERE d.index_hash=i.index_hash)
   ORDER BY i.created_at DESC,i.index_hash LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  WITH requested AS (
   SELECT DISTINCT s->>'familyId' AS family_id,(s->>'sourceId')::uuid AS source_id,
      s->>'sourceHash' AS source_hash,s->>'sourceTextHash' AS source_text_hash
    FROM jsonb_array_elements(p_sources) s
  ), scored AS (
   SELECT r.family_id,d.source_id,d.profile_hash,d.row_hash,d.mean_affinity,d.generic_excess,
     greatest(-1.0,least(1.0,1-(d.embedding OPERATOR(%1$I.<=>) p_query))) AS similarity,
     p_alpha*d.generic_excess AS penalty
   FROM requested r JOIN postspark.design_semantic_documents d ON d.index_hash=chosen.index_hash
    AND d.source_id=r.source_id AND d.source_hash=r.source_hash AND d.source_text_hash=r.source_text_hash
  ), adjusted AS (SELECT *,similarity-penalty AS adjusted FROM scored),
  families AS (
   SELECT DISTINCT ON(family_id) * FROM adjusted ORDER BY family_id,adjusted DESC,source_id
  ), ranked AS (
   SELECT *,row_number() OVER(ORDER BY similarity DESC,family_id) AS raw_rank,
      row_number() OVER(ORDER BY adjusted DESC,family_id) AS adjusted_rank FROM families
  )
  SELECT jsonb_build_object(
    'indexHash',chosen.index_hash,'modelFingerprint',chosen.model_fingerprint,'profileVersion',chosen.profile_version,
    'calibrationHash',chosen.calibration_hash,'calibrationVersion',chosen.calibration_version,
    'matchedSourceIds',coalesce((SELECT jsonb_agg(DISTINCT source_id ORDER BY source_id) FROM scored),'[]'::jsonb),
    'ranking',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',family_id,'sourceId',source_id,'profileHash',profile_hash,'rowHash',row_hash,
      'similarity',similarity,'meanAffinity',mean_affinity,'genericExcess',generic_excess,
      'penalty',penalty,'adjusted',adjusted,'rawRank',raw_rank,'adjustedRank',adjusted_rank
    ) ORDER BY adjusted_rank) FROM ranked),'[]'::jsonb)
  ) INTO answer;
  RETURN answer;
 END $function$;
 REVOKE ALL ON FUNCTION postspark.design_semantic_search_v1(bigint,text,text,text,%1$I.vector,jsonb,double precision,text) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION postspark.design_semantic_search_v1(bigint,text,text,text,%1$I.vector,jsonb,double precision,text) TO service_role;
 $ddl$,vs);
END $install$;

CREATE FUNCTION postspark.design_semantic_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'semantic_design_index_immutable'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM postspark.design_semantic_indexes i
    JOIN postspark.catalog_revision_definitions d ON d.revision=i.catalog_revision
   WHERE i.index_hash=NEW.index_hash AND d.component_id=NEW.source_id AND d.definition_hash=NEW.source_hash
 ) THEN RAISE EXCEPTION 'semantic_design_source_stale'; END IF;
 IF abs(NEW.generic_excess-(SELECT greatest(0.0,NEW.mean_affinity-(i.calibration_metadata->>'grandMean')::double precision)
   FROM postspark.design_semantic_indexes i WHERE i.index_hash=NEW.index_hash)) > 0.000000000001
 THEN RAISE EXCEPTION 'semantic_design_prior_invalid'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER design_semantic_document_guard BEFORE INSERT OR UPDATE OR DELETE ON postspark.design_semantic_documents
 FOR EACH ROW EXECUTE FUNCTION postspark.design_semantic_guard();
CREATE FUNCTION postspark.design_semantic_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'semantic_design_index_immutable'; END $$;
CREATE TRIGGER design_semantic_index_guard BEFORE UPDATE OR DELETE ON postspark.design_semantic_indexes
 FOR EACH ROW EXECUTE FUNCTION postspark.design_semantic_immutable();
REVOKE ALL ON FUNCTION postspark.design_semantic_guard(),postspark.design_semantic_immutable() FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE postspark.design_semantic_indexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE postspark.design_semantic_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON postspark.design_semantic_indexes,postspark.design_semantic_documents FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON postspark.design_semantic_indexes,postspark.design_semantic_documents TO service_role;
CREATE POLICY semantic_index_service_read ON postspark.design_semantic_indexes FOR SELECT TO service_role USING(true);
CREATE POLICY semantic_document_service_read ON postspark.design_semantic_documents FOR SELECT TO service_role USING(true);
COMMENT ON TABLE postspark.design_semantic_documents IS 'Compact authored English profiles and immutable E5 q8 384d vectors. Administrative provisioning only; service runtime reads, no customer prompts.';
COMMIT;
