-- SQL CHECK treats NULL as passing: explicitly require V2 publication evidence.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION postspark.design_catalog_guard_v2() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE variant jsonb; aid text; doc postspark.design_catalog_search_documents; piece_hash text; decision text;
BEGIN
 IF NEW.definition->>'schemaVersion' IS DISTINCT FROM '2' OR NEW.status<>'approved' THEN RETURN NEW; END IF;
 IF NEW.definition->>'compilerVersion' IS DISTINCT FROM 'arsenal-v2.0.0' OR jsonb_typeof(NEW.definition->'variants') IS DISTINCT FROM 'array' OR COALESCE(jsonb_array_length(NEW.definition->'variants'),0)<1 THEN RAISE EXCEPTION 'Unsupported or empty V2 definition'; END IF;
 FOR variant IN SELECT value FROM pg_catalog.jsonb_array_elements(NEW.definition->'variants') LOOP
  IF jsonb_typeof(variant->'instances') IS DISTINCT FROM 'array' OR COALESCE(jsonb_array_length(variant->'instances'),0)<1 OR jsonb_typeof(variant->'assetIds') IS DISTINCT FROM 'array' OR jsonb_typeof(variant->'bindings') IS DISTINCT FROM 'array' OR NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(variant->'bindings') b WHERE b->>'source'='headline' AND b->>'required'='true') THEN RAISE EXCEPTION 'Empty or unbound V2 variant'; END IF;
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

ALTER TABLE postspark.design_catalog_evidence ADD CONSTRAINT arsenal_human_evidence_present CHECK(kind<>'human' OR (png_hash IS NOT NULL AND briefing_hash IS NOT NULL AND reviewed_at IS NOT NULL));
ALTER TABLE postspark.design_catalog_search_documents ADD CONSTRAINT arsenal_descriptor_present CHECK(jsonb_typeof(descriptor->'structure') IS NOT DISTINCT FROM 'array' AND COALESCE(jsonb_array_length(descriptor->'structure'),0)=48);
ALTER TABLE postspark.design_catalog_assets ADD CONSTRAINT arsenal_asset_verification_present CHECK(COALESCE(metadata->>'signatureVerified','false')='true' AND COALESCE(metadata->>'decoded','false')='true' AND manifest->>'bytes' IS NOT NULL);
COMMIT;
