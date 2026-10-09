export type ArsenalMode = "off" | "admin" | "all";
export function readArsenalMode(
  value = process.env.DESIGN_ARSENAL_V2_MODE
): ArsenalMode {
  return value === "admin" || value === "all" ? value : "off";
}
/** Only NEW generation selection is gated. Never use this to deny saved document/assets. */
export function canSelectArsenalV2(
  role: string | undefined,
  mode = readArsenalMode()
): boolean {
  return mode === "all" || (mode === "admin" && role === "admin");
}
