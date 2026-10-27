import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { resyncSupabaseSession } from "@/lib/authBridge";

export default function GoogleAuthCallback() {
  useEffect(() => {
    let active = true;
    const finish = async () => {
      try {
        if (!supabase) throw new Error("auth_unavailable");
        // getSession waits for SDK initialization, including consuming the OAuth URL.
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!session?.access_token) throw new Error("auth_session_missing");
        if (!active) return;
        await resyncSupabaseSession(session.access_token);
        if (active) window.location.replace("/thevoid");
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "";
        const reason = message === "postspark_access_required"
          ? "postspark_access_required"
          : message === "auth_session_missing" ? "no_token" : "session_failed";
        window.location.replace(`/?auth_error=${reason}`);
      }
    };
    void finish();
    return () => { active = false; };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "oklch(0.04 0.06 280)" }}>
      <div className="text-center">
        <div className="text-2xl mb-3 animate-spin inline-block">✦</div>
        <p className="text-foreground font-semibold">Autenticando...</p>
        <p className="text-muted-foreground text-sm mt-1">Aguarde um instante</p>
      </div>
    </div>
  );
}
