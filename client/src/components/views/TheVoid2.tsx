import { useAuth } from "@/_core/hooks/useAuth";
import SparkLogo from "@/components/SparkLogo";
import SparkParticles from "@/components/SparkParticles";
import { exchangeSupabaseSession } from "@/lib/authBridge";
import { showcaseCards, type ShowcaseCard } from "@/lib/showcaseCards";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";

type AuthMode = "login" | "register";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getOptimizedUnsplashUrl(url: string, isMobile: boolean) {
  if (!url.includes("images.unsplash.com")) return url;

  try {
    const parsed = new URL(url);
    parsed.searchParams.set("auto", "format");
    parsed.searchParams.set("fit", "crop");
    parsed.searchParams.set("w", isMobile ? "480" : "800");
    parsed.searchParams.set("q", isMobile ? "75" : "85");
    if (isMobile) parsed.searchParams.set("fm", "webp");
    return parsed.toString();
  } catch {
    return url;
  }
}

// -------------------------------------------------------------
// Componente do Ícone Oficial do Google
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// Renderizador dos Cards Oficiais do Motor do PostSpark
// -------------------------------------------------------------
function ShowcasePostCard({
  post,
  isMobile,
  isCenter,
  onClick,
}: {
  post: ShowcaseCard;
  isMobile: boolean;
  isCenter: boolean;
  onClick: () => void;
}) {
  const imageUrl = post.backgroundImageUrl
    ? getOptimizedUnsplashUrl(post.backgroundImageUrl, isMobile)
    : undefined;

  return (
    <div
      onClick={onClick}
      className={`relative h-full w-full overflow-hidden rounded-[22px] md:rounded-[26px] text-left transition-all duration-300 select-none cursor-pointer ${
        isCenter
          ? "shadow-[0_24px_60px_rgba(0,0,0,0.7)]"
          : "shadow-[0_12px_36px_rgba(0,0,0,0.5)] opacity-40 hover:opacity-60"
      }`}
      style={{
        background: post.palette.background,
        border: isCenter
          ? `1.5px solid ${post.palette.accent}66`
          : "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      {/* Background de Foto com Overlay Cinematográfico */}
      {imageUrl && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                post.layoutType === "editorial-poster"
                  ? `linear-gradient(180deg, ${post.palette.background}22 0%, ${post.palette.background}99 45%, ${post.palette.background}FC 100%)`
                  : post.layoutType === "duotone-wash"
                  ? `linear-gradient(135deg, ${post.palette.accent}44 0%, ${post.palette.background}E6 75%)`
                  : post.layoutType === "glitch-signal"
                  ? `linear-gradient(180deg, ${post.palette.background}44 0%, ${post.palette.background}F2 100%)`
                  : `linear-gradient(180deg, ${post.palette.background}33 0%, ${post.palette.background}F0 85%)`,
            }}
          />
        </>
      )}

      {/* Vidro Fosco (Glass Veil) */}
      {post.layoutType === "glass-veil" && (
        <div className="absolute inset-x-4 top-14 bottom-14 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl p-5 shadow-2xl" />
      )}

      {/* Grid Neobrutalista (Brutal Split) */}
      {post.layoutType === "brutal-split" && (
        <div
          className="absolute top-0 inset-x-0 h-1.5"
          style={{ backgroundColor: post.palette.accent }}
        />
      )}

      {/* Scanlines (Glitch Signal) */}
      {post.layoutType === "glitch-signal" && (
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: "linear-gradient(rgba(0,240,255,0.15) 1px, transparent 1px)",
            backgroundSize: "100% 4px",
          }}
        />
      )}

      {/* Conteúdo do Post */}
      <div className="relative z-10 flex h-full flex-col justify-between p-5 md:p-6">
        {/* Topo: Família / Badge */}
        <div className="flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.24em]"
            style={{
              backgroundColor: `${post.palette.accent}22`,
              color: post.palette.accent,
              border: `1px solid ${post.palette.accent}44`,
            }}
          >
            {post.badge}
          </span>

          {post.stickerText && (
            <span
              className="text-[9px] font-black uppercase tracking-[0.28em] px-2 py-0.5 rounded"
              style={{
                backgroundColor: post.palette.accent,
                color: "#000000",
              }}
            >
              {post.stickerText}
            </span>
          )}
        </div>

        {/* Base: Categoria, Headline e Subtexto */}
        <div className="space-y-2">
          <div
            className="text-[10px] uppercase tracking-[0.3em] font-medium"
            style={{ color: `${post.palette.text}99` }}
          >
            {post.category}
          </div>

          <h2
            className="font-bold leading-[1.12] tracking-tight"
            style={{
              fontFamily: post.fontFamily,
              color: post.palette.text,
              fontSize:
                post.layoutType === "chromatic-block"
                  ? isMobile ? "1.65rem" : "1.9rem"
                  : isMobile ? "1.25rem" : "1.45rem",
              textTransform: post.layoutType === "chromatic-block" ? "uppercase" : "none",
            }}
          >
            {post.headline}
          </h2>

          <p
            className="text-xs md:text-sm font-light leading-relaxed line-clamp-2"
            style={{ color: `${post.palette.text}CC` }}
          >
            {post.subtext}
          </p>

          <div
            className="h-1 w-10 rounded-full mt-3"
            style={{ backgroundColor: post.palette.accent }}
          />
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Componente do Painel de Autenticação (Modal no Desktop / Bottom Sheet no Mobile)
// -------------------------------------------------------------
function AuthModal({
  isOpen,
  isMobile,
  onClose,
}: {
  isOpen: boolean;
  isMobile: boolean;
  onClose: () => void;
}) {
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
        throw new Error("Login indisponível: configure o Supabase.");
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
      window.location.href = "/thevoid";
    } catch (err: any) {
      const message = err?.message || "Não foi possível autenticar agora.";
      if (message.includes("Invalid login credentials")) setError("E-mail ou senha incorretos.");
      else if (message.includes("User already registered")) setError("Este e-mail já está cadastrado. Faça login.");
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6 overflow-hidden select-none">
          {/* Backdrop escurecido com blur */}
          <motion.div
            key="auth-backdrop"
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Painel do Modal / Bottom Sheet */}
          <motion.div
            key="auth-panel"
            className={
              isMobile
                ? "relative z-10 w-full max-h-[90vh] overflow-y-auto rounded-t-[2.25rem] border-t border-white/15 p-6 pb-8 shadow-2xl backdrop-blur-2xl"
                : "relative z-10 w-full max-w-md my-auto rounded-[2rem] border border-white/15 p-8 shadow-2xl backdrop-blur-2xl"
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
            {/* Handle do topo no mobile */}
            {isMobile && (
              <div
                onClick={onClose}
                className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/30 cursor-pointer active:bg-white/50"
              />
            )}

            {/* Botão Fechar */}
            <button
              onClick={onClose}
              type="button"
              className="absolute left-5 top-5 flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white active:scale-95 cursor-pointer"
              aria-label="Voltar"
            >
              <ChevronDown size={18} />
            </button>

            {/* Cabeçalho */}
            <div className="mb-5 text-center pt-1">
              <div className="text-[10px] uppercase tracking-[0.32em] text-white/40 font-semibold">
                {mode === "login" ? "Acesso à Plataforma" : "Nova Conta"}
              </div>
              <h2 className="mt-2 text-2xl font-bold text-white tracking-tight">
                {mode === "login" ? "Entre no PostSpark" : "Crie sua conta"}
              </h2>
              <p className="mt-1 text-xs md:text-sm text-white/60">
                Gere posts magnéticos de alto impacto com IA.
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
              <span>{googleLoading ? "Conectando ao Google..." : "Continuar com Google"}</span>
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
                    <span>{mode === "login" ? "Entrar no PostSpark" : "Criar conta grátis"}</span>
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
                {mode === "login" ? "Criar conta grátis" : "Fazer login"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// -------------------------------------------------------------
// Componente Principal da Landing Page
// -------------------------------------------------------------
export default function TheVoid2() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      setLocation("/thevoid");
    }
  }, [isAuthenticated, loading, setLocation]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const openAuthModal = useCallback(() => setIsAuthOpen(true), []);
  const closeAuthModal = useCallback(() => setIsAuthOpen(false), []);

  const goToIndex = useCallback((index: number) => {
    setCurrentIndex(clamp(index, 0, showcaseCards.length - 1));
  }, []);

  const goNext = useCallback(() => {
    if (isAuthOpen) return;
    setCurrentIndex((prev) => Math.min(prev + 1, showcaseCards.length - 1));
  }, [isAuthOpen]);

  const goPrevious = useCallback(() => {
    if (isAuthOpen) return;
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, [isAuthOpen]);

  // Teclado
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isAuthOpen) {
        if (event.key === "Escape") closeAuthModal();
        return;
      }
      if (event.key === "ArrowLeft") goPrevious();
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowUp" || event.key === "Enter") openAuthModal();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeAuthModal, goNext, goPrevious, isAuthOpen, openAuthModal]);

  return (
    <div
      className="relative flex h-[100dvh] min-h-screen w-full flex-col justify-between overflow-hidden text-white selection:bg-[#00f5ff] selection:text-black"
      style={{
        background: "radial-gradient(ellipse at 50% 15%, #0e121d 0%, #050608 70%, #030405 100%)",
      }}
    >
      {/* Glows e Partículas de Fundo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <SparkParticles count={isMobile ? 12 : 28} performanceMode={isMobile ? "reduced" : "full"} variant="default" />
        <div
          className={`absolute rounded-full bg-[#00f5ff]/7 blur-[90px] md:blur-[150px] ${
            isMobile ? "-left-16 -top-16 h-64 w-64" : "-left-20 -top-20 h-[32rem] w-[32rem]"
          }`}
        />
        <div
          className={`absolute rounded-full bg-[oklch(0.7_0.22_40)]/7 blur-[100px] md:blur-[160px] ${
            isMobile ? "-bottom-16 -right-16 h-72 w-72" : "-bottom-24 -right-24 h-[36rem] w-[36rem]"
          }`}
        />
      </div>

      {/* 1. HEADER (Top) */}
      <header className="relative z-10 flex flex-col items-center pt-4 md:pt-8 text-center shrink-0 px-4">
        <SparkLogo size={isMobile ? 42 : 72} />
        <h1
          className="mt-1 text-2xl md:text-4xl font-bold tracking-tight"
          style={{
            fontFamily: "var(--font-display)",
            textShadow: "0 4px 24px rgba(0,0,0,0.7)",
          }}
        >
          <span className="text-foreground">Post</span>
          <span style={{ color: "oklch(0.7 0.22 40)" }}>Spark</span>
        </h1>
        <p className="text-[11px] md:text-xs font-light text-white/60 max-w-sm mt-0.5">
          Gere posts e carrosséis com a alma da sua marca usando IA.
        </p>
      </header>

      {/* 2. SHOWCASE STAGE (Centro - Carrossel Nativo Fluido) */}
      <main className="relative z-10 flex flex-1 items-center justify-center my-auto px-4 min-h-0">
        {/* Seta Esquerda (Desktop) */}
        <button
          type="button"
          onClick={goPrevious}
          disabled={currentIndex === 0 || isAuthOpen}
          aria-label="Card anterior"
          className="hidden md:flex absolute left-8 z-20 items-center justify-center rounded-full border border-white/12 bg-black/40 backdrop-blur-md p-3.5 text-white/70 shadow-2xl transition-all hover:scale-110 hover:bg-white/10 hover:text-white active:scale-95 disabled:opacity-0 cursor-pointer"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        {/* Palco dos Cards com Arraste Nativo Framer Motion */}
        <div className="relative flex items-center justify-center h-[350px] md:h-[460px] w-full max-w-md">
          {showcaseCards.map((post, index) => {
            const offset = index - currentIndex;
            if (Math.abs(offset) > 2) return null;

            const isCenter = offset === 0;
            const xOffset = offset * (isMobile ? 220 : 280);

            return (
              <motion.div
                key={post.id}
                className="absolute top-0 bottom-0 flex items-center justify-center touch-none"
                style={{
                  width: isMobile ? "260px" : "320px",
                  height: isMobile ? "350px" : "440px",
                  zIndex: isCenter ? 20 : 10 - Math.abs(offset),
                }}
                animate={{
                  x: xOffset,
                  scale: isCenter ? 1 : 0.86,
                  opacity: isCenter ? 1 : 0.45,
                  rotateY: offset * -18,
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                  mass: 0.6,
                }}
                drag={isCenter ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.25}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -40 || info.velocity.x < -200) {
                    goNext();
                  } else if (info.offset.x > 40 || info.velocity.x > 200) {
                    goPrevious();
                  }
                }}
              >
                <ShowcasePostCard
                  post={post}
                  isMobile={isMobile}
                  isCenter={isCenter}
                  onClick={() => {
                    if (isCenter) {
                      openAuthModal();
                    } else {
                      goToIndex(index);
                    }
                  }}
                />
              </motion.div>
            );
          })}
        </div>

        {/* Seta Direita (Desktop) */}
        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex === showcaseCards.length - 1 || isAuthOpen}
          aria-label="Próximo card"
          className="hidden md:flex absolute right-8 z-20 items-center justify-center rounded-full border border-white/12 bg-black/40 backdrop-blur-md p-3.5 text-white/70 shadow-2xl transition-all hover:scale-110 hover:bg-white/10 hover:text-white active:scale-95 disabled:opacity-0 cursor-pointer"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </main>

      {/* 3. ACTION FOOTER (Base - 100% Isolado e Clicável) */}
      <footer className="relative z-20 flex flex-col items-center justify-center gap-3 pb-6 md:pb-8 pt-2 px-4 shrink-0">
        {/* Paginação por Dots */}
        <div className="flex items-center gap-1.5 pb-1">
          {showcaseCards.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goToIndex(i)}
              aria-label={`Ir para slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                i === currentIndex
                  ? "w-6 bg-[oklch(0.7_0.22_40)] shadow-[0_0_8px_oklch(0.7_0.22_40)]"
                  : "w-1.5 bg-white/20 hover:bg-white/40"
              }`}
            />
          ))}
        </div>

        {/* Botão de Ação Primário */}
        <div className="flex flex-col items-center gap-2 w-full max-w-xs md:max-w-sm">
          <button
            type="button"
            onClick={openAuthModal}
            className="group flex w-full items-center justify-center gap-2.5 rounded-2xl py-3.5 px-6 text-sm md:text-base font-bold text-black shadow-2xl transition-all duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] cursor-pointer"
            style={{
              background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
              boxShadow: "0 0 32px oklch(0.7 0.22 40 / 40%), 0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            <span>Criar meu primeiro post</span>
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </button>

          <div className="flex items-center gap-2 text-xs text-white/55">
            <span>Já tem uma conta?</span>
            <button
              type="button"
              onClick={openAuthModal}
              className="font-semibold text-white/90 hover:text-white underline underline-offset-4 py-0.5 px-1 cursor-pointer"
            >
              Entrar
            </button>
          </div>
        </div>
      </footer>

      {/* Modal / Bottom Sheet de Autenticação */}
      <AuthModal
        isOpen={isAuthOpen}
        isMobile={isMobile}
        onClose={closeAuthModal}
      />
    </div>
  );
}
