-- Optional identity; existing context and extracted templates keep their own lifecycle.
BEGIN;
ALTER TABLE postspark.brand_projects ADD COLUMN IF NOT EXISTS visual_identity jsonb;

CREATE OR REPLACE FUNCTION postspark.brand_project_upsert(p_owner uuid,p_project jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE project_id uuid:=coalesce(nullif(p_project->>'id','')::uuid,gen_random_uuid()); r postspark.brand_projects%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('brand-project:'||p_owner::text,0));
 IF coalesce((p_project->>'isDefault')::boolean,false) THEN UPDATE postspark.brand_projects SET is_default=false,updated_at=now() WHERE user_uuid=p_owner;END IF;
 INSERT INTO postspark.brand_projects(id,user_uuid,name,niche,source_type,structured_data,compiled_document,is_default,capture,visual_preferences,visual_identity)
 VALUES(project_id,p_owner,p_project->>'name',coalesce(p_project->>'niche',''),coalesce(p_project->>'sourceType','form'),coalesce(p_project->'structuredData','{}'::jsonb),coalesce(p_project->>'compiledDocument',''),coalesce((p_project->>'isDefault')::boolean,false),p_project->'capture',p_project->'visualPreferences',p_project->'visualIdentity')
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,niche=EXCLUDED.niche,source_type=EXCLUDED.source_type,structured_data=EXCLUDED.structured_data,compiled_document=EXCLUDED.compiled_document,is_default=EXCLUDED.is_default,capture=coalesce(EXCLUDED.capture,postspark.brand_projects.capture),visual_preferences=coalesce(EXCLUDED.visual_preferences,postspark.brand_projects.visual_preferences),visual_identity=coalesce(EXCLUDED.visual_identity,postspark.brand_projects.visual_identity),updated_at=now() WHERE postspark.brand_projects.user_uuid=p_owner RETURNING * INTO r;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Project not owned' USING ERRCODE='42501';END IF;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION postspark.brand_project_upsert(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.brand_project_upsert(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION postspark.brand_project_save_identity(p_owner uuid,p_project jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE project_id uuid:=coalesce(nullif(p_project->>'id','')::uuid,gen_random_uuid()); r postspark.brand_projects%ROWTYPE;
BEGIN
 INSERT INTO postspark.brand_projects(id,user_uuid,name,niche,source_type,structured_data,compiled_document,is_default,visual_identity)
 VALUES(project_id,p_owner,p_project->>'name','','form','{}'::jsonb,'',false,p_project->'visualIdentity')
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,visual_identity=EXCLUDED.visual_identity,updated_at=now()
 WHERE postspark.brand_projects.user_uuid=p_owner RETURNING * INTO r;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Project not owned' USING ERRCODE='42501';END IF;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION postspark.brand_project_save_identity(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.brand_project_save_identity(uuid,jsonb) TO service_role;
COMMIT;
