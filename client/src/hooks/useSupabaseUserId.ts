import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Invites and checkout confirmation can precede admission to the Studio.
// The initial auth event resolves the same signed-in identity used by their APIs.
export function useSupabaseUserId() {
  const [id, setId] = useState<string | null | undefined>(supabase ? undefined : null);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setId(session?.user.id ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return id;
}
