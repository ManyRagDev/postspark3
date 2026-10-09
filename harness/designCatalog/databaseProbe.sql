-- Execute through Supabase execute_sql. DML only, no lasting fixtures.
-- A failure aborts the transaction; success explicitly rolls it back.
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';
SET LOCAL ROLE service_role;
DO $probe$
DECLARE
  blueprint uuid := gen_random_uuid();
  actor uuid := gen_random_uuid();
  trace uuid := gen_random_uuid();
  first_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  actual uuid;
  denied boolean;
  hash1 text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  hash2 text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  piece_hash text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  pieces jsonb;
BEGIN
  -- Database lifecycle probe; JSON contract is checked separately in contracts.ts.
  pieces := jsonb_build_array(jsonb_build_object('key','headline','hash',piece_hash,'definition',jsonb_build_object('probe',true)));
  actual := postspark.design_catalog_create(first_id,blueprint,hash1,'{"probe":1}',pieces,actor,trace);
  IF actual <> first_id OR (SELECT version FROM postspark.design_catalog_versions WHERE id=first_id) <> 1 THEN
    RAISE EXCEPTION 'draft creation failed';
  END IF;
  actual := postspark.design_catalog_create(gen_random_uuid(),blueprint,hash1,'{"probe":1}',pieces,actor,trace);
  IF actual <> first_id THEN RAISE EXCEPTION 'draft deduplication failed'; END IF;
  PERFORM postspark.design_catalog_status(first_id,'approved',actor,trace);
  PERFORM postspark.design_catalog_status(first_id,'approved',actor,trace);
  IF (SELECT count(*) FROM postspark.design_catalog_events WHERE trace_id=trace AND stage='catalog.approved') <> 1 THEN
    RAISE EXCEPTION 'approval idempotency failed';
  END IF;
  PERFORM postspark.design_catalog_create(second_id,blueprint,hash2,'{"probe":2}',pieces,actor,trace);
  IF (SELECT version FROM postspark.design_catalog_versions WHERE id=second_id) <> 2 THEN
    RAISE EXCEPTION 'version allocation failed';
  END IF;
  IF (SELECT count(*) FROM postspark.design_catalog_pieces WHERE id=piece_hash) <> 1
    OR (SELECT count(*) FROM postspark.design_catalog_version_pieces WHERE piece_id=piece_hash) <> 2 THEN
    RAISE EXCEPTION 'piece deduplication or links failed';
  END IF;
  PERFORM postspark.design_catalog_status(second_id,'approved',actor,trace);
  IF (SELECT status FROM postspark.design_catalog_versions WHERE id=first_id) <> 'archived'
    OR (SELECT count(*) FROM postspark.design_catalog_versions WHERE blueprint_id=blueprint AND status='approved') <> 1 THEN
    RAISE EXCEPTION 'approval replacement failed';
  END IF;
  denied := false;
  BEGIN
    UPDATE postspark.design_catalog_versions SET definition='{"changed":true}' WHERE id=second_id;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Catalog versions are immutable%' THEN RAISE; END IF;
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'version mutation was accepted'; END IF;
  denied := false;
  BEGIN
    PERFORM postspark.design_catalog_status(first_id,'approved',actor,trace);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Archived versions cannot be promoted' THEN RAISE; END IF;
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'archived promotion was accepted'; END IF;
  PERFORM postspark.design_catalog_status(second_id,'archived',actor,trace);
  IF (SELECT count(*) FROM postspark.design_catalog_events WHERE trace_id=trace) <> 6 THEN
    RAISE EXCEPTION 'transactional audit events missing';
  END IF;
  INSERT INTO postspark.design_catalog_events(trace_id,actor_id,event_key,stage,status,data)
    VALUES(trace,actor,'compile:0','catalog.compile','completed','{}')
    ON CONFLICT(trace_id,event_key) DO NOTHING;
  INSERT INTO postspark.design_catalog_events(trace_id,actor_id,event_key,stage,status,data)
    VALUES(trace,actor,'compile:0','catalog.compile','completed','{}')
    ON CONFLICT(trace_id,event_key) DO NOTHING;
  IF (SELECT count(*) FROM postspark.design_catalog_events WHERE trace_id=trace AND event_key='compile:0') <> 1 THEN
    RAISE EXCEPTION 'compilation event deduplication failed';
  END IF;
END $probe$;
SET LOCAL ROLE anon;
DO $probe$
DECLARE denied boolean := false;
BEGIN
  BEGIN PERFORM 1 FROM postspark.design_catalog_versions LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'anon read was accepted'; END IF;
  denied := false;
  BEGIN PERFORM postspark.design_catalog_status(gen_random_uuid(),'approved',gen_random_uuid(),gen_random_uuid());
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'anon RPC was accepted'; END IF;
END $probe$;
SET LOCAL ROLE authenticated;
DO $probe$
DECLARE denied boolean := false;
BEGIN
  BEGIN PERFORM 1 FROM postspark.design_catalog_versions LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'authenticated read was accepted'; END IF;
  denied := false;
  BEGIN PERFORM postspark.design_catalog_status(gen_random_uuid(),'approved',gen_random_uuid(),gen_random_uuid());
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'authenticated RPC was accepted'; END IF;
END $probe$;
ROLLBACK;
SELECT 'passed; fixtures rolled back' AS catalog_database_probe;
