export const HASH =
  "b6b3cd19f6e76f178028a34f937a8a08ba8521a37e035638eec3a5dc5a33a564";
export const BYTES = 397808032;

export async function hasCachedModel() {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("mare-ia-modelos");
    const handle = await dir.getFileHandle(HASH + ".gguf");
    return (await handle.getFile()).size === BYTES;
  } catch {
    return false;
  }
}
