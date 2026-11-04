const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalEmailAuth(config: {
  development: boolean;
  mode: unknown;
  hostname: string;
  supabaseUrl: string;
}): boolean {
  if (
    !config.development ||
    config.mode !== "email" ||
    !loopback.has(config.hostname)
  )
    return false;
  try {
    const url = new URL(config.supabaseUrl);
    return url.protocol === "http:" && loopback.has(url.hostname);
  } catch {
    return false;
  }
}
