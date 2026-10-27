-- Visual reviews performed by agents remain distinct from human decisions.
-- The existing service-only catalogue boundary and immutable evidence are retained.
BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE postspark.design_component_evidence
 DROP CONSTRAINT design_component_evidence_kind_check,
 DROP CONSTRAINT design_component_evidence_check,
 ADD CONSTRAINT design_component_evidence_kind_check CHECK(kind IN ('technical','human','agent_visual')),
 ADD CONSTRAINT design_component_evidence_check CHECK(
  (kind='technical' AND decision='verified') OR
  (kind IN ('human','agent_visual') AND decision IN ('approved','rejected') AND png_hash IS NOT NULL AND briefing_hash IS NOT NULL)
 );

-- Agent evidence must describe the current immutable document and identify its
-- reviewer honestly. actor_id remains the responsible authenticated account FK;
-- reviewer identifies the agent, rather than claiming a human reviewed the PNG.
CREATE FUNCTION postspark.design_component_agent_review_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.kind='agent_visual' THEN
  IF NOT EXISTS(SELECT 1 FROM postspark.design_components c WHERE c.id=NEW.component_id AND c.definition_hash=NEW.definition_hash) THEN
   RAISE EXCEPTION 'Agent review must match current component definition';
  END IF;
  IF jsonb_typeof(NEW.metrics) IS DISTINCT FROM 'object'
    OR NEW.metrics->>'source' IS DISTINCT FROM 'agent_visual_review'
    OR length(btrim(coalesce(NEW.metrics->>'reviewer',''))) NOT BETWEEN 1 AND 200 THEN
   RAISE EXCEPTION 'Agent reviewer attribution required';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER component_agent_review_guard BEFORE INSERT ON postspark.design_component_evidence
 FOR EACH ROW EXECUTE FUNCTION postspark.design_component_agent_review_guard();
REVOKE ALL ON FUNCTION postspark.design_component_agent_review_guard() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION postspark.design_component_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE aid text; decision text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Components are permanent'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Component definitions are immutable'; END IF;
 IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
  IF NOT EXISTS(SELECT 1 FROM postspark.design_component_evidence e WHERE e.component_id=NEW.id AND e.definition_hash=NEW.definition_hash AND e.kind='technical' AND e.decision='verified')
    OR NOT EXISTS(SELECT 1 FROM postspark.design_component_search_documents s WHERE s.component_id=NEW.id AND s.definition_hash=NEW.definition_hash) THEN RAISE EXCEPTION 'Verified component index required'; END IF;
  -- A human's latest decision is authoritative for this exact definition hash.
  -- Only when no human has reviewed it can the latest agent decision approve it.
  SELECT e.decision INTO decision FROM postspark.design_component_evidence e WHERE e.component_id=NEW.id AND e.definition_hash=NEW.definition_hash AND e.kind='human' ORDER BY e.created_at DESC,e.id DESC LIMIT 1;
  IF decision IS NULL THEN
   SELECT e.decision INTO decision FROM postspark.design_component_evidence e WHERE e.component_id=NEW.id AND e.definition_hash=NEW.definition_hash AND e.kind='agent_visual' ORDER BY e.created_at DESC,e.id DESC LIMIT 1;
  END IF;
  IF decision IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Visual component approval required'; END IF;
  FOR aid IN SELECT value->>'id' FROM pg_catalog.jsonb_array_elements(NEW.definition->'assets') LOOP
   IF NOT EXISTS(SELECT 1 FROM postspark.design_component_assets l JOIN postspark.design_catalog_assets a ON a.id=l.asset_id WHERE l.component_id=NEW.id AND a.id=aid AND EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(NEW.definition->'assets') m WHERE m=a.manifest)) THEN RAISE EXCEPTION 'Verified component asset required'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION postspark.design_component_guard() FROM PUBLIC,anon,authenticated;

COMMIT;
