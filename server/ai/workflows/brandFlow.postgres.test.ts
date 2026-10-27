import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  generationReleasePostgresFixture,
  releaseOwner as owner,
  releaseOther as other,
} from "./generationReleasePostgres.fixture";
let pg: Awaited<ReturnType<typeof generationReleasePostgresFixture>>;
beforeAll(async () => {
  pg = await generationReleasePostgresFixture();
}, 30000);
afterAll(async () => {
  await pg?.close();
});
async function scalar(sql: string, args: unknown[] = []) {
  return (await pg.query<any>(sql, args)).rows[0]?.v;
}
async function start(
  key: string,
  url = "https://example.com/",
  refresh = false,
  who = owner
) {
  return scalar(
    "select postspark.brand_capture_start($1,$2,$3,'external',null,$4) v",
    [who, url, key, refresh]
  );
}
async function update(
  c: any,
  action: string,
  key: string | null = null,
  result: unknown = null
) {
  return scalar("select postspark.brand_capture_update($1,$2,$3,$4,$5) v", [
    c.id,
    c.lease_token,
    action,
    key,
    result === null ? null : JSON.stringify(result),
  ]);
}
describe("durable free capture and reconciliation / PostgreSQL", () => {
  it("capture is idempotent and exclusive, preserves operation result and requires the current lease", async () => {
    const a = await start("capture-1");
    expect((await start("capture-1")).id).toBe(a.id);
    await expect(start("capture-2")).rejects.toThrow("captura já");
    const c = await scalar("select postspark.brand_capture_claim(null,null) v");
    expect(c.id).toBe(a.id);
    expect((await update(c, "begin", "visual")).state).toBe("new");
    await update(c, "complete", "visual", { brand: "observed" });
    await update(c, "uncertain", "visual");
    expect((await update(c, "begin", "visual")).result).toEqual({
      brand: "observed",
    });
    await expect(
      update(
        { ...c, lease_token: "00000000-0000-4000-8000-000000000000" },
        "heartbeat"
      )
    ).rejects.toThrow("lease lost");
    await update(c, "finish", null, {
      siteIntelligence: { sourceUrl: "https://example.com/" },
    });
    expect(
      await scalar("select sparks v from postspark.profiles where id=$1", [
        owner,
      ])
    ).toBe(150);
    expect(
      await scalar(
        "select count(*)::int v from postspark.next_spark_reservations"
      )
    ).toBe(0);
  });
  it("capture save is atomic, owner scoped, reusable for 24h, and refresh consumes a new admission", async () => {
    const c = await start("capture-1");
    const project = {
      name: "General brand",
      niche: "Services",
      structuredData: { factualDifferentials: "By appointment" },
      compiledDocument: "General facts",
      capture: { captureId: c.id },
    };
    const saved = await scalar(
      "select postspark.brand_capture_save($1,$2,$3) v",
      [c.id, owner, JSON.stringify(project)]
    );
    expect((await start("reuse")).id).toBe(c.id);
    await expect(
      scalar("select postspark.brand_capture_save($1,$2,$3) v", [
        c.id,
        other,
        JSON.stringify(project),
      ])
    ).rejects.toThrow();
    await scalar(
      "insert into postspark.brand_projects(user_uuid,name,niche) values($1,'Other','General') returning id v",
      [other]
    ).then(async id => {
      await expect(
        scalar(
          "select postspark.brand_capture_save($1,$2,$3,'foreign-project') v",
          [c.id, owner, JSON.stringify({ ...project, id })]
        )
      ).rejects.toThrow("not owned");
    });
    const fresh = await start("refresh", "https://example.com/", true);
    expect(fresh.id).not.toBe(c.id);
    await pg.query(
      "update postspark.brand_captures set status='failed' where id=$1",
      [fresh.id]
    );
    expect(
      await scalar(
        "select capture->>'captureId' v from postspark.brand_projects where id=$1",
        [saved.id]
      )
    ).toBe(c.id);
  });
  it("enforces five new captures per rolling hour including failures", async () => {
    for (let n = 0; n < 3; n++) {
      const c = await start("limit-" + n, "https://example.com/" + n, true);
      await pg.query(
        "update postspark.brand_captures set status='failed' where id=$1",
        [c.id]
      );
    }
    await expect(
      start("sixth", "https://example.com/new", true)
    ).rejects.toThrow("cinco");
  });
  it("RLS hides another owner and runtime-only functions cannot be invoked by authenticated users", async () => {
    await pg.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${other}',false);`
    );
    try {
      expect(
        await scalar("select count(*)::int v from postspark.brand_captures")
      ).toBe(0);
      await expect(start("forbidden")).rejects.toThrow("permission denied");
    } finally {
      await pg.exec("reset role");
    }
  });
  it("pending review releases the lease without settling, expires at original deadline, and settles once", async () => {
    const id = "90000000-0000-4000-8000-000000000001",
      input = {
        ownerId: owner,
        inputType: "text",
        content: "General briefing",
        platform: "linkedin",
        postMode: "static",
        creationMode: "ideation",
        idempotencyKey: "reconcile",
      };
    await scalar(
      "select postspark.generation_admit($1,$2,'reconcile',$3,$4,false,now()+interval '10 minutes') v",
      [id, owner, "a".repeat(64), JSON.stringify(input)]
    );
    const c = await scalar(
      "select postspark.generation_v5_claim('release-test') v"
    );
    const proposals = c.proposals.map((p: any) => ({
      ...p,
      status: "awaiting_reconciliation",
    }));
    for (const delivery of proposals)
      await scalar(
        "select postspark.generation_v5_lease_update($1,$2,'checkpoint',$3) v",
        [id, c.leaseToken, JSON.stringify({ delivery })]
      );
    const pending = await scalar(
      "select postspark.generation_v5_finish($1,$2,'awaiting_reconciliation',null) v",
      [id, c.leaseToken]
    );
    expect(pending.lease_token).toBeNull();
    expect(pending.billing_settled_at).toBeNull();
    expect(pending.status).toBe("awaiting_reconciliation");
    expect(await scalar("select postspark.generation_reconcile() v")).toBe(0);
    expect(
      await scalar("select sparks v from postspark.profiles where id=$1", [
        owner,
      ])
    ).toBe(150);
    await pg.query(
      "update postspark.generation_v5_requests set deadline_at=now()-interval '1 second' where id=$1",
      [id]
    );
    await scalar("select postspark.generation_reconcile() v");
    const final = await scalar(
      "select to_jsonb(r) v from postspark.generation_v5_requests r where id=$1",
      [id]
    );
    expect(final.status).toBe("failed");
    expect(final.proposals.every((p: any) => p.status === "expired")).toBe(
      true
    );
    expect(final.billing_debited).toBe(0);
    await scalar("select postspark.generation_reconcile() v");
    expect(
      await scalar("select count(*)::int v from postspark.spark_transactions")
    ).toBe(0);
  });
  it("preserves local project import, blocks another owner's ID, and restricts runtime RPCs", async () => {
    const localId = "70000000-0000-4000-8000-000000000001";
    const project = {
      id: localId,
      name: "Imported project",
      niche: "General",
      structuredData: { voiceTone: "Calm" },
      compiledDocument: "Institutional facts",
    };
    const first = await scalar(
      "select postspark.brand_project_upsert($1,$2) v",
      [owner, JSON.stringify(project)]
    );
    expect(first.id).toBe(localId);
    await expect(
      scalar("select postspark.brand_project_upsert($1,$2) v", [
        other,
        JSON.stringify({ ...project, name: "Unauthorized" }),
      ])
    ).rejects.toThrow("not owned");
    expect(
      await scalar("select name v from postspark.brand_projects where id=$1", [
        localId,
      ])
    ).toBe("Imported project");
    for (const signature of [
      "postspark.brand_project_upsert(uuid,jsonb)",
      "postspark.brand_capture_save(uuid,uuid,jsonb,text)",
      "postspark.generation_recover_review(uuid,uuid,text,jsonb,jsonb)",
      "postspark.generation_review_expectation(uuid,uuid,text,jsonb)",
    ]) {
      expect(
        await scalar(
          "select has_function_privilege('authenticated',$1,'EXECUTE') v",
          [signature]
        )
      ).toBe(false);
      expect(
        await scalar(
          "select has_function_privilege('service_role',$1,'EXECUTE') v",
          [signature]
        )
      ).toBe(true);
    }
  });
  it("recovers only the expected existing review and queues that proposal without changing deadline or budget journal", async () => {
    const id = "90000000-0000-4000-8000-000000000002",
      input = {
        ownerId: other,
        inputType: "text",
        content: "Another briefing",
        platform: "twitter",
        postMode: "static",
        creationMode: "ideation",
        idempotencyKey: "recover",
      };
    await scalar(
      "select postspark.generation_admit($1,$2,'recover',$3,$4,false,now()+interval '10 minutes') v",
      [id, other, "b".repeat(64), JSON.stringify(input)]
    );
    const c = await scalar(
        "select postspark.generation_v5_claim('recover-test') v"
      ),
      proposal = c.proposals[0];
    const key = `${proposal.proposalId}:review:initial:${"d".repeat(64)}`,
      expectation = {
        requestId: id,
        proposalId: proposal.proposalId,
        configurationHash: "pinned-config",
        sourceContextHash: "pinned-context",
        inputHash: "d".repeat(64),
        transport: { model: "pinned-review-model" },
      };
    await scalar(
      "select postspark.generation_v5_lease_update($1,$2,'prepared',$3) v",
      [
        id,
        c.leaseToken,
        JSON.stringify({
          reviewPolicyVersion: 9,
          reviewExecutionConfig: {
            configurationHash: "pinned-config",
            resolvedModel: "pinned-review-model",
          },
          editorialContextHash: "pinned-context",
        }),
      ]
    );
    await scalar(
      "select postspark.generation_v5_operation($1,$2,$3,'begin',null) v",
      [id, c.leaseToken, key]
    );
    await scalar(
      "select postspark.generation_review_expectation($1,$2,$3,$4) v",
      [id, c.leaseToken, key, JSON.stringify(expectation)]
    );
    await scalar(
      "select postspark.generation_v5_operation($1,$2,$3,'uncertain',null) v",
      [id, c.leaseToken, key]
    );
    for (const p of c.proposals)
      await scalar(
        "select postspark.generation_v5_lease_update($1,$2,'checkpoint',$3) v",
        [
          id,
          c.leaseToken,
          JSON.stringify({
            delivery: { ...p, status: "awaiting_reconciliation" },
          }),
        ]
      );
    const pending = await scalar(
      "select postspark.generation_v5_finish($1,$2,'awaiting_reconciliation') v",
      [id, c.leaseToken]
    );
    await expect(
      scalar("select postspark.generation_recover_review($1,$2,$3,$4,$5) v", [
        id,
        other,
        key,
        JSON.stringify(expectation),
        JSON.stringify({
          __proposalReview: { ...expectation, inputHash: "wrong" },
        }),
      ])
    ).rejects.toThrow("mismatch");
    const { transport, ...receipt } = expectation;
    const recovered = await scalar(
      "select postspark.generation_recover_review($1,$2,$3,$4,$5) v",
      [
        id,
        other,
        key,
        JSON.stringify(expectation),
        JSON.stringify({
          __proposalReview: receipt,
          choices: [{ message: { content: "Existing response" } }],
        }),
      ]
    );
    expect(recovered.status).toBe("queued");
    expect(recovered.deadline_at).toBe(pending.deadline_at);
    expect(recovered.proposals[0].status).toBe("planned");
    expect(recovered.proposals[1].status).toBe("awaiting_reconciliation");
    expect(recovered.billing_settled_at).toBeNull();
    expect(
      await scalar(
        "select count(*)::int v from postspark.generation_v5_operations where request_id=$1",
        [id]
      )
    ).toBe(1);
    await expect(
      scalar(
        "select postspark.generation_v5_operation($1,$2,'late:copy','begin',null) v",
        [id, c.leaseToken]
      )
    ).rejects.toMatchObject({ code: "PT409" });
  });
});
