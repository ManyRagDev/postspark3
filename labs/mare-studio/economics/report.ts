// Offline analysis. Every currency rate and usage mix in the scenario is a hypothesis.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { PAID_PLAN_OFFERS } from "../../../shared/membership.ts";

const number = z.number().finite().nonnegative();
const operations = [
  "firstCut",
  "edit",
  "review",
  "narration",
  "render",
  "speech",
  "mask",
  "ingest",
  "delivery",
] as const;
type Operation = (typeof operations)[number];
const operation = z.enum(operations);
const costs = z.partialRecord(operation, number);
const jobsSchema = z.object({
  model: z.string().optional(),
  jobs: z.array(
    z.object({
      id: z.string().min(1),
      operation,
      status: z.enum([
        "ready",
        "failed",
        "queued",
        "running",
        "cancelled",
        "reconciling",
      ]),
      durationSeconds: number.nullish(),
      resolution: z.string().nullish(),
      model: z.string().nullish(),
      receipts: z.array(
        z.object({
          stage: z.string(),
          id: z.string().nullish(),
          usage: z.object({ cost: number.nullish() }).nullish(),
        })
      ),
      // Allocation for this job, including retries. Zero must be expressly measured or inapplicable.
      infrastructureBrl: z
        .object({
          compute: number,
          memory: number,
          storage: number,
          backup: number,
          egress: number,
          processorFees: number,
        })
        .optional(),
    })
  ),
});
const settingsSchema = z.object({
  fxBrlPerUsd: number.positive(),
  variableBrlPerSpark: number.positive(),
  targetMargin: number.max(1),
  netRevenueFraction: number.positive().max(1),
  period: z.enum(["monthly", "annual"]),
  otherMonthlyCostsBrl: number.nullable(),
  includedRenderUnitBrl: number.positive().nullable(),
  unitTcoBrl: costs,
  mixes: z.record(z.string(), z.partialRecord(operation, number.int())),
});
type Job = z.infer<typeof jobsSchema>["jobs"][number];
const requiredStages: Partial<Record<Operation, string[]>> = {
  firstCut: ["script", "direction"],
  edit: ["edit"],
  review: ["review"],
  narration: ["narration"],
};
const round = (n: number) => Number(n.toFixed(9));
function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const index = (ordered.length - 1) * p;
  return round(
    ordered[Math.floor(index)] +
      (ordered[Math.ceil(index)] - ordered[Math.floor(index)]) * (index % 1)
  );
}
function measure(job: Job, fx: number) {
  let knownUsd = 0;
  let incomplete = false;
  const stages = new Set<string>();
  const seen = new Map<string, string>();
  for (const receipt of job.receipts) {
    const value = receipt.usage?.cost;
    if (receipt.id) {
      const signature = JSON.stringify([receipt.stage, value]);
      if (seen.has(receipt.id)) {
        if (seen.get(receipt.id) !== signature)
          throw new Error("Conflicting provider receipt: " + receipt.id);
        continue;
      }
      seen.set(receipt.id, signature);
    }
    if (value == null) incomplete = true;
    else {
      knownUsd += value;
      stages.add(receipt.stage);
    }
  }
  const required = requiredStages[job.operation];
  const complete =
    !incomplete &&
    (required
      ? required.every(stage => stages.has(stage))
      : job.receipts.length > 0);
  const infra = job.infrastructureBrl;
  const tco =
    complete && infra
      ? knownUsd * fx + Object.values(infra).reduce((a, b) => a + b, 0)
      : null;
  return { knownUsd, complete, tco };
}
export function report(input: unknown, settings: unknown) {
  const { jobs, model } = jobsSchema.parse(input);
  const s = settingsSchema.parse(settings);
  if (new Set(jobs.map(j => j.id)).size !== jobs.length)
    throw new Error("Duplicate job");
  function summarize(rows: Job[]) {
    const samples: number[] = [],
      tcos: number[] = [];
    let knownUsd = 0,
      complete = 0,
      delivered = 0;
    for (const job of rows) {
      const m = measure(job, s.fxBrlPerUsd);
      knownUsd += m.knownUsd;
      if (m.complete) complete++;
      if (job.status === "ready") {
        delivered++;
        if (m.complete) samples.push(m.knownUsd);
        if (m.tco != null) tcos.push(m.tco);
      }
    }
    const p95 = percentile(samples, 0.95);
    return {
      jobs: rows.length,
      delivered,
      completeReceipts: complete,
      knownUsd: round(knownUsd),
      deliveredApiSamples: samples.length,
      apiMedianUsd: percentile(samples, 0.5),
      apiP95Usd: p95,
      apiP95SparksFloor:
        p95 == null
          ? null
          : Math.ceil(round((p95 * s.fxBrlPerUsd) / s.variableBrlPerSpark)),
      deliveredTcoSamples: tcos.length,
      tcoMedianBrl: percentile(tcos, 0.5),
      tcoP95Brl: percentile(tcos, 0.95),
      // Includes all observed attempts. With partial receipts this is only a lower bound.
      knownUsdPerDelivery: delivered ? round(knownUsd / delivered) : null,
    };
  }
  const byOperation = Object.fromEntries(
    operations.map(op => [op, summarize(jobs.filter(j => j.operation === op))])
  ) as Record<Operation, ReturnType<typeof summarize>>;
  const strata = new Map<string, Job[]>();
  for (const job of jobs) {
    const d = job.durationSeconds;
    const band =
      d == null
        ? "unknown"
        : d <= 5
          ? "<=5s"
          : d <= 15
            ? "6–15s"
            : d <= 30
              ? "16–30s"
              : d <= 60
                ? "31–60s"
                : ">60s";
    const key = [
      job.operation,
      job.model || model || "unknown",
      band,
      job.resolution || "unknown",
    ].join(" / ");
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key)!.push(job);
  }
  const plans = Object.entries(PAID_PLAN_OFFERS).flatMap(([plan, offer]) =>
    Object.entries(s.mixes).map(([mix, counts]) => {
      const net =
        ((s.period === "annual" ? offer.annualCents / 12 : offer.monthlyCents) /
          100) *
        s.netRevenueFraction;
      let knownApiBrl = 0,
        modeledCost = s.otherMonthlyCostsBrl ?? 0;
      const missing = new Set<string>();
      if (s.otherMonthlyCostsBrl == null) missing.add("otherMonthlyCostsBrl");
      for (const [name, count] of Object.entries(counts)) {
        if (!count) continue;
        const op = name as Operation;
        const stats = byOperation[op];
        knownApiBrl += (stats.apiP95Usd ?? 0) * s.fxBrlPerUsd * count;
        const unit = s.unitTcoBrl[op];
        // A modeled unit includes failures, retries and delivery. Do not promote a partial pilot to a tariff.
        if (unit == null) missing.add(op);
        else modeledCost += unit * count;
      }
      const budget = net * (1 - s.targetMargin);
      return {
        plan,
        mix,
        sparks: offer.sparksPerMonth,
        hypotheticalNetBrl: round(net),
        targetCostBudgetBrl: round(budget),
        observedApiAtP95Brl: round(knownApiBrl),
        remainingAfterObservedApiBrl: round(budget - knownApiBrl),
        missingTco: [...missing],
        simulatedMargin: missing.size ? null : round((net - modeledCost) / net),
        additionalIncludedRenders:
          missing.size || s.includedRenderUnitBrl == null
            ? null
            : Math.max(
                0,
                Math.floor((budget - modeledCost) / s.includedRenderUnitBrl)
              ),
      };
    })
  );
  return {
    knownProviderTotalUsd: round(
      Object.values(byOperation).reduce((n, o) => n + o.knownUsd, 0)
    ),
    byOperation,
    strata: Object.fromEntries(
      [...strata].map(([key, rows]) => [key, summarize(rows)])
    ),
    simulatedPlans: plans,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const read = (path: string | URL) => JSON.parse(readFileSync(path, "utf8"));
  const [data, config] = process.argv.slice(2);
  console.log(
    JSON.stringify(
      report(
        read(data || new URL("./piloto.json", import.meta.url)),
        read(config || new URL("./cenarios.json", import.meta.url))
      ),
      null,
      2
    )
  );
}
