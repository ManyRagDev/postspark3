/** Local-only measurement of already paid copy; never invokes models or writes remote data. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { instantiateCompleteDesign } from "../../shared/completeDesignGeneration";
import {
  resolveArsenalGeometry,
  measureArsenalElement,
} from "../../shared/arsenalGeometry";
import { createComponentTextMeasurer } from "../../server/ai/componentTextMeasurer";
import { partitionArsenalReadinessIssues } from "../../shared/arsenalReadiness";
const root = resolve(
  process.argv[2] ??
    "artifacts/verification/editorial-regression-2026-10-09-r3/bizuminer"
);
const manifest = JSON.parse(
  await readFile(join(root, "MANIFEST.json"), "utf8")
);
const prepared = JSON.parse(
  await readFile(join(root, "PREPARED.json"), "utf8")
);
const operations = await Promise.all(
  (await readdir(join(root, "operations"))).map(async file =>
    JSON.parse(await readFile(join(root, "operations", file), "utf8"))
  )
);
const assets = new Map<string, string>();
for (const file of await readdir(join(manifest.catalogRoot, "packages"))) {
  const pkg = JSON.parse(
    await readFile(join(manifest.catalogRoot, "packages", file), "utf8")
  );
  for (const asset of pkg.assetFiles)
    assets.set(
      asset.manifest.id,
      resolve(manifest.catalogRoot, asset.relativePath)
    );
}
const definitions = prepared.selectedDefinitions[0];
const measure = await createComponentTextMeasurer(
  definitions.flatMap((d: any) => d.assets),
  async asset => readFile(assets.get(asset.id)!)
);
const report = [];
for (const key of ["proposal-0:copy", "proposal-0:copy_recovery"]) {
  const operation = operations.find(o => o.operationKey === key);
  if (!operation) continue;
  const copy = JSON.parse(operation.result.choices[0].message.content);
  for (let slide = 0; slide < definitions.length; slide++) {
    const source = instantiateCompleteDesign({
      definition: definitions[slide],
      values: copy.slides[slide].values,
      mediaPrompts: copy.slides[slide].mediaPrompts,
      runId: manifest.runId,
      slot: 0,
      slide,
      planHash: "a".repeat(64),
      experimental: true,
    });
    const fixed = resolveArsenalGeometry(source, { measureText: measure }),
      fitted = resolveArsenalGeometry(source, {
        measureText: measure,
        allowReduction: true,
      });
    const changed = fitted.elements
      .filter(
        element =>
          element.kind === "text" &&
          element.fontSize !==
            fixed.elements.find(e => e.id === element.id)?.fontSize
      )
      .map(element => {
        const before = fixed.elements.find(e => e.id === element.id)!;
        const box = (e: typeof element) => ({
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          rotation: e.rotation,
        });
        return {
          id: element.id,
          text: element.text,
          beforeFontSize: before.fontSize,
          afterFontSize: element.fontSize,
          beforeBox: box(before),
          afterBox: box(element),
          beforeMeasured: measureArsenalElement(before, measure),
          afterMeasured: measureArsenalElement(element, measure),
        };
      });
    report.push({
      operationKey: key,
      slide,
      definitionId: definitions[slide].id,
      contentPreserved:
        JSON.stringify(fitted.content) === JSON.stringify(fixed.content),
      beforeIssues: partitionArsenalReadinessIssues(fixed.issues),
      afterIssues: partitionArsenalReadinessIssues(fitted.issues),
      changed,
    });
  }
}
await writeFile(
  join(root, "FIT_PROBE.json"),
  JSON.stringify({ providerCalls: 0, databaseWrites: 0, report }, null, 2) +
    "\n"
);
console.log(
  JSON.stringify(
    report.map(
      ({ operationKey, slide, beforeIssues, afterIssues, changed }) => ({
        operationKey,
        slide,
        beforeIssues: beforeIssues.blocking,
        afterIssues: afterIssues.blocking,
        fontChanges: changed.map(({ id, beforeFontSize, afterFontSize }) => ({
          id,
          beforeFontSize,
          afterFontSize,
        })),
      })
    ),
    null,
    2
  )
);
