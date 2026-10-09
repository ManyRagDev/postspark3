-- Derived, versioned art-direction metadata; immutable search cards/vectors and definitions stay pinned.
ALTER TABLE postspark.design_component_search_documents ADD COLUMN IF NOT EXISTS visual_traits jsonb;
CREATE OR REPLACE FUNCTION postspark.design_component_search_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Component search documents are immutable'; END IF;
 IF (to_jsonb(NEW)-'visual_traits') IS DISTINCT FROM (to_jsonb(OLD)-'visual_traits') THEN
  RAISE EXCEPTION 'Only derived visual traits may change';
 END IF;
 IF NEW.visual_traits IS NULL OR jsonb_typeof(NEW.visual_traits)<>'object'
  OR NEW.visual_traits->>'version' IS DISTINCT FROM '1'
  OR NEW.visual_traits->>'sourceKey' IS DISTINCT FROM (SELECT source_key FROM postspark.design_components WHERE id=NEW.component_id)
  OR jsonb_typeof(NEW.visual_traits->'languages') IS DISTINCT FROM 'array'
  OR jsonb_typeof(NEW.visual_traits->'treatments') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid visual traits'; END IF;
 IF jsonb_array_length(NEW.visual_traits->'languages') NOT BETWEEN 1 AND 5
  OR jsonb_array_length(NEW.visual_traits->'treatments')>10
  OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(NEW.visual_traits->'languages') l WHERE l NOT IN ('editorial','graphic','typographic','organic','restrained'))
  OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(NEW.visual_traits->'treatments') t WHERE jsonb_typeof(t)<>'string') THEN RAISE EXCEPTION 'Invalid visual traits vocabulary'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER component_immutable ON postspark.design_component_search_documents;
CREATE TRIGGER component_search_guard BEFORE UPDATE OR DELETE ON postspark.design_component_search_documents FOR EACH ROW EXECUTE FUNCTION postspark.design_component_search_guard();
GRANT UPDATE(visual_traits) ON postspark.design_component_search_documents TO service_role;
REVOKE ALL ON FUNCTION postspark.design_component_search_guard() FROM PUBLIC,anon,authenticated;
