import assert from "node:assert/strict";
import { join } from "node:path";
import { runs, root, read, save, hash } from "./inputs.mjs";
import {
  generationReleasePostgresFixture,
  releaseOwner,
} from "../../../server/ai/workflows/generationReleasePostgres.fixture.ts";
if (process.argv.includes("--historical")) {
  const url = new URL(
    "/rest/v1/generation_v5_requests",
    "https://api.postspark.com.br"
  );
  assert.equal(url.origin, new URL(process.env.SUPABASE_URL).origin);
  url.search = new URLSearchParams({
    id: "in.(" + runs.map(x => x.r.id).join(",") + ")",
    owner_id: "eq." + runs[0].r.input.ownerId,
    select:
      "id,billing_mode,billing_reserved,billing_preparation,billing_per_proposal,billing_debited,billing_settled_at",
  });
  const res = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Accept-Profile": "postspark",
    },
    redirect: "error",
  });
  assert(res.ok, "billing HTTP " + res.status);
  const rows = await res.json();
  assert.deepEqual(rows.map(r => r.id).sort(), runs.map(r => r.r.id).sort());
  save("sparks-historicos", rows);
  console.log(rows.length, "liquidações consultadas");
} else {
  const pg = await generationReleasePostgresFixture();
  const receipts = [];
  try {
    await pg.query("update postspark.profiles set sparks=1000 where id=$1", [
      releaseOwner,
    ]);
    for (const n of [2, 7, 10])
      for (const arm of ["A", "B"]) {
        const { id, snapshot } = read(
          join(root, "geracoes", n + "-" + arm, "final.json")
        );
        const input = {
          ...runs[n - 1].r.input,
          ownerId: releaseOwner,
          idempotencyKey: id,
        };
        await pg.query(
          "select postspark.generation_admit($1,$2,$3,$4,$5::jsonb,false,now()+interval '5 minutes')",
          [id, releaseOwner, id, hash(input), JSON.stringify(input)]
        );
        await pg.query(
          "update postspark.generation_v5_requests set status=$2,proposals=$3::jsonb where id=$1",
          [id, snapshot.overallStatus, JSON.stringify(snapshot.proposals)]
        );
        const settle = async () =>
          (
            await pg.query(
              "select postspark.generation_settle($1) as receipt",
              [id]
            )
          ).rows[0].receipt;
        const receipt = await settle();
        assert.deepEqual(await settle(), receipt);
        const ready = snapshot.proposals.filter(
          p => p.status === "ready"
        ).length;
        const expected = ready
          ? (n === 2 ? 1 : 4) + ready * (n === 2 ? 3 : 12)
          : 0;
        assert.equal(receipt.debitedSparks, expected);
        const ledger = await pg.query(
          "select amount from postspark.spark_transactions where generation_id=$1",
          [id]
        );
        assert.deepEqual(
          ledger.rows.map(r => r.amount),
          expected ? [expected] : []
        );
        receipts.push({ id, n, arm, ready, receipt, ledger: ledger.rows });
      }
    save("sparks-diagnostico", receipts);
    console.log(receipts.map(r => [r.n, r.arm, r.receipt.debitedSparks]));
  } finally {
    await pg.close();
  }
}
