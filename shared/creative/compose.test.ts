import { describe, expect, it } from "vitest";
import { createPostVariation } from "../../tests/fixtures/postspark";
import { DEFAULT_DESIGN_TOKENS } from "../postspark";
import { composeVariation } from "./compose";
import { directCreative } from "./directCreative";
import { hashString } from "./seed";

/**
 * SPEC-002 (docs/reforma/SPEC-002 passo 2): composeVariation não pode mutar
 * a entrada. `Object.freeze` faz qualquer escrita silenciosa virar
 * TypeError em modo estrito (module ESM já é estrito) — é o jeito mais
 * direto de provar pureza, mais forte que comparar snapshots antes/depois
 * (que não pega mutação seguida de restauração acidental).
 */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.getOwnPropertyNames(value).forEach((key) => {
      deepFreeze((value as Record<string, unknown>)[key]);
    });
    Object.freeze(value);
  }
  return value;
}

describe("composeVariation", () => {
  it("does not mutate a frozen input variation", () => {
    const variation = deepFreeze(createPostVariation());

    expect(() => composeVariation(variation, DEFAULT_DESIGN_TOKENS)).not.toThrow();
  });

  it("does not mutate an input variation that already has creativeDirection/copyAngle", () => {
    const base = createPostVariation();
    const direction = directCreative(base, null, hashString(base.id));
    const withDirection = deepFreeze({
      ...base,
      creativeDirection: { ...direction, familyId: "chromatic-block" },
    });

    expect(() => composeVariation(withDirection, DEFAULT_DESIGN_TOKENS)).not.toThrow();
  });

  it("produces structurally identical output for the same input, seed and aspect ratio", () => {
    const variation = createPostVariation({ id: "determinism-check" });

    const first = composeVariation({ ...variation }, DEFAULT_DESIGN_TOKENS);
    const second = composeVariation({ ...variation }, DEFAULT_DESIGN_TOKENS);

    expect(second).toEqual(first);
  });

  it("produces a different creative direction for a different seed (via id)", () => {
    const a = composeVariation(createPostVariation({ id: "seed-a" }), DEFAULT_DESIGN_TOKENS);
    const b = composeVariation(createPostVariation({ id: "seed-b" }), DEFAULT_DESIGN_TOKENS);

    // Não é garantido que família/paleta sempre difiram (o espaço é finito),
    // mas a seed derivada do id deve diferir — é o que alimenta toda a
    // composição determinística.
    expect(a.creativeDirection?.seed).not.toBe(b.creativeDirection?.seed);
  });
});
