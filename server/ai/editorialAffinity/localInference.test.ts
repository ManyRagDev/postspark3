import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { compactComponentCard } from "@shared/componentAssembly";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { editorialCatalogProfiles } from "./catalogProfiles";
import { createAffinityObserver, offeredEditorialProfiles } from "./observe";
import { loadAffinityBundle } from "./bundle";
import { editorialAffinityReceiptSchema } from "./contracts";

// Opt-in real inference: requires explicitly provisioned local weights and r9.
// No API, browser, paid generation or human editorial approval is exercised here.
const directory = process.env.EDITORIAL_AFFINITY_TEST_DIR;
const catalogAvailable = editorialCatalogProfiles.every(p =>
  existsSync(resolve(p.evidence.sourcePath))
);
describe.skipIf(!directory || !catalogAvailable)(
  "provisioned local editorial inference",
  () => {
    it("scores actual static/carousel repertoires without network and preserves its receipt through JSON transport", async () => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () => {
          throw new Error("network forbidden in local inference");
        });
      let loaded: Awaited<ReturnType<typeof loadAffinityBundle>> | undefined;
      try {
        const cards = editorialCatalogProfiles.flatMap(p =>
          p.evidence.components.map(c => {
            const definition = JSON.parse(
              readFileSync(
                resolve(dirname(p.evidence.sourcePath), `${c.id}.json`),
                "utf8"
              )
            );
            return compactComponentCard(definition);
          })
        );
        loaded = await loadAffinityBundle(resolve(directory!));
        const observe = createAffinityObserver({
          mode: "shadow",
          directory: resolve(directory!),
          load: async () => loaded!,
          timeoutMs: 5000,
        });
        const input = orchestratedGenerationInputSchema.parse({
          ownerId: "00000000-0000-4000-8000-000000000001",
          idempotencyKey: "local-affinity",
          inputType: "text",
          content:
            "Compare duas alternativas em blocos lado a lado, destacando as diferenças.",
          platform: "instagram",
          postMode: "static",
        });
        const first = await observe({ input, cards });
        expect(first?.status).toBe("scored");
        expect(first?.scores.length).toBeGreaterThan(10);
        expect(first?.scores.some(s => s.familyId === "versus")).toBe(true);
        expect(first?.tokenCount).toBeGreaterThan(5);
        expect(first?.modelId).toBe(loaded.bundle.model.modelId);
        expect(
          editorialAffinityReceiptSchema.parse(
            JSON.parse(JSON.stringify(first))
          )
        ).toEqual(first);

        const carouselInput = {
          ...input,
          postMode: "carousel" as const,
          slideCount: 5,
        };
        const carousel = await observe({ input: carouselInput, cards });
        expect(carousel?.status).toBe("scored");
        const allowed = offeredEditorialProfiles({
          input: carouselInput,
          cards,
        });
        expect(
          offeredEditorialProfiles({
            input: {
              ...carouselInput,
              tone: "Mesmo layout em todos os slides",
            },
            cards,
            repertoireInstructions: input.content,
          })
        ).toEqual(allowed);
        const sourceOnly = editorialCatalogProfiles[0];
        const materialized = offeredEditorialProfiles({
          input: carouselInput,
          cards,
          catalogIdentities: [
            {
              family: sourceOnly.familyId,
              sourceId: sourceOnly.id,
              sourceHash: sourceOnly.evidence.sourceHash,
              components: [
                { id: sourceOnly.id, hash: sourceOnly.evidence.sourceHash },
              ],
            },
          ],
        });
        expect(materialized).toHaveLength(1);
        expect(
          materialized[0].references.every(r =>
            r.evidenceComponentIds.includes(sourceOnly.id)
          )
        ).toBe(true);
        for (const score of carousel!.scores) {
          const profile = allowed.find(p => p.id === score.profileId)!;
          expect(profile).toBeDefined();
          expect(score.references.map(r => r.id).sort()).toEqual(
            profile.references.map(r => r.id).sort()
          );
        }
        expect(carousel?.inputHash).not.toBe(first?.inputHash);
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        await loaded?.engine.dispose();
        fetch.mockRestore();
      }
    }, 30000);
  }
);
