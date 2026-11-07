import { describe, expect, it } from "vitest";
import { z } from "zod";
import { reviewResponseInventorySchemaV10 } from "./proposalReviewV10";

const response = {
  outcome: "reviewed", limitation: "", reviewedSlides: [0], requirementChecks: [],
  messageAssessment: {status: "preserved", explanation: "Pedido preservado."},
  unitChecks: [], intentChecks: [], findings: [],
  sequenceAssessment: {status: "coherent", explanation: "Peça coerente.", promises: []},
};
describe("native review requirement inventories", () => {
  it("makes both empty namespaces impossible to populate with idea IDs", () => {
    const schema = reviewResponseInventorySchemaV10({requirementChecks: [], intentChecks: []});
    const json = z.toJSONSchema(schema) as any;
    expect(json.properties.requirementChecks).toMatchObject({minItems: 0, maxItems: 0});
    expect(json.properties.intentChecks).toMatchObject({minItems: 0, maxItems: 0});
    expect(schema.safeParse(response).success).toBe(true);
    expect(schema.safeParse({...response, intentChecks: [{requirementId: "idea-1", status: "met", deliveries: [], explanation: "Uma ideia"}]}).success).toBe(false);
  });
  it("keeps the populated namespaces separate with exact counts and compact enums", () => {
    const schema = reviewResponseInventorySchemaV10({requirementChecks: ["source-1", "source-2"], intentChecks: ["intent-1"]});
    const json = z.toJSONSchema(schema) as any;
    expect(json.properties.requirementChecks).toMatchObject({minItems: 2, maxItems: 2, items: {properties: {requirementId: {enum: ["source-1", "source-2"]}}}});
    expect(json.properties.intentChecks).toMatchObject({minItems: 1, maxItems: 1});
    const valid = {...response, requirementChecks: ["source-1", "source-2"].map(requirementId => ({requirementId, status: "met", unitIds: [], explanation: "Verificado."})), intentChecks: [{requirementId: "intent-1", status: "met", deliveries: [], explanation: "Verificado."}]};
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({...valid, intentChecks: [{...valid.intentChecks[0],requirementId: "source-1"}]}).success).toBe(false);
    expect(schema.safeParse({...valid, requirementChecks: valid.requirementChecks.slice(0, 1)}).success).toBe(false);
    const many = z.toJSONSchema(reviewResponseInventorySchemaV10({requirementChecks: Array.from({length:50}, (_,i)=>`r-${i}`), intentChecks: []}));
    expect(JSON.stringify(many).length - JSON.stringify(json).length).toBeLessThan(1000);
  });
});
