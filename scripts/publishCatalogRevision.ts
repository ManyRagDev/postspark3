/** Explicit operator command. Never imported by server startup or CI. */
import "dotenv/config";
import { ENV } from "../server/_core/env";
import { getDb } from "../server/db";
import {
  validateCatalogSnapshot,
  publishCatalog,
} from "../server/designCatalog/versionedCatalog";
import { arsenalHash } from "../shared/arsenalContent";
const args = process.argv.slice(2);
const project = args
  .find(arg => arg.startsWith("--project="))
  ?.slice("--project=".length);
const hostname = new URL(ENV.supabaseUrl).hostname;
if (
  !project ||
  !(
    hostname === `${project}.supabase.co` ||
    (project === "local" && ["localhost", "127.0.0.1"].includes(hostname))
  )
)
  throw new Error(
    "Informe --project=<referência exata> correspondente ao SUPABASE_URL."
  );
if (!args.includes("--check") && !args.includes("--publish"))
  throw new Error(
    "Use --check para validar, ou --publish somente com autorização de publicação."
  );
const { data, error } = await getDb().rpc("catalog_staged_snapshot");
if (error) throw error;
const snapshot = validateCatalogSnapshot({ rows: data.rows }, true);
const compact = {
  rows: snapshot.rows.map(({ definition, assets, ...row }) => row),
};
console.info(
  JSON.stringify({
    project,
    sourceRevision: data.sourceRevision,
    rows: snapshot.rows.length,
    compactBytes: Buffer.byteLength(JSON.stringify(compact)),
    hash: arsenalHash(compact),
  })
);
if (args.includes("--publish"))
  console.info(JSON.stringify({ publishedRevision: await publishCatalog() }));
