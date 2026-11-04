export type RepertoireImportMode =
  | { packagePath: string; kind: "verify-local" }
  | { packagePath: string; kind: "verify-staged"; revision: string }
  | { packagePath: string; kind: "stage"; actor: string };

/** Reject mixed/unknown flags before any remote client or mutation is reached. */
export function parseRepertoireImportMode(
  args: string[]
): RepertoireImportMode {
  const [packagePath, ...rest] = args;
  if (!packagePath || packagePath.startsWith("--"))
    throw new Error("Informe o caminho do pacote");
  if (rest.length === 1 && rest[0] === "--verify-only")
    return { packagePath, kind: "verify-local" };
  if (
    rest.length === 2 &&
    rest[0] === "--verify-staged-revision" &&
    /^[1-9]\d*$/.test(rest[1])
  )
    return { packagePath, kind: "verify-staged", revision: rest[1] };
  if (rest.length === 1 && /^[a-f0-9-]{36}$/.test(rest[0]))
    return { packagePath, kind: "stage", actor: rest[0] };
  throw new Error(
    "Use PACOTE ADMIN_UUID, PACOTE --verify-only ou PACOTE --verify-staged-revision N"
  );
}
