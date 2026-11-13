import type { GenerationIntent } from "../../shared/generationPlan";
import type { ImageObligation } from "../../shared/generationContracts";

/** 96 explicitly identified contract cases. Scores are replay controls, not human/provider judgments. */
export function selectionReferenceCorpus() {
  const cases: Array<{ id: string; brief: string; aspectRatio: string; slideCount: number; intent: GenerationIntent; media: ImageObligation }> = [];
  for (const aspectRatio of ["1:1", "4:5", "5:6", "9:16"])
    for (const slideCount of [1, 5])
      for (const kind of ["short", "long", "comparison", "brand"])
        for (const media of ["optional", "required", "forbidden"] as const) {
          const meaning = kind === "long"
            ? "Explique como planejar as compras da semana: verificar os ingredientes disponíveis, escolher refeições variadas, calcular as quantidades para evitar desperdício e organizar a lista antes de sair. Preserve cada etapa e explique a razão, sem inventar resultados ou promessas."
            : kind === "comparison" ? "Compare comprar sem lista e planejar as compras, com diferenças de organização e desperdício."
              : kind === "brand" ? "Apresente a marca fictícia Estúdio Ipê. Preserve o nome e não invente credenciais."
                : "Planeje suas compras.";
          const brief = `${meaning} ${slideCount === 1 ? "Post estático" : "Carrossel com cinco páginas"} em ${aspectRatio}. ${media === "required" ? "Use uma foto." : media === "forbidden" ? "Sem foto." : "Foto opcional."}`;
          const texts = kind === "comparison" ? ["Comprar sem lista", "Planejar as compras"] : kind === "long" ? [
            "Verifique os ingredientes disponíveis", "Escolha refeições variadas", "Calcule as quantidades", "Organize a lista antes de sair",
          ] : [meaning];
          const id = `${aspectRatio.replace(":", "x")}-${slideCount}-${kind}-${media}`;
          cases.push({ id, brief, aspectRatio, slideCount,
            media: {policy: media, required: media === "required", slotTargets: media === "required" ? 1 : 0, purpose: media === "forbidden" ? "none" : "editorial-photo", reason: "Contrato declarado do caso de referência"},
            intent: {version: 1, objective: meaning, adaptation: "controlled", tone: {description: "Claro", origin: "inferred", rationale: "Sem obrigação de tom"},
              requirements: [{id: "content", kind: "content", description: meaning, surface: "art", origin: "explicit", source: "declared", strength: "required", requestQuote: meaning, itemCount: texts.length > 1 ? texts.length : null}],
              content: texts.map((text, index) => ({id: `item-${index}`, meaning: text, requirementIds: ["content"], sourceIds: []})),
            },
          });
        }
  return cases;
}
