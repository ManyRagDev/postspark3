import { useAuth } from "@/_core/hooks/useAuth";
import SparkLogo from "@/components/SparkLogo";
import SparkParticles from "@/components/SparkParticles";
import { exchangeSupabaseSession } from "@/lib/authBridge";
import { showcaseCards, type ShowcaseCard } from "@/lib/showcaseCards";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Chrome,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ArrowRight,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
    parsed.searchParams.set("w", isMobile ? "480" : "900");
    parsed.searchParams.set("q", isMobile ? "75" : "85");
    if (isMobile) parsed.searchParams.set("fm", "webp");
    return parsed.toString();
  } catch {
    return url;
  }
}

function renderBackground(post: ShowcaseCard, isMobile: boolean) {
  if (post.backgroundKind === "photo" && post.backgroundImageUrl) {
    const backgroundImageUrl = getOptimizedUnsplashUrl(post.backgroundImageUrl, isMobile);
    return (
      <>
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105"
          style={{ backgroundImage: `url(${backgroundImageUrl})` }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${post.palette.background}14 0%, ${post.palette.background}88 52%, ${post.palette.background}F4 100%)`,
          }}
        />
      </>
    );
  }
  if (post.backgroundKind === "glass") {
    return (
      <>
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 18% 18%, ${post.palette.accent}45 0%, transparent 36%), radial-gradient(circle at 82% 22%, #ffffff14 0%, transparent 30%), linear-gradient(135deg, ${post.palette.surface ?? post.palette.background} 0%, ${post.palette.background} 100%)`,
          }}
        />
        <div className="absolute left-6 top-8 h-28 w-28 rounded-[2rem] border border-white/10 bg-white/6 backdrop-blur-2xl" />
        <div className="absolute right-5 top-[4.5rem] h-20 w-20 rounded-full border border-white/10 bg-white/6 backdrop-blur-2xl" />
        <div className="absolute bottom-24 right-7 h-24 w-36 rounded-[1.75rem] border border-white/10 bg-white/8 backdrop-blur-xl" />
      </>
    );
  }
  if (post.backgroundKind === "pattern") {
    return (
      <>
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${post.palette.surface ?? post.palette.background} 0%, ${post.palette.background} 100%)`,
          }}
        />
        <div
          className="absolute inset-0 opacity-55"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
      </>
    );
  }
  if (post.backgroundKind === "mesh") {
    return (
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 16% 24%, ${post.palette.accent}42 0%, transparent 28%), radial-gradient(circle at 78% 24%, #ffffff12 0%, transparent 20%), radial-gradient(circle at 62% 78%, ${post.palette.accent}24 0%, transparent 24%), linear-gradient(135deg, ${post.palette.surface ?? post.palette.background} 0%, ${post.palette.background} 100%)`,
        }}
      />
    );
  }
  if (post.backgroundKind === "editorial" && post.backgroundImageUrl) {
    const backgroundImageUrl = getOptimizedUnsplashUrl(post.backgroundImageUrl, isMobile);
    return (
      <>
        <div
          className="absolute inset-y-0 right-0 w-[58%] bg-cover bg-center"
          style={{ backgroundImage: `url(${backgroundImageUrl})` }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg, ${post.palette.background} 0%, ${post.palette.background}F2 48%, ${post.palette.background}66 74%, transparent 100%)`,
          }}
        />
      </>
    );
  }
  return (
    <div
      className="absolute inset-0"
      style={{
        background: `linear-gradient(180deg, ${post.palette.surface ?? post.palette.background} 0%, ${post.palette.background} 100%)`,
      }}
    />
  );
}

function renderDecorations(post: ShowcaseCard) {
  if (post.layoutType === "grid") {
    return (
      <>
        <div className="absolute left-6 top-14 grid w-[70%] grid-cols-2 gap-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className={`rounded-2xl border border-white/8 bg-black/25 backdrop-blur-md ${item === 2 ? "col-span-2 h-16" : "h-20"}`}
            />
          ))}
        </div>
        <div
          className="absolute right-6 top-6 h-10 w-10 rounded-full"
          style={{
            backgroundColor: `${post.palette.accent}22`,
            border: `1px solid ${post.palette.accent}40`,
          }}
        />
      </>
    );
  }
  if (post.layoutType === "split") {
    return (
      <div
        className="absolute inset-y-0 left-[48%] w-px"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${post.palette.accent}90 50%, transparent 100%)`,
        }}
      />
    );
  }
  if (post.layoutType === "minimal") {
    return (
      <>
        <div
          className="absolute left-6 top-6 h-20 w-20 rounded-full"
          style={{ border: `2px solid ${post.palette.accent}` }}
        />
        <div
          className="absolute right-6 top-10 h-3 w-14"
          style={{ backgroundColor: post.palette.accent }}
        />
      </>
    );
  }
  if (post.layoutType === "conversion") {
    return (
      <>
        <div
          className="absolute left-0 top-0 h-28 w-full"
          style={{
            background: `linear-gradient(135deg, ${post.palette.accent}28 0%, transparent 58%)`,
          }}
        />
        <div
          className="absolute right-5 top-5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em]"
          style={{ backgroundColor: post.palette.accent, color: "#0A0A0A" }}
        >
          Spark
        </div>
      </>
    );
  }
  if (post.layoutType === "editorial") {
    return (
      <>
        <div
          className="absolute left-6 top-16 h-px w-24"
          style={{ backgroundColor: `${post.palette.accent}AA` }}
        />
        <div
          className="absolute left-6 top-6 h-2 w-2 rounded-full"
          style={{ backgroundColor: post.palette.accent }}
        />
      </>
    );
  }
  return (
    <div
      className="absolute left-6 top-6 h-1.5 rounded-full"
      style={{ width: "2.75rem", backgroundColor: post.palette.accent }}
    />
  );
}

function getTextBlockClasses(post: ShowcaseCard) {
  return post.layoutType === "editorial" ? "justify-between" : "justify-end";
}

function getHeadlineClasses(post: ShowcaseCard) {
  if (post.layoutType === "minimal") return "max-w-[12ch] text-[1.75rem] md:text-[1.95rem] uppercase leading-[0.92]";
  if (post.layoutType === "editorial") return "max-w-[12ch] text-[1.85rem] md:text-[2.15rem] leading-[0.96]";
  if (post.layoutType === "conversion") return "max-w-[11ch] text-[1.8rem] md:text-[2.05rem] uppercase leading-[0.92]";
  if (post.layoutType === "grid") return "max-w-[12ch] text-[1.75rem] md:text-[1.9rem] leading-[1]";
  return "max-w-[12ch] text-[1.8rem] md:text-[2rem] leading-tight";
}

interface ShowcaseCardViewProps {
  post: ShowcaseCard;
  index: number;
  carouselPosition: MotionValue<number>;
  isMobile: boolean;
  isAuthOpen: boolean;
  onSelect: (index: number) => void;
}

function ShowcaseCardView({
  post,
  index,
  carouselPosition,
  isMobile,
  isAuthOpen,
  onSelect,
}: ShowcaseCardViewProps) {
  const cardSpacing = isMobile ? 190 : 270;
  const offset = useTransform(carouselPosition, (pos) => index - pos);

  const isVisible = useTransform(offset, (off) => Math.abs(off) <= 2.4);

  const x = useTransform(offset, (off) => {
    const absOff = Math.abs(off);
    const sign = off < 0 ? -1 : 1;
    return sign * (Math.pow(absOff, 0.92) * cardSpacing);
  });

  const rotateY = useTransform(offset, (off) => {
    return clamp(off * -22, -38, 38);
  });

  const scale = useTransform(offset, (off) => {
    const absOff = Math.abs(off);
    return clamp(1 - absOff * (isMobile ? 0.12 : 0.11), 0.74, 1);
  });

  const z = useTransform(offset, (off) => {
    const absOff = Math.abs(off);
    return -absOff * (isMobile ? 50 : 100);
  });

  const opacity = useTransform(offset, (off) => {
    const absOff = Math.abs(off);
    if (absOff > 2.2) return 0;
    return clamp(1 - absOff * (isMobile ? 0.32 : 0.24), 0, 1);
  });

  const zIndex = useTransform(offset, (off) => {
    const absOff = Math.abs(off);
    return Math.round(30 - absOff * 10);
  });

  const filter = useTransform(offset, (off) => {
    const absOff = Math.abs(off);
    if (isMobile) return "none";
    const brightness = clamp(1 - absOff * 0.18, 0.45, 1);
    return `brightness(${brightness})`;
  });

  const hoverRotateX = useMotionValue(0);
  const hoverRotateY = useMotionValue(0);
  const springHoverX = useSpring(hoverRotateX, { stiffness: 180, damping: 20 });
  const springHoverY = useSpring(hoverRotateY, { stiffness: 180, damping: 20 });

  const [isCenter, setIsCenter] = useState(() => Math.abs(offset.get()) < 0.35);
  const [visibleInDom, setVisibleInDom] = useState(() => Math.abs(offset.get()) <= 2.4);

  useEffect(() => {
    return offset.on("change", (val) => {
      const abs = Math.abs(val);
      setIsCenter(abs < 0.35);
      setVisibleInDom(abs <= 2.4);
    });
  }, [offset]);

  if (!visibleInDom) {
    return null;
  }

  return (
    <motion.div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none cursor-pointer outline-none pointer-events-auto"
      style={{
        x,
        y: 0,
        z,
        scale,
        rotateY,
        opacity,
        zIndex,
        filter,
        transformStyle: "preserve-3d",
        touchAction: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
      onClick={() => {
        if (!isAuthOpen) onSelect(index);
      }}
      onMouseMove={(event) => {
        if (isMobile || isAuthOpen || Math.abs(offset.get()) > 0.4) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const relativeX = event.clientX - rect.left;
        const relativeY = event.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        hoverRotateX.set(((relativeY - centerY) / centerY) * -8);
        hoverRotateY.set(((relativeX - centerX) / centerX) * 8);
      }}
      onMouseLeave={() => {
        hoverRotateX.set(0);
        hoverRotateY.set(0);
      }}
    >
      <motion.div
        draggable={false}
        className={`relative overflow-hidden rounded-[22px] md:rounded-[28px] text-left shadow-2xl transition-shadow duration-300 pointer-events-none select-none ${
          isMobile ? "h-[350px] w-[250px]" : "h-[480px] w-[320px]"
        }`}
        style={{
          background: post.palette.background,
          border: isCenter
            ? `1.5px solid ${post.palette.accent}77`
            : "1px solid rgba(255,255,255,0.08)",
          boxShadow: isCenter
            ? `0 0 36px ${post.palette.accent}20, 0 20px 50px rgba(0,0,0,0.55)`
            : "0 14px 40px rgba(0,0,0,0.4)",
          rotateX: springHoverX,
          rotateY: springHoverY,
          transformStyle: "preserve-3d",
        }}
      >
        {renderBackground(post, isMobile)}
        {renderDecorations(post)}

        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              post.layoutType === "minimal"
                ? "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))"
                : `linear-gradient(180deg, transparent 0%, transparent 35%, ${post.palette.background}33 55%, ${post.palette.background}E6 100%)`,
          }}
        />

        <div
          className={`absolute inset-0 flex flex-col p-5 md:p-7 pointer-events-none ${getTextBlockClasses(post)}`}
        >
          {post.layoutType === "editorial" && (
            <div
              className="text-[10px] uppercase tracking-[0.34em]"
              style={{ color: `${post.palette.text}88`, fontFamily: post.fontFamily }}
            >
              {post.title}
            </div>
          )}

          <div>
            <span
              className="mb-2 block text-[10px] md:text-[11px] font-bold uppercase tracking-[0.32em]"
              style={{ color: post.palette.accent, fontFamily: post.fontFamily }}
            >
              {post.category}
            </span>
            {post.layoutType !== "editorial" && (
              <div
                className="mb-1 text-[9px] md:text-[10px] uppercase tracking-[0.24em]"
                style={{ color: `${post.palette.text}85`, fontFamily: post.fontFamily }}
              >
                {post.title}
              </div>
            )}
            <h2
              className={`font-semibold ${getHeadlineClasses(post)}`}
              style={{
                color: post.palette.text,
                fontFamily: post.fontFamily,
                textTransform:
                  post.layoutType === "minimal" || post.titleCase === "upper"
                    ? "uppercase"
                    : "none",
              }}
            >
              {post.headline}
            </h2>
            <p
              className={`mt-2 max-w-[24ch] text-xs md:text-sm font-light leading-relaxed ${
                post.layoutType === "minimal" ? "text-[11px] md:text-[13px]" : ""
              }`}
              style={{
                color: `${post.palette.text}BF`,
                fontFamily: post.fontFamily,
              }}
            >
              {post.subtext}
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
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
// Componente do Painel de Autenticação (Modal no Desktop / Bottom Sheet no Mobile)
// -------------------------------------------------------------
interface AuthModalProps {
  isOpen: boolean;
  isMobile: boolean;
  onClose: () => void;
}

function AuthModal({ isOpen, isMobile, onClose }: AuthModalProps) {
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
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-6 overflow-hidden select-none">
          {/* Backdrop escurecido suave com blur que fecha ao clicar fora */}
          <motion.div
            key="auth-backdrop"
            className="fixed inset-0 bg-black/65 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />

          {/* Painel: Bottom Sheet no Mobile, Modal Centralizado no Desktop */}
          <motion.div
            key="auth-panel"
            className={
              isMobile
                ? "relative z-[110] w-full max-h-[90vh] overflow-y-auto rounded-t-[2.25rem] border-t border-white/15 p-6 pb-8 shadow-2xl backdrop-blur-2xl"
                : "relative z-[110] w-full max-w-md my-auto rounded-[2rem] border border-white/14 p-8 shadow-2xl backdrop-blur-2xl"
            }
            style={{
              background: isMobile
                ? "linear-gradient(180deg, rgba(16, 20, 32, 0.96) 0%, rgba(8, 10, 16, 0.99) 100%)"
                : "linear-gradient(180deg, rgba(16, 20, 32, 0.92) 0%, rgba(9, 11, 18, 0.98) 100%)",
              boxShadow:
                "0 28px 80px rgba(0,0,0,0.8), 0 0 50px rgba(0, 245, 255, 0.06), inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
            initial={isMobile ? { y: "100%" } : { opacity: 0, y: 28, scale: 0.94 }}
            animate={isMobile ? { y: "0%" } : { opacity: 1, y: 0, scale: 1 }}
            exit={isMobile ? { y: "100%" } : { opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            drag={isMobile ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (isMobile && (info.offset.y > 90 || info.velocity.y > 250)) {
                onClose();
              }
            }}
          >
            {/* Barra indicadora de arraste / Handle no topo (Mobile) */}
            {isMobile && (
              <div
                onClick={onClose}
                className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/30 cursor-pointer active:bg-white/50"
              />
            )}

            {/* Botão de Fechar / Voltar aos cards */}
            <button
              onClick={onClose}
              type="button"
              className="absolute left-5 top-5 flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white active:scale-95 cursor-pointer touch-manipulation"
              aria-label="Voltar aos cards"
            >
              <ChevronDown size={18} />
            </button>

            {/* Cabeçalho do modal */}
            <div className="mb-5 text-center pt-1">
              <div className="text-[11px] uppercase tracking-[0.32em] text-white/40 font-medium">
                {mode === "login" ? "Acesso à Plataforma" : "Nova Conta"}
              </div>
              <h2 className="mt-2 text-2xl font-bold text-white tracking-tight">
                {mode === "login" ? "Entre no PostSpark" : "Crie sua conta"}
              </h2>
              <p className="mt-1.5 text-xs md:text-sm text-white/60">
                Capture a alma do seu conteúdo e crie posts de alto impacto.
              </p>
            </div>

            {/* Botão do Google OAuth com Logo Oficial */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading || googleLoading || !isSupabaseConfigured}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/6 py-3 px-4 text-sm font-medium text-white transition-all hover:bg-white/10 active:scale-[0.99] disabled:opacity-50 cursor-pointer touch-manipulation"
            >
              {googleLoading ? (
                <Loader2 size={18} className="animate-spin text-white" />
              ) : (
                <GoogleLogo className="h-4 w-4 shrink-0" />
              )}
              <span>{googleLoading ? "Conectando ao Google..." : "Continuar com Google"}</span>
            </button>

            {/* Separador */}
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">ou com e-mail</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Formulário de E-mail / Senha */}
            <form onSubmit={handleEmailAuth} className="space-y-3.5">
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
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200"
                >
                  {error}
                </motion.div>
              )}

              {!isSupabaseConfigured && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
                  Login indisponível até configurar as variáveis do Supabase.
                </div>
              )}

              <button
                type="submit"
                disabled={loading || googleLoading || !isSupabaseConfigured}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-3 text-sm font-semibold text-black transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 cursor-pointer touch-manipulation"
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

            {/* Alternância Login / Cadastro */}
            <div className="mt-4 text-center text-xs text-white/55">
              {mode === "login" ? "Ainda não tem conta? " : "Já possui conta? "}
              <button
                type="button"
                onClick={() => {
                  setMode((v) => (v === "login" ? "register" : "login"));
                  setError(null);
                }}
                className="font-semibold text-[oklch(0.75_0.22_45)] hover:underline cursor-pointer touch-manipulation"
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

export default function TheVoid2() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  const [currentIndex, setCurrentIndex] = useState(4);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const carouselPosition = useMotionValue(4);

  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartTimeRef = useRef(0);
  const dragStartPosRef = useRef(4);

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

  const openAuthModal = useCallback(() => {
    setIsAuthOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthOpen(false);
  }, []);

  const goToIndex = useCallback(
    (targetIndex: number) => {
      const clamped = clamp(targetIndex, 0, showcaseCards.length - 1);
      setCurrentIndex(clamped);
      animate(carouselPosition, clamped, {
        type: "spring",
        stiffness: 320,
        damping: 32,
        mass: 0.6,
      });
    },
    [carouselPosition]
  );

  const goNext = useCallback(() => {
    if (isAuthOpen) return;
    goToIndex(currentIndex + 1);
  }, [currentIndex, goToIndex, isAuthOpen]);

  const goPrevious = useCallback(() => {
    if (isAuthOpen) return;
    goToIndex(currentIndex - 1);
  }, [currentIndex, goToIndex, isAuthOpen]);

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

  // Arraste com física suave 1:1 sem trancos (bidirecional em tempo real)
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isAuthOpen) return;
    isDraggingRef.current = true;
    dragStartXRef.current = event.clientX;
    dragStartTimeRef.current = performance.now();
    dragStartPosRef.current = carouselPosition.get();

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignora erro se ponteiro já foi liberado
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || isAuthOpen) return;

    const deltaX = event.clientX - dragStartXRef.current;
    const dragStep = isMobile ? 220 : 280;
    const indexDelta = -deltaX / dragStep;

    // Desloca em tempo real de onde o carrossel estava posicionado
    const nextPos = clamp(
      dragStartPosRef.current + indexDelta,
      0,
      showcaseCards.length - 1
    );

    carouselPosition.set(nextPos);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignora erro
    }

    const deltaX = event.clientX - dragStartXRef.current;
    const dt = Math.max(performance.now() - dragStartTimeRef.current, 1);
    const velocityX = deltaX / dt;
    const currentPos = carouselPosition.get();

    let targetIndex = Math.round(currentPos);

    // Se houve swipe significativo para esquerda ou direita, avança ou recua
    if (deltaX < -30 || velocityX < -0.25) {
      targetIndex = Math.min(showcaseCards.length - 1, Math.floor(dragStartPosRef.current) + 1);
    } else if (deltaX > 30 || velocityX > 0.25) {
      targetIndex = Math.max(0, Math.ceil(dragStartPosRef.current) - 1);
    }

    goToIndex(targetIndex);
  };

  return (
    <div
      className="relative h-[100dvh] min-h-screen w-full overflow-hidden text-white selection:bg-[#00f5ff] selection:text-black"
      style={{
        background: "radial-gradient(ellipse at 50% 15%, #0e121d 0%, #050608 70%, #030405 100%)",
        touchAction: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {/* Partículas e Glows de Fundo */}
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_50%)]" />
      </div>

      <div className="relative z-10 flex h-full min-h-[100dvh] flex-col justify-between px-4 pb-6 pt-4 md:px-8 md:pb-8 md:pt-10">
        {/* Cabeçalho */}
        <motion.div
          className="mx-auto flex w-full max-w-5xl flex-col items-center gap-1.5 md:gap-2 text-center shrink-0"
          animate={{
            y: isAuthOpen ? -14 : 0,
            opacity: isAuthOpen ? 0.35 : 1,
          }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <SparkLogo size={isMobile ? 44 : 84} />
          <div className="space-y-0.5">
            <h1
              className="text-2xl font-bold tracking-tight md:text-5xl"
              style={{
                fontFamily: "var(--font-display)",
                textShadow: "0 4px 24px rgba(0,0,0,0.7)",
              }}
            >
              <span className="text-foreground">Post</span>
              <span style={{ color: "oklch(0.7 0.22 40)" }}>Spark</span>
            </h1>
            <p className="text-[11px] font-light text-white/60 md:text-sm">
              Capture a alma do seu negócio. Crie posts magnéticos com IA.
            </p>
          </div>
        </motion.div>

        {/* Palco 3D dos Cards com foco total em deslize suave horizontal */}
        <motion.div
          className="relative mx-auto flex w-full max-w-6xl flex-1 items-center justify-center my-auto min-h-0 overflow-visible"
          animate={{
            y: isAuthOpen ? (isMobile ? -40 : -100) : 0,
            scale: isAuthOpen ? 0.93 : 1,
            opacity: isAuthOpen ? 0.2 : 1,
            filter: isAuthOpen ? "blur(6px)" : "blur(0px)",
          }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
        >
          {/* Botão Anterior (Desktop) */}
          <button
            type="button"
            onClick={goPrevious}
            disabled={currentIndex === 0 || isAuthOpen}
            aria-label="Card anterior"
            className="absolute left-2 md:left-8 z-40 hidden md:flex items-center justify-center rounded-full border border-white/12 bg-black/40 backdrop-blur-md p-3.5 text-white/70 shadow-2xl transition-all duration-200 hover:scale-110 hover:bg-white/10 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-0 cursor-pointer"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          {/* Área de Toque dos Cards com touch-action: none explícito */}
          <div
            className="relative flex h-[360px] md:h-[500px] w-full items-center justify-center cursor-grab active:cursor-grabbing select-none"
            style={{
              perspective: "1100px",
              transformStyle: "preserve-3d",
              touchAction: "none",
              WebkitUserSelect: "none",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {showcaseCards.map((post, index) => (
              <ShowcaseCardView
                key={post.id}
                post={post}
                index={index}
                carouselPosition={carouselPosition}
                isMobile={isMobile}
                isAuthOpen={isAuthOpen}
                onSelect={(clickedIndex) => {
                  if (clickedIndex === currentIndex) {
                    openAuthModal();
                  } else {
                    goToIndex(clickedIndex);
                  }
                }}
              />
            ))}
          </div>

          {/* Botão Próximo (Desktop) */}
          <button
            type="button"
            onClick={goNext}
            disabled={currentIndex === showcaseCards.length - 1 || isAuthOpen}
            aria-label="Próximo card"
            className="absolute right-2 md:right-8 z-40 hidden md:flex items-center justify-center rounded-full border border-white/12 bg-black/40 backdrop-blur-md p-3.5 text-white/70 shadow-2xl transition-all duration-200 hover:scale-110 hover:bg-white/10 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-0 cursor-pointer"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </motion.div>

        {/* Indicadores de Paginação */}
        <div className="flex justify-center items-center gap-1.5 pb-2 shrink-0 select-none">
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

        {/* Barra de Ação Inferior: CTA Direto com Prioridade z-50 e Área de Toque Isolada */}
        <div className="relative z-50 flex flex-col items-center justify-center gap-2 pt-1 pb-1 shrink-0 pointer-events-auto select-none">
          <AnimatePresence mode="wait">
            {!isAuthOpen && (
              <motion.div
                key="cta-container"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 14 }}
                className="flex flex-col items-center gap-2 w-full max-w-xs md:max-w-md pointer-events-auto"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openAuthModal();
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    openAuthModal();
                  }}
                  className="group relative z-50 flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl py-3.5 px-6 text-sm md:text-base font-bold text-black shadow-2xl transition-all duration-200 active:scale-[0.97] cursor-pointer touch-manipulation"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
                    boxShadow: "0 0 32px oklch(0.7 0.22 40 / 40%), 0 8px 24px rgba(0,0,0,0.5)",
                  }}
                >
                  <span>Criar meu primeiro post</span>
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                </button>

                <div className="flex items-center gap-2 text-xs text-white/50">
                  <span>Já tem uma conta?</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openAuthModal();
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      openAuthModal();
                    }}
                    className="font-semibold text-white/90 hover:text-white underline underline-offset-4 py-1 px-2 cursor-pointer touch-manipulation active:opacity-70"
                  >
                    Entrar
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modal / Bottom Sheet de Autenticação */}
      <AuthModal
        isOpen={isAuthOpen}
        isMobile={isMobile}
        onClose={closeAuthModal}
      />
    </div>
  );
}




