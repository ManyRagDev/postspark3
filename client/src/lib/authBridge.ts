import { supabase } from "@/lib/supabaseClient";

export async function exchangeSupabaseSession(accessToken: string): Promise<void> {
  const response = await fetch("/api/auth/supabase-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (!response.ok) {
    throw new Error("Failed to sync Supabase session bridge");
  }
}

export async function refreshBridgeFromCurrentSession(): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Missing Supabase session");
  }

  await exchangeSupabaseSession(session.access_token);
}
