import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { resyncSupabaseSession } from "@/lib/authBridge";
import { membershipCycleKey } from "@/lib/membershipApi";

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
        const params = new URLSearchParams(window.location.search);
        const invite = params.get("invite");
        if (invite && /^[0-9a-f-]{36}$/i.test(invite)) {
          window.location.replace(`/agency?invite=${invite}`);
          return;
        }
        if (params.get("start") === "1") {
          window.location.replace("/pricing?start=1");
          return;
        }
        const checkoutCycle = params.get("cycle")
          ?? sessionStorage.getItem(membershipCycleKey);
        if (checkoutCycle === "monthly" || checkoutCycle === "annual") {
          sessionStorage.removeItem(membershipCycleKey);
          const plan = params.get("plan");
          const suffix = plan && ["SOLO", "PRO_PLUS", "AGENCY"].includes(plan) ? `&plan=${plan}` : "";
          window.location.replace(`/pricing?cycle=${checkoutCycle}${suffix}`);
          return;
        }
        await resyncSupabaseSession(session.access_token);
        if (active) window.location.replace("/thevoid");
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "";
        if (message === "postspark_access_required") {
          window.location.replace("/pricing");
          return;
        }
        const reason = message === "auth_session_missing" ? "no_token" : "session_failed";
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
