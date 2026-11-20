// Preserve the Zod 4.1 JSON Schema representation used by historical hashes.
// Validation and current review contracts continue to use the installed Zod.
export function historicalReviewSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(historicalReviewSchema);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length === 1 && Array.isArray(record.type) &&
      record.type.length === 2 && record.type[0] === "string" && record.type[1] === "null") {
    return { anyOf: [{ type: "string" }, { type: "null" }] };
  }
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, historicalReviewSchema(item)]));
}
