import { describe, expect, it } from "vitest";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { policyImageObligation } from "./generationPreparation";
const input = (content: string) => orchestratedGenerationInputSchema.parse({ownerId: "00000000-0000-4000-8000-000000000001", inputType: "text", content, platform: "instagram", idempotencyKey: "capability-media", selectionPolicy: "capability_v1"});
describe("declared media requirements versus preferences", () => {
  it.each([
    ["Use uma foto do produto", "required"],
    ["Quero um post sem foto", "forbidden"],
    ["Prefiro um post sem foto", "optional"],
    ["Se possível use uma foto", "optional"],
    ["Prefiro azul. Use uma foto do produto", "required"],
    ["Prefiro sem foto, mas use uma foto do produto", "required"],
    ["Prefiro azul e use uma foto do produto", "required"],
    ["Use uma foto do produto, prefiro azul", "required"],
    ["Prefiro azul e não use fotos", "forbidden"],
  ])("%s => %s", (brief, policy) => expect(policyImageObligation(input(brief), null).policy).toBe(policy));
});
