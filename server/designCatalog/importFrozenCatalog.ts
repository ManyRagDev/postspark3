/** Offline package verification and explicit, non-activating administrative import. */
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { arsenalHash } from "../../shared/arsenalContent";
import {
  componentDefinitionV1Schema,
  componentHash,
  compactComponentCard,
  type ComponentDefinitionV1,
} from "../../shared/componentAssembly";
import type { ArsenalAsset } from "../../shared/designArsenal";
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z.object({
  catalogHash: hashSchema,
  definitions: z.number().int().positive(),
  assets: z.number().int().nonnegative(),
  activationApproved: z.literal(false),
  files: z.record(
    z.string(),
    z.object({ bytes: z.number().int().nonnegative(), sha256: hashSchema })
  ),
});
export type FrozenPackage = {
  sourceHash: string;
  definitions: ComponentDefinitionV1[];
  assets: Array<{ manifest: ArsenalAsset; bytes: Buffer }>;
  families: number;
};
export async function readFrozenCatalog(
  directory: string,
  expectedHash?: string
): Promise<FrozenPackage> {
  const root = await realpath(directory);
  const safeRead = async (name: string) => {
    if (
      !/^(?:manifest\.json|snapshot\.json|registry\.json|provenance\.json|definitions\/[a-f0-9-]+\.json|assets\/[a-f0-9]{64})$/.test(
        name
      )
    )
      throw Error("frozen_package_path_invalid");
    const path = await realpath(resolve(root, name));
    if (!path.startsWith(root + sep)) throw Error("frozen_package_path_escape");
    return readFile(path);
  };
  const manifest = manifestSchema.parse(
    JSON.parse((await safeRead("manifest.json")).toString())
  );
  if (expectedHash && manifest.catalogHash !== expectedHash)
    throw Error("frozen_package_expected_hash_mismatch");
  const files = new Map<string, Buffer>();
  for (const [name, proof] of Object.entries(manifest.files)) {
    const bytes = await safeRead(name);
    if (bytes.length !== proof.bytes || sha(bytes) !== proof.sha256)
      throw Error(`frozen_package_file_mismatch:${name}`);
    files.set(name, bytes);
  }
  const json = (name: string) => {
    const bytes = files.get(name);
    if (!bytes) throw Error(`frozen_package_missing:${name}`);
    return JSON.parse(bytes.toString());
  };
  const registry = json("registry.json"),
    snapshot = json("snapshot.json");
  json("provenance.json");
  const definitions: ComponentDefinitionV1[] = [],
    assets = new Map<string, ArsenalAsset>(),
    ids = new Set<string>();
  if (!Array.isArray(registry.entries) || !registry.entries.length)
    throw Error("frozen_registry_invalid");
  for (const entry of registry.entries)
    for (const ref of entry.definitions) {
      const d = componentDefinitionV1Schema.parse(
        json(`definitions/${ref.id}.json`)
      );
      if (d.kind !== "content" || !d.completeDesign)
        throw Error("frozen_definition_not_complete_design");
      if (
        ids.has(d.id) ||
        d.id !== ref.id ||
        d.hash !== ref.hash ||
        componentHash(d) !== d.hash
      )
        throw Error("frozen_definition_identity_mismatch");
      ids.add(d.id);
      definitions.push(d);
      for (const a of d.assets) {
        if (a.kind !== "catalog") throw Error("frozen_asset_not_catalog");
        const old = assets.get(a.sha256);
        if (old && arsenalHash(old) !== arsenalHash(a))
          throw Error("frozen_asset_manifest_conflict");
        assets.set(a.sha256, a);
      }
    }
  const rows = definitions.map(d => ({
    card: compactComponentCard(d),
    component_id: d.id,
    definition_hash: d.hash,
  }));
  if (
    arsenalHash({ rows }) !== manifest.catalogHash ||
    snapshot.hash !== manifest.catalogHash ||
    arsenalHash(snapshot.snapshot) !== manifest.catalogHash
  )
    throw Error("frozen_snapshot_mismatch");
  if (
    Array.from(files.keys()).filter(n => n.startsWith("definitions/"))
      .length !== definitions.length ||
    Array.from(files.keys()).filter(n => n.startsWith("assets/")).length !==
      assets.size ||
    definitions.length !== manifest.definitions ||
    assets.size !== manifest.assets
  )
    throw Error("frozen_package_count_mismatch");
  const assetBytes = Array.from(assets.values()).map(a => {
    const bytes = files.get(`assets/${a.sha256}`);
    if (!bytes || bytes.length !== a.bytes || sha(bytes) !== a.sha256)
      throw Error("frozen_asset_bytes_mismatch");
    return { manifest: a, bytes };
  });
  return {
    sourceHash: manifest.catalogHash,
    definitions,
    assets: assetBytes,
    families: registry.entries.length,
  };
}
export function validateImportTarget(
  url: string,
  expectedHost: string,
  actor: string,
  expectedHash: string
) {
  const target = new URL(url);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== "/" ||
    target.host !== expectedHost
  )
    throw Error("frozen_import_target_mismatch");
  z.string().uuid().parse(actor);
  hashSchema.parse(expectedHash);
  return target.origin;
}
export interface FrozenImportPort {
  assertAdmin(actor: string): Promise<void>;
  inspect(): Promise<{
    activeRevision: string | null;
    components: Array<{
      id: string;
      hash: string;
      status: string;
      definition: unknown;
    }>;
  }>;
  checkAsset(asset: ArsenalAsset): Promise<void>;
  upload(asset: ArsenalAsset, bytes: Buffer, actor: string): Promise<void>;
  stage(
    definitions: ComponentDefinitionV1[],
    actor: string
  ): Promise<{ revision: string; hash: string }>;
  grant(definitions: ComponentDefinitionV1[], actor: string): Promise<void>;
}
export async function applyFrozenCatalog(
  bundle: FrozenPackage,
  actor: string,
  port: FrozenImportPort
) {
  z.string().uuid().parse(actor);
  await port.assertAdmin(actor);
  const before = await port.inspect();
  if (before.activeRevision !== null)
    throw Error("frozen_import_requires_inactive_catalog");
  const wanted = new Map(bundle.definitions.map(d => [d.id, d]));
  for (const row of before.components) {
    const d = wanted.get(row.id);
    if (
      !d ||
      row.status !== "draft" ||
      d.hash !== row.hash ||
      arsenalHash(d) !== arsenalHash(row.definition)
    )
      throw Error("frozen_import_existing_catalog_conflict");
  }
  for (const a of bundle.assets) await port.checkAsset(a.manifest);
  for (const a of bundle.assets) await port.upload(a.manifest, a.bytes, actor);
  const staged = await port.stage(bundle.definitions, actor);
  const after = await port.inspect();
  if (after.activeRevision !== null) throw Error("frozen_import_head_changed");
  if (
    after.components.length !== bundle.definitions.length ||
    after.components.some(
      r => r.status !== "draft" || r.hash !== wanted.get(r.id)?.hash
    )
  )
    throw Error("frozen_import_result_mismatch");
  await port.grant(bundle.definitions, actor);
  return {
    sourceHash: bundle.sourceHash,
    revision: staged.revision,
    catalogHash: staged.hash,
    actor,
    definitions: bundle.definitions.length,
    assets: bundle.assets.length,
    activationApproved: false,
    activeRevision: null,
    status: "draft",
    scope: "admin-rehearsal",
    runtimeAdmissionGateRequired: true,
    editorialMissing: true,
    generatable: false,
    sourceGrantsPresent: false,
    grantedActorOnly: actor,
  };
}
/** Called only after explicit CLI --apply. No renderer, provider, embeddings or activation. */
export async function createFrozenImportPort(
  url: string,
  key: string
): Promise<FrozenImportPort> {
  const { createClient } = await import("@supabase/supabase-js");
  const auth = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { ENV } = await import("../_core/env");
  if (
    ENV.supabaseUrl !== url ||
    ENV.supabaseServiceRoleKey !== key ||
    ENV.designRetrievalDirectory
  )
    throw Error("frozen_import_runtime_environment_mismatch");
  const { getDb } = await import("../db");
  const db = getDb();
  const { uploadArsenalAsset, verifyArsenalAsset } = await import(
    "./arsenalAssets"
  );
  const {
    withCatalogStaging,
    readCatalogSnapshot,
    readCatalogManifest,
    validateCatalogSnapshot,
  } = await import("./versionedCatalog");
  const { prepareComponentDraft } = await import("./componentStore");
  return {
    async assertAdmin(actor) {
      const r = await auth.auth.admin.getUserById(actor);
      if (
        r.error ||
        r.data.user?.id !== actor ||
        r.data.user.app_metadata?.role !== "admin"
      )
        throw Error("frozen_import_actor_not_admin");
      const access = await db.rpc("has_app_access", { p_user_id: actor });
      if (access.error || access.data !== true)
        throw Error("frozen_import_actor_no_app_access");
    },
    async inspect() {
      const state = await db
        .from("catalog_state")
        .select("active_revision")
        .eq("id", true)
        .single();
      if (state.error) throw state.error;
      const components = [];
      for (let offset = 0; ; offset += 500) {
        const r = await db
          .from("design_components")
          .select("id,definition_hash,status,definition")
          .order("id")
          .range(offset, offset + 499);
        if (r.error) throw r.error;
        components.push(
          ...r.data.map((x: any) => ({
            id: x.id,
            hash: x.definition_hash,
            status: x.status,
            definition: x.definition,
          }))
        );
        if (r.data.length < 500) break;
      }
      return {
        activeRevision:
          state.data.active_revision === null
            ? null
            : String(state.data.active_revision),
        components,
      };
    },
    async checkAsset(asset) {
      const r = await db
        .from("design_catalog_assets")
        .select("manifest")
        .eq("id", asset.id)
        .maybeSingle();
      if (r.error) throw r.error;
      if (r.data && arsenalHash(r.data.manifest) !== arsenalHash(asset))
        throw Error("frozen_import_asset_conflict");
    },
    async upload(asset, bytes, actor) {
      const options = { license: asset.license, weight: asset.weight };
      const verified = await verifyArsenalAsset(bytes, options);
      if (arsenalHash(verified.manifest) !== arsenalHash(asset))
        throw Error("frozen_import_asset_decode_mismatch");
      const stored = await uploadArsenalAsset(bytes, options, actor);
      if (arsenalHash(stored) !== arsenalHash(asset))
        throw Error("frozen_import_asset_conflict");
      const downloaded = await auth.storage
        .from("design-arsenal")
        .download(asset.sha256);
      if (
        downloaded.error ||
        !downloaded.data ||
        sha(Buffer.from(await downloaded.data.arrayBuffer())) !== asset.sha256
      )
        throw Error("frozen_import_stored_bytes_mismatch");
    },
    async stage(definitions, actor) {
      const result = await withCatalogStaging(async () => {
        for (const d of definitions) await prepareComponentDraft(d, actor);
      });
      const manifest = await readCatalogManifest(result.revision);
      const snapshot = validateCatalogSnapshot(
        await readCatalogSnapshot(result.revision)
      );
      if (arsenalHash(snapshot) !== manifest.hash)
        throw Error("frozen_import_revision_hash_mismatch");
      return { revision: result.revision, hash: manifest.hash };
    },
    async grant(definitions, actor) {
      const rows = definitions.flatMap(d =>
        d.assets.map(a => ({
          user_uuid: actor,
          asset_id: a.id,
          component_id: d.id,
        }))
      );
      for (let i = 0; i < rows.length; i += 500) {
        const r = await db
          .from("design_component_asset_grants")
          .upsert(rows.slice(i, i + 500), {
            onConflict: "user_uuid,asset_id,component_id",
            ignoreDuplicates: true,
          });
        if (r.error) throw r.error;
      }
    },
  };
}
