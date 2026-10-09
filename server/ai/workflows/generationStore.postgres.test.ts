import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const owner = "11111111-1111-4111-8111-111111111111";
const otherOwner = "22222222-2222-4222-8222-222222222222";
const thirdOwner = "33333333-3333-4333-8333-333333333333";
const hash = "a".repeat(64);
const assetId = "catalog-test-image";
const assetHash = "b".repeat(64);
const assetManifest = {
  id: assetId,
  kind: "catalog",
  sha256: assetHash,
  mimeType: "image/png",
  bytes: 42,
};

const input = {
  inputType: "text",
  content: "A launch brief",
  platform: "instagram",
  postMode: "static",
  creationMode: "ideation",
  idempotencyKey: "key",
};

let pg: PGlite;
let serial = 0;

async function scalar<T = any>(
  query: string,
  params: unknown[] = []
): Promise<T> {
  const result = await pg.query(query, params);
  return (result.rows[0] as any)?.value as T;
}

async function serviceScalar<T = any>(
  query: string,
  params: unknown[] = []
): Promise<T> {
  await pg.query("SET ROLE service_role");
  try {
    return await scalar<T>(query, params);
  } finally {
    await pg.query("RESET ROLE");
  }
}

async function admit(
  options: {
    owner?: string;
    key?: string;
    inputHash?: string;
    id?: string;
    deadlineAt?: string;
  } = {}
) {
  const id =
    options.id ??
    `30000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`;
  const idempotencyKey = options.key ?? `idem-${serial}`;
  const value = await serviceScalar<any>(
    "SELECT postspark.generation_v5_admit($1::uuid,$2::uuid,$3,$4,$5::jsonb,false,$6::timestamptz) AS value",
    [
      id,
      options.owner ?? owner,
      idempotencyKey,
      options.inputHash ?? hash,
      JSON.stringify({
        ...input,
        ownerId: options.owner ?? owner,
        idempotencyKey,
      }),
      options.deadlineAt ?? new Date(Date.now() + 600_000).toISOString(),
    ]
  );
  return value as Record<string, any>;
}

async function claim() {
  return serviceScalar<any>(
    "SELECT postspark.generation_v5_claim('worker-test') AS value"
  );
}

async function leaseUpdate(
  id: string,
  token: string,
  action: string,
  payload: unknown
) {
  return serviceScalar<any>(
    "SELECT postspark.generation_v5_lease_update($1::uuid,$2::uuid,$3,$4::jsonb) AS value",
    [id, token, action, JSON.stringify(payload)]
  );
}

async function seedComponent(
  options: {
    id?: string;
    definitionHash?: string;
    status?: string;
    asset?: typeof assetManifest | null;
    linkAsset?: boolean;
  } = {}
) {
  const id =
    options.id ??
    `40000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`;
  const definitionHash = options.definitionHash ?? hash;
  await pg.query(
    "INSERT INTO postspark.design_components(id,definition_hash,definition,kind,status,actor_id) VALUES($1,$2,$3::jsonb,'content',$4,$5)",
    [
      id,
      definitionHash,
      JSON.stringify({
        completeDesign: { baselineVerified: true, family: "family-test" },
      }),
      options.status ?? "approved",
      owner,
    ]
  );
  if (options.asset) {
    await pg.query(
      "INSERT INTO postspark.design_catalog_assets(id,manifest) VALUES($1,$2::jsonb)",
      [options.asset.id, JSON.stringify(options.asset)]
    );
    if (options.linkAsset !== false) {
      await pg.query(
        "INSERT INTO postspark.design_component_assets(component_id,asset_id) VALUES($1,$2)",
        [id, options.asset.id]
      );
    }
  }
  return { id, definitionHash };
}

function readyDelivery(
  id: string,
  slot: number,
  componentId: string,
  componentHash = hash,
  asset: unknown = assetManifest
) {
  const family = "family-test";
  return {
    contractVersion: 1,
    proposalId: `p-${id}-${slot}`,
    runId: id,
    slot,
    revision: 1,
    status: "ready",
    findings: [],
    diagnostics: [],
    bundle: {
      runId: id,
      traceId: id,
      slot,
      family,
      slides: [
        {
          id: `slide-${slot}`,
          role: "static",
          composition: {
            origin: {
              componentAssembly: {
                completeDesign: { family, baselineVerified: true },
                componentIds: [componentId],
                componentHashes: [componentHash],
              },
            },
            assets: asset ? [asset] : [],
          },
        },
      ],
    },
  };
}

async function commit(
  id: string,
  token: string,
  slot: number,
  componentId: string,
  options: {
    componentHash?: string;
    asset?: unknown;
    projection?: unknown;
  } = {}
) {
  const delivery = readyDelivery(
    id,
    slot,
    componentId,
    options.componentHash,
    options.asset
  );
  return leaseUpdate(id, token, "commit", {
    delivery,
    projection: options.projection ?? { id: `projection-slot-${slot}`, slot },
  });
}

beforeEach(async () => {
  serial = 0;
  pg = new PGlite();
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
  for (const migration of [
    "0034_orchestrated_generation.sql",
    "0035_generation_lease_conflict.sql",
  ]) {
    await pg.exec(
      readFileSync(new URL(`../../../drizzle/${migration}`, import.meta.url), "utf8")
    );
  }
});

afterEach(async () => {
  await pg.close();
});

describe("generation V5 PostgreSQL state", () => {
  it("can repeat unpaid reads after interruption but never paid selection or copy", async () => {
    const request = await admit();
    const lease = await claim();
    await serviceScalar(
      "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'prepare:catalog','begin',NULL) AS value",
      [request.id, lease.leaseToken]
    );
    await serviceScalar(
      "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'prepare:catalog','uncertain',NULL) AS value",
      [request.id, lease.leaseToken]
    );
    const resumed = await serviceScalar<any>(
      "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'prepare:catalog','begin_safe',NULL) AS value",
      [request.id, lease.leaseToken]
    );
    expect(resumed.state).toBe("new");
    await expect(
      serviceScalar(
        "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'prepare:selection','begin_safe',NULL) AS value",
        [request.id, lease.leaseToken]
      )
    ).rejects.toThrow("Only unpaid preparation reads");
    await expect(
      serviceScalar(
        "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'proposal:copy','begin_safe',NULL) AS value",
        [request.id, lease.leaseToken]
      )
    ).rejects.toThrow("Only unpaid preparation reads");
  });
  it("keeps owner-scoped idempotency atomic and enforces two active requests", async () => {
    await expect(
      serviceScalar(
        "SELECT postspark.generation_v5_admit($1::uuid,$2::uuid,$3,$4,$5::jsonb,false,$6::timestamptz) AS value",
        [
          "30000000-0000-4000-8000-999999999998",
          owner,
          "wrong-owner",
          hash,
          JSON.stringify({
            ...input,
            ownerId: otherOwner,
            idempotencyKey: "wrong-owner",
          }),
          new Date(Date.now() + 600000).toISOString(),
        ]
      )
    ).rejects.toThrow("Input owner does not match");
    const first = await admit({ key: "same" });
    const retry = await admit({
      key: "same",
      id: "30000000-0000-4000-8000-999999999999",
    });
    expect(first.id).toBe(retry.id);
    expect(retry.created).toBe(false);
    await expect(
      admit({ key: "same", inputHash: "c".repeat(64) })
    ).rejects.toThrow(/Idempotency key reused/);
    await admit({ key: "second" });
    await expect(admit({ key: "third" })).rejects.toThrow(
      /Active generation limit reached/
    );

    await pg.query("SET ROLE authenticated");
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    const own = await pg.query(
      "SELECT id FROM postspark.generation_v5_requests ORDER BY id"
    );
    expect(own.rows).toHaveLength(2);
    await pg.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      otherOwner,
    ]);
    const foreign = await pg.query(
      "SELECT id FROM postspark.generation_v5_requests"
    );
    expect(foreign.rows).toHaveLength(0);
    await expect(
      pg.query("SELECT postspark.generation_v5_claim('forbidden')")
    ).rejects.toThrow(/permission denied/);
  });

  it("fences stale lease mutations and marks interrupted operations uncertain on reclaim", async () => {
    const request = await admit();
    const original = await claim();
    await expect(
      leaseUpdate(request.id, otherOwner, "heartbeat", null)
    ).rejects.toMatchObject({ code: "PT409", message: "Generation lease lost" });
    await expect(
      serviceScalar(
        "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'probe','begin',NULL) AS value",
        [request.id, otherOwner]
      )
    ).rejects.toMatchObject({ code: "PT409", message: "Generation lease lost" });
    await expect(
      serviceScalar(
        "SELECT postspark.generation_v5_finish($1::uuid,$2::uuid,'completed',NULL) AS value",
        [request.id, otherOwner]
      )
    ).rejects.toMatchObject({ code: "PT409", message: "Generation lease lost" });
    const started = await serviceScalar<any>(
      "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'selection:0','begin',NULL) AS value",
      [request.id, original.leaseToken]
    );
    expect(started.state).toBe("new");
    await pg.query(
      "UPDATE postspark.generation_v5_requests SET lease_until=now()-interval '1 second' WHERE id=$1",
      [request.id]
    );
    const reclaimed = await claim();
    expect(reclaimed.id).toBe(request.id);
    expect(reclaimed.leaseToken).not.toBe(original.leaseToken);
    const uncertain = await serviceScalar<any>(
      "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'selection:0','begin',NULL) AS value",
      [request.id, reclaimed.leaseToken]
    );
    expect(uncertain.state).toBe("uncertain");

    const cacheStart = await serviceScalar<any>(
      "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'copy:0','begin',NULL) AS value",
      [request.id, reclaimed.leaseToken]
    );
    expect(cacheStart.state).toBe("new");
    const result = { text: "persisted provider result" };
    const complete = await serviceScalar<any>(
      "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'copy:0','complete',$3::jsonb) AS value",
      [request.id, reclaimed.leaseToken, JSON.stringify(result)]
    );
    expect(complete.state).toBe("completed");
    const cached = await serviceScalar<any>(
      "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'copy:0','begin',NULL) AS value",
      [request.id, reclaimed.leaseToken]
    );
    expect(cached).toMatchObject({ state: "completed", result });
  });

  it("limits all workers together to three live request leases", async () => {
    await admit({ owner, key: "owner-a" });
    await admit({ owner, key: "owner-b" });
    await admit({ owner: otherOwner, key: "owner-c" });
    await admit({ owner: otherOwner, key: "owner-d" });
    const leases = [await claim(), await claim(), await claim()];
    expect(leases.every(Boolean)).toBe(true);
    expect(await claim()).toBeNull();
    expect(
      (
        await pg.query(
          "SELECT count(*)::int AS count FROM postspark.generation_v5_requests WHERE lease_until>now()"
        )
      ).rows[0]
    ).toEqual({ count: 3 });
  });

  it("commits ready and grants catalog assets in one transaction, preserving empty slot positions", async () => {
    const request = await admit();
    const lease = await claim();
    const component = await seedComponent({ asset: assetManifest });
    const slot2 = await commit(request.id, lease.leaseToken, 2, component.id, {
      projection: { slot: 2, text: "third" },
    });
    expect(slot2.proposals[2].status).toBe("ready");
    expect(slot2.proposals[0].status).toBe("planned");
    const slot0 = await commit(request.id, lease.leaseToken, 0, component.id, {
      projection: { slot: 0, text: "first" },
    });
    expect(slot0.proposals[0].status).toBe("ready");

    const grants = await pg.query(
      "SELECT user_uuid,asset_id,component_id FROM postspark.design_component_asset_grants"
    );
    expect(grants.rows).toEqual([
      { user_uuid: owner, asset_id: assetId, component_id: component.id },
    ]);
    const history = await scalar<any>(
      "SELECT output_snapshot AS value FROM postspark.generation_runs WHERE id=$1",
      [request.id]
    );
    expect(history).toEqual([
      { slot: 0, text: "first" },
      null,
      { slot: 2, text: "third" },
    ]);

    const finished = await serviceScalar<any>(
      "SELECT postspark.generation_v5_finish($1::uuid,$2::uuid,'failed','slot 1 failed') AS value",
      [request.id, lease.leaseToken]
    );
    expect(finished.status).toBe("partial");
    expect(finished.proposals.map((p: any) => p.status)).toEqual([
      "ready",
      "failed",
      "ready",
    ]);
  });

  it("rejects ineligible component hashes and mismatched asset provenance without granting", async () => {
    const request = await admit();
    const lease = await claim();
    const archived = await seedComponent({
      status: "archived",
      asset: assetManifest,
    });
    await expect(
      commit(request.id, lease.leaseToken, 0, archived.id)
    ).rejects.toThrow(/Component is no longer eligible/);
    expect(
      (await pg.query("SELECT * FROM postspark.design_component_asset_grants"))
        .rows
    ).toHaveLength(0);

    await pg.query(
      "UPDATE postspark.design_components SET status='approved' WHERE id=$1",
      [archived.id]
    );
    await expect(
      commit(request.id, lease.leaseToken, 0, archived.id, {
        componentHash: "c".repeat(64),
      })
    ).rejects.toThrow(/Component is no longer eligible/);
    expect(
      (await pg.query("SELECT * FROM postspark.design_component_asset_grants"))
        .rows
    ).toHaveLength(0);

    const missingLink = await seedComponent({
      id: "50000000-0000-4000-8000-000000000001",
      asset: { ...assetManifest, id: "unlinked-asset" },
      linkAsset: false,
    });
    await expect(
      commit(request.id, lease.leaseToken, 1, missingLink.id, {
        asset: { ...assetManifest, id: "unlinked-asset" },
      })
    ).rejects.toThrow(/Catalog asset is not part/);
    expect(
      (await pg.query("SELECT * FROM postspark.design_component_asset_grants"))
        .rows
    ).toHaveLength(0);
  });

  it("accepts only exact bundled font manifests and never grants them as catalog assets", async () => {
    const request = await admit();
    const lease = await claim();
    const component = await seedComponent();
    const bundled = {
      id: "font-afec86997fdaf54af1f59358fa2c1e2a0f1d04146edad18e5cd141d0384a7548",
      kind: "bundled",
      sha256:
        "afec86997fdaf54af1f59358fa2c1e2a0f1d04146edad18e5cd141d0384a7548",
      mimeType: "font/woff2",
      bytes: 12512,
      family: "Arsenal_afec86997fdaf54a",
      weight: 400,
      license: "open-source",
    };
    await commit(request.id, lease.leaseToken, 0, component.id, {
      asset: bundled,
    });
    expect(
      (await pg.query("SELECT * FROM postspark.design_component_asset_grants"))
        .rows
    ).toHaveLength(0);

    const badRequest = await admit({ key: "unknown-bundled" });
    const otherLease = await claim();
    await expect(
      commit(badRequest.id, otherLease.leaseToken, 0, component.id, {
        asset: { ...bundled, sha256: "d".repeat(64) },
      })
    ).rejects.toThrow(/Bundled asset is not in the application manifest/);
    expect(
      (await pg.query("SELECT * FROM postspark.design_component_asset_grants"))
        .rows
    ).toHaveLength(0);
  });

  it("keeps a committed ready proposal immutable when the owner cancels remaining work", async () => {
    const request = await admit();
    const lease = await claim();
    const component = await seedComponent({ asset: assetManifest });
    const delivery = readyDelivery(request.id, 0, component.id);
    const payload = { delivery, projection: { slot: 0, text: "committed" } };
    const committed = await leaseUpdate(
      request.id,
      lease.leaseToken,
      "commit",
      payload
    );
    const duplicate = await leaseUpdate(
      request.id,
      lease.leaseToken,
      "checkpoint",
      payload
    );
    expect(duplicate.proposals[0]).toEqual(committed.proposals[0]);
    await expect(
      leaseUpdate(request.id, lease.leaseToken, "checkpoint", {
        delivery: { ...delivery, status: "running", bundle: undefined },
        projection: null,
      })
    ).rejects.toThrow(/Terminal proposal is immutable/);

    const cancelled = await serviceScalar<any>(
      "SELECT postspark.generation_v5_cancel($1::uuid,$2::uuid) AS value",
      [request.id, owner]
    );
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.proposals.map((p: any) => p.status)).toEqual([
      "ready",
      "cancelled",
      "cancelled",
    ]);
    const grant = await pg.query(
      "SELECT * FROM postspark.design_component_asset_grants WHERE user_uuid=$1",
      [owner]
    );
    expect(grant.rows).toHaveLength(1);
  });

  it("finishes an expired request as partial when a delivery was already committed", async () => {
    const request = await admit();
    const lease = await claim();
    const component = await seedComponent({ asset: assetManifest });
    await commit(request.id, lease.leaseToken, 1, component.id);
    await pg.query(
      "UPDATE postspark.generation_v5_requests SET deadline_at=now()-interval '1 second' WHERE id=$1",
      [request.id]
    );
    const finished = await serviceScalar<any>(
      "SELECT postspark.generation_v5_finish($1::uuid,$2::uuid,'failed','deadline') AS value",
      [request.id, lease.leaseToken]
    );
    expect(finished.status).toBe("partial");
    expect(finished.error_reason).toBe("deadline_expired");
    expect(finished.proposals.map((p: any) => p.status)).toEqual([
      "expired",
      "ready",
      "expired",
    ]);
  });
});
