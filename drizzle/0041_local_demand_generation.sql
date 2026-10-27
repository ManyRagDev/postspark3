-- Prepared only: apply after catalog migration 0040 and billing migration 0036.
ALTER TABLE postspark.generation_v5_requests
 ADD COLUMN execution_mode text NOT NULL DEFAULT 'external' CHECK(execution_mode IN ('external','local-demand')),
 ADD COLUMN executor_scope text,
 ADD COLUMN catalog_revision bigint REFERENCES postspark.catalog_revisions(revision),
 ADD COLUMN dispatch_error text,
 ADD CONSTRAINT generation_executor_scope CHECK ((execution_mode='external' AND executor_scope IS NULL) OR (execution_mode='local-demand' AND length(executor_scope) BETWEEN 1 AND 160 AND catalog_revision IS NOT NULL));
CREATE INDEX generation_local_recovery ON postspark.generation_v5_requests(executor_scope,created_at,id) WHERE execution_mode='local-demand' AND (status IN ('queued','running') OR billing_settled_at IS NULL);
CREATE FUNCTION postspark.generation_admit_local(p_id uuid,p_owner uuid,p_idempotency_key text,p_input_hash text,p_input jsonb,p_experimental boolean,p_deadline_at timestamptz,p_scope text,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; req postspark.generation_v5_requests%ROWTYPE;
BEGIN
 IF p_scope IS NULL OR length(p_scope) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid executor scope'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 SELECT * INTO req FROM postspark.generation_v5_requests WHERE owner_id=p_owner AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF FOUND THEN
  IF req.execution_mode<>'local-demand' OR req.executor_scope IS DISTINCT FROM p_scope THEN RAISE EXCEPTION 'generation_executor_scope_mismatch'; END IF;
  IF req.input_hash<>p_input_hash THEN RAISE EXCEPTION 'Idempotency key reused with different input' USING ERRCODE='23505'; END IF;
  RETURN to_jsonb(req)||jsonb_build_object('created',false);
 END IF;
 -- Serialize admission with publication: the checked active snapshot is pinned atomically.
 PERFORM 1 FROM postspark.catalog_state WHERE id=true AND active_revision=p_revision AND published_source_revision=source_revision FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'catalog_revision_changed'; END IF;
 result:=postspark.generation_admit(p_id,p_owner,p_idempotency_key,p_input_hash,p_input,p_experimental,p_deadline_at);
 UPDATE postspark.generation_v5_requests SET execution_mode='local-demand',executor_scope=p_scope,catalog_revision=p_revision WHERE id=p_id RETURNING * INTO req;
 RETURN to_jsonb(req)||jsonb_build_object('created',true);
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
  UPDATE postspark.generation_v5_requests
     SET status = CASE WHEN (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(proposals) p WHERE p->>'status'='ready') > 0 THEN 'partial' ELSE 'failed' END,
         error_reason = 'deadline_expired', lease_token = NULL,
         lease_until = NULL,
         proposals = (SELECT pg_catalog.jsonb_agg(
           CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending')
             THEN p || pg_catalog.jsonb_build_object('status','expired','errorReason','deadline_expired') ELSE p END
           ORDER BY ord) FROM pg_catalog.jsonb_array_elements(proposals) WITH ORDINALITY e(p,ord)),
         updated_at = now()
   WHERE execution_mode='external' AND status IN ('queued','running') AND deadline_at <= now();
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
  IF active_count >= 3 THEN RETURN NULL; END IF;
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

CREATE FUNCTION postspark.generation_reconcile_request(p_id uuid,p_scope text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE reconciled integer:=0;
BEGIN
 FOR req IN SELECT * FROM postspark.generation_v5_requests
  WHERE id=p_id AND execution_mode='local-demand' AND executor_scope=p_scope AND ((status IN ('queued','running') AND deadline_at<=now()) OR (status NOT IN ('queued','running') AND billing_mode='reserved' AND billing_settled_at IS NULL AND (billing_retry_at IS NULL OR billing_retry_at<=now()))
  ) ORDER BY updated_at,id LIMIT 1 FOR UPDATE SKIP LOCKED LOOP
  IF req.status IN ('queued','running') THEN
   UPDATE postspark.generation_v5_requests SET status=CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(proposals) p WHERE p->>'status'='ready') THEN 'partial' ELSE 'failed' END,
    error_reason='deadline_expired',lease_token=NULL,lease_until=NULL,updated_at=now(),
    proposals=(SELECT jsonb_agg(CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending') THEN p||jsonb_build_object('status','expired','errorReason','deadline_expired') ELSE p END ORDER BY ord) FROM jsonb_array_elements(proposals) WITH ORDINALITY e(p,ord))
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
  WHERE execution_mode='external' AND ((status IN ('queued','running') AND deadline_at<=now()) OR (status NOT IN ('queued','running') AND billing_mode='reserved' AND billing_settled_at IS NULL AND (billing_retry_at IS NULL OR billing_retry_at<=now()))
  ) ORDER BY updated_at,id LIMIT 1 FOR UPDATE SKIP LOCKED LOOP
  IF req.status IN ('queued','running') THEN
   UPDATE postspark.generation_v5_requests SET status=CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(proposals) p WHERE p->>'status'='ready') THEN 'partial' ELSE 'failed' END,
    error_reason='deadline_expired',lease_token=NULL,lease_until=NULL,updated_at=now(),
    proposals=(SELECT jsonb_agg(CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending') THEN p||jsonb_build_object('status','expired','errorReason','deadline_expired') ELSE p END ORDER BY ord) FROM jsonb_array_elements(proposals) WITH ORDINALITY e(p,ord))
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

CREATE FUNCTION postspark.generation_claim_request(p_id uuid,p_scope text,p_worker_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE picked postspark.generation_v5_requests%ROWTYPE; next_token uuid; blocked_until timestamptz;
BEGIN
 IF p_worker_id IS NULL OR length(p_worker_id) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid worker id'; END IF;
 PERFORM postspark.generation_reconcile_request(p_id,p_scope);
 PERFORM pg_advisory_xact_lock(hashtextextended('generation_v5_global_leases',0));
 IF NOT EXISTS(SELECT 1 FROM postspark.generation_v5_requests WHERE id=p_id AND execution_mode='local-demand' AND executor_scope=p_scope) THEN RETURN NULL; END IF;
 SELECT min(least(lease_until,deadline_at)) INTO blocked_until FROM postspark.generation_v5_requests WHERE status='running' AND lease_until>now() AND executor_scope=p_scope AND execution_mode='local-demand';
 IF blocked_until IS NOT NULL THEN RETURN jsonb_build_object('blockedUntil',blocked_until); END IF;
 IF (SELECT count(*) FROM postspark.generation_v5_requests WHERE status='running' AND lease_until>now())>=3 THEN
  SELECT min(least(lease_until,deadline_at)) INTO blocked_until FROM postspark.generation_v5_requests WHERE status='running' AND lease_until>now();
  RETURN jsonb_build_object('blockedUntil',blocked_until);
 END IF;
 SELECT * INTO picked FROM postspark.generation_v5_requests WHERE id=p_id AND execution_mode='local-demand' AND executor_scope=p_scope AND deadline_at>now() AND (status='queued' OR (status='running' AND lease_until<=now())) FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE postspark.generation_v5_operations SET state='uncertain',updated_at=now() WHERE request_id=p_id AND state='started';
 next_token:=gen_random_uuid();
 UPDATE postspark.generation_v5_requests SET status='running',lease_token=next_token,lease_until=now()+interval '90 seconds',dispatch_error=NULL,updated_at=now() WHERE id=p_id RETURNING * INTO picked;
 RETURN to_jsonb(picked)||jsonb_build_object('leaseToken',next_token);
END $$;
REVOKE ALL ON FUNCTION postspark.generation_admit_local(uuid,uuid,text,text,jsonb,boolean,timestamptz,text,bigint),postspark.generation_claim_request(uuid,text,text),postspark.generation_reconcile_request(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_admit_local(uuid,uuid,text,text,jsonb,boolean,timestamptz,text,bigint),postspark.generation_claim_request(uuid,text,text),postspark.generation_reconcile_request(uuid,text) TO service_role;

-- Local delivery validates the admitted immutable release; external delivery keeps its current eligibility gate.
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
       ('planned','running','waiting_input','checking','recovering','delivery_pending','ready','failed','cancelled','expired') THEN
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
        IF req_row.execution_mode='local-demand' THEN
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
            IF req_row.execution_mode='local-demand' THEN
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

-- A lease renewal needs status, not the accumulated documents and provider receipts.
CREATE FUNCTION postspark.generation_renew_local_lease(p_id uuid,p_lease_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM postspark.generation_v5_requests WHERE id=p_id AND execution_mode='local-demand') THEN RAISE EXCEPTION 'Local request required'; END IF;
 result:=postspark.generation_v5_lease_update(p_id,p_lease_token,'heartbeat',NULL);
 RETURN jsonb_build_object('status',result->>'status');
END $$;
REVOKE ALL ON FUNCTION postspark.generation_renew_local_lease(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_renew_local_lease(uuid,uuid) TO service_role;
