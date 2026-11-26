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
const expectedHost = args
  .find(arg => arg.startsWith("--expected-host="))
  ?.slice("--expected-host=".length);
const endpoint = URL.parse(ENV.supabaseUrl);
const legacyProjectRef = "spbuwcwmxlycchuwhfir";
const projectMatches = project === "local"
  ? endpoint && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
  : project && endpoint?.hostname === `${project}.supabase.co`;
if (
  !endpoint ||
  !["http:", "https:"].includes(endpoint.protocol) ||
  endpoint.hostname.includes(legacyProjectRef) ||
  (expectedHost && project) ||
  (expectedHost ? endpoint.host !== expectedHost : !projectMatches)
)
  throw new Error(
    "Informe --expected-host=<host[:porta]> correspondente ao SUPABASE_URL vigente. O Cloud aposentado não é aceito."
  );
const publish = args.includes("--publish");
if (args.includes("--check") === publish)
  throw new Error(
    "Escolha um modo: --check para validar ou --publish para publicar."
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
    host: endpoint.host,
    sourceRevision: data.sourceRevision,
    rows: snapshot.rows.length,
    compactBytes: Buffer.byteLength(JSON.stringify(compact)),
    hash: arsenalHash(compact),
  })
);
if (publish)
  console.info(JSON.stringify({ publishedRevision: await publishCatalog() }));
