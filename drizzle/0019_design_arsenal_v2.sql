-- Additive Arsenal V2. Do not replay 0018 or rewrite V1 hashes.
-- Extension schema is discovered, never assumed public. Exact L1 uses explicit
-- 48-term summation, including installations predating the native L1 operator.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS extensions;
DO $extension$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname='vector') THEN
    CREATE EXTENSION vector WITH SCHEMA extensions;
  END IF;
END $extension$;

CREATE TABLE postspark.design_catalog_assets (
  id text PRIMARY KEY,
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  storage_key text NOT NULL UNIQUE CHECK(storage_key=sha256),
  manifest jsonb NOT NULL CHECK(manifest->>'kind'='catalog' AND manifest->>'id'=id AND manifest->>'sha256'=sha256),
  metadata jsonb NOT NULL,
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((manifest->>'bytes')::bigint BETWEEN 1 AND 8388608),
  CHECK(metadata->>'signatureVerified'='true' AND metadata->>'decoded'='true')
);
CREATE TABLE postspark.design_catalog_version_assets (
  version_id uuid NOT NULL REFERENCES postspark.design_catalog_versions(id),
  asset_id text NOT NULL REFERENCES postspark.design_catalog_assets(id),
  PRIMARY KEY(version_id,asset_id)
);
CREATE INDEX design_catalog_asset_versions ON postspark.design_catalog_version_assets(asset_id);
CREATE TABLE postspark.design_catalog_asset_grants (
  user_uuid uuid NOT NULL REFERENCES auth.users(id),
  asset_id text NOT NULL REFERENCES postspark.design_catalog_assets(id),
  granted_version_id uuid NOT NULL REFERENCES postspark.design_catalog_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_uuid,asset_id)
);
CREATE INDEX design_catalog_grants_asset ON postspark.design_catalog_asset_grants(asset_id);
CREATE INDEX design_catalog_grants_version ON postspark.design_catalog_asset_grants(granted_version_id);
-- Independent of optional run-history retention; permits same-version format resolution.
CREATE TABLE postspark.design_catalog_version_grants (
  user_uuid uuid NOT NULL REFERENCES auth.users(id),
  version_id uuid NOT NULL REFERENCES postspark.design_catalog_versions(id),
  definition_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_uuid,version_id)
);
CREATE INDEX design_catalog_version_grants_version ON postspark.design_catalog_version_grants(version_id);
CREATE TABLE postspark.design_catalog_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES postspark.design_catalog_versions(id),
  variant_key text NOT NULL,
  definition_hash text NOT NULL,
  variant_hash text NOT NULL,
  policy_version text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('technical','human')),
  decision text NOT NULL CHECK(decision IN ('verified','approved','rejected')),
  source text NOT NULL CHECK(source IN ('server','client_report','admin_review','historical')),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  recipe_hash text,
  png_hash text,
  briefing_hash text,
  metrics jsonb NOT NULL DEFAULT '{}',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(kind<>'human' OR (decision IN ('approved','rejected') AND source='admin_review' AND png_hash ~ '^[a-f0-9]{64}$' AND briefing_hash ~ '^[a-f0-9]{64}$' AND reviewed_at IS NOT NULL))
);
CREATE INDEX design_catalog_evidence_variant ON postspark.design_catalog_evidence(version_id,variant_key,definition_hash,variant_hash,policy_version,kind);
CREATE UNIQUE INDEX design_catalog_technical_once ON postspark.design_catalog_evidence(version_id,variant_key,definition_hash,variant_hash,policy_version,(metrics->>'metricHash')) WHERE kind='technical' AND source='server';
DO $install$
DECLARE vs text;
BEGIN
 SELECT n.nspname INTO STRICT vs FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector';
 EXECUTE pg_catalog.format($ddl$
 CREATE TABLE postspark.design_catalog_search_documents (
   version_id uuid NOT NULL REFERENCES postspark.design_catalog_versions(id),
   variant_key text NOT NULL,
   descriptor_version text NOT NULL,
   metric_version text NOT NULL,
   metric_hash text NOT NULL CHECK(metric_hash ~ '^[a-f0-9]{64}$'),
   definition_hash text NOT NULL,
   variant_hash text NOT NULL,
   projected %I.vector(48) NOT NULL,
   descriptor jsonb NOT NULL,
   card jsonb NOT NULL,
   derived_at timestamptz NOT NULL DEFAULT now(),
   PRIMARY KEY(version_id,variant_key,descriptor_version,metric_version),
   CHECK(jsonb_array_length(descriptor->'structure')=48)
 )$ddl$,vs);
 -- NULL anchor is an explicit metadata query, never a fabricated vector.
 EXECUTE pg_catalog.format($ddl$
 CREATE FUNCTION postspark.design_catalog_search_v2(
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
      AND (COALESCE(p_profile->>'font','')='' OR NOT EXISTS(
        SELECT 1 FROM pg_catalog.jsonb_array_elements_text(s.card->'fontFamilies') f WHERE lower(f.value)<>lower(p_profile->>'font')))
      AND (s.card->'brandPolicy'->>'fonts' IS DISTINCT FROM 'require-brand' OR COALESCE(p_profile->>'font','')<>'')
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
CREATE INDEX design_catalog_search_metric ON postspark.design_catalog_search_documents(descriptor_version,metric_version,metric_hash,version_id);

CREATE FUNCTION postspark.design_catalog_guard_v2() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE variant jsonb; aid text; doc postspark.design_catalog_search_documents; piece_hash text; decision text;
BEGIN
 IF NEW.definition->>'schemaVersion'<>'2' OR NEW.status<>'approved' THEN RETURN NEW; END IF;
 IF NEW.definition->>'compilerVersion'<>'arsenal-v2.0.0' OR jsonb_array_length(NEW.definition->'variants')<1 THEN RAISE EXCEPTION 'Unsupported or empty V2 definition'; END IF;
 FOR variant IN SELECT value FROM pg_catalog.jsonb_array_elements(NEW.definition->'variants') LOOP
  IF jsonb_array_length(variant->'instances')<1 OR NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(variant->'bindings') b WHERE b->>'source'='headline' AND b->>'required'='true') THEN RAISE EXCEPTION 'Empty or unbound V2 variant'; END IF;
  SELECT * INTO doc FROM postspark.design_catalog_search_documents
    WHERE version_id=NEW.id AND variant_key=variant->>'variantKey' AND definition_hash=NEW.content_hash
      AND descriptor_version='structural-v1' AND metric_version='structural-weighted-l1-v1';
  IF doc.metric_hash IS DISTINCT FROM '668bf91179186afbf14915abfe5d206240689a901b0c767cda9a8e3bd214054a' THEN RAISE EXCEPTION 'Inactive descriptor metric'; END IF;
  IF NOT FOUND OR NOT EXISTS(
      SELECT 1 FROM postspark.design_catalog_evidence e WHERE e.version_id=NEW.id AND e.variant_key=doc.variant_key
        AND e.definition_hash=NEW.content_hash AND e.variant_hash=doc.variant_hash AND e.kind='technical'
        AND e.policy_version='arsenal-eligibility-v1' AND e.decision='verified' AND e.source='server' AND e.metrics->>'metricHash'=doc.metric_hash
        AND e.metrics->>'graphVerified'='true' AND e.metrics->>'piecesVerified'='true' AND e.metrics->>'assetsVerified'='true'
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
CREATE TRIGGER design_catalog_guard_v2 BEFORE INSERT OR UPDATE OF status ON postspark.design_catalog_versions FOR EACH ROW EXECUTE FUNCTION postspark.design_catalog_guard_v2();

CREATE FUNCTION postspark.design_catalog_protect_integrity() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE vid uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Arsenal integrity records are append-only'; END IF;
 vid:=NEW.version_id;
 IF TG_TABLE_NAME<>'design_catalog_evidence' AND EXISTS(SELECT 1 FROM postspark.design_catalog_versions WHERE id=vid AND status<>'draft') THEN
   IF TG_TABLE_NAME<>'design_catalog_search_documents' THEN RAISE EXCEPTION 'Published links are immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION postspark.design_catalog_never_mutate() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Arsenal record is immutable'; END $$;
DO $security$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['design_catalog_assets','design_catalog_version_assets','design_catalog_asset_grants','design_catalog_version_grants','design_catalog_evidence','design_catalog_search_documents'] LOOP
  EXECUTE pg_catalog.format('ALTER TABLE postspark.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE pg_catalog.format('REVOKE ALL ON postspark.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE pg_catalog.format('GRANT SELECT,INSERT ON postspark.%I TO service_role',t);
  EXECUTE pg_catalog.format('CREATE TRIGGER arsenal_immutable BEFORE UPDATE OR DELETE ON postspark.%I FOR EACH ROW EXECUTE FUNCTION postspark.design_catalog_never_mutate()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['design_catalog_version_pieces','design_catalog_version_assets','design_catalog_evidence','design_catalog_search_documents'] LOOP
  EXECUTE pg_catalog.format('CREATE TRIGGER arsenal_integrity BEFORE INSERT OR UPDATE OR DELETE ON postspark.%I FOR EACH ROW EXECUTE FUNCTION postspark.design_catalog_protect_integrity()',t);
 END LOOP;
END $security$;

-- Grants and functional output commit atomically, before the existing Sparks commit.
CREATE FUNCTION postspark.design_catalog_deliver_v2(p_run uuid,p_actor uuid,p_output jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE variation jsonb; candidate jsonb; asset jsonb;
BEGIN
 PERFORM 1 FROM postspark.generation_runs WHERE id=p_run AND user_uuid=p_actor AND status='completed' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owned completed run required'; END IF;
 FOR variation IN SELECT value FROM pg_catalog.jsonb_array_elements(p_output) LOOP
  IF NOT variation ? 'catalogSelectionV2' THEN CONTINUE; END IF;
  FOR candidate IN SELECT value FROM pg_catalog.jsonb_array_elements(variation->'catalogSelectionV2'->'candidates') LOOP
   IF NOT EXISTS(SELECT 1 FROM postspark.design_catalog_versions v JOIN postspark.design_catalog_search_documents s ON s.version_id=v.id
      WHERE v.id=(candidate->>'versionId')::uuid AND v.status='approved' AND v.content_hash=candidate->>'definitionHash'
        AND s.variant_key=candidate->>'variantKey' AND s.variant_hash=candidate->>'variantHash') THEN RAISE EXCEPTION 'Unpublished candidate'; END IF;
   INSERT INTO postspark.design_catalog_version_grants(user_uuid,version_id,definition_hash)
     VALUES(p_actor,(candidate->>'versionId')::uuid,candidate->>'definitionHash') ON CONFLICT DO NOTHING;
   FOR asset IN SELECT value FROM pg_catalog.jsonb_array_elements(variation->'catalogSelectionV2'->'assets') LOOP
    IF asset->>'kind'<>'catalog' THEN CONTINUE; END IF;
    IF NOT EXISTS(SELECT 1 FROM postspark.design_catalog_version_assets l JOIN postspark.design_catalog_assets a ON a.id=l.asset_id
      WHERE l.version_id=(candidate->>'versionId')::uuid AND l.asset_id=asset->>'id' AND a.manifest=asset) THEN
      -- The bundle deduplicates assets across candidates. Only grant this candidate's links.
      CONTINUE;
    END IF;
    INSERT INTO postspark.design_catalog_asset_grants(user_uuid,asset_id,granted_version_id)
      VALUES(p_actor,asset->>'id',(candidate->>'versionId')::uuid) ON CONFLICT DO NOTHING;
   END LOOP;
  END LOOP;
  FOR asset IN SELECT value FROM pg_catalog.jsonb_array_elements(variation->'catalogSelectionV2'->'assets') LOOP
    IF asset->>'kind'='catalog' AND NOT EXISTS(SELECT 1 FROM postspark.design_catalog_asset_grants g JOIN postspark.design_catalog_assets a ON a.id=g.asset_id
      WHERE g.user_uuid=p_actor AND g.asset_id=asset->>'id' AND a.manifest=asset) THEN RAISE EXCEPTION 'Asset not granted'; END IF;
  END LOOP;
 END LOOP;
 UPDATE postspark.generation_runs SET output_snapshot=p_output WHERE id=p_run AND user_uuid=p_actor;
END $$;
REVOKE ALL ON FUNCTION postspark.design_catalog_guard_v2(),postspark.design_catalog_protect_integrity(),postspark.design_catalog_never_mutate(),postspark.design_catalog_deliver_v2(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.design_catalog_deliver_v2(uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
