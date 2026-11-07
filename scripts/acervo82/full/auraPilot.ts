import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "../../../server/db";
import { ENV } from "../../../server/_core/env";
import { createComponentTextMeasurer } from "../../../server/ai/componentTextMeasurer";
import { prepareComponentDraft } from "../../../server/designCatalog/componentStore";
import { uploadArsenalAsset } from "../../../server/designCatalog/arsenalAssets";
import {
  readCatalogDefinition,
  withCatalogStaging,
} from "../../../server/designCatalog/versionedCatalog";
import {
  componentDefinitionV1Schema,
  componentHash,
} from "../../../shared/componentAssembly";
import { arsenalHash } from "../../../shared/arsenalContent";
import { partitionArsenalReadinessIssues } from "../../../shared/arsenalReadiness";
import type { CanvasPostModel } from "../../../client/src/pages/CanvasLab/components/types";
import { putArsenalComposition } from "../../../client/src/pages/CanvasLab/lib/arsenalComposition";
import { nativeScene, sampleContent } from "./nativeScene";

const directory = process.argv[2];
assert(/^artifacts\/acervo82\/full\/[a-z0-9-]+$/.test(directory));
assert.equal(process.env.POSTSPARK_ACERVO82_LOCAL, "true");
assert.equal(process.env.GENERATION_ADMISSION_PAUSED, "true");
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(
    new URL(ENV.supabaseUrl).hostname
  )
);

const id = "acervo82-concept-17";
const json = async (filename: string) =>
  JSON.parse(await fs.readFile(filename, "utf8"));
const pkg = await json(path.join(directory, "packages", `${id}.json`));
const definition = componentDefinitionV1Schema.parse(pkg.components[0]);
assert.equal(definition.completeDesign?.family, id);
assert.equal(componentHash(definition), definition.hash);
assert.equal(
  Object.values(definition.pieces).filter(piece => piece.imageReplacement)
    .length,
  1
);
const readAsset = async (asset: { sha256: string }) => {
  const bytes = await fs.readFile(path.join(directory, "assets", asset.sha256));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
  return bytes;
};

const measure = await createComponentTextMeasurer(definition.assets, readAsset);
const content = sampleContent(pkg);
for (const block of content.blocks) {
  if (block.type !== "text") continue;
  if (block.role === "headline") block.text = "Comece pelo que já está à mão";
  if (block.role === "body")
    block.text = "Escolha uma ideia simples e dê o primeiro passo.";
}
const composition = nativeScene(pkg, definition, measure, content);
assert.deepEqual(
  partitionArsenalReadinessIssues(composition.issues).blocking,
  []
);
const { directory: previousReview } = await json(
  ".acervo82-local/full-review.json"
);
const original: CanvasPostModel = await json(
  path.join(previousReview, "fixtures", `${id}.json`)
);
const model = putArsenalComposition(
  {
    ...original,
    id: `qa-aura-${randomUUID()}`,
    caption: "Piloto local · Aura · edição e troca do fundo.",
  },
  composition
);

const actor = (await json(".acervo82-local/test-account.json")).id;
const db = getDb();
const activeBefore = await db.rpc("catalog_manifest");
if (activeBefore.error) throw activeBefore.error;
for (const asset of definition.assets) {
  const uploaded = await uploadArsenalAsset(
    await readAsset(asset),
    { license: asset.license, weight: asset.weight },
    actor
  );
  assert.equal(arsenalHash(uploaded), arsenalHash(asset));
}
const { revision } = await withCatalogStaging(() =>
  prepareComponentDraft(definition, actor)
);
await readCatalogDefinition(revision, definition.id, definition.hash);
const activeAfter = await db.rpc("catalog_manifest");
if (activeAfter.error) throw activeAfter.error;
assert.deepEqual(activeAfter.data, activeBefore.data);
await fs.mkdir(path.join(directory, "fixtures"), { recursive: true });
await fs.writeFile(
  path.join(directory, "fixtures", `${id}.json`),
  JSON.stringify(model, null, 2)
);
const receipt = {
  directory,
  revision,
  definitionHash: definition.hash,
  activeRevision: activeAfter.data?.revision,
  paidCalls: 0,
};
const receiptFile = ".acervo82-local/aura-preview.json";
await fs.writeFile(`${receiptFile}.tmp`, JSON.stringify(receipt, null, 2), {
  mode: 0o600,
});
await fs.rename(`${receiptFile}.tmp`, receiptFile);
console.log(JSON.stringify(receipt));
