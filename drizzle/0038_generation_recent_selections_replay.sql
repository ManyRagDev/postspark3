-- Recent delivered selections are an unpaid database read. They can be read
-- again after a worker interruption, just like the other preparation reads.
-- Patch only the known allowlist, preserving the deployed function's remaining
-- rules, identity, owner and configuration (including 0035's PT409 lease guard).
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $migration$
DECLARE
  signature constant text := 'postspark.generation_v5_operation(uuid,uuid,text,text,jsonb)';
  function_oid oid;
  definition text;
  old_guard constant text := 'IF p_action = ''begin_safe'' AND p_operation_key NOT IN (''prepare:context'',''prepare:preferences'',''prepare:catalog'',''prepare:definitions'') THEN';
  new_guard constant text := 'IF p_action = ''begin_safe'' AND p_operation_key NOT IN (''prepare:context'',''prepare:preferences'',''prepare:catalog'',''prepare:definitions'',''prepare:recent_selections'') THEN';
BEGIN
  function_oid := pg_catalog.to_regprocedure(signature);
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'Missing generation operation function: %', signature;
  END IF;
  definition := pg_catalog.pg_get_functiondef(function_oid);
  IF pg_catalog.strpos(definition, old_guard) > 0
     AND pg_catalog.strpos(definition, new_guard) = 0 THEN
    EXECUTE pg_catalog.replace(definition, old_guard, new_guard);
  ELSIF pg_catalog.strpos(definition, new_guard) = 0
     OR pg_catalog.strpos(definition, old_guard) > 0 THEN
    -- Do not overwrite an independently changed replay policy. Inspect it first.
    RAISE EXCEPTION 'Unexpected generation replay allowlist: %', signature;
  END IF;
END $migration$;

REVOKE ALL ON FUNCTION postspark.generation_v5_operation(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_v5_operation(uuid,uuid,text,text,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
