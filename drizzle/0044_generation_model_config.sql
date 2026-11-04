-- Freeze provider and generation policy in the same transaction as admission and
-- billing. Existing receipts remain nullable and keep their historical behavior.
BEGIN;
ALTER TABLE postspark.generation_v5_requests
  ADD COLUMN IF NOT EXISTS generation_config jsonb;

CREATE OR REPLACE FUNCTION postspark.generation_admit_configured(
  p_id uuid, p_owner uuid, p_idempotency_key text, p_input_hash text,
  p_input jsonb, p_experimental boolean, p_deadline_at timestamptz,
  p_generation_config jsonb, p_scope text DEFAULT NULL, p_revision bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE admitted jsonb;
DECLARE req postspark.generation_v5_requests%ROWTYPE;
BEGIN
  IF p_generation_config IS NULL
    OR jsonb_typeof(p_generation_config) IS DISTINCT FROM 'object'
    OR p_generation_config->>'version' IS DISTINCT FROM '1'
    OR coalesce(p_generation_config->>'choice','') NOT IN ('gemini','gpt')
    OR coalesce(p_generation_config->>'generationStrategyVersion','') NOT IN ('1','2')
    OR coalesce(p_generation_config->>'model','')=''
    OR coalesce(p_generation_config->>'configurationHash','') !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'Invalid generation configuration' USING ERRCODE='22023'; END IF;

  IF p_scope IS NOT NULL THEN
    admitted:=postspark.generation_admit_local(p_id,p_owner,p_idempotency_key,p_input_hash,p_input,p_experimental,p_deadline_at,p_scope,p_revision);
  ELSIF p_revision IS NOT NULL THEN
    admitted:=postspark.generation_admit_external(p_id,p_owner,p_idempotency_key,p_input_hash,p_input,p_experimental,p_deadline_at,p_revision);
  ELSE
    admitted:=postspark.generation_admit(p_id,p_owner,p_idempotency_key,p_input_hash,p_input,p_experimental,p_deadline_at);
  END IF;
  -- A retry must never reinterpret the first admission, including legacy rows.
  IF (admitted->>'created')::boolean THEN
    UPDATE postspark.generation_v5_requests SET generation_config=p_generation_config
      WHERE id=p_id AND owner_id=p_owner RETURNING * INTO req;
    RETURN to_jsonb(req)||jsonb_build_object('created',true);
  END IF;
  RETURN admitted;
END $$;

REVOKE ALL ON FUNCTION postspark.generation_admit_configured(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_admit_configured(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text,bigint) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
