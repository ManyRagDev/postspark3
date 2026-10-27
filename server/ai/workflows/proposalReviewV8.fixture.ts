import {
  healthyReviewV7Fixture,
  reviewPayloadV7,
} from "./proposalReviewV7.fixture";
import type { InvokeParams } from "../../_core/llm";
/** Deliberately controlled classifications: fixtures never claim to evaluate model semantics. */
export function healthyReviewV8Fixture(params: InvokeParams) {
  const data = reviewPayloadV7(params);
  return {
    ...healthyReviewV7Fixture(params),
    factualAudit: {
      units: data.textUnits.map((u: any) => ({
        unitId: u.id,
        classification: "non_factual",
        claimIds: [],
      })),
      claims: [],
    },
  };
}
