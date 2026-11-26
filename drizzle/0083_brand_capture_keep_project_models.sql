CREATE OR REPLACE FUNCTION postspark.brand_capture_save(p_id uuid,p_owner uuid,p_project jsonb,p_save_key text DEFAULT 'initial') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c postspark.brand_captures%ROWTYPE; r postspark.brand_projects%ROWTYPE; project_id uuid; saved postspark.brand_capture_saves%ROWTYPE;
 reviewed_visual jsonb := p_project->'visualPreferences';
 saved_composition text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('brand-project:'||p_owner::text,0));
 SELECT * INTO c FROM postspark.brand_captures WHERE id=p_id AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND OR c.status<>'completed' OR c.result IS NULL THEN RAISE EXCEPTION 'Capture not available';END IF;
 IF length(p_save_key) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'Invalid save key';END IF;
 SELECT * INTO saved FROM postspark.brand_capture_saves WHERE capture_id=p_id AND save_key=p_save_key;
 IF FOUND THEN
  IF saved.reviewed_project IS DISTINCT FROM p_project THEN RAISE EXCEPTION 'Save key reused with different data' USING ERRCODE='23505';END IF;
  SELECT * INTO r FROM postspark.brand_projects WHERE id=saved.project_id AND user_uuid=p_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saved project was removed';END IF;
  RETURN to_jsonb(r);
 END IF;
 project_id:=nullif(p_project->>'id','')::uuid;
 IF project_id IS NOT NULL THEN
  SELECT * INTO r FROM postspark.brand_projects WHERE id=project_id AND user_uuid=p_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not owned' USING ERRCODE='42501';END IF;
  -- The extraction kit is stored as JSON text alongside editable brand preferences.
  saved_composition := r.visual_preferences->>'composition';
  IF saved_composition IS JSON OBJECT THEN
   IF saved_composition::jsonb->>'source' = 'design-extraction' THEN
    reviewed_visual := jsonb_set(coalesce(reviewed_visual, r.visual_preferences), '{composition}', to_jsonb(saved_composition));
   END IF;
  END IF;
 END IF;
 IF project_id IS NULL THEN project_id:=gen_random_uuid();END IF;
 IF coalesce((p_project->>'isDefault')::boolean,false) THEN UPDATE postspark.brand_projects SET is_default=false WHERE user_uuid=p_owner;END IF;
 INSERT INTO postspark.brand_projects(id,user_uuid,name,niche,source_type,structured_data,compiled_document,is_default,capture,visual_preferences)
 VALUES(project_id,p_owner,p_project->>'name',p_project->>'niche','website',p_project->'structuredData',p_project->>'compiledDocument',coalesce((p_project->>'isDefault')::boolean,false),p_project->'capture',reviewed_visual)
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,niche=EXCLUDED.niche,structured_data=EXCLUDED.structured_data,compiled_document=EXCLUDED.compiled_document,is_default=EXCLUDED.is_default,capture=EXCLUDED.capture,visual_preferences=EXCLUDED.visual_preferences,updated_at=now() WHERE postspark.brand_projects.user_uuid=p_owner RETURNING * INTO r;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Project not owned' USING ERRCODE='42501';END IF;
 INSERT INTO postspark.brand_capture_saves(capture_id,save_key,project_id,reviewed_project) VALUES(p_id,p_save_key,r.id,p_project);
 UPDATE postspark.brand_captures SET saved_project_id=r.id,saved_at=now(),updated_at=now() WHERE id=p_id;
 RETURN to_jsonb(r);
END $$;
