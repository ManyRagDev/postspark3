-- Independent, immutable component documents. Legacy catalogue hashes are untouched.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE postspark.design_components (
 id uuid PRIMARY KEY,
 definition_hash text NOT NULL CHECK(definition_hash ~ '^[a-f0-9]{64}$'),
 definition jsonb NOT NULL CHECK(definition->>'schemaVersion'='1' AND definition->>'id'=id::text AND definition->>'hash'=definition_hash),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','archived')),
 kind text NOT NULL CHECK(kind IN ('background','content','typography','media','ornament')),
 source_key text NOT NULL,
 roles text[] NOT NULL,
 densities text[] NOT NULL,
 aspect_ratios text[] NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX design_components_eligibility ON postspark.design_components(status,kind,source_key);
CREATE TABLE postspark.design_component_assets (
 component_id uuid NOT NULL REFERENCES postspark.design_components(id),
 asset_id text NOT NULL REFERENCES postspark.design_catalog_assets(id),
 PRIMARY KEY(component_id,asset_id)
);
CREATE INDEX design_component_assets_reverse ON postspark.design_component_assets(asset_id);
CREATE TABLE postspark.design_component_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 component_id uuid NOT NULL REFERENCES postspark.design_components(id),
 definition_hash text NOT NULL CHECK(definition_hash ~ '^[a-f0-9]{64}$'),
 kind text NOT NULL CHECK(kind IN ('technical','human')),
 decision text NOT NULL CHECK(decision IN ('verified','approved','rejected')),
 metrics jsonb NOT NULL,
 png_hash text CHECK(png_hash ~ '^[a-f0-9]{64}$'),
 briefing_hash text CHECK(briefing_hash ~ '^[a-f0-9]{64}$'),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='technical' AND decision='verified') OR (kind='human' AND decision IN ('approved','rejected') AND png_hash IS NOT NULL AND briefing_hash IS NOT NULL))
);
CREATE INDEX design_component_evidence_identity ON postspark.design_component_evidence(component_id,definition_hash,kind,created_at DESC);
CREATE TABLE postspark.design_component_asset_grants (
 user_uuid uuid NOT NULL REFERENCES auth.users(id),
 asset_id text NOT NULL REFERENCES postspark.design_catalog_assets(id),
 component_id uuid NOT NULL REFERENCES postspark.design_components(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_uuid,asset_id,component_id)
);
CREATE INDEX design_component_grants_assets ON postspark.design_component_asset_grants(asset_id);
CREATE INDEX design_component_grants_components ON postspark.design_component_asset_grants(component_id);
DO $install$
DECLARE vs text;
BEGIN
 SELECT n.nspname INTO STRICT vs FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector';
 EXECUTE pg_catalog.format($ddl$
 CREATE TABLE postspark.design_component_search_documents (
  component_id uuid PRIMARY KEY REFERENCES postspark.design_components(id),
  definition_hash text NOT NULL,
  descriptor_version text NOT NULL CHECK(descriptor_version='component-structural-v1'),
  projected %1$I.vector(48) NOT NULL,
  descriptor jsonb NOT NULL CHECK(jsonb_array_length(descriptor->'structure')=48),
  card jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
 );
 CREATE FUNCTION postspark.design_component_search_v1(p_kind text,p_aspect text,p_roles text[],p_experimental boolean,p_anchor %1$I.vector(48),p_limit integer DEFAULT 5)
 RETURNS TABLE(component_id uuid,definition_hash text,card jsonb,distance double precision)
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
 BEGIN
  IF p_limit NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid component shortlist size'; END IF;
  RETURN QUERY WITH eligible AS (
   SELECT s.*,c.source_key,c.created_at source_created FROM postspark.design_component_search_documents s
   JOIN postspark.design_components c ON c.id=s.component_id AND c.definition_hash=s.definition_hash
   WHERE c.kind=p_kind AND p_aspect=ANY(c.aspect_ratios) AND c.roles && p_roles
     AND (c.status='approved' OR p_experimental AND c.status='draft')
  ),scored AS (
   SELECT e.*,CASE WHEN p_anchor IS NULL THEN NULL ELSE (
    SELECT sum(abs(a.value::double precision-b.value::double precision))
    FROM pg_catalog.jsonb_array_elements_text(e.projected::text::jsonb) WITH ORDINALITY a(value,i)
    JOIN pg_catalog.jsonb_array_elements_text(p_anchor::text::jsonb) WITH ORDINALITY b(value,i) USING(i)) END d FROM eligible e
  ),deduplicated AS (
   SELECT s.*,row_number() OVER(PARTITION BY s.source_key ORDER BY s.d ASC NULLS LAST,s.component_id) rank FROM scored s
  ) SELECT d.component_id,d.definition_hash,d.card,d.d FROM deduplicated d WHERE d.rank=1
    ORDER BY d.d ASC NULLS LAST,d.component_id LIMIT p_limit;
 END $fn$;
 REVOKE ALL ON FUNCTION postspark.design_component_search_v1(text,text,text[],boolean,%1$I.vector,integer) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION postspark.design_component_search_v1(text,text,text[],boolean,%1$I.vector,integer) TO service_role;
 $ddl$,vs);
END $install$;

CREATE FUNCTION postspark.design_component_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE aid text; decision text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Components are permanent'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Component definitions are immutable'; END IF;
 IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
  IF NOT EXISTS(SELECT 1 FROM postspark.design_component_evidence e WHERE e.component_id=NEW.id AND e.definition_hash=NEW.definition_hash AND e.kind='technical' AND e.decision='verified')
    OR NOT EXISTS(SELECT 1 FROM postspark.design_component_search_documents s WHERE s.component_id=NEW.id AND s.definition_hash=NEW.definition_hash) THEN RAISE EXCEPTION 'Verified component index required'; END IF;
  SELECT e.decision INTO decision FROM postspark.design_component_evidence e WHERE e.component_id=NEW.id AND e.definition_hash=NEW.definition_hash AND e.kind='human' ORDER BY e.created_at DESC,e.id DESC LIMIT 1;
  IF decision IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Human component approval required'; END IF;
  FOR aid IN SELECT value->>'id' FROM pg_catalog.jsonb_array_elements(NEW.definition->'assets') LOOP
   IF NOT EXISTS(SELECT 1 FROM postspark.design_component_assets l JOIN postspark.design_catalog_assets a ON a.id=l.asset_id WHERE l.component_id=NEW.id AND a.id=aid AND EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(NEW.definition->'assets') m WHERE m=a.manifest)) THEN RAISE EXCEPTION 'Verified component asset required'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER component_guard BEFORE INSERT OR UPDATE OR DELETE ON postspark.design_components FOR EACH ROW EXECUTE FUNCTION postspark.design_component_guard();
DO $security$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['design_components','design_component_assets','design_component_evidence','design_component_search_documents','design_component_asset_grants'] LOOP
  EXECUTE pg_catalog.format('ALTER TABLE postspark.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE pg_catalog.format('REVOKE ALL ON postspark.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE pg_catalog.format('GRANT SELECT,INSERT ON postspark.%I TO service_role',t);
  IF t<>'design_components' THEN EXECUTE pg_catalog.format('CREATE TRIGGER component_immutable BEFORE UPDATE OR DELETE ON postspark.%I FOR EACH ROW EXECUTE FUNCTION postspark.design_catalog_never_mutate()',t); END IF;
 END LOOP;
END $security$;
GRANT UPDATE(status) ON postspark.design_components TO service_role;
REVOKE ALL ON FUNCTION postspark.design_component_guard() FROM PUBLIC,anon,authenticated;
-- Pin all slides and their asset grants atomically, before the existing billing commit.
CREATE FUNCTION postspark.design_component_deliver_v1(p_run uuid,p_actor uuid,p_output jsonb,p_experimental boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE variation jsonb; slide jsonb; bundle jsonb; candidate jsonb; cid uuid; chash text; asset jsonb; k integer;
BEGIN
 PERFORM 1 FROM postspark.generation_runs WHERE id=p_run AND user_uuid=p_actor AND status='completed' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owned completed run required'; END IF;
 IF jsonb_array_length(p_output)<>3 THEN RAISE EXCEPTION 'Three proposals required'; END IF;
 FOR variation IN SELECT value FROM pg_catalog.jsonb_array_elements(p_output) LOOP
  IF variation->'componentAssemblyV1'->>'runId' IS DISTINCT FROM p_run::text THEN RAISE EXCEPTION 'Assembly run mismatch'; END IF;
  FOR slide IN SELECT value FROM pg_catalog.jsonb_array_elements(variation->'componentAssemblyV1'->'slides') LOOP
   bundle:=slide->'bundle';
   IF bundle->>'runId' IS DISTINCT FROM p_run::text OR bundle->>'traceId' IS DISTINCT FROM p_run::text THEN RAISE EXCEPTION 'Slide run mismatch'; END IF;
   FOR candidate IN SELECT value FROM pg_catalog.jsonb_array_elements(bundle->'candidates') LOOP
    IF candidate->'componentAssembly'->>'planHash' IS DISTINCT FROM variation->'componentAssemblyV1'->>'planHash' THEN RAISE EXCEPTION 'Assembly plan mismatch'; END IF;
    IF jsonb_array_length(candidate->'componentAssembly'->'componentIds')<1 OR jsonb_array_length(candidate->'componentAssembly'->'componentIds')<>jsonb_array_length(candidate->'componentAssembly'->'componentHashes') THEN RAISE EXCEPTION 'Component provenance required'; END IF;
    FOR k IN 0..jsonb_array_length(candidate->'componentAssembly'->'componentIds')-1 LOOP
     cid:=(candidate->'componentAssembly'->'componentIds'->>k)::uuid;
     chash:=candidate->'componentAssembly'->'componentHashes'->>k;
     IF NOT EXISTS(SELECT 1 FROM postspark.design_components c WHERE c.id=cid AND c.definition_hash=chash AND (c.status='approved' OR p_experimental AND c.status='draft')) THEN RAISE EXCEPTION 'Component not eligible'; END IF;
     FOR asset IN SELECT value FROM pg_catalog.jsonb_array_elements(bundle->'assets') LOOP
      IF asset->>'kind'<>'catalog' THEN RAISE EXCEPTION 'Components require catalog assets'; END IF;
      IF EXISTS(SELECT 1 FROM postspark.design_component_assets l JOIN postspark.design_catalog_assets a ON a.id=l.asset_id WHERE l.component_id=cid AND a.id=asset->>'id' AND a.manifest=asset) THEN
       INSERT INTO postspark.design_component_asset_grants(user_uuid,asset_id,component_id) VALUES(p_actor,asset->>'id',cid) ON CONFLICT DO NOTHING;
      END IF;
     END LOOP;
    END LOOP;
   END LOOP;
   FOR asset IN SELECT value FROM pg_catalog.jsonb_array_elements(bundle->'assets') LOOP
    IF NOT EXISTS(SELECT 1 FROM postspark.design_component_asset_grants g JOIN postspark.design_catalog_assets a ON a.id=g.asset_id WHERE g.user_uuid=p_actor AND g.asset_id=asset->>'id' AND a.manifest=asset) THEN RAISE EXCEPTION 'Slide asset not granted'; END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 UPDATE postspark.generation_runs SET output_snapshot=p_output WHERE id=p_run AND user_uuid=p_actor;
END $$;
REVOKE ALL ON FUNCTION postspark.design_component_deliver_v1(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.design_component_deliver_v1(uuid,uuid,jsonb,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
