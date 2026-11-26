export const THEVOID_LAB_PATH = "/thevoid-lab";

export function isTheVoidLabSearch(search: string): boolean {
  return new URLSearchParams(search).get("studio") === "lab";
}

export function studioLibraryPath(path: "/history" | "/saved-posts", lab: boolean): string {
  return lab ? `${path}?studio=lab` : path;
}
