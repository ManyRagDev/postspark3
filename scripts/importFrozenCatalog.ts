/** No dotenv and no network in dry-run. Extract the trusted tar separately. */
import {
  readFrozenCatalog,
  validateImportTarget,
  applyFrozenCatalog,
  createFrozenImportPort,
} from "../server/designCatalog/importFrozenCatalog";
const args = process.argv.slice(2),
  flags = new Set([
    "--directory",
    "--expected-hash",
    "--supabase-url",
    "--expected-host",
    "--actor",
  ]);
const options = new Map<string, string>();
let apply = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--apply") {
    if (apply) throw Error("duplicate_apply");
    apply = true;
  } else if (arg === "--dry-run") {
    options.set(arg, "true");
  } else if (
    flags.has(arg) &&
    args[i + 1] &&
    !args[i + 1].startsWith("--") &&
    !options.has(arg)
  ) {
    options.set(arg, args[++i]);
  } else throw Error(`unsupported_argument:${arg}`);
}
if (apply && options.has("--dry-run")) throw Error("choose_dry_run_or_apply");
const directory = options.get("--directory");
if (!directory)
  throw Error(
    "Use --directory <extracted package> [--expected-hash SHA256] [--dry-run]. Apply additionally requires --apply --supabase-url URL --expected-host HOST[:PORT] --actor UUID --expected-hash SHA256 and SUPABASE_SERVICE_ROLE_KEY."
  );
const bundle = await readFrozenCatalog(
  directory,
  options.get("--expected-hash")
);
if (!apply) {
  console.log(
    JSON.stringify({
      dryRun: true,
      sourceHash: bundle.sourceHash,
      definitions: bundle.definitions.length,
      assets: bundle.assets.length,
      families: bundle.families,
      activationApproved: false,
      networkCalls: 0,
    })
  );
} else {
  const required = (name: string) => {
    const v = options.get(name);
    if (!v) throw Error(`required:${name}`);
    return v;
  };
  const actor = required("--actor"),
    url = validateImportTarget(
      required("--supabase-url"),
      required("--expected-host"),
      actor,
      required("--expected-hash")
    );
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw Error("SUPABASE_SERVICE_ROLE_KEY_required");
  // Configure before lazy runtime imports. Staging must never construct an embedding index.
  process.env.DOTENV_CONFIG_PATH = "/dev/null";
  process.env.SUPABASE_URL = url;
  process.env.DESIGN_RETRIEVAL_DIRECTORY = "";
  const port = await createFrozenImportPort(url, key);
  console.log(JSON.stringify(await applyFrozenCatalog(bundle, actor, port)));
}
