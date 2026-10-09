import { describe, expect, it } from "vitest";
import { compactComponentCard, createComponentDefinition } from "@shared/componentAssembly";
import { componentAssemblyFixture, componentAssemblyPlanFixture } from "@shared/componentAssembly.fixture";
import { auditAssemblyArtDirection } from "./assemblyArtDirection";

describe("assembly art direction audit", () => {
  it("keeps legacy plans valid and catches three repeated labels without visual evidence", () => {
    const definition = componentAssemblyFixture()[0];
    const legacy = componentAssemblyPlanFixture(1);
    expect(auditAssemblyArtDirection(legacy, [definition])).toEqual([]);

    const plan = componentAssemblyPlanFixture(1) as any;
    for (const variation of plan.variations) variation.direction.intent = {
      language: "editorial", hierarchy: "headline", recurringComponentIds: [], mediaRole: "none",
      rhythm: [{ slideId: variation.slides[0].id, emphasis: "hero", density: "expressive" }],
    };
    const base = compactComponentCard(definition);
    const offered = [base, { ...base, id: "11111111-1111-4111-8111-111111111111", regions: [{ id:"a",kind:"text",x:.1,y:.1,width:.4,height:.3,rotation:0 }] }, { ...base, id:"22222222-2222-4222-8222-222222222222", regions:[{id:"b",kind:"text",x:.5,y:.5,width:.3,height:.2,rotation:0}] }];
    // Embedded media slots remain available to legacy plans, while extra visual capacity makes identical proposals auditable.
    expect(base.mediaSlots.length).toBeGreaterThan(0);
    expect(auditAssemblyArtDirection(legacy, offered as any)).toEqual([]);
    // Deliberately give each proposal a different intent label while keeping its actual choices identical.
    plan.variations[1].direction.intent.language = "graphic";
    plan.variations[2].direction.intent.language = "organic";
    expect(auditAssemblyArtDirection(plan, offered as any)).toContain("proposals: three distinct visual directions are required; proposals repeat the same cover structure, placement, palette, typography donor and support pieces");
  });

  it("rejects rhythm ordering and ineligible/unoffered recurrence", () => {
    const definition = componentAssemblyFixture()[0];
    const plan = componentAssemblyPlanFixture(2) as any;
    const first = plan.variations[0];
    first.direction.intent = { language:"editorial", hierarchy:"headline", recurringComponentIds:["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", definition.id], mediaRole:"subject", rhythm:[
      { slideId:first.slides[1].id, emphasis:"reading", density:"quiet" },
      { slideId:first.slides[0].id, emphasis:"hero", density:"expressive" },
    ] };
    const issues = auditAssemblyArtDirection(plan, [definition]);
    expect(issues).toContain("variation_0: rhythm order/slideId/density mismatch");
    expect(issues).toContain(`variation_0: invalid recurring component IDs`);
    expect(issues).toContain(`variation_0: recurring component ${definition.id} is not an eligible repeated component`);

    const { hash: _hash, ...donorInput } = definition;
    const donor = createComponentDefinition({ ...donorInput, id: "33333333-3333-4333-8333-333333333333", kind: "typography" });
    const donorPlan = componentAssemblyPlanFixture(2) as any;
    const v = donorPlan.variations[0];
    v.direction.typographyComponentId = donor.id;
    v.direction.intent = { language:"typographic", hierarchy:"headline", recurringComponentIds:[donor.id], mediaRole:"subject", rhythm:[
      {slideId:v.slides[0].id,emphasis:"hero",density:v.slides[0].density},
      {slideId:v.slides[1].id,emphasis:"closing",density:v.slides[1].density},
    ] };
    const donorIssues = auditAssemblyArtDirection(donorPlan, [definition, donor] as any);
    expect(donorIssues).not.toContain(`variation_0: recurring component ${donor.id} is not an eligible repeated component`);
  });
});
