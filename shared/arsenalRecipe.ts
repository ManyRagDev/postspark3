import { z } from "zod";
import { recreationRecipeSchema } from "./designRecreation";
import {
  arsenalCompositionSchema,
  readArsenalComposition,
  type ArsenalComposition,
} from "./designArsenal";
import { arsenalHash } from "./arsenalContent";

/** V1–V3 schema and payload remain intact. V4 is a separate envelope. */
export const arsenalRecipeV4Schema = z
  .discriminatedUnion("representation", [
    z
      .object({
        format: z.literal("postspark.admin2.recipe"),
        version: z.literal(4),
        representation: z.literal("composition-v2"),
        composition: arsenalCompositionSchema,
      })
      .strict(),
    z
      .object({
        format: z.literal("postspark.admin2.recipe"),
        version: z.literal(4),
        representation: z.literal("fixed-v3"),
        source: recreationRecipeSchema.refine(r => r.version === 3),
        sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
        // No dynamic relations are inferred from fixed geometry. Original groups/coordinates live in source.matrix.
        relations: z.array(z.never()).length(0),
      })
      .strict(),
  ])
  .superRefine((recipe, ctx) => {
    try {
      if (recipe.representation === "composition-v2")
        readArsenalComposition(recipe.composition);
      else if (recipe.sourceHash !== arsenalHash(recipe.source))
        throw new Error("Hash do snapshot V3 divergente");
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Receita inválida",
      });
    }
  });
export type ArsenalRecipeV4 = z.infer<typeof arsenalRecipeV4Schema>;
export const arsenalRecipeV5Schema = z
  .object({
    format: z.literal("postspark.admin2.recipe"),
    version: z.literal(5),
    representation: z.literal("composition-v3"),
    composition: arsenalCompositionSchema,
  })
  .strict()
  .superRefine((recipe, ctx) => {
    try {
      readArsenalComposition(recipe.composition);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Receita V5 inválida",
      });
    }
  });
export type ArsenalRecipeV5 = z.infer<typeof arsenalRecipeV5Schema>;

export function readPortableArsenalRecipe(value: unknown) {
  const version = (value as { version?: unknown })?.version;
  if (version === 5) return arsenalRecipeV5Schema.parse(value);
  if (version === 4) return arsenalRecipeV4Schema.parse(value);
  return recreationRecipeSchema.parse(value);
}
export function fixedV3ToV4(value: unknown): ArsenalRecipeV4 {
  const source = recreationRecipeSchema.parse(value);
  return arsenalRecipeV4Schema.parse({
    format: "postspark.admin2.recipe",
    version: 4,
    representation: "fixed-v3",
    source,
    sourceHash: arsenalHash(source),
    relations: [],
  });
}
export function compositionToRecipeV4(
  composition: ArsenalComposition
): ArsenalRecipeV4 {
  return arsenalRecipeV4Schema.parse({
    format: "postspark.admin2.recipe",
    version: 4,
    representation: "composition-v2",
    composition,
  });
}
export function compositionToRecipeV5(
  composition: ArsenalComposition
): ArsenalRecipeV5 {
  return arsenalRecipeV5Schema.parse({
    format: "postspark.admin2.recipe",
    version: 5,
    representation: "composition-v3",
    composition,
  });
}
export function compositionToPortableRecipe(
  composition: ArsenalComposition
): ArsenalRecipeV4 | ArsenalRecipeV5 {
  if (composition.version === 3) return compositionToRecipeV5(composition);
  return compositionToRecipeV4(composition);
}
