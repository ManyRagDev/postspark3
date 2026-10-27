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

describe("atomic durable generation finances on the existing Next ledger", () => {
  it("admits once, links the actual reservation, and never refunds an admitted request on retry/collision", async () => {
    const [a, b] = await Promise.all([
      admit({ key: "same" }),
      admit({ key: "same" }),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.billing_mode).toBe("reserved");
    expect(a.billing_ledger).toBe("next");
    expect(a.billing_reservation_id).toBeTruthy();
    const rows = (
      await pg.query("SELECT * FROM postspark.next_spark_reservations")
    ).rows as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      run_id: a.id,
      user_uuid: owner,
      amount: 10,
      status: "reserved",
    });
    await expect(
      admit({ key: "same", inputHash: "b".repeat(64) })
    ).rejects.toThrow("Idempotency key reused");
    expect(
      await scalar(
        "SELECT status AS value FROM postspark.next_spark_reservations"
      )
    ).toBe("reserved");
  });
  it("rolls back the run and request if funds/profile are unavailable and does not create a second ledger", async () => {
    await pg.query("UPDATE postspark.profiles SET sparks=9 WHERE id=$1", [
      owner,
    ]);
    await expect(admit()).rejects.toMatchObject({ code: "PT402" });
    expect(
      await scalar(
        "SELECT count(*)::int AS value FROM postspark.generation_runs"
      )
    ).toBe(0);
    expect(
      await scalar(
        "SELECT count(*)::int AS value FROM postspark.generation_v5_requests"
      )
    ).toBe(0);
    expect(
      await scalar(
        "SELECT to_regclass('postspark.spark_reservations') AS value"
      )
    ).toBeNull();
  });
  it("never over-reserves competing admission keys", async () => {
    await pg.query("UPDATE postspark.profiles SET sparks=15 WHERE id=$1", [
      owner,
    ]);
    const results = await Promise.allSettled([
      admit({ key: "first" }),
      admit({ key: "second" }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await scalar(
        "SELECT sum(amount)::int AS value FROM postspark.next_spark_reservations WHERE status='reserved'"
      )
    ).toBe(10);
  });
  it.each([0, 1, 2, 3])(
    "settles %i ready proposals exactly once across repeated cancellation and reconciliation",
    async ready => {
      const req = await admit();
      const lease = await claim();
      const component = await seedComponent();
      for (let slot = 0; slot < ready; slot++)
        await commit(req.id, lease.leaseToken, slot, component.id, {
          asset: null,
        });
      await serviceScalar(
        "SELECT postspark.generation_v5_cancel($1::uuid,$2::uuid) AS value",
        [req.id, owner]
      );
      await serviceScalar(
        "SELECT postspark.generation_v5_cancel($1::uuid,$2::uuid) AS value",
        [req.id, owner]
      );
      await serviceScalar("SELECT postspark.generation_reconcile() AS value");
      await serviceScalar(
        "SELECT postspark.generation_settle($1::uuid) AS value",
        [req.id]
      );
      const debt = ready ? 1 + ready * 3 : 0;
      expect(
        await scalar(
          "SELECT sparks AS value FROM postspark.profiles WHERE id=$1",
          [owner]
        )
      ).toBe(150 - debt);
      expect(
        await scalar(
          "SELECT count(*)::int AS value FROM postspark.spark_transactions"
        )
      ).toBe(ready ? 1 : 0);
      expect(
        await scalar(
          "SELECT billing_debited AS value FROM postspark.generation_v5_requests WHERE id=$1",
          [req.id]
        )
      ).toBe(debt);
    }
  );
  it("preserves the 40-Spark commercial carousel total and settles one delivered sequence for 16", async () => {
    const req = await admit({ postMode: "carousel" });
    expect(req.billing_reserved).toBe(40);
    expect(req.billing_preparation).toBe(4);
    expect(req.billing_per_proposal).toBe(12);
    const lease = await claim();
    const component = await seedComponent();
    await commit(req.id, lease.leaseToken, 0, component.id, { asset: null });
    await serviceScalar(
      "SELECT postspark.generation_v5_cancel($1::uuid,$2::uuid) AS value",
      [req.id, owner]
    );
    expect(
      await scalar(
        "SELECT sparks AS value FROM postspark.profiles WHERE id=$1",
        [owner]
      )
    ).toBe(134);
    expect(
      await scalar(
        "SELECT amount AS value FROM postspark.next_spark_reservations"
      )
    ).toBe(16);
  });
  it("preserves ready deliveries and settles them after deadline and worker crash, even if the old hold expired", async () => {
    const req = await admit();
    const lease = await claim();
    const component = await seedComponent();
    await commit(req.id, lease.leaseToken, 1, component.id, { asset: null });
    await pg.query(
      "UPDATE postspark.generation_v5_requests SET deadline_at=now()-interval '1 second',lease_until=now()-interval '1 second' WHERE id=$1",
      [req.id]
    );
    await pg.query(
      "UPDATE postspark.next_spark_reservations SET status='expired',expires_at=now()-interval '1 second'"
    );
    await serviceScalar("SELECT postspark.generation_reconcile() AS value");
    expect(
      await scalar(
        "SELECT status AS value FROM postspark.generation_v5_requests WHERE id=$1",
        [req.id]
      )
    ).toBe("partial");
    expect(
      await scalar(
        "SELECT sparks AS value FROM postspark.profiles WHERE id=$1",
        [owner]
      )
    ).toBe(146);
    expect(
      await scalar(
        "SELECT billing_settled_at IS NOT NULL AS value FROM postspark.generation_v5_requests WHERE id=$1",
        [req.id]
      )
    ).toBe(true);
  });
  it("rolls back a failed financial subtransaction and reconciles later without losing delivery or charging twice", async () => {
    const req = await admit();
    const lease = await claim();
    const component = await seedComponent();
    await commit(req.id, lease.leaseToken, 0, component.id, { asset: null });
    await pg.exec(
      "ALTER TABLE postspark.spark_transactions ADD CONSTRAINT fail_financial_write CHECK (false)"
    );
    await serviceScalar(
      "SELECT postspark.generation_v5_finish($1::uuid,$2::uuid,'partial',NULL) AS value",
      [req.id, lease.leaseToken]
    );
    expect(
      await scalar(
        "SELECT sparks AS value FROM postspark.profiles WHERE id=$1",
        [owner]
      )
    ).toBe(150);
    expect(
      await scalar(
        "SELECT amount AS value FROM postspark.next_spark_reservations"
      )
    ).toBe(10);
    expect(
      await scalar(
        "SELECT billing_error IS NOT NULL AS value FROM postspark.generation_v5_requests WHERE id=$1",
        [req.id]
      )
    ).toBe(true);
    await pg.exec(
      "ALTER TABLE postspark.spark_transactions DROP CONSTRAINT fail_financial_write"
    );
    await pg.query(
      "UPDATE postspark.generation_v5_requests SET billing_retry_at=now()-interval '1 second' WHERE id=$1",
      [req.id]
    );
    await serviceScalar("SELECT postspark.generation_reconcile() AS value");
    await serviceScalar("SELECT postspark.generation_reconcile() AS value");
    expect(
      await scalar(
        "SELECT sparks AS value FROM postspark.profiles WHERE id=$1",
        [owner]
      )
    ).toBe(146);
    expect(
      await scalar(
        "SELECT count(*)::int AS value FROM postspark.spark_transactions"
      )
    ).toBe(1);
  });
  it.each(["expired", "reserved"])(
    "does not overdraw funds released by a TTL-expired %s hold, and leaves a retryable financial state",
    async expiredStatus => {
      const req = await admit();
      const lease = await claim();
      const component = await seedComponent();
      await commit(req.id, lease.leaseToken, 0, component.id, { asset: null });
      await pg.query(
        "UPDATE postspark.next_spark_reservations SET status=$1,expires_at=now()-interval '1 second'",
        [expiredStatus]
      );
      await pg.query("UPDATE postspark.profiles SET sparks=1 WHERE id=$1", [
        owner,
      ]);
      await serviceScalar(
        "SELECT postspark.generation_v5_cancel($1::uuid,$2::uuid) AS value",
        [req.id, owner]
      );
      expect(
        await scalar(
          "SELECT sparks AS value FROM postspark.profiles WHERE id=$1",
          [owner]
        )
      ).toBe(1);
      expect(
        await scalar(
          "SELECT billing_error AS value FROM postspark.generation_v5_requests WHERE id=$1",
          [req.id]
        )
      ).toContain("financial reconciliation");
      expect(
        await scalar(
          "SELECT billing_settled_at AS value FROM postspark.generation_v5_requests WHERE id=$1",
          [req.id]
        )
      ).toBeNull();
      const other = await admit({ owner: otherOwner });
      await serviceScalar(
        "SELECT postspark.generation_v5_cancel($1::uuid,$2::uuid) AS value",
        [other.id, otherOwner]
      );
      expect(
        await scalar(
          "SELECT billing_settled_at IS NOT NULL AS value FROM postspark.generation_v5_requests WHERE id=$1",
          [other.id]
        )
      ).toBe(true);
    }
  );
  it("reconciles another terminal request while a permanent financial error waits for backoff", async () => {
    const a = await admit({ key: "failure-a" });
    const leaseA = await claim();
    const component = await seedComponent();
    await commit(a.id, leaseA.leaseToken, 0, component.id, { asset: null });
    const b = await admit({ owner: otherOwner, key: "failure-b" });
    const leaseB = await claim();
    await commit(b.id, leaseB.leaseToken, 0, component.id, { asset: null });
    await pg.exec(
      "ALTER TABLE postspark.spark_transactions ADD CONSTRAINT fail_financial_write CHECK (false)"
    );
    await serviceScalar(
      "SELECT postspark.generation_v5_cancel($1::uuid,$2::uuid) AS value",
      [a.id, owner]
    );
    await serviceScalar(
      "SELECT postspark.generation_v5_cancel($1::uuid,$2::uuid) AS value",
      [b.id, otherOwner]
    );
    await pg.exec(
      "ALTER TABLE postspark.spark_transactions DROP CONSTRAINT fail_financial_write"
    );
    await pg.query(
      "UPDATE postspark.next_spark_reservations SET status='expired',expires_at=now()-interval '1 second' WHERE user_uuid=$1",
      [owner]
    );
    await pg.query("UPDATE postspark.profiles SET sparks=1 WHERE id=$1", [
      owner,
    ]);
    await pg.query(
      "UPDATE postspark.generation_v5_requests SET billing_retry_at=NULL,updated_at=now()-interval '1 minute'"
    );
    await serviceScalar("SELECT postspark.generation_reconcile() AS value");
    expect(
      await scalar(
        "SELECT billing_settled_at AS value FROM postspark.generation_v5_requests WHERE id=$1",
        [a.id]
      )
    ).toBeNull();
    await serviceScalar("SELECT postspark.generation_reconcile() AS value");
    expect(
      await scalar(
        "SELECT billing_settled_at IS NOT NULL AS value FROM postspark.generation_v5_requests WHERE id=$1",
        [b.id]
      )
    ).toBe(true);
    expect(
      await scalar(
        "SELECT sparks AS value FROM postspark.profiles WHERE id=$1",
        [otherOwner]
      )
    ).toBe(146);
  });
  it("releases an admitted paid hold when the authoritative account becomes unlimited before settlement", async () => {
    const req = await admit();
    const lease = await claim();
    const component = await seedComponent();
    await commit(req.id, lease.leaseToken, 0, component.id, { asset: null });
    await pg.query("UPDATE postspark.profiles SET plan='FOUNDER' WHERE id=$1", [
      owner,
    ]);
    await serviceScalar(
      "SELECT postspark.generation_v5_cancel($1::uuid,$2::uuid) AS value",
      [req.id, owner]
    );
    expect(
      await scalar(
        "SELECT sparks AS value FROM postspark.profiles WHERE id=$1",
        [owner]
      )
    ).toBe(150);
    expect(
      await scalar(
        "SELECT billing_debited AS value FROM postspark.generation_v5_requests WHERE id=$1",
        [req.id]
      )
    ).toBe(0);
    expect(
      await scalar(
        "SELECT status AS value FROM postspark.next_spark_reservations"
      )
    ).toBe("refunded");
  });
  it("bypasses only authoritative unlimited plans and denies public financial RPCs", async () => {
    const req = await admit({ owner: thirdOwner });
    expect(req.billing_mode).toBe("unlimited");
    expect(
      await scalar(
        "SELECT count(*)::int AS value FROM postspark.next_spark_reservations"
      )
    ).toBe(0);
    await pg.query("SET ROLE authenticated");
    await expect(
      pg.query("SELECT postspark.generation_reconcile()")
    ).rejects.toThrow("permission denied");
    await expect(
      pg.query(
        "SELECT postspark.generation_admit(null,null,null,null,null,null,null)"
      )
    ).rejects.toThrow("permission denied");
    await pg.query("RESET ROLE");
  });
});
