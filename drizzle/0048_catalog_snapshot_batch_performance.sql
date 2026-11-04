-- R9 failed in the administrative snapshot READ before catalog_stage was called.
-- Keep the atomic source-revision snapshot, build JSON once then convert at the
-- boundary, and give this service-only RPC the same scoped deadline as staging.
-- No role/global timeout or activation behavior changes.
BEGIN;
CREATE OR REPLACE FUNCTION postspark.catalog_staged_snapshot() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='60s' AS $$
 SELECT json_build_object('sourceRevision',s.source_revision::text,'rows',coalesce((
 SELECT json_agg(json_build_object('component_id',c.id,'definition_hash',c.definition_hash,'card',d.card,
 'design_components',json_build_object('status',c.status,'definition_hash',c.definition_hash,'source',c.definition->'source'),
 'definition',c.definition,'assets',coalesce((SELECT json_agg(a.manifest ORDER BY a.id) FROM postspark.design_component_assets l JOIN postspark.design_catalog_assets a ON a.id=l.asset_id WHERE l.component_id=c.id),'[]'::json)) ORDER BY c.id)
 FROM postspark.design_components c LEFT JOIN postspark.design_component_search_documents d ON d.component_id=c.id
 WHERE c.kind='content' AND c.definition->'completeDesign' IS NOT NULL AND c.definition->'completeDesign'<>'null'::jsonb
 ),'[]'::json))::jsonb FROM postspark.catalog_state s WHERE id=true;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
