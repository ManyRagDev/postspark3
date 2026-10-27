import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
export const releaseOwner = "11111111-1111-4111-8111-111111111111",
  releaseOther = "22222222-2222-4222-8222-222222222222";
export async function generationReleasePostgresFixture(options: { withoutLegacyBrandProjects?: boolean } = {}) {
  const owner = releaseOwner,
    otherOwner = releaseOther,
    thirdOwner = "33333333-3333-4333-8333-333333333333";
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE SCHEMA postspark;
    GRANT USAGE ON SCHEMA auth, postspark TO anon, authenticated, service_role;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${owner}'), ('${otherOwner}'), ('${thirdOwner}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE postspark.generation_runs(
      id uuid PRIMARY KEY, user_uuid uuid NOT NULL, status text NOT NULL,
      input_type text NOT NULL, input_content text NOT NULL, platform text NOT NULL,
      post_mode text NOT NULL, creation_mode text NOT NULL, requested_model text NOT NULL,
      effective_models jsonb NOT NULL DEFAULT '[]'::jsonb, output_snapshot jsonb,
      error_message text,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE postspark.generation_runs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY run_select_own ON postspark.generation_runs FOR SELECT USING (user_uuid=auth.uid());
    GRANT SELECT ON postspark.generation_runs TO authenticated;
    CREATE TABLE postspark.design_components(
      id uuid PRIMARY KEY, definition_hash text NOT NULL, definition jsonb NOT NULL,
      kind text NOT NULL, status text NOT NULL, actor_id uuid NOT NULL REFERENCES auth.users(id)
    );
    CREATE TABLE postspark.design_component_assets(
      component_id uuid NOT NULL REFERENCES postspark.design_components(id), asset_id text NOT NULL,
      PRIMARY KEY(component_id,asset_id)
    );
    CREATE TABLE postspark.design_catalog_assets(id text PRIMARY KEY, manifest jsonb NOT NULL);
    CREATE TABLE postspark.design_component_asset_grants(
      user_uuid uuid NOT NULL REFERENCES auth.users(id), asset_id text NOT NULL,
      component_id uuid NOT NULL REFERENCES postspark.design_components(id),
      PRIMARY KEY(user_uuid,asset_id,component_id)
    );
  `);
  await pg.exec(`
    CREATE TABLE postspark.design_component_search_documents(component_id uuid,definition_hash text,card jsonb);
    CREATE TABLE postspark.posts(id bigint PRIMARY KEY);
    CREATE TABLE postspark.profiles(id uuid PRIMARY KEY,plan text,sparks integer NOT NULL);
    INSERT INTO postspark.profiles VALUES ('${owner}','PRO',150),('${otherOwner}','FREE',150),('${thirdOwner}','DEV',150);
    CREATE TABLE postspark.next_spark_reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_uuid uuid REFERENCES postspark.profiles(id),run_id uuid,nonce text,amount integer,status text DEFAULT 'reserved',expires_at timestamptz DEFAULT now()+interval '15 minutes',error_detail text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(user_uuid,nonce));
    CREATE TABLE postspark.spark_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,amount integer,description text,generation_id uuid,metadata jsonb);
    CREATE FUNCTION postspark.next_reserve_sparks_v2(p_user_uuid uuid,p_nonce text,p_amount integer) RETURNS TABLE(reservation_id uuid,status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
    DECLARE balance integer; held integer; res postspark.next_spark_reservations%ROWTYPE;
    BEGIN
      SELECT p.sparks INTO balance FROM postspark.profiles p WHERE p.id=p_user_uuid FOR UPDATE;
      SELECT * INTO res FROM postspark.next_spark_reservations r WHERE r.user_uuid=p_user_uuid AND r.nonce=p_nonce;
      IF FOUND THEN RETURN QUERY SELECT res.id,res.status; RETURN; END IF;
      SELECT coalesce(sum(r.amount),0) INTO held FROM postspark.next_spark_reservations r WHERE r.user_uuid=p_user_uuid AND r.status='reserved' AND r.expires_at>now();
      IF balance-held<p_amount THEN RETURN QUERY SELECT NULL::uuid,'insufficient_sparks'::text; RETURN; END IF;
      INSERT INTO postspark.next_spark_reservations(user_uuid,nonce,amount) VALUES(p_user_uuid,p_nonce,p_amount) RETURNING * INTO res;
      RETURN QUERY SELECT res.id,res.status;
    END $$;
    CREATE FUNCTION postspark.next_commit_reservation_v2(p_reservation_id uuid,p_description text,p_metadata jsonb DEFAULT '{}') RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
    DECLARE res postspark.next_spark_reservations%ROWTYPE;
    BEGIN
      SELECT * INTO res FROM postspark.next_spark_reservations WHERE id=p_reservation_id FOR UPDATE;
      IF res.status='committed' THEN RETURN true; END IF;
      IF res.status<>'reserved' OR res.expires_at<=now() THEN RETURN false; END IF;
      UPDATE postspark.profiles SET sparks=sparks-res.amount WHERE id=res.user_uuid;
      INSERT INTO postspark.spark_transactions(user_id,type,amount,description,generation_id,metadata) VALUES(res.user_uuid,'debit',res.amount,p_description,res.run_id,p_metadata);
      UPDATE postspark.next_spark_reservations SET status='committed' WHERE id=res.id;
      RETURN true;
    END $$;
    CREATE FUNCTION postspark.next_refund_reservation_v2(p_reservation_id uuid,p_reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
    BEGIN
      UPDATE postspark.next_spark_reservations SET status='refunded',error_detail=p_reason WHERE id=p_reservation_id AND status='reserved';
      RETURN FOUND OR EXISTS(SELECT 1 FROM postspark.next_spark_reservations WHERE id=p_reservation_id AND status='refunded');
    END $$;
  `);
  for (const migration of [
    "0034_orchestrated_generation.sql",
    "0035_generation_lease_conflict.sql",
    "0036_generation_billing.sql",
    "0038_generation_recent_selections_replay.sql",
    "0039_brand_projects.sql",
    "0040_catalog_revisions.sql",
    "0041_local_demand_generation.sql",
    "0042_gallery_previews.sql",
    "0043_brand_capture_and_reconciliation.sql",
  ]) {
    if (options.withoutLegacyBrandProjects && migration === "0039_brand_projects.sql") continue;
    await pg.exec(
      readFileSync(
        new URL(`../../../drizzle/${migration}`, import.meta.url),
        "utf8"
      )
    );
  }
  return pg;
}
