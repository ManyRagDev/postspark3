import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root, runs, read } from "./inputs.mjs";

const dir = join(root, "definicoes");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const cards = runs.find(r => r.r.input.postMode === "carousel").op[
  "prepare:catalog"
].cards;
const known = new Map(cards.map(c => [c.hash, c.id]));
function store(d) {
  assert.equal(known.get(d.hash), d.id);
  writeFileSync(join(dir, d.hash + ".json"), JSON.stringify(d), {
    mode: 0o600,
  });
}
for (const run of runs)
  for (const d of run.r.prepared.selectedDefinitions.flat()) store(d);
for (const c of cards) {
  const file = join(
    "artifacts/acervo82/full/acervo82-fidelidade-20261119/definitions",
    c.id + ".json"
  );
  if (existsSync(file)) {
    const d = read(file);
    if (d.hash === c.hash) store(d);
  }
}
const missing = cards.filter(c => !existsSync(join(dir, c.hash + ".json")));
for (let i = 0; i < missing.length; i += 20) {
  const hashes = missing.slice(i, i + 20).map(c => c.hash);
  assert(hashes.every(h => /^[a-f0-9]{64}$/.test(h)));
  const url = new URL(
    "/rest/v1/catalog_revision_definitions",
    "https://api.postspark.com.br"
  );
  assert.equal(new URL(process.env.SUPABASE_URL).origin, url.origin);
  url.search = new URLSearchParams({
    select: "definition_hash,def:payload->definition",
    revision: "eq.1",
    definition_hash: "in.(" + hashes.join(",") + ")",
  });
  const response = await fetch(url, {
    redirect: "error",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Accept-Profile": "postspark",
    },
    signal: AbortSignal.timeout(20000),
  });
  assert(response.ok, "catalog HTTP " + response.status);
  const rows = await response.json();
  assert.deepEqual(rows.map(r => r.definition_hash).sort(), [...hashes].sort());
  for (const r of rows) {
    assert.equal(r.def.hash, r.definition_hash);
    store(r.def);
  }
}
console.log(
  cards.length,
  "definições conferidas;",
  missing.length,
  "consultadas por hash."
);
const assetDir = join(root, "assets");
mkdirSync(assetDir, { recursive: true, mode: 0o700 });
const needed = new Map(
  cards
    .flatMap(c => read(join(dir, c.hash + ".json")).assets)
    .map(a => [a.sha256, a])
);
const { createHash } = await import("node:crypto");
const { readFileSync } = await import("node:fs");
for (const a of needed.values()) {
  const local = join(
    "artifacts/acervo82/full/acervo82-fidelidade-20261119/assets",
    a.sha256
  );
  const frozen = join(assetDir, a.sha256);
  if (existsSync(local) || existsSync(frozen)) {
    assert.equal(
      createHash("sha256")
        .update(readFileSync(existsSync(local) ? local : frozen))
        .digest("hex"),
      a.sha256
    );
    continue;
  }
  assert(/^[a-f0-9]{64}$/.test(a.sha256));
  const url = new URL(
    "/storage/v1/object/authenticated/design-arsenal/" + a.sha256,
    "https://api.postspark.com.br"
  );
  assert.equal(url.origin, new URL(process.env.SUPABASE_URL).origin);
  const response = await fetch(url, {
    redirect: "error",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  assert(response.ok, "asset HTTP " + response.status);
  const data = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash("sha256").update(data).digest("hex"), a.sha256);
  writeFileSync(frozen, data, { mode: 0o600 });
}
console.log(needed.size, "assets verificados por SHA-256");
