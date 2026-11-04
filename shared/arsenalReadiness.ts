/** Shared technical policy. Diagnostics still require rendered review; they do
 * not establish readability, visual fidelity, or publication approval. */
export function subpixelTextOverflowLimit(worldScale: number): number {
  return 0.5 / Math.max(1, worldScale);
}

export function partitionArsenalReadinessIssues(issues: readonly string[]): {
  blocking: string[];
  diagnostics: string[];
} {
  const blocking: string[] = [];
  const diagnostics: string[] = [];
  for (const issue of issues) {
    const target = issue.startsWith("contrast:unknown:") ||
      issue.startsWith("collision:text_media:") ||
      issue.startsWith("overflow:subpixel:") ? diagnostics : blocking;
    target.push(issue);
  }
  return { blocking, diagnostics };
}
