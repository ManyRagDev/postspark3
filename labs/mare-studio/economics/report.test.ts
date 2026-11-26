import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { report } from "./report.ts";
const load = (name: string) =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const scenarios = load("./cenarios.json");
const pilot = load("./piloto.json");
test("reconciles pilot receipts, interpolated percentiles and withheld margins", () => {
  const r = report(pilot, scenarios);
  assert.equal(r.knownProviderTotalUsd, 0.1163595);
  assert.equal(r.byOperation.firstCut.apiMedianUsd, 0.037107);
  assert.equal(r.byOperation.firstCut.apiP95Usd, 0.0437112);
  assert.equal(r.byOperation.review.apiP95Usd, 0.0185619);
  assert.equal(r.byOperation.narration.apiP95Usd, null);
  assert.equal(r.byOperation.firstCut.tcoP95Brl, null);
  for (const p of r.simulatedPlans) assert.equal(p.simulatedMargin, null);
});
test("counts costs of failed jobs, omits partial deliveries from percentiles, rejects conflicting receipts", () => {
  const job = {
    id: "1",
    operation: "firstCut",
    status: "ready",
    receipts: [{ id: "a", stage: "script", usage: { cost: 1 } }],
  };
  const failed = {
    ...job,
    id: "2",
    status: "failed",
    receipts: [...job.receipts, ...job.receipts],
  };
  const r = report({ jobs: [job, failed] }, scenarios).byOperation.firstCut;
  assert.equal(r.knownUsd, 2);
  assert.equal(r.knownUsdPerDelivery, 2);
  assert.equal(r.apiP95Usd, null);
  assert.throws(() => report({ jobs: [job, job] }, scenarios), /Duplicate job/);
  assert.throws(
    () =>
      report(
        {
          jobs: [
            {
              ...job,
              receipts: [
                ...job.receipts,
                { ...job.receipts[0], usage: { cost: 2 } },
              ],
            },
          ],
        },
        scenarios
      ),
    /Conflicting/
  );
});
test("explicit full costs yield a simulated margin and additional render allowance", () => {
  const r = report(pilot, {
    ...scenarios,
    unitTcoBrl: { edit: 1, firstCut: 2, review: 1 },
    otherMonthlyCostsBrl: 10,
    includedRenderUnitBrl: 0.5,
  });
  const p = r.simulatedPlans.find(
    row => row.plan === "PRO" && row.mix === "misto"
  )!;
  assert.equal(p.additionalIncludedRenders, 30);
  assert.ok(p.simulatedMargin !== null);
  assert.ok(Math.abs(p.simulatedMargin - (117.6 - 20) / 117.6) < 1e-8);
});
