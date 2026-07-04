/**
 * Módulo compartilhado de autenticação para PostSpark.
 * Reutilizável em TheVoid2, Landing Page e outros pontos de entrada.
 *
 * Extrai:
 * - Google OAuth handler
 * - Drawer de login/registro
 * - Estados e handlers comuns
 */

import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { exchangeSupabaseSession } from "@/lib/authBridge";
import { useState, useCallback } from "react";

export type AuthMode = "login" | "register";

/**
 * Hook para gerenciar drawer de login/registro.
 * Reutilizável em múltiplos componentes.
 */
export function useAuthDrawer(onSuccess?: () => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailAuth = async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error("Autenticação indisponível: configure o Supabase.");
      }

      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) throw result.error;

      const accessToken = result.data.session?.access_token;
      if (!accessToken) {
        if (mode === "register") {
          setError("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
          return;
        }
        throw new Error("Sessão não encontrada.");
      }

      await exchangeSupabaseSession(accessToken);
      onSuccess?.();
      setIsOpen(false);
    } catch (err: any) {
      const message = err?.message || "Não foi possível autenticar agora.";
      if (message.includes("Invalid login credentials")) setError("E-mail ou senha incorretos.");
      else if (message.includes("User already registered")) setError("Este e-mail já está cadastrado. Faça login.");
      else setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error("Login com Google indisponível: configure o Supabase.");
      }

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/google-callback`,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });

      if (oauthError) throw oauthError;
    } catch (err: any) {
      setError(err?.message || "Falha ao iniciar login com Google.");
      setGoogleLoading(false);
    }
  };

  const switchMode = () => {
    setMode((prev) => (prev === "login" ? "register" : "login"));
    setError(null);
  };

  const openDrawer = () => setIsOpen(true);
  const closeDrawer = () => setIsOpen(false);

  return {
    isOpen,
    mode,
    loading,
    googleLoading,
    error,
    handleEmailAuth,
    handleGoogleSignIn,
    switchMode,
    openDrawer,
    closeDrawer,
    setError,
  };
}

/**
 * Handler simples de Google OAuth para CTAs diretos (sem drawer).
 * Usado no CTA do hero da landing page.
 */
export async function handleGoogleOAuthOnly() {
  try {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Login com Google indisponível: configure o Supabase.");
    }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/google-callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });

    if (oauthError) throw oauthError;
  } catch (err: any) {
    console.error("Google OAuth error:", err?.message || err);
    throw err;
  }
}
