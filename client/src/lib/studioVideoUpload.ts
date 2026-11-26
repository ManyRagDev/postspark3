import { uploadStudioAsset } from "../../../labs/mare-studio/dist/studio-upload.js";

export function uploadStudioVideo(
  file: File,
  workspaceId?: string,
  signal?: AbortSignal
) {
  return uploadStudioAsset(file, { kind: "video", workspaceId, signal });
}
