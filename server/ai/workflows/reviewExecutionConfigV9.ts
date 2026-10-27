import { z } from "zod";
import { arsenalHash } from "@shared/arsenalContent";
import { GenerationFailureError } from "@shared/generationFailure";
import {
  reviewExecutionConfigV4Schema,
  proposalReviewRecordV9Schema,
  reviewDurableContextV4Schema,
} from "@shared/proposalReviewV9";
import {
  resolveReviewExecutionConfigV8,
  reviewInstructionsV8,
  copyInstructionsV8,
} from "./reviewExecutionConfigV8";
export const copyInstructionsV9 =
  copyInstructionsV8 +
  "\nProtocolo de fontes tipadas v3: preserve a finalidade e a origem de cada referência. Preferências visuais orientam a escolha; mantenha a geometria, cores e fontes autorais.";
export function reviewInstructionsV9(
  violations?: string[],
  invalidHash?: string
) {
  return (
    reviewInstructionsV8(violations, invalidHash).replace(
      "postspark.review.v8",
      "postspark.review.v9"
    ) +
    "\nIntervalos de orientação conservam seu tipo mesmo quando o texto também ocorre em outra fonte. Uma referência factual deve apontar para a fonte factual. Considere a imagem fonte original quando fornecida."
  );
}
export function reviewContractHashV9() {
  return arsenalHash({
    protocol: "review.v9.typed-sources.1",
    contextProtocol: "sources.typed-references.3",
    copyInstructions: copyInstructionsV9,
    instructions: [
      reviewInstructionsV9(),
      reviewInstructionsV9(["formal-reason"], "receipt-hash"),
    ],
    record: z.toJSONSchema(proposalReviewRecordV9Schema),
    receipt: z.toJSONSchema(reviewDurableContextV4Schema),
  });
}
export function resolveReviewExecutionConfigV9(textModel?: string) {
  const { configurationHash, ...old } =
    resolveReviewExecutionConfigV8(textModel);
  const data = {
    ...old,
    version: 4,
    policyVersion: 9,
    editorialGuidanceVersion: 8,
    timeoutMs: 45000,
    extendedTimeoutMs: 90000,
    contractHash: reviewContractHashV9(),
  };
  return reviewExecutionConfigV4Schema.parse({
    ...data,
    configurationHash: arsenalHash(data),
  });
}
export function assertReviewExecutionConfigV9(value: unknown) {
  const r = reviewExecutionConfigV4Schema.safeParse(value);
  if (!r.success)
    throw new GenerationFailureError(
      "preparation_contract_incompatible",
      "review"
    );
  const { configurationHash, ...data } = r.data;
  if (
    configurationHash !== arsenalHash(data) ||
    data.contractHash !== reviewContractHashV9()
  )
    throw new GenerationFailureError(
      "preparation_contract_incompatible",
      "review"
    );
  return r.data;
}
