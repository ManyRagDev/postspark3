-- Durable V5 orchestration state. generation_runs keeps the same UUID as the
-- request so existing history consumers can resolve its incremental output.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE postspark.generation_runs
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE TABLE postspark.generation_v5_requests (
  id uuid PRIMARY KEY REFERENCES postspark.generation_runs(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  status text NOT NULL CHECK (status IN ('queued','running','completed','partial','failed','cancelled')),
  experimental boolean NOT NULL,
  deadline_at timestamptz NOT NULL,
  proposals jsonb NOT NULL CHECK (jsonb_typeof(proposals) = 'array' AND jsonb_array_length(proposals) = 3),
  prepared jsonb,
  projections jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(projections) = 'object'),
  lease_token uuid,
  lease_until timestamptz,
  error_reason text,
  billing_mode text NOT NULL DEFAULT 'dev_pilot' CHECK (billing_mode = 'dev_pilot'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, idempotency_key),
  CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);

CREATE INDEX generation_v5_claim_queue
  ON postspark.generation_v5_requests (created_at, id)
  WHERE status IN ('queued','running');
CREATE INDEX generation_v5_active_leases
  ON postspark.generation_v5_requests (lease_until)
  WHERE status = 'running';
CREATE INDEX generation_v5_owner_active
  ON postspark.generation_v5_requests (owner_id, status, deadline_at);

CREATE TABLE postspark.generation_v5_operations (
  request_id uuid NOT NULL REFERENCES postspark.generation_v5_requests(id) ON DELETE CASCADE,
  operation_key text NOT NULL CHECK (length(operation_key) BETWEEN 1 AND 240),
  state text NOT NULL CHECK (state IN ('started','completed','uncertain')),
  result jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, operation_key),
  CHECK ((state = 'completed') = (result IS NOT NULL))
);
CREATE INDEX generation_v5_operations_open
  ON postspark.generation_v5_operations (request_id, state)
  WHERE state = 'started';

CREATE TABLE postspark.generation_v5_workers (
  worker_id text PRIMARY KEY CHECK (length(worker_id) BETWEEN 1 AND 160),
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generation_v5_workers_liveness ON postspark.generation_v5_workers (last_seen DESC);

-- Bundled M1 font assets are immutable application-owned files, not catalogue
-- grants. Pin only the manifest fields present in ArsenalAsset.
CREATE TABLE postspark.generation_v5_bundled_assets (
  id text PRIMARY KEY,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text NOT NULL,
  bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 8388608),
  family text NOT NULL,
  weight integer NOT NULL CHECK (weight BETWEEN 100 AND 900),
  license text NOT NULL
);
INSERT INTO postspark.generation_v5_bundled_assets(id,sha256,mime_type,bytes,family,weight,license) VALUES
 ('font-afec86997fdaf54af1f59358fa2c1e2a0f1d04146edad18e5cd141d0384a7548','afec86997fdaf54af1f59358fa2c1e2a0f1d04146edad18e5cd141d0384a7548','font/woff2',12512,'Arsenal_afec86997fdaf54a',400,'open-source'),
 ('font-8909904ab6c872eb994093482a88a28eca2cd95912d7b6fecd72103b0dc07edc','8909904ab6c872eb994093482a88a28eca2cd95912d7b6fecd72103b0dc07edc','font/woff2',23664,'Arsenal_8909904ab6c872eb',400,'open-source'),
 ('font-6f56409fd3d64bb85f7d070bce20749db2d66b6d63cec586cc22d1c761be2491','6f56409fd3d64bb85f7d070bce20749db2d66b6d63cec586cc22d1c761be2491','font/woff2',24356,'Arsenal_6f56409fd3d64bb8',700,'open-source'),
 ('font-25f33e61cf995abd6be62931cf03bf427286259177b43618cc410ee0157cfd30','25f33e61cf995abd6be62931cf03bf427286259177b43618cc410ee0157cfd30','font/woff2',18604,'Arsenal_25f33e61cf995abd',400,'open-source'),
 ('font-c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6','c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6','font/ttf',300724,'Arsenal_c40f2293766a503b',700,'open-source'),
 ('font-d0fa07ff63dd60cbc0e2f58e29c802dca2a5ae0276c999f59c6111ab7bbaec3b','d0fa07ff63dd60cbc0e2f58e29c802dca2a5ae0276c999f59c6111ab7bbaec3b','font/woff2',18612,'Arsenal_d0fa07ff63dd60cb',400,'open-source')
ON CONFLICT (id) DO NOTHING;
ALTER TABLE postspark.generation_v5_bundled_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON postspark.generation_v5_bundled_assets FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE postspark.generation_v5_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE postspark.generation_v5_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE postspark.generation_v5_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY generation_v5_requests_select_own
  ON postspark.generation_v5_requests FOR SELECT USING (owner_id = auth.uid());

REVOKE ALL ON postspark.generation_v5_requests, postspark.generation_v5_operations,
  postspark.generation_v5_workers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON postspark.generation_v5_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON postspark.generation_v5_requests,
  postspark.generation_v5_operations, postspark.generation_v5_workers TO service_role;

CREATE FUNCTION postspark.generation_v5_admit(
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
           CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending')
             THEN p || pg_catalog.jsonb_build_object('status','expired','errorReason','deadline_expired') ELSE p END
           ORDER BY ord) FROM pg_catalog.jsonb_array_elements(proposals) WITH ORDINALITY e(p,ord)),
         updated_at = now()
   WHERE owner_id = p_owner AND status IN ('queued','running') AND deadline_at <= now();
  UPDATE postspark.generation_runs r SET status = q.status, error_message = 'deadline_expired', completed_at = now()
   FROM postspark.generation_v5_requests q
   WHERE q.id = r.id AND q.owner_id = p_owner AND q.status IN ('partial','failed') AND q.error_reason = 'deadline_expired'
     AND (r.status IS DISTINCT FROM q.status OR r.error_message IS DISTINCT FROM 'deadline_expired');
  UPDATE postspark.generation_v5_operations SET state = 'uncertain', updated_at = now()
   WHERE state = 'started' AND request_id IN (SELECT id FROM postspark.generation_v5_requests
     WHERE owner_id = p_owner AND status IN ('partial','failed') AND error_reason = 'deadline_expired');
  IF (SELECT pg_catalog.count(*) FROM postspark.generation_v5_requests
       WHERE owner_id = p_owner AND status IN ('queued','running') AND deadline_at > now()) >= 2 THEN
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

CREATE FUNCTION postspark.generation_v5_claim(p_worker_id text)
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
   WHERE status IN ('queued','running') AND deadline_at <= now();
  UPDATE postspark.generation_runs r SET status = q.status, error_message = 'deadline_expired', completed_at = now()
   FROM postspark.generation_v5_requests q
   WHERE q.id = r.id AND q.status IN ('partial','failed') AND q.error_reason = 'deadline_expired'
     AND (r.status IS DISTINCT FROM q.status OR r.error_message IS DISTINCT FROM 'deadline_expired');
  UPDATE postspark.generation_v5_operations SET state = 'uncertain', updated_at = now()
   WHERE state = 'started' AND request_id IN (SELECT id FROM postspark.generation_v5_requests
     WHERE status IN ('partial','failed') AND error_reason = 'deadline_expired');

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('generation_v5_global_leases', 0));
  SELECT pg_catalog.count(*) INTO active_count FROM postspark.generation_v5_requests
   WHERE status = 'running' AND lease_until > now();
  IF active_count >= 3 THEN RETURN NULL; END IF;
  SELECT * INTO picked FROM postspark.generation_v5_requests
   WHERE deadline_at > now() AND (status = 'queued' OR (status = 'running' AND lease_until <= now()))
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

CREATE FUNCTION postspark.generation_v5_worker_heartbeat(p_worker_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_worker_id IS NULL OR length(p_worker_id) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid worker id' USING ERRCODE = '22023';
  END IF;
  INSERT INTO postspark.generation_v5_workers(worker_id,last_seen) VALUES(p_worker_id,now())
  ON CONFLICT(worker_id) DO UPDATE SET last_seen = EXCLUDED.last_seen;
END $$;

CREATE FUNCTION postspark.generation_v5_is_available()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM postspark.generation_v5_workers WHERE last_seen > now() - interval '30 seconds')
$$;

CREATE FUNCTION postspark.generation_v5_lease_update(
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
    RAISE EXCEPTION 'Generation lease lost' USING ERRCODE = '40001';
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
        IF NOT EXISTS (SELECT 1 FROM postspark.design_components c WHERE c.id = v_component_id
          AND c.definition_hash = v_component_hash AND c.kind = 'content'
          AND c.definition->'completeDesign'->>'baselineVerified' = 'true'
          AND (c.status = 'approved' OR req_row.experimental AND c.status = 'draft')) THEN
          RAISE EXCEPTION 'Component is no longer eligible' USING ERRCODE = '22023';
        END IF;
        FOR asset IN SELECT value FROM pg_catalog.jsonb_array_elements(coalesce(composition->'assets','[]'::jsonb)) LOOP
          IF asset->>'kind' = 'catalog' THEN
            IF NOT EXISTS (SELECT 1 FROM postspark.design_component_assets ca
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

CREATE FUNCTION postspark.generation_v5_operation(
  p_id uuid,p_lease_token uuid,p_operation_key text,p_action text,p_result jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE op postspark.generation_v5_operations%ROWTYPE;
BEGIN
  SELECT * INTO req FROM postspark.generation_v5_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR req.status <> 'running' OR req.lease_token IS DISTINCT FROM p_lease_token OR req.lease_until <= now()
     OR req.deadline_at <= now() THEN
    RAISE EXCEPTION 'Generation lease lost' USING ERRCODE = '40001';
  END IF;
  IF p_operation_key IS NULL OR length(p_operation_key) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Invalid operation key' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO op FROM postspark.generation_v5_operations WHERE request_id = p_id AND operation_key = p_operation_key FOR UPDATE;
  IF p_action = 'begin_safe' AND p_operation_key NOT IN ('prepare:context','prepare:preferences','prepare:catalog','prepare:definitions') THEN
    RAISE EXCEPTION 'Only unpaid preparation reads may be replayed' USING ERRCODE = '22023';
  END IF;
  IF p_action IN ('begin','begin_safe') THEN
    IF FOUND THEN
      IF p_action = 'begin_safe' AND op.state <> 'completed' THEN
        UPDATE postspark.generation_v5_operations SET state = 'started', result = NULL, updated_at = now()
         WHERE request_id = p_id AND operation_key = p_operation_key;
        RETURN pg_catalog.jsonb_build_object('state','new');
      END IF;
      IF op.state = 'started' THEN
        UPDATE postspark.generation_v5_operations SET state = 'uncertain', updated_at = now()
         WHERE request_id = p_id AND operation_key = p_operation_key RETURNING * INTO op;
      END IF;
      RETURN pg_catalog.jsonb_build_object('state', op.state, 'result', op.result);
    END IF;
    INSERT INTO postspark.generation_v5_operations(request_id,operation_key,state)
      VALUES(p_id,p_operation_key,'started');
    RETURN pg_catalog.jsonb_build_object('state','new');
  ELSIF p_action = 'complete' THEN
    IF p_result IS NULL THEN RAISE EXCEPTION 'Operation result required' USING ERRCODE = '22023'; END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Operation was not started' USING ERRCODE = '22023'; END IF;
    IF op.state = 'completed' THEN
      IF op.result IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'Operation result changed' USING ERRCODE = '23505'; END IF;
      RETURN pg_catalog.jsonb_build_object('state','completed','result',op.result);
    END IF;
    IF op.state = 'uncertain' THEN RETURN pg_catalog.jsonb_build_object('state','uncertain'); END IF;
    UPDATE postspark.generation_v5_operations SET state = 'completed', result = p_result, updated_at = now()
     WHERE request_id = p_id AND operation_key = p_operation_key RETURNING * INTO op;
    RETURN pg_catalog.jsonb_build_object('state','completed','result',op.result);
  ELSIF p_action = 'uncertain' THEN
    IF NOT FOUND THEN RAISE EXCEPTION 'Operation was not started' USING ERRCODE = '22023'; END IF;
    IF op.state <> 'completed' THEN
      UPDATE postspark.generation_v5_operations SET state = 'uncertain', updated_at = now()
       WHERE request_id = p_id AND operation_key = p_operation_key RETURNING * INTO op;
    END IF;
    RETURN pg_catalog.jsonb_build_object('state',op.state,'result',op.result);
  END IF;
  RAISE EXCEPTION 'Unknown operation action' USING ERRCODE = '22023';
END $$;

CREATE FUNCTION postspark.generation_v5_finish(
  p_id uuid,p_lease_token uuid,p_status text,p_error_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE ready_count integer;
DECLARE final_status text;
DECLARE final_error text;
BEGIN
  SELECT * INTO req FROM postspark.generation_v5_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR req.status <> 'running' OR req.lease_token IS DISTINCT FROM p_lease_token OR req.lease_until <= now() THEN
    RAISE EXCEPTION 'Generation lease lost' USING ERRCODE = '40001';
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
      CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending')
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

CREATE FUNCTION postspark.generation_v5_cancel(p_id uuid,p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE new_proposals jsonb;
BEGIN
  SELECT * INTO req FROM postspark.generation_v5_requests WHERE id = p_id AND owner_id = p_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF req.status IN ('queued','running') THEN
    SELECT coalesce(pg_catalog.jsonb_agg(CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending')
      THEN p || pg_catalog.jsonb_build_object('status','cancelled') ELSE p END ORDER BY ord), '[]'::jsonb)
      INTO new_proposals FROM pg_catalog.jsonb_array_elements(req.proposals) WITH ORDINALITY e(p,ord);
    UPDATE postspark.generation_v5_operations SET state = 'uncertain', updated_at = now()
      WHERE request_id = p_id AND state = 'started';
    UPDATE postspark.generation_v5_requests SET status = 'cancelled', proposals = new_proposals,
      lease_token = NULL, lease_until = NULL, updated_at = now() WHERE id = p_id RETURNING * INTO req;
    UPDATE postspark.generation_runs SET status = 'cancelled', error_message = 'cancelled'
      WHERE id = p_id AND user_uuid = p_owner;
  END IF;
  RETURN pg_catalog.to_jsonb(req);
END $$;

REVOKE ALL ON FUNCTION postspark.generation_v5_admit(uuid,uuid,text,text,jsonb,boolean,timestamptz),
  postspark.generation_v5_claim(text),postspark.generation_v5_worker_heartbeat(text),
  postspark.generation_v5_is_available(),postspark.generation_v5_lease_update(uuid,uuid,text,jsonb),
  postspark.generation_v5_operation(uuid,uuid,text,text,jsonb),postspark.generation_v5_finish(uuid,uuid,text,text),
  postspark.generation_v5_cancel(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_v5_admit(uuid,uuid,text,text,jsonb,boolean,timestamptz),
  postspark.generation_v5_claim(text),postspark.generation_v5_worker_heartbeat(text),
  postspark.generation_v5_is_available(),postspark.generation_v5_lease_update(uuid,uuid,text,jsonb),
  postspark.generation_v5_operation(uuid,uuid,text,text,jsonb),postspark.generation_v5_finish(uuid,uuid,text,text),
  postspark.generation_v5_cancel(uuid,uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
