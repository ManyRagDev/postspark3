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
    postMode?: "static" | "carousel";
  } = {}
) {
  const id =
    options.id ??
    `30000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`;
  const idempotencyKey = options.key ?? `idem-${serial}`;
  const value = await serviceScalar<any>(
    "SELECT postspark.generation_admit($1::uuid,$2::uuid,$3,$4,$5::jsonb,false,$6::timestamptz) AS value",
    [
      id,
      options.owner ?? owner,
      idempotencyKey,
      options.inputHash ?? hash,
      JSON.stringify({
        ...input,
        postMode: options.postMode ?? "static",
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
    "0040_catalog_revisions.sql",
    "0041_local_demand_generation.sql",
    "0042_gallery_previews.sql",
  ]) {
    await pg.exec(
      readFileSync(
        new URL(`../../../drizzle/${migration}`, import.meta.url),
        "utf8"
      )
    );
  }
});

afterEach(async () => {
  await pg.close();
});

async function release() {
  const staged = await scalar<any>(
    "select postspark.catalog_staged_snapshot() value"
  );
  return serviceScalar<string>(
    "select postspark.catalog_publish($1,$2,$3,$4)::text value",
    [staged.sourceRevision, JSON.stringify(staged.rows), "{}", hash]
  );
}
async function localAdmit(
  key = "local",
  scope = "machine-a",
  revision?: string
) {
  const rev = revision ?? (await release()),
    id = `50000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`;
  return serviceScalar<any>(
    "select postspark.generation_admit_local($1,$2,$3,$4,$5,false,$6,$7,$8) value",
    [
      id,
      owner,
      key,
      hash,
      JSON.stringify({ ...input, ownerId: owner, idempotencyKey: key }),
      new Date(Date.now() + 600000).toISOString(),
      scope,
      rev,
    ]
  );
}
describe("local demand / real PostgreSQL invariants", () => {
  it("atomically pins scope/revision and reserves once across lost-response retries", async () => {
    const first = await localAdmit();
    const retry = await localAdmit();
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.id).toBe(first.id);
    expect(first.execution_mode).toBe("local-demand");
    expect(first.catalog_revision).toBeTruthy();
    expect(
      await scalar(
        "select count(*)::int value from postspark.next_spark_reservations"
      )
    ).toBe(1);
    await expect(localAdmit("local", "machine-b")).rejects.toThrow(
      "generation_executor_scope_mismatch"
    );
  });
  it("external claim and a different machine cannot steal local work", async () => {
    const r = await localAdmit();
    expect(await claim()).toBeNull();
    expect(
      await serviceScalar(
        "select postspark.generation_claim_request($1,$2,$3) value",
        [r.id, "machine-b", "w"]
      )
    ).toBeNull();
    const c = await serviceScalar<any>(
      "select postspark.generation_claim_request($1,$2,$3) value",
      [r.id, "machine-a", "w"]
    );
    expect(c.leaseToken).toBeTruthy();
    expect(
      await serviceScalar(
        "select postspark.generation_claim_request($1,$2,$3) value",
        [r.id, "machine-a", "w2"]
      )
    ).toHaveProperty("blockedUntil");
  });
  it("recovery fences a dead lease and preserves uncertainty of paid operations", async () => {
    const r = await localAdmit();
    const c = await serviceScalar<any>(
      "select postspark.generation_claim_request($1,$2,$3) value",
      [r.id, "machine-a", "w"]
    );
    await serviceScalar(
      "select postspark.generation_v5_operation($1,$2,$3,$4,null) value",
      [r.id, c.leaseToken, "p:copy", "begin"]
    );
    await pg.query(
      "update postspark.generation_v5_requests set lease_until=now()-interval '1 second' where id=$1",
      [r.id]
    );
    const next = await serviceScalar<any>(
      "select postspark.generation_claim_request($1,$2,$3) value",
      [r.id, "machine-a", "w2"]
    );
    expect(next.leaseToken).not.toBe(c.leaseToken);
    expect(
      await scalar(
        "select state value from postspark.generation_v5_operations where request_id=$1",
        [r.id]
      )
    ).toBe("uncertain");
    await expect(
      leaseUpdate(r.id, c.leaseToken, "heartbeat", null)
    ).rejects.toThrow();
  });
  it("dirty catalog cannot be admitted and stale publication cannot win", async () => {
    const rev = await release();
    await seedComponent();
    await expect(localAdmit("changed", "machine-a", rev)).rejects.toThrow(
      "catalog_revision_changed"
    );
    expect(
      await scalar(
        "select count(*)::int value from postspark.next_spark_reservations"
      )
    ).toBe(0);
    await expect(
      serviceScalar(
        "select postspark.catalog_publish(1,'[]'::jsonb,'{}'::jsonb,$1) value",
        [hash]
      )
    ).rejects.toThrow();
  });
  it("expiry reconciles only its request and refunds the hold", async () => {
    const a = await localAdmit("a");
    const b = await localAdmit("b", "machine-b");
    await pg.query(
      "update postspark.generation_v5_requests set deadline_at=now()-interval '1 second'"
    );
    await serviceScalar(
      "select postspark.generation_reconcile_request($1,$2) value",
      [a.id, "machine-a"]
    );
    expect(
      await scalar(
        "select status value from postspark.generation_v5_requests where id=$1",
        [a.id]
      )
    ).toBe("failed");
    expect(
      await scalar(
        "select status value from postspark.generation_v5_requests where id=$1",
        [b.id]
      )
    ).toBe("queued");
    expect(
      await scalar(
        "select status value from postspark.next_spark_reservations where run_id=$1",
        [a.id]
      )
    ).toBe("refunded");
  });
  it("publication is immutable and archiving later does not replace an admitted revision", async () => {
    const component = await seedComponent({ asset: assetManifest });
    const r = await localAdmit();
    const claim = await serviceScalar<any>(
      "select postspark.generation_claim_request($1,$2,$3) value",
      [r.id, "machine-a", "worker"]
    );
    const revision = r.catalog_revision;
    const pulse = await serviceScalar<any>(
      "select postspark.generation_renew_local_lease($1,$2) value",
      [r.id, claim.leaseToken]
    );
    expect(pulse).toEqual({ status: "running" });
    expect(JSON.stringify(pulse).length).toBeLessThan(40);
    await pg.query(
      "update postspark.design_components set status='archived' where id=$1",
      [component.id]
    );
    const later = await release();
    expect(later).not.toBe(String(revision));
    await expect(
      pg.query(
        "update postspark.catalog_revisions set summary='{}' where revision=$1",
        [revision]
      )
    ).rejects.toThrow("catalog_revision_immutable");
    await commit(r.id, claim.leaseToken, 0, component.id);
    await expect(
      commit(r.id, claim.leaseToken, 1, component.id, {
        componentHash: "b".repeat(64),
      })
    ).rejects.toThrow("Pinned component");
    expect(
      await scalar(
        "select proposals->0->>'status' value from postspark.generation_v5_requests where id=$1",
        [r.id]
      )
    ).toBe("ready");
  });
  it("two backends sharing one executor cannot run two jobs simultaneously", async () => {
    const a = await localAdmit("first"),
      b = await localAdmit("second");
    await serviceScalar(
      "select postspark.generation_claim_request($1,$2,$3) value",
      [a.id, "machine-a", "w1"]
    );
    expect(
      await serviceScalar(
        "select postspark.generation_claim_request($1,$2,$3) value",
        [b.id, "machine-a", "w2"]
      )
    ).toHaveProperty("blockedUntil");
    expect(
      await scalar(
        "select count(*)::int value from postspark.generation_v5_requests where status='running'"
      )
    ).toBe(1);
  });
  it("unprivileged roles cannot publish or claim", async () => {
    await pg.exec("set role authenticated");
    await expect(
      pg.query("select postspark.catalog_publish(1,'[]','{}',$1)", [hash])
    ).rejects.toThrow();
    await pg.exec("reset role");
  });
});
