import { z } from "zod";
import type { ArsenalSearchHit } from "@shared/arsenalCatalog";
export const queryProfilesSchema = z
  .object({
    version: z.literal("query-profiles-v1"),
    profiles: z.array(
      z
        .object({
          id: z.string(),
          priority: z.number().int(),
          intentions: z.array(z.string()),
          provenance: z.string(),
          anchors: z
            .array(
              z
                .object({
                  versionId: z.string().uuid(),
                  variantKey: z.string(),
                  definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
                  variantHash: z.string().regex(/^[a-f0-9]{64}$/),
                })
                .strict()
            )
            .max(3),
        })
        .strict()
    ),
  })
  .strict();
// Real imported identities. The retrieval query activates them only after human review/publication.
export const ARSENAL_QUERY_PROFILES = queryProfilesSchema.parse({
  version: "query-profiles-v1",
  profiles: [
    {
      id: "headline-body-minimal-air",
      priority: 10,
      intentions: ["headline-body"],
      provenance:
        "Identidades da versão 2 do Minimal Air, com retrato 4:5 derivado em 2026-10-01. Âncoras ficam inativas enquanto a versão é draft; resolução exige aprovação humana publicada no Supabase.",
      anchors: [
        {
          versionId: "8ed8a6f1-dd4d-4878-83be-534404e1b2fd",
          variantKey: "1x1-533f796b90f1",
          definitionHash:
            "f6add8167866d235f24d03f2616586a15b481553164a7c2b34644b0e3517a0fa",
          variantHash:
            "805c17be669a4ed0cfae9f1ee3b8814a427c82c3e73968aa3d2b306248ee7369",
        },
        {
          versionId: "8ed8a6f1-dd4d-4878-83be-534404e1b2fd",
          variantKey: "4x5-instagram-v1",
          definitionHash:
            "f6add8167866d235f24d03f2616586a15b481553164a7c2b34644b0e3517a0fa",
          variantHash:
            "279357613af73a07916f35c195ada12374afef82a07cede6fc83523c25381e88",
        },
        {
          versionId: "8ed8a6f1-dd4d-4878-83be-534404e1b2fd",
          variantKey: "9x16-5d17ce0c37c2",
          definitionHash:
            "f6add8167866d235f24d03f2616586a15b481553164a7c2b34644b0e3517a0fa",
          variantHash:
            "42e994cbb249b6c2e9024577754ed566f008b5407f49207a447ba011e4633d00",
        },
      ],
    },
  ],
});
export function mergeArsenalNeighbors(lists: ArsenalSearchHit[][], limit = 5) {
  const seen = new Set<string>(),
    blueprints = new Set<string>(),
    result: ArsenalSearchHit[] = [];
  for (let round = 0; round < 20 && result.length < limit; round++)
    for (const list of lists) {
      const hit = list[round];
      if (!hit || seen.has(hit.candidateId) || blueprints.has(hit.blueprintId))
        continue;
      seen.add(hit.candidateId);
      blueprints.add(hit.blueprintId);
      result.push(hit);
      if (result.length === limit) break;
    }
  return result;
}
