import { describe, expect, it } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { fragmentContentText } from "@shared/designArsenal";
import { arsenalHash } from "@shared/arsenalContent";
import { repairLayoutLabels } from "./localTextRecovery";
import { FirstDeliveryQueue } from "./firstDeliveryQueue";

describe("local text recovery", () => {
  it("keeps the measured break until the canonical field is edited", () => {
    const text = "Uma frase com palavras",
      split = { textHash: arsenalHash(text), afterWord: 1 };
    const part = { unit: "words" as const, count: 2, index: 0 };
    expect(fragmentContentText(text, part, split)).toBe("Uma ");
    expect(fragmentContentText(text, { ...part, index: 1 }, split)).toBe(
      "frase com palavras"
    );
    expect(fragmentContentText(text + " novas", part, split)).toBe(
      fragmentContentText(text + " novas", part)
    );
  });
  it("round-trips a measured allocation across three fragments without changing the price or benefit", () => {
    const text = "R$ 39/mês e 1 oficina mensal";
    const split = JSON.parse(JSON.stringify({ textHash: arsenalHash(text), afterWords: [2, 5] }));
    const part = { unit: "words" as const, count: 3, index: 0 };
    const fragments = [0, 1, 2].map(index => fragmentContentText(text, { ...part, index }, split));
    expect(fragments).toEqual(["R$ 39/mês ", "e 1 oficina ", "mensal"]);
    expect(fragments.join("")).toBe(text);
    expect(fragmentContentText(text, part, { ...split, afterWords: [5, 2] })).toBe(fragmentContentText(text, part));
  });
  it("preserves a canonical comparison break without adding a blank line to the measured fragment", () => {
    const text = "Essencial: R$ 39\nCompleto: R$ 69";
    const split = { textHash: arsenalHash(text), afterWord: 3 };
    const fragment = { unit: "words" as const, count: 2, index: 0 };
    const rows = [0, 1].map(index => fragmentContentText(text, { ...fragment, index }, split));
    expect(rows).toEqual(["Essencial: R$ 39", "Completo: R$ 69"]);
    expect(rows.join("\n")).toBe(text);
  });
  it("fills authored page indexes, keeps factual labels and honors the content contract", () => {
    const base = completeDesignTestDefinitions()[0];
    const definition = (id: string) => ({
      ...base,
      fragment: {
        ...base.fragment,
        bindings: base.fragment.bindings.map((b, i) =>
          i === 1
            ? {
                ...b,
                source: "block:label:0:text" as const,
                required: false,
                targetIds: [id],
              }
            : b
        ),
      },
    });
    const labels = ["Como", "Dados", "R$ 49", "Próximo"];
    const copy = {
      caption: "Legenda",
      hashtags: [],
      slides: labels.map(value => ({
        mediaPrompts: [],
        values: [
          { fieldId: "field-0", value: "Título independente" },
          { fieldId: "field-1", value },
        ],
      })),
    };
    const defs = labels.map((_, i) =>
      definition(i === 0 ? "indice" : "support")
    );
    const findings = labels.map((_, i) => ({
      target: `slide-${i + 1}:support`,
      rule: "overflow",
      severity: "fatal" as const,
      evidence: "width",
    }));
    const next = repairLayoutLabels(
      copy,
      defs,
      findings,
      undefined,
      candidate => candidate.slides[3].values[1].value === "Próximo"
    );
    expect(next?.slides.map(s => s.values[1].value)).toEqual([
      "01",
      "",
      "R$ 49",
      "Próximo",
    ]);
    expect(copy.slides.map(s => s.values[1].value)).toEqual(labels);
  });
  it("prioritizes fewer defects while empty and releases all siblings after a delivery", async () => {
    const queue = new FirstDeliveryQueue([0, 1, 2]),
      grants: number[] = [];
    const first = queue.nextAttempt(0, 6).then(() => grants.push(0));
    const second = queue.nextAttempt(1, 2).then(() => grants.push(1));
    expect(grants).toEqual([]);
    queue.finish(2, false);
    await second;
    expect(grants).toEqual([1]);
    queue.finish(1, true);
    await first;
    await queue.nextAttempt(0, 4);
    expect(grants).toEqual([1, 0]);
  });
});
