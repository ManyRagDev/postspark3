import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { exchangeSupabaseSession } from "@/lib/authBridge";

export function useAuth() {
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  useEffect(() => {
    let active = true;

    const syncCurrentSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active || !session?.access_token) {
        return;
      }

      try {
        await exchangeSupabaseSession(session.access_token);
        await utils.auth.me.invalidate();
      } catch (error) {
        console.warn("[Auth] Failed to sync existing Supabase session:", error);
      }
    };

    syncCurrentSession().catch(() => {});

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "SIGNED_OUT") {
        fetch("/api/auth/supabase-logout", {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
        utils.auth.me.setData(undefined, null);
        return;
      }

      if (session?.access_token) {
        exchangeSupabaseSession(session.access_token)
          .then(() => utils.auth.me.invalidate())
          .catch(error => {
            console.warn("[Auth] Failed to sync Supabase token refresh:", error);
          });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [utils]);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn("[Auth] Supabase signOut failed:", error);
    }

    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      fetch("/api/auth/supabase-logout", {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
