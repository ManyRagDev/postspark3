import assert from "node:assert/strict";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cases, hash, profiles, read, root, save } from "./inputs.mjs";
import { elect, prepare } from "./replay.mjs";

export function receipt(c, arm) {
  const path = join(root, "jev", c.id + "-" + arm + ".json");
  if (existsSync(path)) return read(path);
  assert(c.set === "historical" && arm === "A");
  const { trace, input, returned } = c.run.jev;
  return {
    payload: input.payload,
    result: returned,
    ms: trace.latencyMs,
    payloadHash: input.hash,
    bytes: Buffer.byteLength(JSON.stringify(input.payload)),
  };
}
// Conservative declared needs. An open brief and mere presence of numbers earn no bonus.
function need(request) {
  if (/compare|lado a lado/iu.test(request))
    return "comparar dois lados rotulados";
  if (/perguntas e respostas/iu.test(request)) return "pergunta com apoio";
  if (
    /número precisa ser entendido de relance|dê destaque ao total/iu.test(
      request
    )
  )
    return "destacar uma métrica";
  return null;
}
const effective = a => a.score * (0.5 + 0.5 * a.confidence);
export function adjustment(a, evidence, required, prior, params) {
  const allowed =
    effective(a) >= params.floor && a.confidence >= params.confidence;
  const supported =
    allowed && !!required && evidence.functions.includes(required);
  const specific = supported ? params.margin : 0;
  const n = prior?.length ?? 0;
  const usual = n ? prior.reduce((s, v) => s + v, 0) / n : null;
  const historical =
    allowed && n
      ? ((params.priorWeight * n) / (n + 5)) * (effective(a) - usual)
      : 0;
  return {
    specific,
    historical,
    n,
    usual,
    support: supported ? required : null,
    elements: supported ? evidence.elements : [],
  };
}

export function compare(c, arm, params, memory) {
  const { input, eligible, families } = prepare(c.run, c.request);
  // Paired inputs use the same physical constraints and factual content as the source.
  // No historical inferred communicative direction is supplied as an editorial requirement.
  if (c.request)
    input.intent = { ...input.intent, objective: c.request, requirements: [] };
  const response = receipt(c, arm);
  const required = need(c.request ?? c.run.r.input.content);
  const version = [
    c.run.r.catalog_revision,
    input.slideCount,
    arm,
    response.result.model,
  ].join("/");
  const start = performance.now();
  const rows = new Map();
  const ranking = [];
  for (const f of families) {
    const a = response.result.answers[f.id];
    if (!a) continue;
    const p = profiles.get(f.family);
    const key = [version, p.sourceHash].join("/");
    const cutoff =
      c.set === "historical"
        ? Date.parse(c.run.r.created_at)
        : receiptTime(response);
    const prior = (memory.get(key) ?? [])
      .filter(x => x.availableAt < cutoff)
      .map(x => x.effective);
    const delta = adjustment(a, p.evidence, required, prior, params);
    const row = {
      family: f.family,
      key,
      raw: a.score,
      confidence: a.confidence,
      effective: effective(a),
      ...delta,
    };
    rows.set(f.family, row);
    // Carry a diagnostic effective utility through the unmodified planner. The receipt retains the raw answer.
    for (const rep of f.repertoires)
      ranking.push({
        id: rep.defaultOffer.offerId,
        confidence: a.confidence,
        score:
          a.score +
          (delta.specific + delta.historical) / (0.5 + 0.5 * a.confidence),
      });
  }
  const original = {
    ...input,
    shortlist: {
      evaluated: ranking.map(a => ({
        ...a,
        score:
          response.result.answers[
            families.find(f =>
              f.repertoires.some(r => r.defaultOffer.offerId === a.id)
            ).id
          ].score,
      })),
    },
  };
  // Reserves always use the original judgments.
  const selected = elect(
    { ...input, shortlist: { evaluated: ranking } },
    eligible,
    original
  );
  const elapsed = performance.now() - start;
  const slots = selected.observations.map((o, i) => ({
    top: o.candidates
      .filter(x => x.rank)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 2)
      .map(x => ({
        ...rows.get(x.family),
        recent: x.recentFamily,
        distance: x.diversityDistance,
        final: x.rankingUtility,
        tie: x.tieBreaker,
        componentIds: x.componentIds,
      })),
    reserves: selected.reserves[i].map(r => r.family),
  }));
  return {
    selected,
    rows,
    report: { slots, ms: elapsed, required, payloadHash: response.payloadHash },
  };
}
const zero = { floor: 2.6, confidence: 0.45, margin: 0, priorWeight: 0 };
export const frozen = { ...zero, margin: 0.35 };
function receiptTime(response) {
  const epoch = /gen-(?:dec-)?(\d{10})-/.exec(response.result.id)?.[1];
  assert(epoch, "Missing dated provider receipt");
  return Number(epoch) * 1000;
}
function suite(subset, params) {
  const memory = new Map();
  const casesOut = [];
  for (const c of subset) {
    const reports = {};
    for (const arm of ["A", "B"]) {
      const variants = {
        current: zero,
        specific: params,
        priorOnly: { ...zero, priorWeight: 0.25 },
        combined: { ...params, priorWeight: 0.25 },
      };
      let rows;
      for (const [name, p] of Object.entries(variants)) {
        const result = compare(c, arm, p, memory);
        rows = result.rows;
        reports[arm + "-" + name] = result.report;
      }
      // Freeze all validation cases to the same prior. All assessed historical losers are included.
      if (c.set === "historical")
        for (const row of rows.values()) {
          if (!memory.has(row.key)) memory.set(row.key, []);
          const availableAt =
            arm === "A"
              ? Date.parse(c.run.r.updated_at)
              : receiptTime(receipt(c, arm)) +
                Math.ceil(receipt(c, arm).ms) +
                1000;
          memory.get(row.key).push({ effective: row.effective, availableAt });
        }
    }
    casesOut.push({ id: c.id, set: c.set, source: c.run.r.id, reports });
  }
  return casesOut;
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const calibration = cases().filter(c => c.set === "calibration");
  const configs = [
    { ...frozen, floor: 2.4, margin: 0.2 },
    frozen,
    { ...frozen, floor: 2.8, margin: 0.5 },
  ];
  const calibrations = configs.map(params => ({
    params,
    cases: suite(calibration, params).map(c => ({
      id: c.id,
      slots: c.reports["B-specific"].slots.map(s => s.top[0].family),
    })),
  }));
  save("calibracao", calibrations);
  save("parametros", {
    frozen,
    hash: hash(frozen),
    reference: "sem contribuição histórica na regra principal",
    reasons:
      "piso acima de plausível, margem menor que um degrau da escala; adequação geral nas instruções abertas",
  });
  const results = suite(cases(), frozen);
  save("classificacoes", results);
  for (const c of results)
    console.log(
      c.id,
      Object.values(c.reports)
        .filter((_, i) => [0, 4, 5, 7].includes(i))
        .map(r =>
          r.slots.map(s => s.top[0].family.replace("acervo82-", "")).join(",")
        )
    );
}
