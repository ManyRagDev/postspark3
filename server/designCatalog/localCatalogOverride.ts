import { ENV } from "../_core/env";

/** Server-only admission choice. Never accepted from a browser request. */
export function localCatalogRevisionOverride(): string | undefined {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.VERCEL ||
    ENV.isProduction ||
    ENV.generationWorkerMode !== "local-demand" ||
    !ENV.localDemandEnabled
  )
    return undefined;
  const revision = ENV.localCatalogRevision.trim();
  if (!revision) return undefined;
  if (!/^[1-9]\d*$/.test(revision)) throw new Error("catalog_revision_invalid");
  return revision;
}
