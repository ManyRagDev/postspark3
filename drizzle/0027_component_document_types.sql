-- Null-safe database identity checks complement the full backend graph schema.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE postspark.design_components ADD CONSTRAINT component_document_types CHECK ((
 jsonb_typeof(definition)='object'
 AND definition->>'schemaVersion'='1'
 AND jsonb_typeof(definition->'schemaVersion')='number'
 AND jsonb_typeof(definition->'id')='string' AND definition->>'id'=id::text
 AND jsonb_typeof(definition->'hash')='string' AND definition->>'hash'=definition_hash
 AND jsonb_typeof(definition->'kind')='string' AND definition->>'kind'=kind
 AND jsonb_typeof(definition->'source')='object'
 AND jsonb_typeof(definition->'fragment')='object'
 AND jsonb_typeof(definition->'pieces')='object'
 AND jsonb_typeof(definition->'assets')='array'
 AND jsonb_typeof(definition->'roles')='array'
 AND jsonb_typeof(definition->'densities')='array'
 AND jsonb_typeof(definition->'aspectRatios')='array'
) IS TRUE);
ALTER TABLE postspark.design_component_search_documents ADD CONSTRAINT component_index_types CHECK ((
 jsonb_typeof(descriptor)='object'
 AND jsonb_typeof(descriptor->'structure')='array'
 AND jsonb_array_length(descriptor->'structure')=48
 AND descriptor->>'version'=descriptor_version
 AND jsonb_typeof(card)='object'
 AND card->>'id'=component_id::text
 AND card->>'hash'=definition_hash
) IS TRUE);
COMMIT;
