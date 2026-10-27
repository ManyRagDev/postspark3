import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
/** Real migration/RPC execution with isolated PostgreSQL roles and catalog. */
export async function generationPostgresFixture(owner: string) {
  const pg = new PGlite();
  await pg.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA postspark;
 GRANT USAGE ON SCHEMA auth,postspark TO anon,authenticated,service_role;
 CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('${owner}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE postspark.generation_runs(id uuid PRIMARY KEY,user_uuid uuid NOT NULL,status text NOT NULL,input_type text NOT NULL,input_content text NOT NULL,platform text NOT NULL,post_mode text NOT NULL,creation_mode text NOT NULL,requested_model text NOT NULL,effective_models jsonb NOT NULL DEFAULT '[]',output_snapshot jsonb,error_message text,"createdAt" timestamptz NOT NULL DEFAULT now());
 ALTER TABLE postspark.generation_runs ENABLE ROW LEVEL SECURITY;
 CREATE POLICY own_run ON postspark.generation_runs FOR SELECT USING(user_uuid=auth.uid());
 GRANT SELECT ON postspark.generation_runs TO authenticated;
 CREATE TABLE postspark.design_components(id uuid PRIMARY KEY,definition_hash text NOT NULL,definition jsonb NOT NULL,kind text NOT NULL,status text NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id));
 CREATE TABLE postspark.design_catalog_assets(id text PRIMARY KEY,manifest jsonb NOT NULL);
 CREATE TABLE postspark.design_component_assets(component_id uuid REFERENCES postspark.design_components(id),asset_id text NOT NULL,PRIMARY KEY(component_id,asset_id));
 CREATE TABLE postspark.design_component_asset_grants(user_uuid uuid REFERENCES auth.users(id),asset_id text NOT NULL,component_id uuid REFERENCES postspark.design_components(id),PRIMARY KEY(user_uuid,asset_id,component_id));
 `);
  for (const name of [
    "0034_orchestrated_generation.sql",
    "0035_generation_lease_conflict.sql",
    "0038_generation_recent_selections_replay.sql",
  ])
    await pg.exec(
      readFileSync(new URL(`../../../drizzle/${name}`, import.meta.url), "utf8")
    );
  return pg;
}
