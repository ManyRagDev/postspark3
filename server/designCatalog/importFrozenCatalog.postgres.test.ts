import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { it, expect } from "vitest";
import {
  generationReleasePostgresFixture,
  releaseOwner,
} from "../ai/workflows/generationReleasePostgres.fixture";
import { completeDesignTestDefinitions } from "../../shared/completeDesignGeneration.fixture";
import { createComponentDefinition } from "../../shared/componentAssembly";
import { buildCatalogPublication } from "./versionedCatalog";
import { resolveGenerationModelConfig } from "../ai/generationModel";
import {
  applyFrozenCatalog,
  type FrozenImportPort,
} from "./importFrozenCatalog";
it("imports idempotently, admits the staged revision and claims it externally without activating or changing catalog access", async () => {
  const pg = await generationReleasePostgresFixture();
  try {
    await pg.exec(`ALTER TABLE auth.users ADD COLUMN raw_app_meta_data jsonb DEFAULT '{}';
   ALTER TABLE postspark.generation_runs ADD COLUMN latency_ms integer, ADD COLUMN total_tokens integer, ADD COLUMN estimated_cost_usd numeric;
   ALTER TABLE postspark.design_components ADD COLUMN source_key text, ADD COLUMN roles text[], ADD COLUMN densities text[], ADD COLUMN aspect_ratios text[];
   ALTER TABLE postspark.design_component_search_documents ADD COLUMN descriptor_version text, ADD COLUMN projected text, ADD COLUMN descriptor jsonb;
   CREATE UNIQUE INDEX frozen_test_search_identity ON postspark.design_component_search_documents(component_id);
   CREATE TABLE postspark.design_component_evidence(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),component_id uuid REFERENCES postspark.design_components(id),definition_hash text,kind text,decision text,actor_id uuid REFERENCES auth.users(id),metrics jsonb);`);
    for (const name of [
      "0044_generation_model_config.sql",
      "0045_staged_catalog_local_admission.sql",
      "0047_catalog_stage_batch_performance.sql",
      "0048_catalog_snapshot_batch_performance.sql",
      "0049_catalog_stage_row_validation.sql",
      "0050_catalog_stage_timing.sql",
      "0051_catalog_stage_delta.sql",
      "0052_generation_preparation_reconciliation.sql",
      "0053_generation_model_choices.sql",
      "0057_generation_task_routing.sql",
      "0060_generation_task_routing_v2.sql",
      "0064_generation_progress_reads.sql",
      "0065_demand_executor.sql",
      "0068_app_access.sql",
      "0070_trial_catalog_admission.sql",
    ])
      await pg.exec(
        readFileSync(new URL(`../../drizzle/${name}`, import.meta.url), "utf8")
      );
    const definitions = completeDesignTestDefinitions()
      .slice(0, 1)
      .map(d =>
        createComponentDefinition({
          ...d,
          assets: d.assets.map(a => ({ ...a, kind: "catalog" })),
        })
      );
    const manifests = Array.from(
      new Map(
        definitions.flatMap(d => d.assets.map(a => [a.id, a] as const))
      ).values()
    );
    const value = async (sql: string, args: unknown[] = []) =>
      (await pg.query<{ value: any }>(sql, args)).rows[0].value;
    const port: FrozenImportPort = {
      async assertAdmin() {
        /* Auth API independently tested by administrative boundary; SQL fixture owns this identity. */
      },
      async inspect() {
        return {
          activeRevision: await value(
            "SELECT active_revision::text value FROM postspark.catalog_state"
          ),
          components: (
            await pg.query<any>(
              "SELECT id,definition_hash AS hash,status,definition FROM postspark.design_components"
            )
          ).rows,
        };
      },
      async checkAsset() {},
      async upload(asset) {
        await pg.query(
          "INSERT INTO postspark.design_catalog_assets VALUES ($1,$2::jsonb) ON CONFLICT DO NOTHING",
          [asset.id, JSON.stringify(asset)]
        );
      },
      async stage(ds, actor) {
        const source = await value(
          "SELECT postspark.catalog_staged_snapshot() value"
        );
        const built = await buildCatalogPublication(
          source,
          ds.map(definition => ({ definition, actor })),
          true
        );
        const revision = await value(
          "SELECT postspark.catalog_stage($1,$2::jsonb,$3::jsonb,$4,$5::jsonb,$6::jsonb)::text value",
          [
            source.sourceRevision,
            JSON.stringify(built.snapshot.rows),
            JSON.stringify(built.summary),
            built.hash,
            JSON.stringify(built.registrations),
            JSON.stringify(built.indexes),
          ]
        );
        return { revision, hash: built.hash };
      },
      async grant(ds, actor) {
        for (const d of ds)
          for (const a of d.assets)
            await pg.query(
              "INSERT INTO postspark.design_component_asset_grants VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
              [actor, a.id, d.id]
            );
      },
    };
    const bundle = {
      sourceHash: "a".repeat(64),
      definitions,
      assets: manifests.map(manifest => ({ manifest, bytes: Buffer.alloc(0) })),
      families: 1,
    };
    const first = await applyFrozenCatalog(bundle, releaseOwner, port),
      second = await applyFrozenCatalog(bundle, releaseOwner, port);
    expect(second).toEqual(first);
    expect(
      await value("SELECT active_revision value FROM postspark.catalog_state")
    ).toBeNull();
    expect(
      Number(
        await value("SELECT count(*) value FROM postspark.catalog_revisions")
      )
    ).toBe(1);
    expect(
      Number(
        await value(
          "SELECT count(*) value FROM postspark.design_component_search_documents"
        )
      )
    ).toBe(0);
    expect(
      Number(
        await value(
          "SELECT count(*) value FROM postspark.design_component_evidence"
        )
      )
    ).toBe(definitions.length);
    const grants = (
      await pg.query<{ user_uuid: string }>(
        "SELECT user_uuid FROM postspark.design_component_asset_grants"
      )
    ).rows;
    expect(grants.length).toBe(
      definitions.reduce((n, d) => n + d.assets.length, 0)
    );
    expect(grants.every(g => g.user_uuid === releaseOwner)).toBe(true);

    // Exercise the real staging payload against 0070, not a hand-built catalog
    // row. Storage byte verification belongs to the importer boundary tests;
    // this fixture deliberately supplies manifests without external Storage.
    const frozenRows = (await pg.query<any>(
      "SELECT component_id,definition_hash,payload FROM postspark.catalog_revision_definitions WHERE revision=$1 ORDER BY component_id",
      [first.revision]
    )).rows;
    expect(frozenRows).toHaveLength(definitions.length);
    for (const d of definitions) {
      expect(frozenRows.find(r => r.component_id === d.id)).toMatchObject({
        definition_hash: d.hash,
        payload: { definition: d, design_components: { status: "draft", definition_hash: d.hash } },
      });
    }
    const catalogState = async () => value(`SELECT jsonb_build_object(
      'state',(SELECT to_jsonb(s) FROM postspark.catalog_state s),
      'definitions',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM postspark.design_components d),
      'grants',(SELECT jsonb_agg(to_jsonb(g) ORDER BY component_id,asset_id,user_uuid) FROM postspark.design_component_asset_grants g),
      'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]') FROM postspark.design_component_search_documents i),
      'evidence',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM postspark.design_component_evidence e)
    ) value`);
    const beforeAdmission = await catalogState();
    // Explicit local DEV entitlement: this test makes no paid call and must
    // inherit unlimited billing from generation_admit, not bypass its rules.
    await pg.query("UPDATE postspark.profiles SET plan='DEV' WHERE id=$1", [releaseOwner]);
    await pg.query("UPDATE auth.users SET raw_app_meta_data='{\"role\":\"admin\"}' WHERE id=$1", [releaseOwner]);
    await pg.query("INSERT INTO postspark.app_access(user_id,reason) VALUES($1,'local frozen catalog integration fixture')", [releaseOwner]);
    const configuration = resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" });
    const id = randomUUID(), key = "frozen-import-trial";
    const input = { ownerId: releaseOwner, idempotencyKey: key, inputType: "text", content: "Local frozen catalog integration", platform: "instagram", postMode: "static", creationMode: "ideation" };
    const admit = () => value(
      "SELECT postspark.generation_admit_trial_external($1::uuid,$2::uuid,$3,$4,$5::jsonb,true,now()+interval '10 minutes',$6::bigint,$7::jsonb) value",
      [id, releaseOwner, key, "a".repeat(64), JSON.stringify(input), first.revision, JSON.stringify(configuration)]
    );
    await pg.exec("SET ROLE service_role");
    try {
      const admitted = await admit();
      expect(admitted).toMatchObject({ id, created: true, status: "queued", execution_mode: "external", executor_scope: null, catalog_revision: Number(first.revision), generation_config: configuration, experimental: true, billing_mode: "unlimited", billing_reserved: 0 });
      expect(await admit()).toEqual({ ...admitted, created: false });
      const claimed = await value("SELECT postspark.generation_v5_claim('frozen-trial-worker') value");
      expect(claimed).toMatchObject({ id, status: "running", execution_mode: "external", executor_scope: null, catalog_revision: Number(first.revision), generation_config: configuration, billing_mode: "unlimited" });
      expect(claimed.leaseToken).toMatch(/^[a-f0-9-]{36}$/);
      expect(await value("SELECT postspark.generation_v5_claim('second-worker') value")).toBeNull();
    } finally {
      await pg.exec("RESET ROLE");
    }
    expect(await catalogState()).toEqual(beforeAdmission);
    expect(await value("SELECT requested_model value FROM postspark.generation_runs WHERE id=$1", [id])).toBe(configuration.model);
    expect(Number(await value("SELECT count(*) value FROM postspark.generation_v5_requests"))).toBe(1);
    expect(Number(await value("SELECT count(*) value FROM postspark.next_spark_reservations"))).toBe(0);
    expect(Number(await value("SELECT count(*) value FROM postspark.spark_transactions"))).toBe(0);
  } finally {
    await pg.close();
  }
}, 30000);
