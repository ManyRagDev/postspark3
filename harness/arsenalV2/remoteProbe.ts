import "dotenv/config";
import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  arsenalDefinitionSchema,
  ARSENAL_CAPABILITIES,
} from "../../shared/arsenalCatalog";
import {
  STRUCTURAL_L1_METRIC_HASH,
  STRUCTURAL_L1_METRIC_VERSION,
} from "../../shared/designDescriptorMetric";
const url = process.env.SUPABASE_URL!,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY!,
  anonKey = process.env.VITE_SUPABASE_ANON_KEY!;
if (new URL(url).hostname !== "spbuwcwmxlycchuwhfir.supabase.co")
  throw new Error("Unexpected project");
const admin = createClient(url, key, {
    db: { schema: "postspark" },
    auth: { persistSession: false },
  }),
  anon = createClient(url, anonKey, {
    db: { schema: "postspark" },
    auth: { persistSession: false },
  });
const tables = [
  "design_catalog_versions",
  "design_catalog_search_documents",
  "design_catalog_assets",
  "design_catalog_evidence",
];
const inventory: Record<string, number> = {};
for (const table of tables) {
  const r = await admin.from(table).select("*", { count: "exact", head: true });
  if (r.error) throw r.error;
  inventory[table] = r.count ?? 0;
}
const v = await admin
  .from("design_catalog_versions")
  .select("id,status,content_hash,definition");
if (v.error) throw v.error;
const entries = (v.data ?? []).map(row => ({
  ...row,
  definition: arsenalDefinitionSchema.parse(row.definition),
}));
const params = {
  p_anchor: null,
  p_aspect: null,
  p_capabilities: ARSENAL_CAPABILITIES,
  p_has_media: false,
  p_profile: { present: ["headline"] },
  p_descriptor: "structural-v1",
  p_metric: STRUCTURAL_L1_METRIC_VERSION,
  p_metric_hash: STRUCTURAL_L1_METRIC_HASH,
  p_limit: 20,
  p_terms: [],
};
const start = performance.now(),
  search = await admin.rpc("design_catalog_search_v2", params);
if (search.error) throw search.error;
const searchDurationMs = performance.now() - start;
const queryTimings: number[] = [];
for (let i = 0; i < 100; i++) {
  const t = performance.now();
  const r = await admin.rpc("design_catalog_search_v2", params);
  if (r.error) throw r.error;
  queryTimings.push(performance.now() - t);
}
const orderedTimings = [...queryTimings].sort((a, b) => a - b);
const unauthenticated = await anon.rpc("design_catalog_search_v2", params);
if (!unauthenticated.error) throw new Error("anon should not execute RPC");
const privateRead = await anon.from("design_catalog_assets").select("id");
if (!privateRead.error) throw new Error("anon should not read assets");
const first = await admin
  .from("design_catalog_assets")
  .select("storage_key")
  .limit(1)
  .single();
if (first.error) throw first.error;
const privateAsset = await fetch(
  url + "/storage/v1/object/public/design-arsenal/" + first.data.storage_key
);
if (privateAsset.ok) throw new Error("Private asset exposed publicly");
const signed = await admin.storage
  .from("design-arsenal")
  .createSignedUrl(first.data.storage_key, 1);
if (signed.error) throw signed.error;
// Actual expired URL; never print its token or retain it as document identity.
await new Promise(r => setTimeout(r, 2100));
const expired = await fetch(signed.data.signedUrl);
if (expired.ok) throw new Error("Expired signed URL still usable");
const report = {
  project: "spbuwcwmxlycchuwhfir",
  checkedAt: new Date().toISOString(),
  inventory,
  versionCount: entries.length,
  variantCount: entries.reduce((n, v) => n + v.definition.variants.length, 0),
  approved: entries.filter(v => v.status === "approved").length,
  eligibleReturned: search.data?.length ?? 0,
  searchDurationMs,
  retrievalSamples: {
    queries: 100,
    anchor: null,
    approvedVersions: entries.filter(v => v.status === "approved").length,
    p95Ms: orderedTimings[94],
    maxMs: orderedTimings[99],
    environment: "actual Supabase REST RPC; empty approved catalogue",
  },
  anonRpcRejected: true,
  anonTableReadRejected: true,
  publicAssetRejected: true,
  expiredSignedUrlRejected: true,
  expiredStatus: expired.status,
};
await fs.mkdir("artifacts/arsenal-v2", { recursive: true });
await fs.writeFile(
  "artifacts/arsenal-v2/remote-probe.json",
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report));
