import { ENV } from "../_core/env";

/** Explicit, server-only pin for an inactive catalog on an external executor.
 * Does not activate a catalog, confer admin/access, or change saved documents.
 */
export function readTrialCatalogConfig() {
  const revision = ENV.trialCatalogRevision.trim();
  const adminUuid = ENV.trialCatalogAdminUuid.trim();
  if (!revision && !adminUuid) return null;
  if (
    ENV.generationWorkerMode !== "external" ||
    !/^[1-9]\d*$/.test(revision) ||
    BigInt(revision) > BigInt("9223372036854775807") ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(adminUuid)
  ) throw new Error("catalog_trial_configuration_invalid");
  return { revision, adminUuid: adminUuid.toLowerCase() };
}

export function trialCatalogRevisionForUser(user: { id: string; role?: string | null }) {
  const config = readTrialCatalogConfig();
  return config && user.role === "admin" && user.id.toLowerCase() === config.adminUuid
    ? config.revision
    : undefined;
}

/** Store callers must match the same pin; SQL also verifies admin + app_access. */
export function assertTrialCatalogAdmission(ownerId: string, revision?: string) {
  const config = readTrialCatalogConfig();
  if (!config || config.adminUuid !== ownerId.toLowerCase() || config.revision !== revision)
    throw new Error("catalog_trial_admission_not_allowed");
}

export async function assertTrialCatalogEditorialReady(revision: string) {
  const { readEditorialCatalog } = await import("./editorialCatalog");
  if (!(await readEditorialCatalog(revision)))
    throw new Error("catalog_trial_editorial_required");
}
