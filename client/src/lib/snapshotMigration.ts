import type { PostVisualSnapshot } from "@shared/postspark";

export type SnapshotV1 = PostVisualSnapshot & { snapshotVersion: 1 };
export type SnapshotV2 = PostVisualSnapshot & { snapshotVersion: 2 };
export type SnapshotV3 = PostVisualSnapshot & { snapshotVersion: 3 };

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

export function migrateToLatest(snapshot: PostVisualSnapshot): SnapshotV3 {
  if (snapshot.snapshotVersion === 1) {
    return migrateV2ToV3(migrateV1ToV2(snapshot as SnapshotV1));
  }
  if (snapshot.snapshotVersion === 2) {
    return migrateV2ToV3(snapshot as SnapshotV2);
  }
  return snapshot as SnapshotV3;
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
