import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { exchangeSupabaseSession } from "@/lib/authBridge";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { useState } from "react";

type AuthMode = "login" | "register";

function GoogleLogo({ className = "h-4 w-4 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

interface StudioAuthModalProps {
  isOpen: boolean;
  isMobile: boolean;
  onClose: () => void;
  initialPrompt?: string;
}

export default function StudioAuthModal({ isOpen, isMobile, onClose, initialPrompt }: StudioAuthModalProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error("Login indisponível no momento.");
      }

      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) throw result.error;

      const accessToken = result.data.session?.access_token;
      if (!accessToken) {
        if (mode === "register") {
          setError("Conta criada com sucesso! Verifique seu e-mail para confirmar.");
          return;
        }
        throw new Error("Sessão não encontrada.");
      }

      await exchangeSupabaseSession(accessToken);
      window.location.href = "/thevoid";
    } catch (err: any) {
      const message = err?.message || "Não foi possível autenticar agora.";
      if (message.includes("Invalid login credentials")) setError("E-mail ou senha incorretos.");
      else if (message.includes("User already registered")) setError("Este e-mail já está cadastrado.");
      else setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);

    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error("Login com Google indisponível.");
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center p-0 md:p-6 overflow-hidden select-none pointer-events-auto">
          {/* Backdrop */}
          <motion.div
            key="studio-auth-backdrop"
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Painel do Modal */}
          <motion.div
            key="studio-auth-panel"
            className={
              isMobile
                ? "relative z-10 w-full max-h-[90vh] overflow-y-auto rounded-t-[2.25rem] border-t border-white/15 p-6 pb-8 shadow-2xl backdrop-blur-2xl pointer-events-auto"
                : "relative z-10 w-full max-w-md my-auto rounded-[2rem] border border-white/15 p-8 shadow-2xl backdrop-blur-2xl pointer-events-auto"
            }
            style={{
              background: "linear-gradient(180deg, rgba(18, 22, 34, 0.98) 0%, rgba(8, 10, 16, 0.99) 100%)",
              boxShadow: "0 28px 80px rgba(0,0,0,0.85), 0 0 50px rgba(0, 245, 255, 0.08)",
            }}
            initial={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.94, y: 20 }}
            animate={isMobile ? { y: "0%" } : { opacity: 1, scale: 1, y: 0 }}
            exit={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.96, y: 15 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
          >
            {isMobile && (
              <div
                onClick={onClose}
                className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/30 cursor-pointer active:bg-white/50"
              />
            )}

            <button
              onClick={onClose}
              type="button"
              className="absolute left-5 top-5 flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white active:scale-95 cursor-pointer"
              aria-label="Fechar"
            >
              <ChevronDown size={18} />
            </button>

            <div className="mb-5 text-center pt-1">
              <div className="text-[10px] uppercase tracking-[0.32em] text-white/40 font-semibold">
                {mode === "login" ? "Acesso ao Estúdio" : "Nova Conta"}
              </div>
              <h2 className="mt-2 text-2xl font-bold text-white tracking-tight">
                {mode === "login" ? "Entre no PostSpark" : "Crie sua conta"}
              </h2>
              <p className="mt-1 text-xs md:text-sm text-white/60">
                {initialPrompt
                  ? "Acesse sua conta para gerar posts com esta ideia."
                  : "Direção de arte e inteligência visual para seus posts."}
              </p>
            </div>

            {/* Google OAuth */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading || googleLoading || !isSupabaseConfigured}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/6 py-3 px-4 text-sm font-medium text-white transition-all hover:bg-white/10 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              {googleLoading ? (
                <Loader2 size={18} className="animate-spin text-white" />
              ) : (
                <GoogleLogo className="h-4 w-4 shrink-0" />
              )}
              <span>{googleLoading ? "Conectando..." : "Continuar com Google"}</span>
            </button>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">ou com e-mail</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Formulário */}
            <form onSubmit={handleEmailAuth} className="space-y-3">
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  required
                  placeholder="seu@email.com"
                  className="w-full rounded-2xl border border-white/12 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder-white/35 outline-none transition-all focus:border-[oklch(0.7_0.22_40)] focus:bg-white/8"
                />
              </div>

              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  required
                  minLength={6}
                  placeholder={mode === "register" ? "Mínimo 6 caracteres" : "Sua senha"}
                  className="w-full rounded-2xl border border-white/12 bg-white/5 py-3 pl-10 pr-11 text-sm text-white placeholder-white/35 outline-none transition-all focus:border-[oklch(0.7_0.22_40)] focus:bg-white/8"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || googleLoading || !isSupabaseConfigured}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-3 text-sm font-semibold text-black transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, oklch(0.75 0.22 45), oklch(0.65 0.2 25))",
                  boxShadow: "0 0 24px oklch(0.7 0.22 40 / 35%)",
                }}
              >
                {loading ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <>
                    <span>{mode === "login" ? "Entrar no PostSpark" : "Criar conta"}</span>
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 text-center text-xs text-white/55">
              {mode === "login" ? "Ainda não tem conta? " : "Já possui conta? "}
              <button
                type="button"
                onClick={() => {
                  setMode((v) => (v === "login" ? "register" : "login"));
                  setError(null);
                }}
                className="font-semibold text-[oklch(0.75_0.22_45)] hover:underline cursor-pointer"
              >
                {mode === "login" ? "Criar conta" : "Fazer login"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
