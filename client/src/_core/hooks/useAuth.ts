import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import {
  createContext,
  createElement,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { clearCatalogCache } from "@/lib/catalogCache";
import { exchangeSupabaseSession, clearSessionBridge } from "@/lib/authBridge";

function useAuthState() {
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<unknown>(null);

  const syncedToken = useRef<string | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    const supabaseClient = supabase;
    let active = true;

    const sync = async (token: string) => {
      if (!active || syncedToken.current === token) return;
      syncedToken.current = token;
      try {
        await exchangeSupabaseSession(token);
        if (active && syncedToken.current === token)
          await utils.auth.me.invalidate();
      } catch (error) {
        if (syncedToken.current === token) syncedToken.current = null;
        console.warn("[Auth] Falha ao sincronizar sessão:", error);
      }
    };
    void supabaseClient.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session?.access_token) return sync(session.access_token);
      })
      .catch(error => console.warn("[Auth] Falha ao ler sessão:", error));

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "SIGNED_OUT") {
        syncedToken.current = null;
        void clearCatalogCache();
        void clearSessionBridge().catch(error =>
          console.warn("[Auth] Logout bridge:", error)
        );
        utils.auth.me.setData(undefined, null);
        return;
      }
      if (session?.access_token)
        queueMicrotask(() => void sync(session.access_token));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      syncedToken.current = null;
    };
  }, [utils]);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      if (supabase) {
        const result = await supabase.auth.signOut();
        if (result?.error) throw result.error;
      }
      await clearSessionBridge();
      await clearCatalogCache();
      utils.auth.me.setData(undefined,null);
    } catch (error) {
      setLogoutError(error);
      throw error;
    } finally {
      setLoggingOut(false);
    }
  }, [utils]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || loggingOut,
      error: meQuery.error ?? logoutError ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [meQuery.data, meQuery.error, meQuery.isLoading, logoutError, loggingOut]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}

const AuthContext = createContext<ReturnType<typeof useAuthState> | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  const queryClient = useQueryClient();
  const previousOwner = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (value.loading) return;
    const next = value.user?.id ?? "";
    if (previousOwner.current !== undefined && previousOwner.current !== next) {
      const predicate = (query: { queryKey: readonly unknown[] }) =>
        String(query.queryKey[0]) !== "auth,me";
      void queryClient.cancelQueries({ predicate });
      queryClient.removeQueries({ predicate });
      void clearCatalogCache();
    }
    previousOwner.current = next;
    try {
      if (localStorage.getItem("postspark.catalog-owner") !== next) {
        void clearCatalogCache();
        localStorage.setItem("postspark.catalog-owner", next);
      }
    } catch {}
  }, [value.user?.id, value.loading, queryClient]);

  return createElement(AuthContext.Provider, { value }, children);
}
export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error("AuthProvider ausente");
  return state;
}
