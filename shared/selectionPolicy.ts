/** Policy is pinned at admission; absence on historical requests means legacy. */
export type SelectionPolicy = "legacy" | "capability_v1";
export const CAPABILITY_SELECTION_POLICY = Object.freeze({
  id: "capability_v1" as const,
  scoreScale: 4,
  maximumSuitabilityGap: 0.4,
  diversityWeight: 0.4,
  recencyWeight: 0.1,
});
export function selectionPolicyForNewRequest(value: string | undefined): SelectionPolicy {
  if (!value || value === "legacy") return "legacy";
  if (value === "capability_v1") return value;
  throw new Error("POSTSPARK_SELECTION_POLICY inválida; use legacy ou capability_v1");
}
