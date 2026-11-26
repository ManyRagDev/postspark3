import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { generationReleasePostgresFixture, releaseOwner } from "./generationReleasePostgres.fixture";

let pg: PGlite;
const id = randomUUID();
const args = (price: number) => [
  id, releaseOwner, id, "a".repeat(64), JSON.stringify({
    ownerId: releaseOwner, inputType: "text", content: "Carrossel de 3 slides",
    platform: "instagram", postMode: "carousel", slideCount: 3, creationMode: "execution", idempotencyKey: id,
    fixedDesign: { kind: "project", id: releaseOwner, postId: 31 },
    pinnedDesign: { canvas: { aspectRatio: "4:5", slides: [{ id: "cover" }] } },
    artworkCarousel: { confirmedSparks: price },
  }),
];
async function scalar(sql: string, params: unknown[] = []) {
  const result = await pg.query<{ value: any }>(sql, params);
  return result.rows[0]?.value;
}

beforeAll(async () => {
  pg = await generationReleasePostgresFixture();
  for (const file of ["0063_generation_fixed_design.sql", "0082_generation_artwork_carousel.sql"])
    await pg.exec(readFileSync(new URL(`../../../drizzle/${file}`, import.meta.url), "utf8"));
}, 30_000);
afterAll(async () => { await pg?.close(); });

it("reserves the agreed price once and settles only a full reviewed deck", async () => {
  const admit = "SELECT postspark.generation_admit($1,$2,$3,$4,$5::jsonb,false,now()+interval '10 minutes') AS value";
  await expect(scalar(admit, args(0))).rejects.toThrow(/quotation changed/);
  const accepted = await scalar(admit, args(23));
  expect(accepted).toMatchObject({ billing_mode: "reserved", billing_reserved: 23, billing_preparation: 0, billing_per_proposal: 23 });
  expect(accepted.proposals).toHaveLength(1);
  expect(await scalar(admit, args(23))).toMatchObject({ created: false, billing_reservation_id: accepted.billing_reservation_id });
  const claimed = await scalar("SELECT postspark.generation_v5_claim('artwork-carousel-test') AS value");
  const lease = claimed.leaseToken ?? claimed.lease_token;
  const proposal = accepted.proposals[0];
  const completeReview = async (step: string) => {
    for (const [action, body] of [["begin", null], ["complete", { issues: [] }]] as const) {
      await scalar("SELECT postspark.generation_v5_operation($1,$2,$3,$4,$5::jsonb) AS value",
        [id, lease, `${proposal.proposalId}:${step}`, action, JSON.stringify(body)]);
    }
  };
  const commit = (count: number) => {
    const fixedCanvas = { id: `design-${id}-0`, aspectRatio: "4:5", slides: Array.from({ length: count }, (_, i) => ({ id: `slide-${i}` })) };
    return scalar("SELECT postspark.generation_commit_fixed_design($1,$2,$3::jsonb,$4::jsonb) AS value",
      [id, lease, JSON.stringify({ ...proposal, status: "ready", fixedCanvas }), JSON.stringify({ fixedCanvas })]);
  };
  await completeReview("review");
  await expect(commit(1)).rejects.toThrow(/Invalid fixed design delivery/);
  await expect(commit(3)).rejects.toThrow(/Approved artwork carousel review required/);
  await completeReview("artwork_carousel_review");
  expect(await commit(3)).toMatchObject({ status: "completed" });
  expect(await scalar("SELECT sparks AS value FROM postspark.profiles WHERE id=$1", [releaseOwner])).toBe(127);
  expect(await scalar("SELECT count(*)::int AS value FROM postspark.spark_transactions WHERE generation_id=$1", [id])).toBe(1);
});
