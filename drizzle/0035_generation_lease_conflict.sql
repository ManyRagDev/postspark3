-- Lease loss is a terminal domain conflict for this executor, not a transient
-- PostgreSQL serialization failure. PostgREST can retry custom 40001 errors
-- indefinitely; PT409 returns HTTP 409 immediately without replaying the RPC.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $migration$
DECLARE
  signature text;
  function_oid oid;
  definition text;
  old_guard constant text := 'RAISE EXCEPTION ''Generation lease lost'' USING ERRCODE = ''40001'';';
  new_guard constant text := 'RAISE EXCEPTION ''Generation lease lost'' USING ERRCODE = ''PT409'';';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'postspark.generation_v5_lease_update(uuid,uuid,text,jsonb)',
    'postspark.generation_v5_operation(uuid,uuid,text,text,jsonb)',
    'postspark.generation_v5_finish(uuid,uuid,text,text)'
  ] LOOP
    function_oid := pg_catalog.to_regprocedure(signature);
    IF function_oid IS NULL THEN
      RAISE EXCEPTION 'Missing V5 function: %', signature;
    END IF;
    definition := pg_catalog.pg_get_functiondef(function_oid);
    IF pg_catalog.strpos(definition, old_guard) > 0 THEN
      -- CREATE OR REPLACE preserves the function identity, owner and grants.
      -- Change only the lease guard; keep every existing business rule intact.
      EXECUTE pg_catalog.replace(definition, old_guard, new_guard);
    ELSIF pg_catalog.strpos(definition, new_guard) = 0 THEN
      RAISE EXCEPTION 'Unexpected V5 lease guard: %', signature;
    END IF;
  END LOOP;
END $migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
