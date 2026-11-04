import { z } from "zod";
import type { ComponentDefinitionV1 } from "./componentAssembly";

export const designMechanicsSchema = z
  .object({
    version: z.literal(1),
    evidence: z.literal("definition"),
    fields: z.array(
      z
        .object({
          source: z.string(),
          label: z.string(),
          hideWhenEmpty: z.array(z.string()).optional(),
          distribution: z.enum([
            "continuous",
            "typographic_fragments",
            "repeated_value",
            "independent_items",
            "media",
          ]),
          targets: z.array(
            z
              .object({
                id: z.string(),
                label: z.string(),
                fontSize: z.number().nonnegative(),
                emphasis: z.array(z.string()),
                charsEstimate: z.number().nonnegative().nullable(),
                fragmentWeight: z.number().optional(),
                occupancyPriority: z.number().int().nonnegative().optional(),
              })
              .strict()
          ),
        })
        .strict()
    ),
    relations: z.array(
      z
        .object({
          kind: z.string(),
          targets: z.array(z.string()),
          label: z.string().optional(),
        })
        .strict()
    ),
    capacityEvidence: z.literal("geometry_estimate_not_measurement"),
  })
  .strict();
export type DesignMechanics = z.infer<typeof designMechanicsSchema>;

/** Field ownership survives projection; labels refer to authorship, never to demo copy. */
export function deriveDesignMechanics(
  definition: ComponentDefinitionV1
): DesignMechanics {
  const { fragment, pieces } = definition;
  return designMechanicsSchema.parse({
    version: 1,
    evidence: "definition",
    capacityEvidence: "geometry_estimate_not_measurement",
    fields: fragment.bindings.map(binding => ({
      source: binding.source,
      label: binding.label,
      ...(binding.hideWhenEmpty
        ? { hideWhenEmpty: binding.hideWhenEmpty }
        : {}),
      distribution:
        binding.kind === "media"
          ? "media"
          : binding.kind === "list"
            ? "independent_items"
            : binding.targetIds.some(id => {
                  const instance = fragment.instances.find(i => i.id === id)!;
                  return !!pieces[instance.pieceHash].contentFragment;
                })
              ? "typographic_fragments"
              : binding.targetIds.length > 1
                ? "repeated_value"
                : "continuous",
      targets: binding.targetIds.map(id => {
        const instance = fragment.instances.find(i => i.id === id)!,
          piece = pieces[instance.pieceHash];
        return {
          id,
          label: id,
          fontSize: piece.kind === "text" ? piece.fontSize : 0,
          emphasis: [
            piece.fontWeight >= 600 ? "bold" : "",
            piece.extrusion ? "extrusion" : "",
            piece.stroke && piece.strokeWidth > 0 ? "outline" : "",
            piece.fill ? `color:${piece.fill}` : "",
          ].filter(Boolean),
          charsEstimate:
            piece.kind === "text" && piece.fontSize > 0
              ? Math.max(
                  0,
                  Math.floor(instance.width / (piece.fontSize * 0.55)) *
                    Math.max(
                      1,
                      Math.floor(instance.height / (piece.fontSize * 1.2))
                    )
                )
              : null,
          ...(piece.contentFragment?.weights
            ? {
                fragmentWeight:
                  piece.contentFragment.weights[piece.contentFragment.index],
              }
            : {}),
          ...(piece.contentFragment?.allocation
            ? {
                occupancyPriority:
                  piece.contentFragment.allocation.priority.indexOf(
                    piece.contentFragment.index
                  ),
              }
            : {}),
        };
      }),
    })),
    // Keep semantic dependency edges separate from advisory capacity. textFit adds no relationship between fields.
    relations: [
      ...fragment.relations
        .filter(r => r.kind !== "textFit")
        .map(r => ({
          kind: r.kind,
          targets: Array.from(new Set(r.outputs.map(o => o.targetId))),
        })),
      ...(
        definition.completeDesign?.designGuidance?.fieldRelationships ?? []
      ).map(r => ({ kind: r.kind, targets: r.sources, label: r.label })),
    ],
  });
}
