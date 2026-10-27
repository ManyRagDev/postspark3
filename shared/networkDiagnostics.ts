/** Metadata only: never retain query strings, object names, credentials or bodies. */
export function diagnosticEndpoint(value: string, base?: string): string {
  let path: string;
  try {
    path = new URL(value, base).pathname;
  } catch {
    return "/unknown";
  }
  const safe = (s: string) =>
    /^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(s) ? s : ":redacted";
  const parts = path.split("/").filter(Boolean);
  if (path.startsWith("/rest/v1/rpc/"))
    return "/rest/v1/rpc/" + safe(parts[3] ?? "");
  if (path.startsWith("/rest/v1/")) return "/rest/v1/" + safe(parts[2] ?? "");
  if (path.startsWith("/auth/v1/")) {
    const action = parts[2];
    return (
      "/auth/v1/" +
      ([
        "user",
        "token",
        "logout",
        "authorize",
        "callback",
        "settings",
        "signup",
        "otp",
        "verify",
        "recover",
      ].includes(action)
        ? action
        : ":action")
    );
  }
  if (path.startsWith("/storage/v1/")) return "/storage/v1/:object";
  if (path.startsWith("/api/trpc/"))
    return (
      "/api/trpc/" +
      (parts[2] ?? "").split(",").slice(0, 30).map(safe).join(",")
    );
  if (path.startsWith("/api/generation/events/"))
    return "/api/generation/events/:request";
  if (
    [
      "/api/auth/supabase-session",
      "/api/auth/supabase-logout",
      "/api/analytics/pageview",
      "/api/analytics/event",
    ].includes(path)
  )
    return path;
  return path.startsWith("/api/") ? "/api/:other" : "/:other";
}
export function diagnosticCategory(endpoint: string) {
  if (endpoint.startsWith("/auth/") || /manylabs_app_access/.test(endpoint))
    return "authentication";
  if (/catalog|design_component|design_arsenal/.test(endpoint))
    return "catalog";
  if (/generation|lease/.test(endpoint)) return "generation";
  if (/spark|billing|reservation/.test(endpoint)) return "billing";
  if (endpoint.startsWith("/storage/")) return "storage";
  return "data";
}
export function diagnosticPage(path: string) {
  return [
    "/",
    "/thevoid",
    "/studio",
    "/billing",
    "/saved-posts",
    "/pricing",
    "/admin2",
    "/auth/google-callback",
  ].includes(path)
    ? path
    : "/:other";
}
export function diagnosticBrowser(agent: string) {
  if (/OPR\//.test(agent)) return "Opera";
  if (/Vivaldi\//.test(agent)) return "Vivaldi";
  if (/Firefox\//.test(agent)) return "Firefox";
  if (/Edg\//.test(agent)) return "Edge";
  if (/Chrome\//.test(agent)) return "Chromium";
  return "other";
}
export const diagnosticId = (value: unknown): string | undefined =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value)
    ? value
    : undefined;
export type NetworkCapture = {
  id: string;
  scenario: string;
  start: number;
  until: number;
};
