-- Durable demand execution. Apply after 0064; no process is started by this migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE postspark.generation_v5_requests ADD COLUMN billing_attempts integer NOT NULL DEFAULT 0;
CREATE INDEX generation_demand_deadline ON postspark.generation_v5_requests(deadline_at,id)
 WHERE execution_mode='external' AND status IN ('queued','running','awaiting_reconciliation');
CREATE INDEX generation_demand_billing_due ON postspark.generation_v5_requests((coalesce(billing_retry_at,'-infinity'::timestamptz)),id)
 WHERE execution_mode='external' AND status NOT IN ('queued','running','awaiting_reconciliation') AND billing_mode='reserved' AND billing_settled_at IS NULL;
CREATE INDEX capture_demand_deadline ON postspark.brand_captures(deadline_at,id)
 WHERE execution_mode='external' AND status IN ('queued','running');
CREATE INDEX capture_demand_lease ON postspark.brand_captures(lease_until,id) WHERE status='running';


-- This identity detects miswired REST/runtime and listener databases at startup.
CREATE TABLE postspark.demand_executor_control (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 installation_id uuid NOT NULL DEFAULT gen_random_uuid(),
 failure_count integer NOT NULL DEFAULT 0 CHECK(failure_count>=0),
 retry_at timestamptz, failure_class text CHECK(failure_class IN ('transient','rate_limit','credentials','quota'))
);
ALTER TABLE postspark.demand_executor_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON postspark.demand_executor_control FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE ON postspark.demand_executor_control TO service_role;
INSERT INTO postspark.demand_executor_control(id) VALUES(true);
CREATE FUNCTION postspark.demand_executor_backoff(p_class text) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE delay_seconds numeric; result timestamptz;
BEGIN
 IF p_class NOT IN ('transient','rate_limit','credentials','quota') OR p_class IS NULL THEN RAISE EXCEPTION 'Invalid failure class'; END IF;
 SELECT CASE p_class WHEN 'credentials' THEN 900 WHEN 'quota' THEN 3600 WHEN 'rate_limit' THEN least(900,60*power(2,least(failure_count,4))) ELSE least(300,5*power(2,least(failure_count,6))) END
 INTO delay_seconds FROM postspark.demand_executor_control WHERE id FOR UPDATE;
 UPDATE postspark.demand_executor_control SET failure_count=failure_count+1,failure_class=p_class,
  retry_at=greatest(coalesce(retry_at,now()),now()+make_interval(secs => delay_seconds*(0.8+random()*0.4)))
 WHERE id RETURNING retry_at INTO result;
 PERFORM pg_notify('postspark_work','{"kind":"dependency"}');
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION postspark.demand_executor_backoff(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.demand_executor_backoff(text) TO service_role;

-- Notifications are delivered only after commit. No user input, owner, URL or secret.
CREATE FUNCTION postspark.demand_work_notify() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.execution_mode='external' THEN
  PERFORM pg_catalog.pg_notify('postspark_work',jsonb_build_object('kind',TG_ARGV[0],'id',NEW.id)::text);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION postspark.demand_work_notify() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER generation_demand_insert AFTER INSERT ON postspark.generation_v5_requests FOR EACH ROW EXECUTE FUNCTION postspark.demand_work_notify('generation');
CREATE TRIGGER generation_demand_change AFTER UPDATE OF status,deadline_at,lease_until,billing_retry_at,billing_settled_at ON postspark.generation_v5_requests FOR EACH ROW
 WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.deadline_at IS DISTINCT FROM NEW.deadline_at OR OLD.lease_until IS DISTINCT FROM NEW.lease_until OR OLD.billing_retry_at IS DISTINCT FROM NEW.billing_retry_at OR OLD.billing_settled_at IS DISTINCT FROM NEW.billing_settled_at)
 EXECUTE FUNCTION postspark.demand_work_notify('generation');
CREATE TRIGGER capture_demand_insert AFTER INSERT ON postspark.brand_captures FOR EACH ROW EXECUTE FUNCTION postspark.demand_work_notify('capture');
CREATE TRIGGER capture_demand_change AFTER UPDATE OF status,deadline_at,lease_until ON postspark.brand_captures FOR EACH ROW
 WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.deadline_at IS DISTINCT FROM NEW.deadline_at OR OLD.lease_until IS DISTINCT FROM NEW.lease_until)
 EXECUTE FUNCTION postspark.demand_work_notify('capture');

-- Small scheduling envelope: never serializes briefing, prepared state or proposals.
-- Each minimum uses a partial queue/deadline/lease index; the result is constant size.
CREATE FUNCTION postspark.demand_work_schedule() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH leases AS (
  SELECT lease_until FROM postspark.generation_v5_requests WHERE status='running' AND lease_until>now()
  UNION ALL SELECT lease_until FROM postspark.brand_captures WHERE status='running' AND lease_until>now()
 ), capacity AS (SELECT count(*)<3 AS free,min(lease_until) AS available_at FROM leases),
 deadlines AS (
  SELECT min(deadline_at) AS t FROM postspark.generation_v5_requests WHERE execution_mode='external' AND status IN ('queued','running','awaiting_reconciliation')
  UNION ALL SELECT min(lease_until) FROM postspark.generation_v5_requests WHERE execution_mode='external' AND status='running' AND lease_until>now()
  UNION ALL SELECT min(coalesce(billing_retry_at,'-infinity'::timestamptz)) FROM postspark.generation_v5_requests WHERE execution_mode='external' AND status NOT IN ('queued','running','awaiting_reconciliation') AND billing_mode='reserved' AND billing_settled_at IS NULL
  UNION ALL SELECT min(deadline_at) FROM postspark.brand_captures WHERE execution_mode='external' AND status IN ('queued','running')
  UNION ALL SELECT min(lease_until) FROM postspark.brand_captures WHERE execution_mode='external' AND status='running' AND lease_until>now()
  UNION ALL SELECT greatest((SELECT retry_at FROM postspark.demand_executor_control WHERE id),CASE WHEN free THEN now() ELSE available_at END) FROM capacity WHERE
   EXISTS(SELECT 1 FROM postspark.generation_v5_requests WHERE execution_mode='external' AND (status='queued' OR status='running' AND lease_until<=now())) OR
   EXISTS(SELECT 1 FROM postspark.brand_captures WHERE execution_mode='external' AND (status='queued' OR status='running' AND lease_until<=now()))
 ) SELECT jsonb_build_object('version',1,'installationId',(SELECT installation_id FROM postspark.demand_executor_control WHERE id),'notBefore',(SELECT retry_at FROM postspark.demand_executor_control WHERE id),'wakeAt',CASE WHEN min(t) IS NULL THEN NULL ELSE greatest(now(),min(t)) END) FROM deadlines;
$$;
REVOKE ALL ON FUNCTION postspark.demand_work_schedule() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.demand_work_schedule() TO service_role;
CREATE OR REPLACE FUNCTION postspark.generation_reconcile() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE reconciled integer:=0;
BEGIN
 FOR req IN SELECT * FROM postspark.generation_v5_requests
  WHERE execution_mode='external' AND ((status IN ('queued','running','awaiting_reconciliation') AND deadline_at<=now()) OR (status NOT IN ('queued','running','awaiting_reconciliation') AND billing_mode='reserved' AND billing_settled_at IS NULL AND (billing_retry_at IS NULL OR billing_retry_at<=now()))
  ) ORDER BY updated_at,id LIMIT 50 FOR UPDATE SKIP LOCKED LOOP
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
   UPDATE postspark.generation_v5_requests SET billing_error=SQLERRM,billing_retry_at=now()+make_interval(secs => least(1800,30 * power(2,least(billing_attempts,6))) * (0.8 + random()*0.4)),billing_attempts=billing_attempts+1 WHERE id=req.id;
  END;
 END LOOP;
 RETURN reconciled;
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_v5_claim(p_worker_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE picked postspark.generation_v5_requests%ROWTYPE;
DECLARE next_token uuid;
DECLARE active_count integer;
BEGIN
  IF p_worker_id IS NULL OR length(p_worker_id) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid worker id' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('generation_v5_global_leases', 0));
  IF EXISTS(SELECT 1 FROM postspark.demand_executor_control WHERE id AND retry_at>now()) THEN RETURN NULL; END IF;
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


CREATE FUNCTION postspark.demand_reconcile_captures() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected integer;
BEGIN
 WITH due AS (SELECT id FROM postspark.brand_captures WHERE execution_mode='external' AND status IN ('queued','running') AND deadline_at<=now() ORDER BY deadline_at,id LIMIT 50 FOR UPDATE SKIP LOCKED),
 expired AS (UPDATE postspark.brand_captures c SET status='failed',error_reason='capture_deadline_expired',lease_token=NULL,lease_until=NULL,updated_at=now() FROM due WHERE c.id=due.id RETURNING c.id),
 marked AS (UPDATE postspark.brand_capture_operations o SET state='uncertain',updated_at=now() FROM expired WHERE o.capture_id=expired.id AND o.state='started' RETURNING o.capture_id)
 SELECT count(*) INTO affected FROM expired;
 RETURN affected;
END $$;
REVOKE ALL ON FUNCTION postspark.demand_reconcile_captures() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.demand_reconcile_captures() TO service_role;
CREATE OR REPLACE FUNCTION postspark.brand_capture_claim(p_id uuid,p_scope text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r postspark.brand_captures%ROWTYPE; blocked timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('generation_v5_global_leases',0));
 IF p_scope IS NULL AND EXISTS(SELECT 1 FROM postspark.demand_executor_control WHERE id AND retry_at>now()) THEN
  RETURN jsonb_build_object('blockedUntil',(SELECT retry_at FROM postspark.demand_executor_control WHERE id));
 END IF;
 UPDATE postspark.brand_captures SET status='failed',error_reason='capture_deadline_expired',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id IN (SELECT id FROM postspark.brand_captures WHERE executor_scope IS NOT DISTINCT FROM p_scope AND status IN ('queued','running') AND deadline_at<=now() ORDER BY deadline_at,id LIMIT 50 FOR UPDATE SKIP LOCKED);
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
-- CREATE OR REPLACE preserves an existing function's ACL. A schema-only restore
-- without privileges recreates functions with PUBLIC EXECUTE, so reassert the
-- service boundary for every replaced SECURITY DEFINER entry point as well.
REVOKE ALL ON FUNCTION postspark.generation_reconcile(),postspark.generation_v5_claim(text),postspark.brand_capture_claim(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_reconcile(),postspark.generation_v5_claim(text),postspark.brand_capture_claim(uuid,text) TO service_role;
COMMIT;
