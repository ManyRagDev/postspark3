import { z } from "zod";
import { arsenalHash } from "@shared/arsenalContent";
import { affirmativeCopyInstructions } from "@shared/affirmativeSocialPlaybook";
import { GenerationFailureError } from "@shared/generationFailure";
import {
  proposalReviewResponseV8Schema,
  proposalReviewRecordV8Schema,
  reviewDurableContextV3Schema,
  reviewExecutionConfigV3Schema,
} from "@shared/proposalReviewV8";
import {
  resolveReviewExecutionConfigV7,
  reviewInstructionsV7,
} from "./reviewExecutionConfigV7";
import { referenceContextInstructions } from "./editorialContextV8";

export const copyInstructionsV8 =
  affirmativeCopyInstructions + "\n" + referenceContextInstructions;
export function reviewInstructionsV8(
  violations?: string[],
  invalidHash?: string
) {
  return (
    reviewInstructionsV7(violations, invalidHash, 6).replace(
      "postspark.review.v7",
      "postspark.review.v8"
    ) +
    "\n" +
    referenceContextInstructions +
    "\n" +
    [
      "Na mesma resposta, factualAudit.units classifica CADA unidade recebida como factual, non_factual ou mixed. Associe todas as afirmações factuais explícitas e implícitas aos respectivos claimIds, inclusive nas legendas e hashtags. Títulos, conselhos, hipóteses e CTAs podem ser não factuais conforme seu sentido concreto.",
      "factualAudit.claims enumera cada afirmação com id, unitId, observed literal da unidade, sources por intervalos UTF-16 das fontes, status supported/unsupported/uncertain e explanation breve. Uma unidade mixed combina afirmações factuais e linguagem não factual. Unidades non_factual têm claimIds vazio. Todos os demais claimIds têm uma entrada correspondente e exclusiva.",
      "supported exige evidência que sustente sujeito, modalidade, alcance e condições da afirmação; justifique a relação. Voz, público, CTA, dores do público e termos proibidos são orientação, e não prova de funcionalidades ou resultados. Uma citação existente comprova origem, não equivalência de sentido. Garantia de entrega exige suporte de garantia, além de reputação ou modalidade de envio. Menor preço observado não implica preço abaixo da média histórica.",
      "unsupported explicita a ausência de suporte e gera finding material; uncertain explicita a dúvida factual material e impede aprovação. Declarações verdadeiras segundo a fonte podem ser supported sem certificação externa. Mantenha linguagem e acabamento como advisory. Esta auditoria examina a copy final e não depende de um plano do redator.",
    ].join("\n")
  );
}
export function reviewContractHashV8() {
  return arsenalHash({
    protocol: "review.v8.factual-audit.1",
    contextProtocol: "sources.references.2",
    selectionProtocol: "selection.v3",
    writerLayout: "native.geometry.1",
    copyInstructions: copyInstructionsV8,
    instructions: [
      reviewInstructionsV8(),
      reviewInstructionsV8(["formal-reason"], "receipt-hash"),
    ],
    schema: z.toJSONSchema(proposalReviewResponseV8Schema),
    recordSchema: z.toJSONSchema(proposalReviewRecordV8Schema),
    receipt: z.toJSONSchema(reviewDurableContextV3Schema),
  });
}
export function resolveReviewExecutionConfigV8(textModel?: string) {
  const { configurationHash, ...old } = resolveReviewExecutionConfigV7(
    6,
    textModel
  );
  const data = {
    ...old,
    version: 3 as const,
    policyVersion: 8 as const,
    editorialGuidanceVersion: 7 as const,
    contractHash: reviewContractHashV8(),
  };
  return reviewExecutionConfigV3Schema.parse({
    ...data,
    configurationHash: arsenalHash(data),
  });
}
export function assertReviewExecutionConfigV8(value: unknown) {
  const r = reviewExecutionConfigV3Schema.safeParse(value);
  if (!r.success)
    throw new GenerationFailureError(
      "preparation_contract_incompatible",
      "review"
    );
  const { configurationHash, ...data } = r.data;
  if (
    configurationHash !== arsenalHash(data) ||
    data.contractHash !== reviewContractHashV8()
  )
    throw new GenerationFailureError(
      "preparation_contract_incompatible",
      "review"
    );
  return r.data;
}
