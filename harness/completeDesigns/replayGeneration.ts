/** Offline architecture check against the imported local catalogue and font bytes.
 * Synthetic selection/copy and originality; no provider, database or paid call. */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  compactComponentCard,
  componentDefinitionV1Schema,
} from "../../shared/componentAssembly";
import { completeDesignFields } from "../../shared/completeDesignGeneration";
import { arsenalHash } from "../../shared/arsenalContent";
import { readArsenalComposition } from "../../shared/designArsenal";
import { generateCompleteDesignVariations } from "../../server/ai/completeDesignGeneration";
import { createComponentTextMeasurer } from "../../server/ai/componentTextMeasurer";
import { prepareGenerationPlan } from "../../server/ai/generationPipeline";

const root = resolve(
  process.argv[2] ??
    "artifacts/complete-designs/whole-catalog-final-2026-10-06-r2"
);
const output = resolve(
  process.argv[3] ??
    "artifacts/complete-designs/architecture-v4-offline-2026-10-07"
);
const packages: Array<{ components: unknown[] }> = await Promise.all(
  (await readdir(join(root, "packages")))
    .filter(n => n.endsWith(".json"))
    .map(async n =>
      JSON.parse(await readFile(join(root, "packages", n), "utf8"))
    )
);
const definitions = packages
  .flatMap(p =>
    p.components.map((c: unknown) => componentDefinitionV1Schema.parse(c))
  )
  .filter(
    d => d.completeDesign?.baselineVerified && d.aspectRatios.includes("4:5")
  );
const ids = [
  "86b14978-c67b-467e-8d10-2bd2ec69de04",
  "21c56784-8d0f-4065-8930-a2b8e9ca5d75",
  "0cb033d1-ae67-4d35-8d08-0e1b2f56a294",
];
const selected = ids.map(id => {
  const d = definitions.find(d => d.id === id);
  if (!d) throw new Error(`Missing replay design: ${id}`);
  return d;
});
const selection = {
  options: selected.map(d => ({
    designIds: Array(3).fill(d.id),
    reason: `Replay sintético da composição ${d.label}; a escolha da IA não está sendo avaliada.`,
  })),
};
const copy = {
  options: selected.map(d => ({
    caption: "Uma pausa no Café da Tarde.",
    hashtags: ["café"],
    slides: Array.from({ length: 3 }, (_, i) => ({
      values: completeDesignFields(d).map(field => ({
        fieldId: field.id,
        value:
          field.kind === "list"
            ? ["Café", "Pausa"]
            : field.role === "headline"
              ? ["Café artesanal", "Uma boa pausa", "Venha visitar"][i]
              : i === 2
                ? "Visite o Café da Tarde."
                : "Café e boa conversa.",
      })),
      mediaPrompts: (d.fragment.mediaSlots ?? []).map(s => ({
        slotId: s.id,
        prompt: "Café em uma mesa, luz natural.",
      })),
    })),
  })),
};
const events: unknown[] = [],
  calls: string[] = [];
const runId = "b4f80dea-5ae0-4c16-a6e0-a36e51ce4782",
  before = arsenalHash(definitions);
const result = await generateCompleteDesignVariations(
  {
    offered: definitions.map(compactComponentCard),
    resolve: async ids => definitions.filter(d => ids.includes(d.id)),
    experimental: true,
    aspectRatio: "4:5",
    slideCount: 3,
    userUuid: "offline",
    request: {
      inputType: "text",
      content:
        "Carrossel de três slides sobre café artesanal; encerrar com convite para visitar Café da Tarde.",
      platform: "instagram",
      postMode: "carousel",
      creationMode: "ideation",
    },
    siteIntelligence: null,
    executionBrief: null,
    deadlineMs: null,
    plan: await prepareGenerationPlan({ sourceContent: "Café artesanal" }),
  },
  {
    clock: () => Date.now(),
    trace: { id: runId, recordEvent: e => events.push(e) },
    createTextMeasurer: assets =>
      createComponentTextMeasurer(assets, a =>
        readFile(join(root, "assets", a.sha256))
      ),
    generate: async p => {
      calls.push(p.traceLabel ?? "");
      return {
        choices: [
          {
            message: {
              content: JSON.stringify(
                p.traceLabel?.includes("select") ? selection : copy
              ),
            },
          },
        ],
      } as any;
    },
    loadRecentPosts: async () => [],
    assessOriginality: async () => ({
      assessments: [],
      embeddings: [],
      fallbackUsed: false,
    }),
  }
);
if (result.status !== "approved") throw new Error(JSON.stringify(result));
if (arsenalHash(definitions) !== before)
  throw new Error("Catalogue was mutated");
const scenes = result.snapshots.flatMap((v, slot) =>
  v.completeDesignV1!.slides.map(slide => {
    const c = readArsenalComposition(slide.composition),
      source = selected[slot];
    for (const [label, actual, expected] of [
      ["instances", c.base.instances, source.fragment.instances],
      ["groups", c.base.groups, source.fragment.groups],
      ["pieces", c.pieces, source.pieces],
      ["assets", c.assets, source.assets],
    ] as const)
      if (arsenalHash(actual) !== arsenalHash(expected))
        throw new Error(`Native ${label} changed`);
    if (c.issues.length) throw new Error("Scene contains issues");
    return {
      slot,
      slideId: slide.id,
      designId: source.id,
      definitionHash: source.hash,
      candidateId: c.origin.candidateId,
      issues: c.issues,
    };
  })
);
await mkdir(output, { recursive: true });
await writeFile(
  join(output, "OFFLINE_REPLAY.json"),
  JSON.stringify(
    {
      verification: "offline-synthetic-provider-real-catalog-and-fonts",
      pipeline: "complete-design-v1",
      eligibleDesigns: definitions.length,
      calls,
      scenes,
      events,
      limitations: [
        "No real LLM selection/copy",
        "No remote database or asset grants",
        "No authenticated browser or visual approval",
      ],
      snapshots: result.snapshots,
    },
    null,
    2
  )
);
console.log(
  JSON.stringify({
    status: result.status,
    eligibleDesigns: definitions.length,
    scenes: scenes.length,
    calls,
    output: join(output, "OFFLINE_REPLAY.json"),
  })
);
