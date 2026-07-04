import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { analytics } from "@/lib/analytics";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

/**
 * CTA único da landing: visitante → Google OAuth; autenticado → estúdio.
 */
export function useLanding3Auth() {
  const [starting, setStarting] = useState(false);
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const start = useCallback(
    async (source: string) => {
      analytics.trackEvent("landing3_cta_click", { source });

      if (isAuthenticated) {
        setLocation("/thevoid");
        return;
      }

      if (!isSupabaseConfigured || !supabase) {
        toast.error("Login indisponível no momento. Tente pela página inicial.");
        return;
      }

      setStarting(true);
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/google-callback`,
            queryParams: { access_type: "offline", prompt: "consent" },
          },
        });
        if (error) throw error;
        // sucesso = redirect: o loading permanece até a página trocar
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Falha ao iniciar login com Google.";
        toast.error(message);
        setStarting(false);
      }
    },
    [isAuthenticated, setLocation],
  );

  return { starting, isAuthenticated, start };
}
