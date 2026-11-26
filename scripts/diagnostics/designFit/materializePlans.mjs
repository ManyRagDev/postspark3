import assert from "node:assert/strict";
import { cases, save } from "./inputs.mjs";
import { compare, frozen } from "./rank.mjs";

for (const n of [2, 7, 10])
  for (const arm of ["A", "B"]) {
    const c = cases().find(c => c.id === "historico-" + n);
    const { selected } = compare(
      c,
      arm,
      { ...frozen, margin: arm === "A" ? 0 : frozen.margin },
      new Map()
    );
    const old = c.run.r.prepared.planning;
    if (arm === "A") assert.deepEqual(selected.slots, old.slots);
    save("plano-" + n + "-" + arm, {
      source: c.run.r.id,
      slots: selected.slots,
      offers: selected.offers,
      deliveryReserves: selected.reserves,
    });
  }
