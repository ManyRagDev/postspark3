import { readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import {
  evidenceHash,
  readSharedBudget,
  withBudgetFileLock,
} from "./sharedBudget";
import { writeJson } from "./journal";
import {
  readSnapshotFile,
  describeSnapshotFile,
  overlayCatalogs,
  verifyJourneyCatalogAlignment,
} from "./catalogAlignment";

/** Refreshes a still-pending proposal only. Never resets or reconciles any spend. */
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--proposal")
    throw new Error("Usage: refreshPreparedCatalog.ts --proposal DIRECTORY");
  const directory = resolve(args[1]),
    planFile = join(directory, "approval-plan.json"),
    budgetFile = join(directory, "shared-budget.json");
  const plan = JSON.parse(await readFile(planFile, "utf8")),
    original = await readSharedBudget(budgetFile);
  const pending = () => {
    if (
      plan.authorization !== "PENDING_SPECIFIC_APPROVAL_DO_NOT_EXECUTE" ||
      original.calls.length !== original.origin.inheritedCount ||
      Object.values(original.campaigns).some(c => c.pipelineHash)
    )
      throw new Error("catalog_refresh_requires_unstarted_pending_proposal");
  };
  pending();
  const packageFile =
    plan.data.revisedPackageSnapshot ?? plan.data.revisedSnapshot;
  const metadata = JSON.parse(
    await readFile(join(dirname(packageFile), "manifest.json"), "utf8")
  );
  const pack = await readSnapshotFile(packageFile);
  const overlay = overlayCatalogs(
    await readSnapshotFile(plan.data.baselineSnapshot),
    await readSnapshotFile(join(metadata.previousPackage, "catalog-rows.json")),
    pack
  );
  const alignment = await verifyJourneyCatalogAlignment({
    remote: overlay,
    overlay,
    revisedPackage: pack,
  });
  const overlayFile = join(directory, "catalog-revised-overlay.json");
  await writeJson(overlayFile, overlay);
  const revisedDescriptor = await describeSnapshotFile(overlayFile),
    packageDescriptor = await describeSnapshotFile(packageFile);
  await withBudgetFileLock(budgetFile, async () => {
    const state = await readSharedBudget(budgetFile);
    if (evidenceHash(state) !== evidenceHash(original))
      throw new Error("pending_budget_changed_during_catalog_refresh");
    state.catalogSnapshots!.revised = revisedDescriptor;
    state.revisedPackage = packageDescriptor;
    await writeJson(budgetFile, state);
  });
  const previousSnapshot = plan.data.revisedSnapshot;
  plan.data.revisedPackageSnapshot = packageFile;
  plan.data.revisedSnapshot = overlayFile;
  plan.data.catalogAlignment = alignment;
  const command = plan.commands.matrix.args;
  command[command.indexOf("--revised-snapshot") + 1] = overlayFile;
  for (const entry of plan.matrix)
    if (entry.strategy === 2) entry.catalog = { snapshot: overlayFile };
  await writeJson(planFile, plan);
  await writeJson(join(directory, "catalog-alignment-offline.json"), alignment);
  const readme = await readFile(join(directory, "README.md"), "utf8");
  await writeFile(
    join(directory, "README.md"),
    readme.split(previousSnapshot).join(overlayFile),
    { mode: 0o600 }
  );
  process.stdout.write(
    JSON.stringify({
      preparedOnly: true,
      approval: plan.authorization,
      overlayRows: overlay.rows.length,
      revisedSubset: pack.rows.length,
      cases: alignment.cases,
      preservedCalls: original.calls.length,
      totalUsd: original.maxUsd,
      totalCalls: original.maxCalls,
    }) + "\n"
  );
}
void main().catch(error => {
  console.error(
    error instanceof Error ? error.message : "catalog_refresh_failed"
  );
  process.exitCode = 1;
});
