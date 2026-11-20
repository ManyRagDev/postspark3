import type { RequestRecord } from "./generationStore";
import { withCatalogRevision } from "../../designCatalog/versionedCatalog";

/** Only identity compositions have no authored catalogue dependency. */
export async function withLocalRequestCatalog<T>(
  record: Pick<RequestRecord, "input" | "catalogRevision">,
  work: () => Promise<T>
): Promise<T> {
  if (record.input.fixedDesign?.kind === "identity") return work();
  if (!record.catalogRevision) throw new Error("catalog_revision_missing");
  return withCatalogRevision(record.catalogRevision, work);
}
