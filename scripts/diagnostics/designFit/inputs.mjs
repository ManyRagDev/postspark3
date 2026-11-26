import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

export const root = process.env.DESIGN_FIT_OUTPUT;
export const audit = process.env.DESIGN_FIT_AUDIT;
assert(root && audit, "Configure DESIGN_FIT_OUTPUT e DESIGN_FIT_AUDIT");
export const hash = value =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
export const read = file => JSON.parse(readFileSync(file));
export function save(name, value) {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, name + ".json"),
    JSON.stringify(value, null, 2) + "\n",
    { mode: 0o600 }
  );
}
export const pairs = read(
  ".conductor/tracks/015-controle-selecao-design/pares.json"
);
export const rounds = read(join(audit, "ref08-mapa-das-chamadas.json")).rounds;
export const runs = rounds.map(round => {
  const file = join(root, "recibos", round.request + ".json.gz");
  const raw = gunzipSync(readFileSync(file));
  const { r, ops, events } = JSON.parse(raw);
  const op = Object.fromEntries(ops.map(x => [x.operation_key, x.result]));
  const jev = round.calls.find(call => call.title === "Adequação das famílias");
  assert.equal(hash([jev.input.payload]), jev.trace.promptHash);
  assert(jev.input.exact);
  return { r, op, ops, events, round, jev, receiptHash: hash(raw.toString()) };
});
const cards = runs[0].op["prepare:catalog"].cards;
const manifest = runs[0].op["prepare:catalog"].coverage.entries;
const unique = xs => [...new Set(xs)];
function evidence(card) {
  const { fields } = card.mechanics;
  const kinds = unique(
    card.fields.map(f => f.source.split(":")[1]).filter(Boolean)
  );
  const numbers = fields.filter(f => f.source.startsWith("block:metric:"));
  const comparison = [
    "left.label",
    "left.text",
    "right.label",
    "right.text",
  ].every(side => fields.some(f => f.source === "block:comparison:0:" + side));
  const description =
    card.completeDesign.designGuidance.selection?.description ?? "";
  const question =
    /pergunta/i.test(description) &&
    kinds.includes("headline") &&
    (kinds.includes("body") || kinds.includes("list"));
  const modular =
    /grade|cartões|blocos/i.test(description) && fields.length >= 3;
  const support = kinds.includes("body");
  const functions = [
    ...(comparison ? ["comparar dois lados rotulados"] : []),
    ...(numbers.length ? ["destacar uma métrica"] : []),
    ...(question ? ["pergunta com apoio"] : []),
    ...(modular ? ["organizar blocos"] : []),
    ...(support ? ["acompanhar título com texto"] : []),
  ];
  const list = card.fields.find(f => f.kind === "list")?.cardinality;
  const shortest = fields
    .filter(f => f.targets.length === 1 && f.targets[0].charsEstimate > 0)
    .sort((a, b) => a.targets[0].charsEstimate - b.targets[0].charsEstimate)[0];
  return {
    functions: functions.length ? functions : ["função específica incerta"],
    elements: comparison
      ? [
          "left.label + left.text",
          "right.label + right.text",
          ...kinds.filter(x => x !== "comparison"),
        ]
      : kinds,
    ...(list ? { listItems: [list.min, list.max] } : {}),
    limitation: shortest
      ? {
          field: shortest.source,
          estimatedChars: shortest.targets[0].charsEstimate,
        }
      : "encaixe tipográfico desconhecido",
  };
}
export const profiles = new Map(
  cards.map(card => {
    const definition = manifest.find(
      entry => entry.id === card.id && !entry.isVariant
    );
    assert.equal(definition.hash, card.hash);
    assert.equal(definition.family, card.completeDesign.family);
    return [
      card.completeDesign.family,
      { id: card.id, sourceHash: card.hash, evidence: evidence(card) },
    ];
  })
);
assert.equal(profiles.size, 82);

export function cases() {
  const historical = runs.map(run => ({
    id: "historico-" + run.round.round,
    run,
    payload: run.jev.input.payload,
    set: "historical",
  }));
  const paired = pairs.groups.flatMap(group =>
    group.cases.map(c => {
      const run = runs[group.sourceRound - 1];
      const payload = structuredClone(run.jev.input.payload);
      const state = JSON.parse(payload.state);
      const request = group.facts + " " + c.ask;
      // One frozen textual context for both arms. Remove the source request's inferred intent.
      state.context = {
        request,
        objective: c.ask,
        semanticQuery: request,
        creativeDirection: state.context.creativeDirection,
      };
      payload.state = JSON.stringify(state);
      return { id: c.id, set: c.set, run, payload, request };
    })
  );
  return [...historical, ...paired];
}
export function armPayload(payload, arm) {
  const copy = structuredClone(payload);
  if (arm === "B")
    for (const question of Object.values(copy.questions)) {
      const design = question.instructions.design;
      design.nativeEvidence = profiles.get(design.family).evidence;
    }
  return copy;
}
