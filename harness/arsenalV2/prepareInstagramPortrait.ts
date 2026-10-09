import "dotenv/config";
import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { arsenalImportSchema } from "../../shared/arsenalCatalog";
import { arsenalHash } from "../../shared/arsenalContent";
import { aspectRatioDimensions } from "../../shared/aspectRatios";
import { prepareArsenalDraft } from "../../server/designCatalog/arsenalStore";

// Authorship creates a new immutable draft. It never approves or publishes one.
const source =
  "artifacts/arsenal-v2/import-2026-10-01T20-59-00-631Z/packages/02de75fd-37bc-449f-8e6a-ffc163d6269b.json";
const dir = "artifacts/arsenal-v2/instagram-4x5";
const original = arsenalImportSchema.parse(
  JSON.parse(await fs.readFile(source, "utf8"))
);
const definitionHash = arsenalHash(original.definition);
const next = structuredClone(original);
const portrait = next.definition.variants.find(v => v.aspectRatio === "5:6")!;
if (
  !portrait ||
  portrait.artboard.width !== 1080 ||
  portrait.artboard.height !== 1296 ||
  portrait.groups.some(g => g.parentId !== null || g.y !== 0 || g.scale !== 1)
)
  throw new Error("A fonte mudou; reavalie a geometria antes de derivar");
portrait.variantKey = "4x5-instagram-v1";
portrait.aspectRatio = "4:5";
const offsetY =
  (aspectRatioDimensions["4:5"].height - portrait.artboard.height) / 2;
portrait.artboard.height = aspectRatioDimensions["4:5"].height;
portrait.groups.forEach(g => {
  g.height = portrait.artboard.height;
});
portrait.instances.forEach(i => {
  i.y += offsetY;
});
portrait.limitations.push(
  "Retrato 4:5: altura 1350; geometria original centralizada com +27 px, sem escala anisotrópica. Aceite visual próprio pendente."
);
next.definition.name = "Minimal Air · Instagram 4:5";
next.definition.description +=
  " Retrato corrigido para 1080×1350; versões anteriores preservadas.";
next.definition.provenance.notes.push(
  `Derivação 4:5 da definição ${definitionHash}; +27 px verticais, peças e fontes idênticas. Revisão visual pendente.`
);
const packageValue = arsenalImportSchema.parse(next);
await fs.mkdir(dir, { recursive: true });
await fs.writeFile(
  `${dir}/package.json`,
  JSON.stringify(packageValue, null, 2) + "\n"
);
let entry: { id: string; version: number } | undefined;
if (process.argv.includes("--apply")) {
  const actor = process.env.ARSENAL_IMPORT_ACTOR;
  if (!actor)
    throw new Error("--apply exige ARSENAL_IMPORT_ACTOR administrativo");
  const checked = await createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  ).auth.admin.getUserById(actor);
  if (checked.error || checked.data.user?.app_metadata?.role !== "admin")
    throw new Error("Ator administrativo não confirmado");
  entry = (await prepareArsenalDraft(packageValue, actor)).entry;
}
const report = {
  source,
  sourceDefinitionHash: definitionHash,
  blueprintId: packageValue.blueprintId,
  versionId: entry?.id,
  version: entry?.version,
  definitionHash: arsenalHash(packageValue.definition),
  variants: packageValue.definition.variants.map(v => ({
    variantKey: v.variantKey,
    aspectRatio: v.aspectRatio,
    variantHash: arsenalHash(v),
    artboard: v.artboard,
  })),
  status: entry ? "draft_imported" : "draft_prepared",
  approval: "pending",
  automaticGenerationEligible: false,
  offsetY,
};
await fs.writeFile(
  `${dir}/report.json`,
  JSON.stringify(report, null, 2) + "\n"
);
console.log(JSON.stringify(report, null, 2));
