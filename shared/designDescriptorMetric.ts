import {
  STRUCTURE_AXES,
  STRUCTURE_WEIGHTS,
  DESCRIPTOR_VERSION,
} from "./designDescriptors";
import { arsenalHash } from "./arsenalContent";
export const STRUCTURAL_L1_METRIC_VERSION = "structural-weighted-l1-v1";
export const STRUCTURAL_L1_METRIC_HASH = arsenalHash({
  descriptorVersion: DESCRIPTOR_VERSION,
  metricVersion: STRUCTURAL_L1_METRIC_VERSION,
  axes: STRUCTURE_AXES,
  weights: STRUCTURE_WEIGHTS,
});
export function projectStructuralL1(values: readonly number[]): number[] {
  if (
    values.length !== 48 ||
    values.some(n => !Number.isFinite(n) || n < 0 || n > 1)
  )
    throw new Error("Descritor structural-v1 inválido");
  const total = STRUCTURE_WEIGHTS.reduce((sum, w) => sum + w, 0);
  return values.map((n, i) => (n * STRUCTURE_WEIGHTS[i]) / total);
}
export function projectedL1Distance(
  a: readonly number[],
  b: readonly number[]
): number {
  if (
    a.length !== 48 ||
    b.length !== 48 ||
    [...a, ...b].some(n => !Number.isFinite(n))
  )
    throw new Error("Vetores incompatíveis");
  return a.reduce((sum, n, i) => sum + Math.abs(n - b[i]), 0);
}
