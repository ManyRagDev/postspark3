-- Add the reviewed same-model provider preference policy without changing V1
-- receipts, hashes, reservations, reconciliation or historical RPC signatures.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF to_regprocedure('postspark.generation_task_routing_valid(jsonb)') IS NULL
    OR to_regprocedure('postspark.generation_task_routing_available()') IS NULL
  THEN RAISE EXCEPTION 'Apply 0057 before 0060'; END IF;
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_task_routing_valid(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE routing jsonb; stage text; route jsonb; expected jsonb; timeout_ms numeric;
BEGIN
  IF p_config IS NULL OR jsonb_typeof(p_config) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF p_config->>'choice' IS DISTINCT FROM 'auto' THEN RETURN NOT (p_config ? 'taskRouting'); END IF;
  routing:=p_config->'taskRouting';
  IF p_config->'version' IS DISTINCT FROM '1'::jsonb
    OR p_config->'generationStrategyVersion' IS DISTINCT FROM '2'::jsonb
    OR p_config->>'model' IS DISTINCT FROM 'anthropic/claude-haiku-5.5'
    OR p_config->>'reasoningEffort' IS DISTINCT FROM 'none'
    OR p_config->>'structuredOutputMode' IS DISTINCT FROM 'native_schema'
    OR p_config ? 'temperature' OR p_config ? 'topP'
    OR jsonb_typeof(routing) IS DISTINCT FROM 'object'
    OR (routing->'version' IS DISTINCT FROM '1'::jsonb AND routing->'version' IS DISTINCT FROM '2'::jsonb)
    OR routing->>'policy' IS DISTINCT FROM (CASE WHEN routing->'version'='2'::jsonb THEN 'deepseek_haiku_v2' ELSE 'deepseek_haiku_v1' END)
    OR routing - ARRAY['version','policy','intent','copy','repair'] IS DISTINCT FROM '{}'::jsonb
  THEN RETURN false; END IF;
  FOREACH stage IN ARRAY ARRAY['intent','copy','repair'] LOOP
    route:=routing->stage;
    IF jsonb_typeof(route) IS DISTINCT FROM 'object'
      OR jsonb_typeof(route->'transportTimeoutMs') IS DISTINCT FROM 'number'
    THEN RETURN false; END IF;
    timeout_ms:=(route->>'transportTimeoutMs')::numeric;
    IF timeout_ms<1 OR timeout_ms>180000 OR timeout_ms<>trunc(timeout_ms) THEN RETURN false; END IF;
    expected:=CASE WHEN stage='copy' THEN
      '{"model":"anthropic/claude-haiku-5.5","providerEndpoint":"anthropic","maxPrice":{"prompt":0.101,"completion":0.505},"reasoningEffort":"none","reasoningEnabled":false,"structuredOutputMode":"native_schema"}'::jsonb
    WHEN routing->'version'='2'::jsonb THEN
      '{"model":"deepseek/deepseek-v4.1-flash","providerEndpoint":"deepinfra","allowProviderFallbacks":true,"maxPrice":{"prompt":0.1414,"completion":0.4242},"reasoningEffort":"none","reasoningEnabled":false,"structuredOutputMode":"native_schema"}'::jsonb
    ELSE
      '{"model":"deepseek/deepseek-v4.1-flash","providerEndpoint":"deepinfra/fp8","maxPrice":{"prompt":0.1414,"completion":0.4242},"reasoningEffort":"none","reasoningEnabled":false,"structuredOutputMode":"native_schema"}'::jsonb
    END;
    IF route - 'transportTimeoutMs' IS DISTINCT FROM expected THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

-- New admission asks for a specific supported routing version. The no-argument
-- readiness RPC remains unchanged for historical clients. A DB with only 0057
-- has no overload, so a new client fails readiness before reserving billing.
CREATE OR REPLACE FUNCTION postspark.generation_task_routing_available(p_version integer)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE probe jsonb; deepseek jsonb; haiku jsonb;
BEGIN
  IF p_version IS DISTINCT FROM 1 AND p_version IS DISTINCT FROM 2 THEN RETURN false; END IF;
  deepseek:='{"model":"deepseek/deepseek-v4.1-flash","providerEndpoint":"deepinfra/fp8","maxPrice":{"prompt":0.1414,"completion":0.4242},"reasoningEffort":"none","reasoningEnabled":false,"structuredOutputMode":"native_schema","transportTimeoutMs":60000}'::jsonb;
  IF p_version=2 THEN
    deepseek:=deepseek||'{"providerEndpoint":"deepinfra","allowProviderFallbacks":true}'::jsonb;
  END IF;
  haiku:='{"model":"anthropic/claude-haiku-5.5","providerEndpoint":"anthropic","maxPrice":{"prompt":0.101,"completion":0.505},"reasoningEffort":"none","reasoningEnabled":false,"structuredOutputMode":"native_schema","transportTimeoutMs":90000}'::jsonb;
  probe:='{"version":1,"generationStrategyVersion":2,"choice":"auto","model":"anthropic/claude-haiku-5.5","reasoningEffort":"none","structuredOutputMode":"native_schema"}'::jsonb
    ||jsonb_build_object('taskRouting',jsonb_build_object('version',p_version,
      'policy',CASE WHEN p_version=2 THEN 'deepseek_haiku_v2' ELSE 'deepseek_haiku_v1' END,
      'intent',deepseek,'copy',haiku,'repair',deepseek));
  RETURN coalesce(postspark.generation_task_routing_available(),false)
    AND postspark.generation_task_routing_valid(probe);
END $$;
REVOKE ALL ON FUNCTION postspark.generation_task_routing_valid(jsonb),
  postspark.generation_task_routing_available(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_task_routing_valid(jsonb),
  postspark.generation_task_routing_available(integer) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
