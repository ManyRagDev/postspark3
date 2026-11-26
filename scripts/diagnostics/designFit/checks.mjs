import assert from "node:assert/strict";
import { join } from "node:path";
import {
  cases,
  runs,
  root,
  profiles,
  hash,
  read,
  save,
  armPayload,
} from "./inputs.mjs";
import { ENV } from "../../../server/_core/env.ts";
import { recordDecisionObservation } from "../../../server/ai/decisionTrace.ts";
import { runWithGenerationTrace } from "../../../server/ai/generationTrace.ts";
import { buildHeuristicGenerationPlan } from "../../../server/ai/workflows/heuristicPlanBuilder.ts";
import { prepare, elect } from "./replay.mjs";
import { compactComponentCard } from "../../../shared/componentAssembly.ts";
import { frozen, adjustment, receipt, compare } from "./rank.mjs";
const inputCases = cases();
for (const card of runs[0].op["prepare:catalog"].cards) {
  const projection = compactComponentCard(
    read(join(root, "definicoes", card.hash + ".json"))
  );
  for (const field of ["mechanics", "fields", "completeDesign"])
    assert.deepEqual(projection[field], card[field]);
}
const open = compare(
  inputCases.find(c => c.id === "patio-aberto"),
  "B",
  frozen,
  new Map()
).report;
assert.equal(open.required, null);
assert.equal(open.slots[0].top[0].family, "acervo82-reference-14");
const measurements = [];
for (const c of inputCases)
  for (const arm of ["A", "B"]) {
    const actual = receipt(c, arm),
      payload = actual.payload,
      expected = armPayload(c.payload, arm);
    assert.deepEqual(payload, expected);
    assert.equal(hash([payload]), actual.payloadHash);
    assert(
      Object.keys(payload.questions).length === 20 && actual.bytes <= 48000
    );
    const response = actual.result;
    assert.deepEqual(
      Object.keys(payload.questions).sort(),
      Object.keys(response.answers).sort()
    );
    assert.equal(response.model, c.run.jev.trace.effectiveModel);
    measurements.push({
      case: c.id,
      source: c.run.r.id,
      set: c.set,
      arm,
      profile: arm === "A" ? "compact-v5" : "compact-v5+native-evidence-1",
      model: response.model,
      id: response.id,
      bytes: actual.bytes,
      latencyMs: actual.ms,
      payloadHash: actual.payloadHash,
      requests: 1,
      expanded: false,
      usage: response.usage,
      evaluations: Object.entries(payload.questions).map(([id, q]) => ({
        id,
        family: q.instructions.design.family,
        sourceHash: profiles.get(q.instructions.design.family).sourceHash,
        profileHash: hash(q.instructions.design),
        ...response.answers[id],
      })),
    });
  }
save("avaliacoes", measurements);
const control = runs[6];
const { input } = prepare(control);
const evidence = profiles.get("acervo82-r9-03").evidence;
assert.equal(
  adjustment(
    { score: 1, confidence: 1 },
    evidence,
    "comparar dois lados rotulados",
    [],
    frozen
  ).specific,
  0
);
assert.equal(
  adjustment(
    { score: 4, confidence: 0.1 },
    evidence,
    "comparar dois lados rotulados",
    [],
    frozen
  ).specific,
  0
);
assert.equal(
  adjustment({ score: 4, confidence: 1 }, evidence, null, [], frozen).specific,
  0
);
assert.equal(
  adjustment(
    { score: 3.8, confidence: 0.8 },
    evidence,
    "comparar dois lados rotulados",
    [],
    frozen
  ).specific,
  frozen.margin
);
assert.equal(
  adjustment({ score: 4, confidence: 1 }, evidence, null, [], {
    ...frozen,
    priorWeight: 0.25,
  }).historical,
  0
);
const single = { ...input, eligible: input.eligible.slice(0, 1) };
assert.deepEqual(
  elect(single, single.eligible).slots.map(s => s.status),
  ["viable", "insufficient_fit", "insufficient_fit"]
);
const tied = {
  ...input,
  recentSelections: [],
  shortlist: {
    evaluated: input.shortlist.evaluated.map(a => ({
      ...a,
      score: 3.5,
      confidence: 0.8,
    })),
  },
};
const first = elect(tied, tied.eligible).slots;
assert.deepEqual(
  first,
  elect({ ...tied, eligible: [...tied.eligible].reverse() }, tied.eligible)
    .slots
);
console.log(
  "32 lotes com versões, hashes e ordem verificados. Empate, piso, baixa confiança, evidência ausente e candidato único OK."
);

// A rejected diagnostic ID exercises the real writer's rejection path without
// touching local records. The observer must retain each in-memory decision.
const originalLog = console.error;
const previousDemand = ENV.localDemandEnabled;
let failedWrites = 0;
try {
  ENV.localDemandEnabled = true;
  console.error = (message, ...args) => {
    if (message === "[decision-trace] Falha ao persistir observação local")
      failedWrites++;
    else originalLog(message, ...args);
  };
  for (const run of runs) {
    const trace = { id: "invalid/" + run.r.id, events: [], calls: [] };
    const { input } = prepare(run);
    await runWithGenerationTrace(trace, async () => {
      const { slots } = buildHeuristicGenerationPlan({
        ...input,
        observeDecision: observation =>
          recordDecisionObservation("selection_slot_observed", observation),
      });
      assert.deepEqual(slots, run.r.prepared.planning.slots);
    });
    assert.equal(
      trace.events.filter(e => e.stage === "selection_slot_observed").length,
      3
    );
  }
  assert.equal(failedWrites, 30);
  console.log(
    "Trinta falhas no registro diagnóstico preservaram as escolhas e os componentes dos dez pedidos."
  );
} finally {
  console.error = originalLog;
  ENV.localDemandEnabled = previousDemand;
}
