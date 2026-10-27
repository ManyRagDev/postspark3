import { supabase } from "@/lib/supabaseClient";
let inFlight: Promise<void> | undefined;
let inFlightToken: string | undefined;
const marker = "postspark.session-bridge.v2";
const epochKey = "postspark.session-epoch";
const epoch = () => {
  try {
    return localStorage.getItem(epochKey) ?? "";
  } catch {
    return "";
  }
};
let fallbackBridgeQueue: Promise<unknown> = Promise.resolve();
async function bridgeLock(run: () => Promise<void>) {
  if (navigator.locks)
    return navigator.locks.request("postspark-session-bridge", run);
  const result = fallbackBridgeQueue.then(run);
  fallbackBridgeQueue = result.catch(() => {});
  return result;
}
export function clearBridgeMarker() {
  try {
    localStorage.removeItem(marker);
  } catch {}
}
async function digest(token: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(bytes), b =>
    b.toString(16).padStart(2, "0")
  ).join("");
}
export async function exchangeSupabaseSession(
  accessToken: string
): Promise<void> {
  if (inFlight && inFlightToken === accessToken) return inFlight;
  const startEpoch = epoch();
  const work = async () => {
    const fingerprint = await digest(accessToken);
    const sync = async () => {
      if (startEpoch !== epoch()) throw new Error("session_changed");
      try {
        if (localStorage.getItem(marker) === fingerprint) return;
      } catch {}
      const response = await fetch("/api/auth/supabase-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(import.meta.env.DEV ? {"X-PostSpark-Auth-Bridge":"shared"} : {}) },
        credentials: "include",
        body: JSON.stringify({ access_token: accessToken }),
      });
      if (!response.ok) {
        clearBridgeMarker();
        const body = await response.json().catch(() => ({}));
        throw new Error(
          body.error === "postspark_access_required"
            ? "postspark_access_required"
            : "Failed to sync Supabase session bridge"
        );
      }
      if (startEpoch !== epoch()) {
        clearBridgeMarker();
        await fetch("/api/auth/supabase-logout", {
          method: "POST",
          credentials: "include",
        });
        throw new Error("session_changed");
      }
      try {
        localStorage.setItem(marker, fingerprint);
      } catch {}
    };
    await bridgeLock(sync);
  };
  const promise = work();
  inFlight = promise;
  inFlightToken = accessToken;
  try {
    await promise;
  } finally {
    if (inFlight === promise) {
      inFlight = undefined;
      inFlightToken = undefined;
    }
  }
}
let refresh: Promise<void> | undefined;
/** A completed login must repair a missing cookie even if its persisted marker survived. */
export async function resyncSupabaseSession(accessToken: string) {
  const previous = inFlightToken === accessToken ? inFlight : undefined;
  clearBridgeMarker();
  if (previous) await previous;
  await exchangeSupabaseSession(accessToken);
}
export async function ensureSessionForRequest() {
  if (!supabase) return;
  if (refresh) return refresh;
  const work = async () => {
    const run = async () => {
      let {
        data: { session },
      } = await supabase!.auth.getSession();
      if (!session) return;
      if (
        !session.expires_at ||
        session.expires_at * 1000 < Date.now() + 30_000
      ) {
        const r = await supabase!.auth.refreshSession();
        if (r.error) throw r.error;
        session = r.data.session;
      }
      if (!session) throw new Error("Missing Supabase session");
      await exchangeSupabaseSession(session.access_token);
    };
    if (navigator.locks)
      await navigator.locks.request("postspark-session-refresh", run);
    else await run();
  };
  refresh = work();
  try {
    await refresh;
  } finally {
    refresh = undefined;
  }
}
export async function refreshBridgeFromCurrentSession() {
  clearBridgeMarker();
  await ensureSessionForRequest();
}

export async function clearSessionBridge() {
  window.dispatchEvent(new Event("postspark:session-ended"));
  try {
    localStorage.setItem(epochKey, crypto.randomUUID());
  } catch {}
  const clear = async () => {
    try {
      if (localStorage.getItem(marker) === "signed-out") return;
    } catch {}
    const response = await fetch("/api/auth/supabase-logout", {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error("session_logout_failed");
    try {
      localStorage.setItem(marker, "signed-out");
    } catch {}
  };
  await bridgeLock(clear);
}
