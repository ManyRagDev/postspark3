import fs from "node:fs/promises";
import {
  prepareCatalogSearchIndex,
  closeSearchEngines,
} from "../../server/designCatalog/familySearchIndex";
const revision =
  process.argv[2] ??
  JSON.parse(await fs.readFile("artifacts/acervo82/pilot/staged.json", "utf8"))
    .revision;
try {
  console.log(
    JSON.stringify({
      revision,
      index: await prepareCatalogSearchIndex(revision),
      generationRemainsPaused: true,
      paidCalls: 0,
    })
  );
} finally {
  await closeSearchEngines();
}
