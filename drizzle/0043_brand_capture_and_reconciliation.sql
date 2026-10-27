-- Incremental release: free durable brand capture and pending review reconciliation.
-- Some installations never enabled brand projects (0039). Bootstrap only that
-- missing prerequisite; existing projects and their data remain in place.
CREATE TABLE IF NOT EXISTS postspark.brand_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_uuid uuid NOT NULL,
 name varchar(120) NOT NULL, niche varchar(120) NOT NULL,
 source_type varchar(32) NOT NULL DEFAULT 'form',
 structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
 compiled_document text NOT NULL DEFAULT '', is_default boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brand_projects_user_uuid ON postspark.brand_projects(user_uuid);
CREATE INDEX IF NOT EXISTS idx_brand_projects_user_default ON postspark.brand_projects(user_uuid,is_default);
GRANT SELECT,INSERT,UPDATE,DELETE ON postspark.brand_projects TO authenticated,service_role;
ALTER TABLE postspark.brand_projects ADD COLUMN capture jsonb, ADD COLUMN visual_preferences jsonb;
ALTER TABLE postspark.brand_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY brand_projects_owner ON postspark.brand_projects FOR ALL TO authenticated USING (user_uuid=(SELECT auth.uid())) WITH CHECK (user_uuid=(SELECT auth.uid()));
CREATE TABLE postspark.brand_captures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, idempotency_key text NOT NULL,
 normalized_url text NOT NULL, status text NOT NULL CHECK(status IN ('queued','running','completed','failed')),
 execution_mode text NOT NULL CHECK(execution_mode IN ('external','local-demand')), executor_scope text,
 result jsonb, error_reason text, lease_token uuid, lease_until timestamptz,
 deadline_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 saved_project_id uuid REFERENCES postspark.brand_projects(id) ON DELETE SET NULL, saved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,idempotency_key), CHECK(length(normalized_url)<=2048),
 CHECK(execution_mode='external' AND executor_scope IS NULL OR execution_mode='local-demand' AND length(executor_scope) BETWEEN 1 AND 160)
);
CREATE UNIQUE INDEX brand_capture_one_active ON postspark.brand_captures(owner_id) WHERE status IN ('queued','running');
CREATE INDEX brand_capture_rate ON postspark.brand_captures(owner_id,created_at DESC);
CREATE INDEX brand_capture_reuse ON postspark.brand_captures(owner_id,normalized_url,saved_at DESC) WHERE status='completed' AND saved_at IS NOT NULL;
CREATE INDEX brand_capture_recovery ON postspark.brand_captures(execution_mode,executor_scope,created_at,id) WHERE status IN ('queued','running');
CREATE INDEX brand_capture_project ON postspark.brand_captures(saved_project_id);
CREATE TABLE postspark.brand_capture_operations (
 capture_id uuid NOT NULL REFERENCES postspark.brand_captures(id) ON DELETE CASCADE,
 operation_key text NOT NULL, state text NOT NULL CHECK(state IN ('started','completed','uncertain')), result jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(capture_id,operation_key),
 CHECK(state<>'completed' OR result IS NOT NULL)
);
ALTER TABLE postspark.brand_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE postspark.brand_capture_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY brand_capture_owner ON postspark.brand_captures FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
REVOKE ALL ON postspark.brand_captures,postspark.brand_capture_operations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON postspark.brand_captures TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON postspark.brand_captures,postspark.brand_capture_operations TO service_role;
CREATE FUNCTION postspark.brand_capture_start(p_owner uuid,p_url text,p_key text,p_mode text,p_scope text,p_refresh boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r postspark.brand_captures%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('capture:'||p_owner::text,0));
 IF length(p_key) NOT BETWEEN 1 AND 128 OR length(p_url)>2048 OR p_url !~ '^https?://' THEN RAISE EXCEPTION 'Invalid capture input' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM postspark.brand_captures WHERE owner_id=p_owner AND idempotency_key=p_key;
 IF FOUND THEN IF r.normalized_url<>p_url THEN RAISE EXCEPTION 'Idempotency input conflict' USING ERRCODE='23505'; END IF;RETURN to_jsonb(r);END IF;
 UPDATE postspark.brand_captures SET status='failed',error_reason='capture_deadline_expired',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE owner_id=p_owner AND status IN ('queued','running') AND deadline_at<=now();
 IF NOT p_refresh THEN
  SELECT * INTO r FROM postspark.brand_captures WHERE owner_id=p_owner AND normalized_url=p_url AND status='completed' AND saved_at>now()-interval '24 hours' ORDER BY saved_at DESC LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(r);END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM postspark.brand_captures WHERE owner_id=p_owner AND status IN ('queued','running')) THEN RAISE EXCEPTION 'Uma captura já está em andamento' USING ERRCODE='PT429';END IF;
 IF (SELECT count(*) FROM postspark.brand_captures WHERE owner_id=p_owner AND created_at>now()-interval '1 hour')>=5 THEN RAISE EXCEPTION 'Limite de cinco capturas por hora' USING ERRCODE='PT429';END IF;
 INSERT INTO postspark.brand_captures(owner_id,normalized_url,idempotency_key,status,execution_mode,executor_scope) VALUES(p_owner,p_url,p_key,'queued',p_mode,p_scope) RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION postspark.brand_capture_claim(p_id uuid,p_scope text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r postspark.brand_captures%ROWTYPE; blocked timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('generation_v5_global_leases',0));
 UPDATE postspark.brand_captures SET status='failed',error_reason='capture_deadline_expired',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE status IN ('queued','running') AND deadline_at<=now();
 IF (SELECT count(*) FROM postspark.generation_v5_requests WHERE status='running' AND lease_until>now())+(SELECT count(*) FROM postspark.brand_captures WHERE status='running' AND lease_until>now())>=3 THEN
 SELECT min(t) INTO blocked FROM (SELECT least(lease_until,deadline_at) t FROM postspark.generation_v5_requests WHERE status='running' AND lease_until>now() UNION ALL SELECT least(lease_until,deadline_at) FROM postspark.brand_captures WHERE status='running' AND lease_until>now()) x;
 RETURN jsonb_build_object('blockedUntil',blocked);
 END IF;
 SELECT * INTO r FROM postspark.brand_captures WHERE (p_id IS NULL OR id=p_id) AND executor_scope IS NOT DISTINCT FROM p_scope AND (status='queued' OR status='running' AND lease_until<=now()) AND deadline_at>now() ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE postspark.brand_capture_operations SET state='uncertain',updated_at=now() WHERE capture_id=r.id AND state='started';
 UPDATE postspark.brand_captures SET status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now() WHERE id=r.id RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION postspark.brand_capture_update(p_id uuid,p_lease uuid,p_action text,p_key text DEFAULT NULL,p_result jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r postspark.brand_captures%ROWTYPE; op postspark.brand_capture_operations%ROWTYPE;
BEGIN
 SELECT * INTO r FROM postspark.brand_captures WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'running' OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_until<=now() OR r.deadline_at<=now() THEN RAISE EXCEPTION 'Capture lease lost' USING ERRCODE='PT409';END IF;
 IF p_action='heartbeat' THEN UPDATE postspark.brand_captures SET lease_until=least(deadline_at,now()+interval '90 seconds'),updated_at=now() WHERE id=p_id RETURNING * INTO r;RETURN to_jsonb(r);END IF;
 IF p_action IN ('finish','fail') THEN
  IF p_action='finish' AND p_result IS NULL THEN RAISE EXCEPTION 'Missing capture result';END IF;
  UPDATE postspark.brand_captures SET status=CASE WHEN p_action='finish' THEN 'completed' ELSE 'failed' END,result=CASE WHEN p_action='finish' THEN p_result ELSE NULL END,error_reason=CASE WHEN p_action='fail' THEN p_result->>'reason' ELSE NULL END,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_id RETURNING * INTO r;RETURN to_jsonb(r);
 END IF;
 IF p_key IS NULL OR length(p_key)>160 THEN RAISE EXCEPTION 'Invalid operation key';END IF;
 SELECT * INTO op FROM postspark.brand_capture_operations WHERE capture_id=p_id AND operation_key=p_key FOR UPDATE;
 IF p_action='begin' THEN
  IF FOUND THEN RETURN to_jsonb(op);END IF;
  INSERT INTO postspark.brand_capture_operations(capture_id,operation_key,state) VALUES(p_id,p_key,'started');RETURN jsonb_build_object('state','new');
 ELSIF p_action='complete' THEN
  IF op.state='completed' THEN IF op.result IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'Immutable operation result';END IF;RETURN to_jsonb(op);END IF;
  IF op.state IS DISTINCT FROM 'started' OR p_result IS NULL THEN RAISE EXCEPTION 'Uncertain operation cannot be repeated';END IF;
  UPDATE postspark.brand_capture_operations SET state='completed',result=p_result,updated_at=now() WHERE capture_id=p_id AND operation_key=p_key RETURNING * INTO op;RETURN to_jsonb(op);
 ELSIF p_action='uncertain' THEN UPDATE postspark.brand_capture_operations SET state='uncertain',updated_at=now() WHERE capture_id=p_id AND operation_key=p_key AND state<>'completed';RETURN '{}'::jsonb;
 END IF;
 RAISE EXCEPTION 'Unknown capture action';
END $$;
CREATE TABLE postspark.brand_capture_saves(capture_id uuid NOT NULL REFERENCES postspark.brand_captures(id) ON DELETE CASCADE,save_key text NOT NULL,project_id uuid REFERENCES postspark.brand_projects(id) ON DELETE SET NULL,reviewed_project jsonb NOT NULL,PRIMARY KEY(capture_id,save_key));
CREATE INDEX brand_capture_saves_project ON postspark.brand_capture_saves(project_id);
ALTER TABLE postspark.brand_capture_saves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON postspark.brand_capture_saves FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON postspark.brand_capture_saves TO service_role;
CREATE FUNCTION postspark.brand_capture_save(p_id uuid,p_owner uuid,p_project jsonb,p_save_key text DEFAULT 'initial') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c postspark.brand_captures%ROWTYPE; r postspark.brand_projects%ROWTYPE; project_id uuid; saved postspark.brand_capture_saves%ROWTYPE;
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
 END IF;
 IF project_id IS NULL THEN project_id:=gen_random_uuid();END IF;
 IF coalesce((p_project->>'isDefault')::boolean,false) THEN UPDATE postspark.brand_projects SET is_default=false WHERE user_uuid=p_owner;END IF;
 INSERT INTO postspark.brand_projects(id,user_uuid,name,niche,source_type,structured_data,compiled_document,is_default,capture,visual_preferences)
 VALUES(project_id,p_owner,p_project->>'name',p_project->>'niche','website',p_project->'structuredData',p_project->>'compiledDocument',coalesce((p_project->>'isDefault')::boolean,false),p_project->'capture',p_project->'visualPreferences')
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,niche=EXCLUDED.niche,structured_data=EXCLUDED.structured_data,compiled_document=EXCLUDED.compiled_document,is_default=EXCLUDED.is_default,capture=EXCLUDED.capture,visual_preferences=EXCLUDED.visual_preferences,updated_at=now() WHERE postspark.brand_projects.user_uuid=p_owner RETURNING * INTO r;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Project not owned' USING ERRCODE='42501';END IF;
 INSERT INTO postspark.brand_capture_saves(capture_id,save_key,project_id,reviewed_project) VALUES(p_id,p_save_key,r.id,p_project);
 UPDATE postspark.brand_captures SET saved_project_id=r.id,saved_at=now(),updated_at=now() WHERE id=p_id;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION postspark.brand_capture_start(uuid,text,text,text,text,boolean),postspark.brand_capture_claim(uuid,text),postspark.brand_capture_update(uuid,uuid,text,text,jsonb),postspark.brand_capture_save(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.brand_capture_start(uuid,text,text,text,text,boolean),postspark.brand_capture_claim(uuid,text),postspark.brand_capture_update(uuid,uuid,text,text,jsonb),postspark.brand_capture_save(uuid,uuid,jsonb,text) TO service_role;

ALTER TABLE postspark.generation_v5_requests DROP CONSTRAINT generation_v5_requests_status_check;
ALTER TABLE postspark.generation_v5_requests ADD CONSTRAINT generation_v5_requests_status_check CHECK(status IN ('queued','running','awaiting_reconciliation','completed','partial','failed','cancelled'));
ALTER TABLE postspark.generation_v5_operations ADD COLUMN expectation jsonb;
CREATE INDEX generation_reconciliation_deadline ON postspark.generation_v5_requests(deadline_at,id) WHERE status='awaiting_reconciliation';

CREATE OR REPLACE FUNCTION postspark.generation_v5_claim(p_worker_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE picked postspark.generation_v5_requests%ROWTYPE;
DECLARE next_token uuid;
DECLARE active_count integer;
BEGIN
  IF p_worker_id IS NULL OR length(p_worker_id) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid worker id' USING ERRCODE = '22023';
  END IF;
  UPDATE postspark.generation_v5_requests
     SET status = CASE WHEN (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(proposals) p WHERE p->>'status'='ready') > 0 THEN 'partial' ELSE 'failed' END,
         error_reason = 'deadline_expired', lease_token = NULL,
         lease_until = NULL,
         proposals = (SELECT pg_catalog.jsonb_agg(
           CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending','awaiting_reconciliation')
             THEN p || pg_catalog.jsonb_build_object('status','expired','errorReason','deadline_expired') ELSE p END
           ORDER BY ord) FROM pg_catalog.jsonb_array_elements(proposals) WITH ORDINALITY e(p,ord)),
         updated_at = now()
   WHERE execution_mode='external' AND status IN ('queued','running','awaiting_reconciliation') AND deadline_at <= now();
  UPDATE postspark.generation_runs r SET status = q.status, error_message = 'deadline_expired', completed_at = now()
   FROM postspark.generation_v5_requests q
   WHERE q.execution_mode='external' AND q.id = r.id AND q.status IN ('partial','failed') AND q.error_reason = 'deadline_expired'
     AND (r.status IS DISTINCT FROM q.status OR r.error_message IS DISTINCT FROM 'deadline_expired');
  UPDATE postspark.generation_v5_operations SET state = 'uncertain', updated_at = now()
   WHERE state = 'started' AND request_id IN (SELECT id FROM postspark.generation_v5_requests
     WHERE execution_mode='external' AND status IN ('partial','failed') AND error_reason = 'deadline_expired');

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('generation_v5_global_leases', 0));
  SELECT pg_catalog.count(*) INTO active_count FROM postspark.generation_v5_requests
   WHERE status = 'running' AND lease_until > now();
  IF active_count + (SELECT count(*) FROM postspark.brand_captures WHERE status='running' AND lease_until>now()) >= 3 THEN RETURN NULL; END IF;
  SELECT * INTO picked FROM postspark.generation_v5_requests
   WHERE execution_mode='external' AND deadline_at > now() AND (status = 'queued' OR (status = 'running' AND lease_until <= now()))
   ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF picked.status = 'running' THEN
    UPDATE postspark.generation_v5_operations SET state = 'uncertain', updated_at = now()
     WHERE request_id = picked.id AND state = 'started';
  END IF;
  next_token := pg_catalog.gen_random_uuid();
  UPDATE postspark.generation_v5_requests
     SET status = 'running', lease_token = next_token, lease_until = now() + interval '90 seconds',
         updated_at = now()
   WHERE id = picked.id RETURNING * INTO picked;
  RETURN pg_catalog.to_jsonb(picked) || pg_catalog.jsonb_build_object('leaseToken', next_token);
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_reconcile_request(p_id uuid,p_scope text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE reconciled integer:=0;
BEGIN
 FOR req IN SELECT * FROM postspark.generation_v5_requests
  WHERE id=p_id AND execution_mode='local-demand' AND executor_scope=p_scope AND ((status IN ('queued','running','awaiting_reconciliation') AND deadline_at<=now()) OR (status NOT IN ('queued','running','awaiting_reconciliation') AND billing_mode='reserved' AND billing_settled_at IS NULL AND (billing_retry_at IS NULL OR billing_retry_at<=now()))
  ) ORDER BY updated_at,id LIMIT 1 FOR UPDATE SKIP LOCKED LOOP
  IF req.status IN ('queued','running','awaiting_reconciliation') THEN
   UPDATE postspark.generation_v5_requests SET status=CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(proposals) p WHERE p->>'status'='ready') THEN 'partial' ELSE 'failed' END,
    error_reason='deadline_expired',lease_token=NULL,lease_until=NULL,updated_at=now(),
    proposals=(SELECT jsonb_agg(CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending','awaiting_reconciliation') THEN p||jsonb_build_object('status','expired','errorReason','deadline_expired') ELSE p END ORDER BY ord) FROM jsonb_array_elements(proposals) WITH ORDINALITY e(p,ord))
    WHERE id=req.id;
   UPDATE postspark.generation_runs r SET status=q.status,error_message='deadline_expired',completed_at=now() FROM postspark.generation_v5_requests q WHERE r.id=req.id AND q.id=r.id;
   UPDATE postspark.generation_v5_operations SET state='uncertain',updated_at=now() WHERE request_id=req.id AND state='started';
  END IF;
  BEGIN
   PERFORM postspark.generation_settle(req.id);
   reconciled:=reconciled+1;
  EXCEPTION WHEN OTHERS THEN
   UPDATE postspark.generation_v5_requests SET billing_error=SQLERRM,billing_retry_at=now()+interval '30 seconds' WHERE id=req.id;
  END;
 END LOOP;
 RETURN reconciled;
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_reconcile() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE reconciled integer:=0;
BEGIN
 FOR req IN SELECT * FROM postspark.generation_v5_requests
  WHERE execution_mode='external' AND ((status IN ('queued','running','awaiting_reconciliation') AND deadline_at<=now()) OR (status NOT IN ('queued','running','awaiting_reconciliation') AND billing_mode='reserved' AND billing_settled_at IS NULL AND (billing_retry_at IS NULL OR billing_retry_at<=now()))
  ) ORDER BY updated_at,id LIMIT 1 FOR UPDATE SKIP LOCKED LOOP
  IF req.status IN ('queued','running','awaiting_reconciliation') THEN
   UPDATE postspark.generation_v5_requests SET status=CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(proposals) p WHERE p->>'status'='ready') THEN 'partial' ELSE 'failed' END,
    error_reason='deadline_expired',lease_token=NULL,lease_until=NULL,updated_at=now(),
    proposals=(SELECT jsonb_agg(CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending','awaiting_reconciliation') THEN p||jsonb_build_object('status','expired','errorReason','deadline_expired') ELSE p END ORDER BY ord) FROM jsonb_array_elements(proposals) WITH ORDINALITY e(p,ord))
    WHERE id=req.id;
   UPDATE postspark.generation_runs r SET status=q.status,error_message='deadline_expired',completed_at=now() FROM postspark.generation_v5_requests q WHERE r.id=req.id AND q.id=r.id;
   UPDATE postspark.generation_v5_operations SET state='uncertain',updated_at=now() WHERE request_id=req.id AND state='started';
  END IF;
  BEGIN
   PERFORM postspark.generation_settle(req.id);
   reconciled:=reconciled+1;
  EXCEPTION WHEN OTHERS THEN
   UPDATE postspark.generation_v5_requests SET billing_error=SQLERRM,billing_retry_at=now()+interval '30 seconds' WHERE id=req.id;
  END;
 END LOOP;
 RETURN reconciled;
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_claim_request(p_id uuid,p_scope text,p_worker_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE picked postspark.generation_v5_requests%ROWTYPE; next_token uuid; blocked_until timestamptz;
BEGIN
 IF p_worker_id IS NULL OR length(p_worker_id) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid worker id'; END IF;
 PERFORM postspark.generation_reconcile_request(p_id,p_scope);
 PERFORM pg_advisory_xact_lock(hashtextextended('generation_v5_global_leases',0));
 IF NOT EXISTS(SELECT 1 FROM postspark.generation_v5_requests WHERE id=p_id AND execution_mode='local-demand' AND executor_scope=p_scope) THEN RETURN NULL; END IF;
 SELECT min(least(lease_until,deadline_at)) INTO blocked_until FROM postspark.generation_v5_requests WHERE status='running' AND lease_until>now() AND executor_scope=p_scope AND execution_mode='local-demand';
 IF blocked_until IS NOT NULL THEN RETURN jsonb_build_object('blockedUntil',blocked_until); END IF;
 IF (SELECT count(*) FROM postspark.generation_v5_requests WHERE status='running' AND lease_until>now())+(SELECT count(*) FROM postspark.brand_captures WHERE status='running' AND lease_until>now())>=3 THEN
  SELECT min(least(lease_until,deadline_at)) INTO blocked_until FROM postspark.generation_v5_requests WHERE status='running' AND lease_until>now();
  RETURN jsonb_build_object('blockedUntil',coalesce(blocked_until,now()+interval '30 seconds'));
 END IF;
 SELECT * INTO picked FROM postspark.generation_v5_requests WHERE id=p_id AND execution_mode='local-demand' AND executor_scope=p_scope AND deadline_at>now() AND (status='queued' OR (status='running' AND lease_until<=now())) FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE postspark.generation_v5_operations SET state='uncertain',updated_at=now() WHERE request_id=p_id AND state='started';
 next_token:=gen_random_uuid();
 UPDATE postspark.generation_v5_requests SET status='running',lease_token=next_token,lease_until=now()+interval '90 seconds',dispatch_error=NULL,updated_at=now() WHERE id=p_id RETURNING * INTO picked;
 RETURN to_jsonb(picked)||jsonb_build_object('leaseToken',next_token);
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_v5_lease_update(
  p_id uuid,p_lease_token uuid,p_action text,p_payload jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE req_row postspark.generation_v5_requests%ROWTYPE;
DECLARE slot_no integer;
DECLARE proposal jsonb;
DECLARE projection_payload jsonb;
DECLARE old_proposal jsonb;
DECLARE slide_row jsonb;
DECLARE composition jsonb;
DECLARE provenance jsonb;
DECLARE v_component_id uuid;
DECLARE v_component_hash text;
DECLARE asset jsonb;
BEGIN
  SELECT * INTO req_row FROM postspark.generation_v5_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR req_row.status <> 'running' OR req_row.lease_token IS DISTINCT FROM p_lease_token
     OR req_row.lease_until <= now() OR req_row.deadline_at <= now() THEN
    RAISE EXCEPTION 'Generation lease lost' USING ERRCODE = 'PT409';
  END IF;
  IF p_action = 'heartbeat' THEN
    UPDATE postspark.generation_v5_requests SET lease_until = now() + interval '90 seconds', updated_at = now()
     WHERE id = p_id RETURNING * INTO req_row;
  ELSIF p_action = 'prepared' THEN
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'Invalid prepared state' USING ERRCODE = '22023'; END IF;
    UPDATE postspark.generation_v5_requests SET prepared = p_payload, updated_at = now()
     WHERE id = p_id RETURNING * INTO req_row;
  ELSIF p_action = 'checkpoint' OR p_action = 'commit' THEN
    proposal := p_payload->'delivery';
    projection_payload := p_payload->'projection';
    IF proposal IS NULL OR jsonb_typeof(proposal) <> 'object' OR (proposal->>'runId')::uuid <> p_id
       OR (proposal->>'slot')::integer NOT BETWEEN 0 AND 2 THEN
      RAISE EXCEPTION 'Invalid proposal checkpoint' USING ERRCODE = '22023';
    END IF;
    IF proposal->>'contractVersion' <> '1' OR proposal->>'status' NOT IN
       ('planned','running','waiting_input','checking','recovering','delivery_pending','awaiting_reconciliation','ready','failed','cancelled','expired') THEN
      RAISE EXCEPTION 'Invalid proposal lifecycle state' USING ERRCODE = '22023';
    END IF;
    slot_no := (proposal->>'slot')::integer;
    old_proposal := req_row.proposals->slot_no;
    IF proposal->>'proposalId' IS DISTINCT FROM old_proposal->>'proposalId'
       OR (proposal->>'revision')::integer IS DISTINCT FROM (old_proposal->>'revision')::integer THEN
      RAISE EXCEPTION 'Proposal identity or revision changed' USING ERRCODE = '22023';
    END IF;
    IF old_proposal->>'status' IN ('ready','failed','cancelled','expired') THEN
      IF old_proposal = proposal THEN RETURN pg_catalog.to_jsonb(req_row); END IF;
      RAISE EXCEPTION 'Terminal proposal is immutable' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'checkpoint' AND proposal->>'status' = 'ready' THEN
      RAISE EXCEPTION 'Ready delivery must use commit' USING ERRCODE = '22023';
    END IF;
    IF req_row.prepared->>'reviewPolicyVersion'='9' AND p_action='commit' AND
       (proposal->'reviews'->-1->>'policyVersion' IS DISTINCT FROM '9' OR proposal->'reviews'->-1->>'status' IS DISTINCT FROM 'passed') THEN RAISE EXCEPTION 'Valid review required' USING ERRCODE='23514'; END IF;
    IF p_action = 'commit' THEN
      IF proposal->>'status' <> 'ready' OR jsonb_typeof(proposal->'bundle') <> 'object'
         OR proposal->'bundle'->>'runId' <> p_id::text OR proposal->'bundle'->>'traceId' <> p_id::text
         OR (proposal->'bundle'->>'slot')::integer <> slot_no
         OR jsonb_typeof(proposal->'bundle'->'slides') <> 'array'
         OR jsonb_array_length(proposal->'bundle'->'slides') NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'Invalid complete design identity' USING ERRCODE = '22023';
      END IF;
      -- Validate component identity and current publication eligibility from the
      -- canonical complete-design bundle before granting any catalog assets.
      FOR slide_row IN SELECT value FROM pg_catalog.jsonb_array_elements(proposal->'bundle'->'slides') LOOP
        composition := slide_row->'composition';
        provenance := composition->'origin'->'componentAssembly';
        IF provenance IS NULL OR provenance->'completeDesign'->>'baselineVerified' IS DISTINCT FROM 'true'
           OR proposal->'bundle'->>'family' IS DISTINCT FROM provenance->'completeDesign'->>'family'
           OR jsonb_typeof(provenance->'componentIds') IS DISTINCT FROM 'array'
           OR jsonb_typeof(provenance->'componentHashes') IS DISTINCT FROM 'array'
           OR jsonb_array_length(provenance->'componentIds') <> 1
           OR jsonb_array_length(provenance->'componentHashes') <> 1
           OR provenance ? 'resolution' THEN
          RAISE EXCEPTION 'Complete design component provenance invalid' USING ERRCODE = '22023';
        END IF;
        v_component_id := (provenance->'componentIds'->>0)::uuid;
        v_component_hash := provenance->'componentHashes'->>0;
        IF req_row.catalog_revision IS NOT NULL THEN
          IF NOT EXISTS(SELECT 1 FROM postspark.catalog_revision_definitions d WHERE d.revision=req_row.catalog_revision AND d.component_id=v_component_id AND d.definition_hash=v_component_hash
            AND d.payload->'definition'->'completeDesign'->>'baselineVerified'='true'
            AND (d.payload->'design_components'->>'status'='approved' OR req_row.experimental AND d.payload->'design_components'->>'status'='draft')) THEN
            RAISE EXCEPTION 'Pinned component is not eligible' USING ERRCODE='22023';
          END IF;
        ELSIF NOT EXISTS (SELECT 1 FROM postspark.design_components c WHERE c.id = v_component_id
          AND c.definition_hash = v_component_hash AND c.kind = 'content'
          AND c.definition->'completeDesign'->>'baselineVerified' = 'true'
          AND (c.status = 'approved' OR req_row.experimental AND c.status = 'draft')) THEN
          RAISE EXCEPTION 'Component is no longer eligible' USING ERRCODE = '22023';
        END IF;
        FOR asset IN SELECT value FROM pg_catalog.jsonb_array_elements(coalesce(composition->'assets','[]'::jsonb)) LOOP
          IF asset->>'kind' = 'catalog' THEN
            IF req_row.catalog_revision IS NOT NULL THEN
              IF NOT EXISTS(SELECT 1 FROM postspark.catalog_revision_definitions d WHERE d.revision=req_row.catalog_revision AND d.component_id=v_component_id AND d.definition_hash=v_component_hash AND d.payload->'assets' @> jsonb_build_array(asset)) THEN
                RAISE EXCEPTION 'Asset is not in pinned component' USING ERRCODE='22023';
              END IF;
            ELSIF NOT EXISTS (SELECT 1 FROM postspark.design_component_assets ca
              JOIN postspark.design_catalog_assets a ON a.id = ca.asset_id
              WHERE ca.component_id = v_component_id AND ca.asset_id = asset->>'id' AND a.manifest = asset) THEN
              RAISE EXCEPTION 'Catalog asset is not part of the eligible component' USING ERRCODE = '22023';
            END IF;
            INSERT INTO postspark.design_component_asset_grants(user_uuid,asset_id,component_id)
              VALUES(req_row.owner_id,asset->>'id',v_component_id) ON CONFLICT DO NOTHING;
          ELSIF asset->>'kind' = 'bundled' THEN
            IF NOT EXISTS (SELECT 1 FROM postspark.generation_v5_bundled_assets b
              WHERE b.id = asset->>'id' AND b.sha256 = asset->>'sha256'
                AND b.mime_type = asset->>'mimeType' AND b.bytes = (asset->>'bytes')::integer
                AND b.family = asset->>'family' AND b.weight = (asset->>'weight')::integer
                AND b.license = asset->>'license') THEN
              RAISE EXCEPTION 'Bundled asset is not in the application manifest' USING ERRCODE = '22023';
            END IF;
          ELSE
            RAISE EXCEPTION 'Unsupported asset kind in complete design' USING ERRCODE = '22023';
          END IF;
        END LOOP;
      END LOOP;
      -- Every catalog asset in the composition must now have an owner grant.
      FOR slide_row IN SELECT value FROM pg_catalog.jsonb_array_elements(proposal->'bundle'->'slides') LOOP
        FOR asset IN SELECT value FROM pg_catalog.jsonb_array_elements(coalesce(slide_row->'composition'->'assets','[]'::jsonb)) LOOP
          IF asset->>'kind' = 'catalog' AND NOT EXISTS (
            SELECT 1 FROM postspark.design_component_asset_grants g
            JOIN postspark.design_catalog_assets a ON a.id = g.asset_id
            WHERE g.user_uuid = req_row.owner_id AND g.asset_id = asset->>'id' AND a.manifest = asset
          ) THEN RAISE EXCEPTION 'Catalog asset grant missing' USING ERRCODE = '22023'; END IF;
        END LOOP;
      END LOOP;
    END IF;
    UPDATE postspark.generation_v5_requests
       SET proposals = pg_catalog.jsonb_set(proposals, ARRAY[slot_no::text], proposal, true),
           projections = CASE WHEN projection_payload IS NULL THEN projections ELSE pg_catalog.jsonb_set(projections, ARRAY[slot_no::text], projection_payload, true) END,
           updated_at = now()
     WHERE id = p_id RETURNING * INTO req_row;
    UPDATE postspark.generation_runs SET output_snapshot = pg_catalog.jsonb_build_array(
      req_row.projections->'0', req_row.projections->'1', req_row.projections->'2'
    ) WHERE id = p_id AND user_uuid = req_row.owner_id;
  ELSE
    RAISE EXCEPTION 'Unknown lease update action' USING ERRCODE = '22023';
  END IF;
  RETURN pg_catalog.to_jsonb(req_row);
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_v5_finish(
  p_id uuid,p_lease_token uuid,p_status text,p_error_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE ready_count integer;
DECLARE final_status text;
DECLARE final_error text;
BEGIN
  SELECT * INTO req FROM postspark.generation_v5_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR req.status <> 'running' OR req.lease_token IS DISTINCT FROM p_lease_token OR req.lease_until <= now() THEN
    RAISE EXCEPTION 'Generation lease lost' USING ERRCODE = 'PT409';
  END IF;
  IF p_status='awaiting_reconciliation' AND req.deadline_at>now() THEN
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(req.proposals) p WHERE p->>'status'='awaiting_reconciliation') THEN RAISE EXCEPTION 'No pending proposal';END IF;
    UPDATE postspark.generation_v5_requests SET status='awaiting_reconciliation',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_id RETURNING * INTO req;
    RETURN to_jsonb(req);
  END IF;
  IF p_status NOT IN ('completed','partial','failed') THEN RAISE EXCEPTION 'Invalid terminal status' USING ERRCODE = '22023'; END IF;
  SELECT pg_catalog.count(*) INTO ready_count FROM pg_catalog.jsonb_array_elements(req.proposals) p WHERE p->>'status'='ready';
  final_status := CASE WHEN ready_count = 3 THEN 'completed' WHEN ready_count > 0 THEN 'partial' ELSE 'failed' END;
  final_error := CASE WHEN final_status = 'completed' THEN NULL
    WHEN req.deadline_at <= now() THEN 'deadline_expired'
    WHEN final_status = 'failed' THEN coalesce(p_error_reason,'generation_failed')
    ELSE p_error_reason END;
  UPDATE postspark.generation_v5_requests SET status = final_status,
    error_reason = final_error,
    proposals = (SELECT coalesce(pg_catalog.jsonb_agg(
      CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending','awaiting_reconciliation')
        THEN p || pg_catalog.jsonb_build_object('status',CASE WHEN req.deadline_at <= now() THEN 'expired' ELSE 'failed' END,'errorReason',coalesce(final_error,'generation_finished')) ELSE p END
      ORDER BY ord), '[]'::jsonb)
      FROM pg_catalog.jsonb_array_elements(req.proposals) WITH ORDINALITY e(p,ord)),
    lease_token = NULL, lease_until = NULL, updated_at = now() WHERE id = p_id RETURNING * INTO req;
  UPDATE postspark.generation_v5_operations SET state = 'uncertain', updated_at = now()
    WHERE request_id = p_id AND state = 'started';
  UPDATE postspark.generation_runs SET status = final_status, error_message = final_error, completed_at = now()
   WHERE id = p_id AND user_uuid = req.owner_id;
  RETURN pg_catalog.to_jsonb(req);
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_v5_cancel(p_id uuid,p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE new_proposals jsonb;
BEGIN
  SELECT * INTO req FROM postspark.generation_v5_requests WHERE id = p_id AND owner_id = p_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF req.status IN ('queued','running','awaiting_reconciliation') THEN
    SELECT coalesce(pg_catalog.jsonb_agg(CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending','awaiting_reconciliation')
      THEN p || pg_catalog.jsonb_build_object('status','cancelled') ELSE p END ORDER BY ord), '[]'::jsonb)
      INTO new_proposals FROM pg_catalog.jsonb_array_elements(req.proposals) WITH ORDINALITY e(p,ord);
    UPDATE postspark.generation_v5_operations SET state = 'uncertain', updated_at = now()
      WHERE request_id = p_id AND state = 'started';
    UPDATE postspark.generation_v5_requests SET status = 'cancelled', proposals = new_proposals,
      lease_token = NULL, lease_until = NULL, updated_at = now() WHERE id = p_id RETURNING * INTO req;
    UPDATE postspark.generation_runs SET status = 'cancelled', error_message = 'cancelled', completed_at = now()
      WHERE id = p_id AND user_uuid = p_owner;
  END IF;
  RETURN pg_catalog.to_jsonb(req);
END $$;

-- Expectation is fixed before dispatch; only the runtime may reconcile returned content.
CREATE FUNCTION postspark.generation_review_expectation(p_id uuid,p_lease uuid,p_key text,p_expectation jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM postspark.generation_v5_requests WHERE id=p_id AND status='running' AND lease_token=p_lease AND lease_until>now() AND deadline_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Generation lease lost' USING ERRCODE='PT409';END IF;
 IF p_expectation->>'requestId' IS DISTINCT FROM p_id::text OR NOT EXISTS(
   SELECT 1 FROM postspark.generation_v5_requests r WHERE r.id=p_id AND r.prepared->>'reviewPolicyVersion'='9'
   AND r.prepared->'reviewExecutionConfig'->>'configurationHash'=p_expectation->>'configurationHash'
   AND r.prepared->>'editorialContextHash'=p_expectation->>'sourceContextHash'
   AND r.prepared->'reviewExecutionConfig'->>'resolvedModel'=p_expectation->'transport'->>'model'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.proposals) p WHERE p->>'proposalId'=p_expectation->>'proposalId')
 ) THEN RAISE EXCEPTION 'Invalid review expectation';END IF;
 INSERT INTO postspark.generation_v5_operations(request_id,operation_key,state,expectation) VALUES(p_id,p_key,'started',p_expectation)
 ON CONFLICT(request_id,operation_key) DO UPDATE SET expectation=EXCLUDED.expectation WHERE postspark.generation_v5_operations.expectation IS NULL;
 IF NOT EXISTS(SELECT 1 FROM postspark.generation_v5_operations WHERE request_id=p_id AND operation_key=p_key AND expectation=p_expectation) THEN RAISE EXCEPTION 'Immutable review expectation';END IF;
END $$;
CREATE FUNCTION postspark.generation_recover_review(p_id uuid,p_owner uuid,p_key text,p_expectation jsonb,p_result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r postspark.generation_v5_requests%ROWTYPE; op postspark.generation_v5_operations%ROWTYPE;
BEGIN
 SELECT * INTO r FROM postspark.generation_v5_requests WHERE id=p_id AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND OR r.status NOT IN ('awaiting_reconciliation','queued') OR r.deadline_at<=now() OR r.prepared->>'reviewPolicyVersion' IS DISTINCT FROM '9' OR r.prepared->'reviewExecutionConfig'->>'configurationHash' IS DISTINCT FROM p_expectation->>'configurationHash' THEN RAISE EXCEPTION 'Request not awaiting reconciliation';END IF;
 SELECT * INTO op FROM postspark.generation_v5_operations WHERE request_id=p_id AND operation_key=p_key FOR UPDATE;
 IF NOT FOUND OR op.expectation IS DISTINCT FROM p_expectation OR p_result->'__proposalReview' IS DISTINCT FROM (p_expectation-'transport') OR op.state NOT IN ('started','uncertain','completed') THEN RAISE EXCEPTION 'Recovered review mismatch';END IF;
 IF op.state='completed' THEN IF op.result IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'Immutable result';END IF;RETURN to_jsonb(r);END IF;
 UPDATE postspark.generation_v5_operations SET state='completed',result=p_result,updated_at=now() WHERE request_id=p_id AND operation_key=p_key;
 IF NOT EXISTS(SELECT 1 FROM postspark.generation_v5_operations WHERE request_id=p_id AND state<>'completed' AND operation_key LIKE (p_expectation->>'proposalId')||'%' AND operation_key ~ ':review(_evidence_repair)?:') THEN
 UPDATE postspark.generation_v5_requests SET status='queued',proposals=(SELECT jsonb_agg(CASE WHEN p->>'status'='awaiting_reconciliation' AND (p->>'proposalId')=(p_expectation->>'proposalId') THEN (p-'reviews'-'failure'-'errorReason')||jsonb_build_object('status','planned') ELSE p END ORDER BY ord) FROM jsonb_array_elements(proposals) WITH ORDINALITY e(p,ord)),updated_at=now() WHERE id=p_id RETURNING * INTO r;
 END IF;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION postspark.generation_review_expectation(uuid,uuid,text,jsonb),postspark.generation_recover_review(uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_review_expectation(uuid,uuid,text,jsonb),postspark.generation_recover_review(uuid,uuid,text,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION postspark.generation_settle(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE reservation jsonb;
DECLARE ready_count integer;
DECLARE debt integer;
DECLARE ok boolean;
DECLARE balance integer;
DECLARE current_plan text;
DECLARE other_holds integer;
BEGIN
 SELECT * INTO req FROM postspark.generation_v5_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Generation not found'; END IF;
 IF req.status IN ('queued','running','awaiting_reconciliation') THEN RAISE EXCEPTION 'Generation still active'; END IF;
 IF req.billing_settled_at IS NOT NULL THEN
  RETURN jsonb_build_object('settled',true,'debitedSparks',coalesce(req.billing_debited,0),'refundedSparks',coalesce(req.billing_reserved,0)-coalesce(req.billing_debited,0));
 END IF;
 IF req.billing_mode <> 'reserved' THEN
  UPDATE postspark.generation_v5_requests SET billing_settled_at=now(),billing_debited=0,billing_error=NULL,billing_retry_at=NULL WHERE id=p_id;
  RETURN jsonb_build_object('settled',true,'debitedSparks',0,'refundedSparks',0);
 END IF;
 IF req.billing_reservation_id IS NULL OR req.billing_reserved IS NULL THEN RAISE EXCEPTION 'Generation reservation missing'; END IF;
 -- Serialize all financial decisions for this owner before locking the ledger,
 -- matching admission lock order. The request lock fences cancellation/delivery.
 SELECT sparks,plan INTO balance,current_plan FROM postspark.profiles WHERE id=req.owner_id FOR UPDATE;
 SELECT count(*) INTO ready_count FROM jsonb_array_elements(req.proposals) p WHERE p->>'status'='ready';
 debt := CASE WHEN ready_count=0 THEN 0 ELSE req.billing_preparation + ready_count * req.billing_per_proposal END;
 IF debt IS NULL THEN RAISE EXCEPTION 'Generation pricing missing'; END IF;
 -- Existing debit_sparks also bypasses an account upgraded to unlimited before commit.
 -- Release its hold explicitly so recorded debt matches the actual balance change.
 IF current_plan IN ('DEV','FOUNDER') THEN debt:=0; END IF;
 IF debt>req.billing_reserved THEN RAISE EXCEPTION 'Generation settlement exceeds reservation'; END IF;
 IF req.billing_ledger='next' THEN
  EXECUTE 'SELECT to_jsonb(r) FROM postspark.next_spark_reservations r WHERE id=$1 FOR UPDATE' INTO reservation USING req.billing_reservation_id;
 ELSE
  EXECUTE 'SELECT to_jsonb(r) FROM postspark.spark_reservations r WHERE id=$1 FOR UPDATE' INTO reservation USING req.billing_reservation_id;
 END IF;
 IF reservation IS NULL OR reservation->>'user_uuid' IS DISTINCT FROM req.owner_id::text THEN RAISE EXCEPTION 'Generation reservation owner mismatch'; END IF;
 IF reservation->>'status'='committed' THEN
  IF (reservation->>'amount')::integer<>debt THEN RAISE EXCEPTION 'Generation reservation already committed with different amount'; END IF;
 ELSIF debt=0 AND reservation->>'status' IN ('refunded','expired') THEN
  NULL; -- A preceding expiry/refund released the entire hold; no delivery exists.
 ELSIF reservation->>'status'='reserved' OR (req.billing_ledger='next' AND reservation->>'status'='expired' AND debt>0) THEN
  -- Deadline expiry may have released a hold before the worker recovered. Only
  -- this request's linked reservation may be restored to settle existing ready
  -- deliveries; no provider calls are repeated and debt is charged exactly once.
  IF req.billing_ledger='next' THEN
   IF (reservation->>'status'='expired' OR (reservation->>'expires_at')::timestamptz<=now()) AND debt>0 THEN
    EXECUTE 'SELECT coalesce(sum(amount),0)::integer FROM postspark.next_spark_reservations WHERE user_uuid=$1 AND id<>$2 AND status=''reserved'' AND expires_at>now()' INTO other_holds USING req.owner_id,req.billing_reservation_id;
    IF balance-coalesce(other_holds,0)<debt THEN RAISE EXCEPTION 'Expired generation reservation requires financial reconciliation'; END IF;
   END IF;
   EXECUTE 'UPDATE postspark.next_spark_reservations SET amount=$2,status=''reserved'',expires_at=greatest(expires_at,now()+interval ''5 minutes''),run_id=$3,updated_at=now() WHERE id=$1' USING req.billing_reservation_id,CASE WHEN debt>0 THEN debt ELSE req.billing_reserved END,p_id;
   IF debt=0 THEN
    EXECUTE 'SELECT postspark.next_refund_reservation_v2($1,$2)' INTO ok USING req.billing_reservation_id,'Generation completed without usable proposals';
   ELSE
    EXECUTE 'SELECT postspark.next_commit_reservation_v2($1,$2,$3)' INTO ok USING req.billing_reservation_id,'PostSpark generation '||p_id::text,jsonb_build_object('generationRunId',p_id,'readyProposals',ready_count,'reservedSparks',req.billing_reserved);
   END IF;
  ELSE
   EXECUTE 'UPDATE postspark.spark_reservations SET amount=$2,updated_at=now() WHERE id=$1' USING req.billing_reservation_id,CASE WHEN debt>0 THEN debt ELSE req.billing_reserved END;
   IF debt=0 THEN
    EXECUTE 'SELECT postspark.refund_spark_reservation($1,$2)' INTO ok USING req.billing_reservation_id,'Generation completed without usable proposals';
   ELSE
    EXECUTE 'SELECT postspark.commit_spark_reservation($1,$2)' INTO ok USING req.billing_reservation_id,p_id::text;
   END IF;
  END IF;
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Generation financial settlement rejected'; END IF;
 ELSE
  RAISE EXCEPTION 'Generation reservation cannot be settled: %',reservation->>'status';
 END IF;
 UPDATE postspark.generation_v5_requests SET billing_debited=debt,billing_settled_at=now(),billing_error=NULL,billing_retry_at=NULL WHERE id=p_id;
 RETURN jsonb_build_object('settled',true,'debitedSparks',debt,'refundedSparks',req.billing_reserved-debt);
END $$;
DROP TRIGGER generation_terminal_billing ON postspark.generation_v5_requests;
CREATE TRIGGER generation_terminal_billing AFTER UPDATE OF status ON postspark.generation_v5_requests
 FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status NOT IN ('queued','running','awaiting_reconciliation'))
 EXECUTE FUNCTION postspark.generation_settle_terminal();
DROP INDEX postspark.generation_billing_pending;
CREATE INDEX generation_billing_pending ON postspark.generation_v5_requests(updated_at,id) WHERE status NOT IN ('queued','running','awaiting_reconciliation') AND billing_settled_at IS NULL AND billing_mode='reserved';
-- Extend only the replay guard, retaining the deployed PT409 lease fence.
DO $migration$
DECLARE definition text; old_guard text := 'IF p_action = ''begin_safe'' AND p_operation_key NOT IN (';
BEGIN
 definition:=pg_get_functiondef('postspark.generation_v5_operation(uuid,uuid,text,text,jsonb)'::regprocedure);
 IF strpos(definition,old_guard)=0 THEN RAISE EXCEPTION 'Unexpected replay guard';END IF;
 EXECUTE replace(definition,old_guard,'IF p_action = ''begin_safe'' AND p_operation_key !~ '':candidate$'' AND p_operation_key NOT IN (');
END $migration$;
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION postspark.generation_v5_admit(
  p_id uuid, p_owner uuid, p_idempotency_key text, p_input_hash text,
  p_input jsonb, p_experimental boolean, p_deadline_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing postspark.generation_v5_requests%ROWTYPE;
DECLARE proposal_list jsonb;
BEGIN
  IF p_id IS NULL OR p_owner IS NULL OR p_input IS NULL OR jsonb_typeof(p_input) <> 'object'
     OR p_input_hash !~ '^[a-f0-9]{64}$' OR p_idempotency_key IS NULL
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 128 OR p_experimental IS NULL THEN
    RAISE EXCEPTION 'Invalid generation admission' USING ERRCODE = '22023';
  END IF;
  IF p_input->>'idempotencyKey' IS DISTINCT FROM p_idempotency_key THEN
    RAISE EXCEPTION 'Idempotency key does not match request input' USING ERRCODE = '22023';
  END IF;
  IF p_input->>'ownerId' IS DISTINCT FROM p_owner::text THEN
    RAISE EXCEPTION 'Input owner does not match authenticated admission' USING ERRCODE = '22023';
  END IF;
  IF p_deadline_at IS NOT NULL AND p_deadline_at <= now() THEN
    RAISE EXCEPTION 'Generation deadline must be in the future' USING ERRCODE = '22023';
  END IF;

  -- Serialize a user's idempotency and active-limit decisions without taking a
  -- broad table lock. Idempotent retries are resolved before enforcing capacity.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text, 0));
  SELECT * INTO existing FROM postspark.generation_v5_requests
   WHERE owner_id = p_owner AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF existing.input_hash <> p_input_hash THEN
      RAISE EXCEPTION 'Idempotency key reused with different input' USING ERRCODE = '23505';
    END IF;
    RETURN pg_catalog.to_jsonb(existing) || pg_catalog.jsonb_build_object('created', false);
  END IF;

  UPDATE postspark.generation_v5_requests
     SET status = CASE WHEN (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(proposals) p WHERE p->>'status'='ready') > 0 THEN 'partial' ELSE 'failed' END,
         error_reason = 'deadline_expired', lease_token = NULL,
         lease_until = NULL,
         proposals = (SELECT pg_catalog.jsonb_agg(
           CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending','awaiting_reconciliation')
             THEN p || pg_catalog.jsonb_build_object('status','expired','errorReason','deadline_expired') ELSE p END
           ORDER BY ord) FROM pg_catalog.jsonb_array_elements(proposals) WITH ORDINALITY e(p,ord)),
         updated_at = now()
   WHERE owner_id = p_owner AND status IN ('queued','running','awaiting_reconciliation') AND deadline_at <= now();
  UPDATE postspark.generation_runs r SET status = q.status, error_message = 'deadline_expired', completed_at = now()
   FROM postspark.generation_v5_requests q
   WHERE q.id = r.id AND q.owner_id = p_owner AND q.status IN ('partial','failed') AND q.error_reason = 'deadline_expired'
     AND (r.status IS DISTINCT FROM q.status OR r.error_message IS DISTINCT FROM 'deadline_expired');
  UPDATE postspark.generation_v5_operations SET state = 'uncertain', updated_at = now()
   WHERE state = 'started' AND request_id IN (SELECT id FROM postspark.generation_v5_requests
     WHERE owner_id = p_owner AND status IN ('partial','failed') AND error_reason = 'deadline_expired');
  IF (SELECT pg_catalog.count(*) FROM postspark.generation_v5_requests
       WHERE owner_id = p_owner AND status IN ('queued','running','awaiting_reconciliation') AND deadline_at > now()) >= 2 THEN
    RAISE EXCEPTION 'Active generation limit reached' USING ERRCODE = '54000';
  END IF;

  proposal_list := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('contractVersion',1,'proposalId','p-'||p_id::text||'-0','runId',p_id,'slot',0,'revision',1,'status','planned','findings','[]'::jsonb,'diagnostics','[]'::jsonb),
    pg_catalog.jsonb_build_object('contractVersion',1,'proposalId','p-'||p_id::text||'-1','runId',p_id,'slot',1,'revision',1,'status','planned','findings','[]'::jsonb,'diagnostics','[]'::jsonb),
    pg_catalog.jsonb_build_object('contractVersion',1,'proposalId','p-'||p_id::text||'-2','runId',p_id,'slot',2,'revision',1,'status','planned','findings','[]'::jsonb,'diagnostics','[]'::jsonb)
  );

  INSERT INTO postspark.generation_runs (
    id,user_uuid,status,input_type,input_content,platform,post_mode,creation_mode,
    requested_model,effective_models,output_snapshot
  ) VALUES (
    p_id,p_owner,'running',p_input->>'inputType',p_input->>'content',p_input->>'platform',
    p_input->>'postMode',p_input->>'creationMode',coalesce(p_input->>'model','gemini'),
    '[]'::jsonb,'[]'::jsonb
  );
  INSERT INTO postspark.generation_v5_requests (
    id,owner_id,idempotency_key,input_hash,input,status,experimental,deadline_at,proposals
  ) VALUES (
    p_id,p_owner,p_idempotency_key,p_input_hash,p_input,'queued',p_experimental,
    least(coalesce(p_deadline_at, now() + interval '10 minutes'), now() + interval '10 minutes'),proposal_list
  ) RETURNING * INTO existing;
  RETURN pg_catalog.to_jsonb(existing) || pg_catalog.jsonb_build_object('created', true);
END $$;

CREATE FUNCTION postspark.generation_admit_external(p_id uuid,p_owner uuid,p_idempotency_key text,p_input_hash text,p_input jsonb,p_experimental boolean,p_deadline_at timestamptz,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r postspark.generation_v5_requests%ROWTYPE; admitted jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 SELECT * INTO r FROM postspark.generation_v5_requests WHERE owner_id=p_owner AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF FOUND THEN IF r.input_hash<>p_input_hash OR r.execution_mode<>'external' THEN RAISE EXCEPTION 'Idempotency input conflict' USING ERRCODE='23505';END IF;RETURN to_jsonb(r)||jsonb_build_object('created',false);END IF;
 PERFORM 1 FROM postspark.catalog_state WHERE id=true AND active_revision=p_revision AND published_source_revision=source_revision FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'catalog_revision_changed';END IF;
 admitted:=postspark.generation_admit(p_id,p_owner,p_idempotency_key,p_input_hash,p_input,p_experimental,p_deadline_at);
 UPDATE postspark.generation_v5_requests SET catalog_revision=p_revision WHERE id=p_id RETURNING * INTO r;
 RETURN to_jsonb(r)||jsonb_build_object('created',true);
END $$;
REVOKE ALL ON FUNCTION postspark.generation_admit_external(uuid,uuid,text,text,jsonb,boolean,timestamptz,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_admit_external(uuid,uuid,text,text,jsonb,boolean,timestamptz,bigint) TO service_role;
-- Preserve local-project import while preventing a service-role upsert from changing another owner.
CREATE FUNCTION postspark.brand_project_upsert(p_owner uuid,p_project jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE project_id uuid:=coalesce(nullif(p_project->>'id','')::uuid,gen_random_uuid()); r postspark.brand_projects%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('brand-project:'||p_owner::text,0));
 IF coalesce((p_project->>'isDefault')::boolean,false) THEN UPDATE postspark.brand_projects SET is_default=false,updated_at=now() WHERE user_uuid=p_owner;END IF;
 INSERT INTO postspark.brand_projects(id,user_uuid,name,niche,source_type,structured_data,compiled_document,is_default,capture,visual_preferences)
 VALUES(project_id,p_owner,p_project->>'name',p_project->>'niche',coalesce(p_project->>'sourceType','form'),coalesce(p_project->'structuredData','{}'::jsonb),coalesce(p_project->>'compiledDocument',''),coalesce((p_project->>'isDefault')::boolean,false),p_project->'capture',p_project->'visualPreferences')
 ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,niche=EXCLUDED.niche,source_type=EXCLUDED.source_type,structured_data=EXCLUDED.structured_data,compiled_document=EXCLUDED.compiled_document,is_default=EXCLUDED.is_default,capture=coalesce(EXCLUDED.capture,postspark.brand_projects.capture),visual_preferences=coalesce(EXCLUDED.visual_preferences,postspark.brand_projects.visual_preferences),updated_at=now() WHERE postspark.brand_projects.user_uuid=p_owner RETURNING * INTO r;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Project not owned' USING ERRCODE='42501';END IF;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION postspark.brand_project_upsert(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.brand_project_upsert(uuid,jsonb) TO service_role;
