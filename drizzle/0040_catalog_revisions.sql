-- Immutable catalog releases. No initial release is published by this migration.
CREATE TABLE postspark.catalog_revisions (
 revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source_revision bigint NOT NULL UNIQUE,
 format_version integer NOT NULL DEFAULT 1 CHECK(format_version=1),
 snapshot jsonb NOT NULL,
 summary jsonb NOT NULL,
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE postspark.catalog_revision_definitions (
 revision bigint NOT NULL REFERENCES postspark.catalog_revisions(revision),
 component_id uuid NOT NULL,
 definition_hash text NOT NULL,
 payload jsonb NOT NULL,
 PRIMARY KEY(revision,component_id)
);
ALTER TABLE postspark.catalog_revision_definitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON postspark.catalog_revision_definitions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON postspark.catalog_revision_definitions TO service_role;
CREATE FUNCTION postspark.catalog_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'catalog_revision_immutable'; END $$;
CREATE TRIGGER catalog_release_immutable BEFORE UPDATE OR DELETE ON postspark.catalog_revisions FOR EACH ROW EXECUTE FUNCTION postspark.catalog_immutable();
CREATE TRIGGER catalog_definition_immutable BEFORE UPDATE OR DELETE ON postspark.catalog_revision_definitions FOR EACH ROW EXECUTE FUNCTION postspark.catalog_immutable();
REVOKE ALL ON FUNCTION postspark.catalog_immutable() FROM PUBLIC,anon,authenticated;
CREATE TABLE postspark.catalog_state (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 source_revision bigint NOT NULL DEFAULT 1,
 published_source_revision bigint,
 active_revision bigint REFERENCES postspark.catalog_revisions(revision)
);
INSERT INTO postspark.catalog_state(id) VALUES(true);
ALTER TABLE postspark.catalog_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE postspark.catalog_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON postspark.catalog_state,postspark.catalog_revisions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON postspark.catalog_state,postspark.catalog_revisions TO service_role;
CREATE FUNCTION postspark.catalog_mark_dirty() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='design_catalog_assets' THEN
  IF NOT EXISTS(SELECT 1 FROM postspark.design_component_assets WHERE asset_id=coalesce(NEW.id,OLD.id)) THEN RETURN NULL; END IF;
 END IF;
 UPDATE postspark.catalog_state SET source_revision=source_revision+1 WHERE id=true; RETURN NULL; END $$;
CREATE TRIGGER catalog_component_dirty AFTER INSERT OR UPDATE OR DELETE ON postspark.design_components FOR EACH STATEMENT EXECUTE FUNCTION postspark.catalog_mark_dirty();
CREATE TRIGGER catalog_index_dirty AFTER INSERT OR UPDATE OR DELETE ON postspark.design_component_search_documents FOR EACH STATEMENT EXECUTE FUNCTION postspark.catalog_mark_dirty();
CREATE TRIGGER catalog_links_dirty AFTER INSERT OR UPDATE OR DELETE ON postspark.design_component_assets FOR EACH STATEMENT EXECUTE FUNCTION postspark.catalog_mark_dirty();
CREATE TRIGGER catalog_assets_dirty AFTER INSERT OR UPDATE OR DELETE ON postspark.design_catalog_assets FOR EACH ROW EXECUTE FUNCTION postspark.catalog_mark_dirty();
CREATE FUNCTION postspark.catalog_staged_snapshot() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('sourceRevision',s.source_revision::text,'rows',coalesce((
 SELECT jsonb_agg(jsonb_build_object('component_id',c.id,'definition_hash',c.definition_hash,'card',d.card,
 'design_components',jsonb_build_object('status',c.status,'definition_hash',c.definition_hash,'source',c.definition->'source'),
 'definition',c.definition,'assets',coalesce((SELECT jsonb_agg(a.manifest ORDER BY a.id) FROM postspark.design_component_assets l JOIN postspark.design_catalog_assets a ON a.id=l.asset_id WHERE l.component_id=c.id),'[]'::jsonb)) ORDER BY c.id)
 FROM postspark.design_components c LEFT JOIN postspark.design_component_search_documents d ON d.component_id=c.id
 WHERE c.kind='content' AND c.definition->'completeDesign' IS NOT NULL AND c.definition->'completeDesign'<>'null'::jsonb
 ),'[]'::jsonb)) FROM postspark.catalog_state s WHERE id=true;
$$;
CREATE FUNCTION postspark.catalog_publish(p_source_revision bigint,p_rows jsonb,p_summary jsonb,p_hash text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_source bigint; current_published bigint; result bigint; cards jsonb;
BEGIN
 SELECT source_revision,published_source_revision,active_revision INTO current_source,current_published,result FROM postspark.catalog_state WHERE id=true FOR UPDATE;
 IF current_source<>p_source_revision THEN RAISE EXCEPTION 'catalog_publication_conflict'; END IF;
 IF current_published=current_source THEN RETURN result; END IF;
 IF p_rows IS DISTINCT FROM (postspark.catalog_staged_snapshot()->'rows') THEN RAISE EXCEPTION 'catalog_snapshot_mismatch'; END IF;
 SELECT coalesce(jsonb_agg(item-'definition'-'assets' ORDER BY item->>'component_id'),'[]'::jsonb) INTO cards FROM jsonb_array_elements(p_rows) item;
 INSERT INTO postspark.catalog_revisions(source_revision,snapshot,summary,content_hash) VALUES(current_source,jsonb_build_object('rows',cards),p_summary,p_hash) RETURNING revision INTO result;
 INSERT INTO postspark.catalog_revision_definitions(revision,component_id,definition_hash,payload)
 SELECT result,(item->>'component_id')::uuid,item->>'definition_hash',item FROM jsonb_array_elements(p_rows) item;
 UPDATE postspark.catalog_state SET active_revision=result,published_source_revision=current_source WHERE id=true;
 RETURN result;
END $$;
CREATE FUNCTION postspark.catalog_manifest() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('revision',r.revision::text,'formatVersion',r.format_version,'hash',r.content_hash,'summary',r.summary,'dirty',s.source_revision IS DISTINCT FROM s.published_source_revision)
 FROM postspark.catalog_state s LEFT JOIN postspark.catalog_revisions r ON r.revision=s.active_revision WHERE s.id=true;
$$;
REVOKE ALL ON FUNCTION postspark.catalog_mark_dirty(),postspark.catalog_staged_snapshot(),postspark.catalog_publish(bigint,jsonb,jsonb,text),postspark.catalog_manifest() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.catalog_staged_snapshot(),postspark.catalog_publish(bigint,jsonb,jsonb,text),postspark.catalog_manifest() TO service_role;
