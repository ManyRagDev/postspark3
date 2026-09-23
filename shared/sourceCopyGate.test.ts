import { describe, expect, it } from "vitest";
import { evaluateSourceCopyGate, stripRequiredTerms } from "./sourceCopyGate";

describe("sourceCopyGate", () => {
  it("blocks a headline identical to the prompt", () => {
    const violations = evaluateSourceCopyGate({
      prompt: "Como vender mais com autoridade",
      fields: [{ field: "headline", value: "Como vender mais com autoridade" }],
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].code).toBe("source_copy_too_similar");
  });

  it("blocks near-verbatim reproduction", () => {
    const violations = evaluateSourceCopyGate({
      prompt: "cinco dicas práticas para aumentar a retenção de clientes em consultorias",
      fields: [{ field: "body", value: "cinco dicas práticas para aumentar a retenção de clientes em consultorias hoje" }],
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows original copy", () => {
    const violations = evaluateSourceCopyGate({
      prompt: "cinco dicas práticas para aumentar a retenção de clientes em consultorias",
      fields: [{ field: "headline", value: "Por que seu cliente some depois da proposta" }],
    });
    expect(violations).toHaveLength(0);
  });

  it("preserves a mandatory slogan (explicit exception)", () => {
    const slogan = "O marketing que gera autoridade";
    const violations = evaluateSourceCopyGate({
      prompt: `Use o slogan "${slogan}" no post`,
      requiredTerms: [slogan],
      fields: [{ field: "headline", value: slogan }],
    });
    expect(violations).toHaveLength(0);
  });

  it("strips required terms before comparison", () => {
    const stripped = stripRequiredTerms(
      "O marketing que gera autoridade mude sua marca",
      ["O marketing que gera autoridade"],
    );
    expect(stripped).not.toContain("O marketing que gera autoridade");
  });
});