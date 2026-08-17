import type { PostVisualSnapshot } from "@shared/postspark";
import { resolveSnapshotTypography } from "@shared/variationSnapshot";

export type SnapshotV1 = PostVisualSnapshot & { snapshotVersion: 1 };
export type SnapshotV2 = PostVisualSnapshot & { snapshotVersion: 2 };
export type SnapshotV3 = PostVisualSnapshot & { snapshotVersion: 3 };
export type SnapshotV4 = PostVisualSnapshot & { snapshotVersion: 4 };

export function migrateV1ToV2(snapshot: SnapshotV1): SnapshotV2 {
  return {
    ...snapshot,
    snapshotVersion: 2,
  } as SnapshotV2;
}

export function migrateV2ToV3(snapshot: SnapshotV2): SnapshotV3 {
  return {
    ...snapshot,
    snapshotVersion: 3,
  } as SnapshotV3;
}

/**
 * v3→v4 (SPEC-001): a única mudança de contrato é `resolvedTypography` — o
 * resto do snapshot já está no formato final. Roda o mesmo resolvedor
 * canônico que `createPostVisualSnapshot` usa, contra o `layoutSettings` já
 * congelado do v3 (nunca recalcula geometria, só tipografia).
 */
export function migrateV3ToV4(snapshot: SnapshotV3): SnapshotV4 {
  const { resolvedTypography, typographyResolutionError } = resolveSnapshotTypography(snapshot);
  return {
    ...snapshot,
    snapshotVersion: 4,
    resolvedTypography,
    typographyResolutionError,
  } as SnapshotV4;
}

export function migrateToLatest(snapshot: PostVisualSnapshot): SnapshotV4 {
  if (snapshot.snapshotVersion === 1) {
    return migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(snapshot as SnapshotV1)));
  }
  if (snapshot.snapshotVersion === 2) {
    return migrateV3ToV4(migrateV2ToV3(snapshot as SnapshotV2));
  }
  if (snapshot.snapshotVersion === 3) {
    return migrateV3ToV4(snapshot as SnapshotV3);
  }
  return snapshot as SnapshotV4;
}

export function isSnapshotV1(snapshot: PostVisualSnapshot): snapshot is SnapshotV1 {
  return snapshot.snapshotVersion === 1;
}

export function isSnapshotV2(snapshot: PostVisualSnapshot): snapshot is SnapshotV2 {
  return snapshot.snapshotVersion === 2;
}

export function isSnapshotV3(snapshot: PostVisualSnapshot): snapshot is SnapshotV3 {
  return snapshot.snapshotVersion === 3;
}

export function isSnapshotV4(snapshot: PostVisualSnapshot): snapshot is SnapshotV4 {
  return snapshot.snapshotVersion === 4;
}
