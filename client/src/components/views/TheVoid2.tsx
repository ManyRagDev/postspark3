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
  const cardSpacing = isMobile ? 210 : 270;
  const offset = useTransform(carouselPosition, (pos) => index - pos);

  const x = useTransform(offset, (off) => {
    const absOff = Math.abs(off);
    const sign = off < 0 ? -1 : 1;
    return sign * (Math.pow(absOff, 0.92) * cardSpacing);
  });

  const rotateY = useTransform(offset, (off) => {
    return clamp(off * -24, -42, 42);
  });

  const scale = useTransform(offset, (off) => {
    const absOff = Math.abs(off);
    return clamp(1 - absOff * (isMobile ? 0.13 : 0.11), 0.68, 1);
  });

  const z = useTransform(offset, (off) => {
    const absOff = Math.abs(off);
    return -absOff * (isMobile ? 70 : 110);
  });

  const opacity = useTransform(offset, (off) => {
    const absOff = Math.abs(off);
    if (absOff > 3.2) return 0;
    return clamp(1 - absOff * (isMobile ? 0.28 : 0.24), 0.1, 1);
  });

  const zIndex = useTransform(offset, (off) => {
    const absOff = Math.abs(off);
    return Math.round(50 - absOff * 10);
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

  useEffect(() => {
    return offset.on("change", (val) => {
      const nextIsCenter = Math.abs(val) < 0.35;
      setIsCenter(nextIsCenter);
    });
  }, [offset]);

  return (
    <motion.div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none cursor-pointer outline-none"
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
        pointerEvents: isAuthOpen ? "none" : "auto",
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
        className={`relative overflow-hidden rounded-[26px] md:rounded-[28px] text-left shadow-2xl transition-shadow duration-300 ${
          isMobile ? "h-[420px] w-[280px]" : "h-[480px] w-[320px]"
        }`}
        style={{
          background: post.palette.background,
          border: isCenter
            ? `1.5px solid ${post.palette.accent}77`
            : "1px solid rgba(255,255,255,0.08)",
          boxShadow: isCenter
            ? `0 0 38px ${post.palette.accent}20, 0 24px 60px rgba(0,0,0,0.55)`
            : "0 18px 45px rgba(0,0,0,0.4)",
          rotateX: springHoverX,
          rotateY: springHoverY,
          transformStyle: "preserve-3d",
        }}
      >
        {renderBackground(post, isMobile)}
        {renderDecorations(post)}

        <div
          className="absolute inset-0"
          style={{
            background:
              post.layoutType === "minimal"
                ? "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))"
                : `linear-gradient(180deg, transparent 0%, transparent 35%, ${post.palette.background}33 55%, ${post.palette.background}E6 100%)`,
          }}
        />

        <div
          className={`absolute inset-0 flex flex-col p-6 md:p-7 ${getTextBlockClasses(post)}`}
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
              className="mb-2.5 block text-[11px] font-bold uppercase tracking-[0.32em]"
              style={{ color: post.palette.accent, fontFamily: post.fontFamily }}
            >
              {post.category}
            </span>
            {post.layoutType !== "editorial" && (
              <div
                className="mb-1.5 text-[10px] uppercase tracking-[0.24em]"
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
              className={`mt-2.5 max-w-[24ch] text-xs md:text-sm font-light leading-relaxed ${
                post.layoutType === "minimal" ? "text-[12px] md:text-[13px]" : ""
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
// Componente do Painel de Autenticação (Login / Cadastro)
// -------------------------------------------------------------
interface AuthModalProps {
  authProgress: MotionValue<number>;
  isOpen: boolean;
  isMobile: boolean;
  onOpen: () => void;
  onClose: () => void;
}

function AuthModal({ authProgress, isOpen, isMobile, onOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transformações reativas contínuas vinculadas ao gesto de toque/scroll
  const backdropOpacity = useTransform(authProgress, [0, 1], [0, 0.65]);
  const modalY = useTransform(authProgress, (p) => {
    if (isMobile) {
      // No mobile sobe suavemente de baixo da tela (100% até 0%)
      return `${(1 - p) * 100}%`;
    }
    // No desktop desliza de 60px para 0px
    return `${(1 - p) * 60}px`;
  });
  const modalScale = useTransform(authProgress, [0, 1], [0.92, 1]);
  const modalOpacity = useTransform(authProgress, [0, 0.12, 1], [0, 0.35, 1]);
  const pointerEvents = useTransform(authProgress, (p) => (p > 0.2 ? "auto" : "none"));

  // Permite arrastar o modal para baixo a partir do cabeçalho ou handle
  const isModalDraggingRef = useRef(false);
  const modalDragStartYRef = useRef(0);
  const modalDragStartProgRef = useRef(1);
  const modalLastYRef = useRef(0);
  const modalLastTimeRef = useRef(0);
  const modalVelocityYRef = useRef(0);

  const handleModalPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Não inicia drag se o clique for dentro de inputs ou botões clicáveis
    const target = e.target as HTMLElement;
    if (target.closest("input, button, a")) return;

    isModalDraggingRef.current = true;
    modalDragStartYRef.current = e.clientY;
    modalDragStartProgRef.current = authProgress.get();
    modalLastYRef.current = e.clientY;
    modalLastTimeRef.current = performance.now();
    modalVelocityYRef.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleModalPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isModalDraggingRef.current) return;
    const deltaY = e.clientY - modalDragStartYRef.current;
    const now = performance.now();
    const dt = now - modalLastTimeRef.current;
    if (dt > 8) {
      modalVelocityYRef.current = (e.clientY - modalLastYRef.current) / dt;
      modalLastYRef.current = e.clientY;
      modalLastTimeRef.current = now;
    }

    const dragDistance = isMobile ? 240 : 280;
    const nextProg = clamp(modalDragStartProgRef.current - deltaY / dragDistance, 0, 1);
    authProgress.set(nextProg);
  };

  const handleModalPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isModalDraggingRef.current) return;
    isModalDraggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const currentProg = authProgress.get();
    const velocity = modalVelocityYRef.current;

    if (currentProg < 0.65 || velocity > 0.3) {
      onClose();
    } else {
      onOpen();
    }
  };

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
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 overflow-hidden select-none"
      style={{ pointerEvents }}
    >
      {/* Backdrop escurecido suave sincronizado em tempo real */}
      <motion.div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        style={{ opacity: backdropOpacity }}
        onClick={onClose}
      />

      {/* Card do Modal de Autenticação com arraste e interpolação contínua */}
      <motion.div
        className="relative z-10 w-full max-w-md my-auto touch-pan-y"
        style={{
          y: modalY,
          scale: modalScale,
          opacity: modalOpacity,
        }}
        onPointerDown={handleModalPointerDown}
        onPointerMove={handleModalPointerMove}
        onPointerUp={handleModalPointerUp}
        onPointerCancel={handleModalPointerUp}
      >
        <div
          className="relative overflow-hidden rounded-[2rem] border p-6 md:p-8 shadow-2xl backdrop-blur-2xl"
          style={{
            background: "linear-gradient(180deg, rgba(16, 20, 32, 0.94) 0%, rgba(9, 11, 18, 0.98) 100%)",
            borderColor: "rgba(255, 255, 255, 0.14)",
            boxShadow:
              "0 28px 80px rgba(0,0,0,0.75), 0 0 50px rgba(0, 245, 255, 0.06), inset 0 1px 0 rgba(255,255,255,0.12)",
          }}
        >
          {/* Barra indicadora de arraste / Handle no topo (Mobile) */}
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/25 md:hidden" />

          {/* Botão de Fechar / Voltar aos cards */}
          <button
            onClick={onClose}
            type="button"
            className="absolute left-5 top-5 flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white active:scale-95"
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
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/6 py-3 px-4 text-sm font-medium text-white transition-all hover:bg-white/10 active:scale-[0.99] disabled:opacity-50"
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
              className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-3 text-sm font-semibold text-black transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
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
              className="font-semibold text-[oklch(0.75_0.22_45)] hover:underline"
            >
              {mode === "login" ? "Criar conta grátis" : "Fazer login"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
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
  const authProgress = useMotionValue(0);

  // Animações contínuas coordenadas pelo authProgress
  const headerY = useTransform(authProgress, [0, 1], [0, -18]);
  const headerOpacity = useTransform(authProgress, [0, 1], [1, 0.35]);

  const cardsY = useTransform(authProgress, [0, 1], [0, isMobile ? -90 : -130]);
  const cardsScale = useTransform(authProgress, [0, 1], [1, 0.92]);
  const cardsOpacity = useTransform(authProgress, [0, 1], [1, 0.16]);
  const cardsBlur = useTransform(authProgress, (p) => `blur(${(p * 7).toFixed(1)}px)`);

  const bottomActionY = useTransform(authProgress, [0, 0.5], [0, 30]);
  const bottomActionOpacity = useTransform(authProgress, [0, 0.4], [1, 0]);
  const bottomActionPointerEvents = useTransform(authProgress, (p) => (p < 0.2 ? "auto" : "none"));

  const isDraggingRef = useRef(false);
  const dragLockedAxisRef = useRef<"x" | "y" | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const dragStartIndexRef = useRef(4);
  const dragStartProgressRef = useRef(0);
  const dragLastTimeRef = useRef(0);
  const dragLastXRef = useRef(0);
  const dragLastYRef = useRef(0);
  const dragVelocityXRef = useRef(0);
  const dragVelocityYRef = useRef(0);

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
    animate(authProgress, 1, {
      type: "spring",
      stiffness: 280,
      damping: 28,
      mass: 0.8,
    });
  }, [authProgress]);

  const closeAuthModal = useCallback(() => {
    setIsAuthOpen(false);
    animate(authProgress, 0, {
      type: "spring",
      stiffness: 280,
      damping: 28,
      mass: 0.8,
    });
  }, [authProgress]);

  const goToIndex = useCallback(
    (targetIndex: number) => {
      const clamped = clamp(targetIndex, 0, showcaseCards.length - 1);
      setCurrentIndex(clamped);
      animate(carouselPosition, clamped, {
        type: "spring",
        stiffness: 260,
        damping: 28,
        mass: 0.8,
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

  // Scroll com a rodinha do mouse ou trackpad
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    const handleWheel = (event: WheelEvent) => {
      // Ignora pequenos scrolls acidentais
      if (Math.abs(event.deltaY) < 25) return;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (event.deltaY > 30 && !isAuthOpen) {
          openAuthModal();
        } else if (event.deltaY < -30 && isAuthOpen) {
          closeAuthModal();
        }
      }, 40);
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      clearTimeout(scrollTimeout);
    };
  }, [closeAuthModal, isAuthOpen, openAuthModal]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    dragLockedAxisRef.current = null;
    dragStartXRef.current = event.clientX;
    dragStartYRef.current = event.clientY;
    dragLastXRef.current = event.clientX;
    dragLastYRef.current = event.clientY;
    dragLastTimeRef.current = performance.now();
    dragStartIndexRef.current = carouselPosition.get();
    dragStartProgressRef.current = authProgress.get();
    dragVelocityXRef.current = 0;
    dragVelocityYRef.current = 0;

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;

    const deltaX = event.clientX - dragStartXRef.current;
    const deltaY = event.clientY - dragStartYRef.current;

    const now = performance.now();
    const dt = now - dragLastTimeRef.current;
    if (dt > 8) {
      dragVelocityXRef.current = (event.clientX - dragLastXRef.current) / dt;
      dragVelocityYRef.current = (event.clientY - dragLastYRef.current) / dt;
      dragLastXRef.current = event.clientX;
      dragLastYRef.current = event.clientY;
      dragLastTimeRef.current = now;
    }

    // Identificação do eixo predominante do gesto
    if (!dragLockedAxisRef.current) {
      if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
        dragLockedAxisRef.current = Math.abs(deltaY) > Math.abs(deltaX) ? "y" : "x";
      }
    }

    if (dragLockedAxisRef.current === "x") {
      // Arraste horizontal nos cards
      const cardStep = isMobile ? 190 : 250;
      const indexDelta = -deltaX / cardStep;
      const nextPos = clamp(
        dragStartIndexRef.current + indexDelta,
        -0.3,
        showcaseCards.length - 0.7
      );
      carouselPosition.set(nextPos);
    } else if (dragLockedAxisRef.current === "y") {
      // Arraste vertical contínuo no modal de login (indo e voltando com o toque)
      const verticalDragDistance = isMobile ? 220 : 260;
      if (dragStartProgressRef.current < 0.5) {
        // Puxando para cima para abrir
        const nextProgress = clamp(dragStartProgressRef.current - deltaY / verticalDragDistance, 0, 1);
        authProgress.set(nextProgress);
      } else {
        // Puxando para baixo para fechar
        const nextProgress = clamp(dragStartProgressRef.current - deltaY / verticalDragDistance, 0, 1);
        authProgress.set(nextProgress);
      }
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (dragLockedAxisRef.current === "y") {
      const currentProg = authProgress.get();
      const velocityY = dragVelocityYRef.current;

      if (dragStartProgressRef.current < 0.5) {
        // Tentativa de abertura
        if (currentProg > 0.3 || velocityY < -0.25) {
          openAuthModal();
        } else {
          closeAuthModal();
        }
      } else {
        // Tentativa de fechamento
        if (currentProg < 0.7 || velocityY > 0.25) {
          closeAuthModal();
        } else {
          openAuthModal();
        }
      }
    } else {
      // Snap do carrossel
      const currentPos = carouselPosition.get();
      const velocityX = dragVelocityXRef.current;

      let targetIndex = Math.round(currentPos);
      if (Math.abs(velocityX) > 0.35) {
        if (velocityX < 0) {
          targetIndex = Math.ceil(currentPos);
        } else {
          targetIndex = Math.floor(currentPos);
        }
      }
      goToIndex(targetIndex);
    }
  };

  return (
    <div
      className="relative h-[100dvh] min-h-screen w-full overflow-hidden text-white selection:bg-[#00f5ff] selection:text-black"
      style={{
        background: "radial-gradient(ellipse at 50% 15%, #0e121d 0%, #050608 70%, #030405 100%)",
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

      <div className="relative z-10 flex h-full min-h-[100dvh] flex-col justify-between px-4 pb-6 pt-6 md:px-8 md:pb-8 md:pt-10">
        {/* Cabeçalho */}
        <motion.div
          className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2.5 text-center"
          style={{
            y: headerY,
            opacity: headerOpacity,
          }}
        >
          <SparkLogo size={isMobile ? 64 : 88} />
          <div className="space-y-1">
            <h1
              className="text-3xl font-bold tracking-tight md:text-5xl"
              style={{
                fontFamily: "var(--font-display)",
                textShadow: "0 4px 24px rgba(0,0,0,0.7)",
              }}
            >
              <span className="text-foreground">Post</span>
              <span style={{ color: "oklch(0.7 0.22 40)" }}>Spark</span>
            </h1>
            <p className="text-xs font-light text-white/60 md:text-sm">
              Capture a alma do seu negócio. Crie posts magnéticos com IA.
            </p>
          </div>
        </motion.div>

        {/* Palco 3D dos Cards */}
        <motion.div
          className="relative mx-auto flex w-full max-w-6xl flex-1 items-center justify-center"
          style={{
            y: cardsY,
            scale: cardsScale,
            opacity: cardsOpacity,
            filter: cardsBlur,
          }}
        >
          {/* Botão Anterior (Desktop) */}
          <button
            type="button"
            onClick={goPrevious}
            disabled={currentIndex === 0 || isAuthOpen}
            aria-label="Card anterior"
            className="absolute left-2 md:left-8 z-40 hidden md:flex items-center justify-center rounded-full border border-white/12 bg-black/40 backdrop-blur-md p-3.5 text-white/70 shadow-2xl transition-all duration-200 hover:scale-110 hover:bg-white/10 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          {/* Área de Toque e Gesto do Palco */}
          <div
            className="relative flex h-[460px] md:h-[530px] w-full items-center justify-center touch-pan-y cursor-grab active:cursor-grabbing"
            style={{ perspective: "1100px", transformStyle: "preserve-3d" }}
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
            className="absolute right-2 md:right-8 z-40 hidden md:flex items-center justify-center rounded-full border border-white/12 bg-black/40 backdrop-blur-md p-3.5 text-white/70 shadow-2xl transition-all duration-200 hover:scale-110 hover:bg-white/10 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </motion.div>

        {/* Indicadores de Paginação */}
        <div className="flex justify-center items-center gap-1.5 pb-2">
          {showcaseCards.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goToIndex(i)}
              aria-label={`Ir para slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentIndex
                  ? "w-6 bg-[oklch(0.7_0.22_40)] shadow-[0_0_8px_oklch(0.7_0.22_40)]"
                  : "w-1.5 bg-white/20 hover:bg-white/40"
              }`}
            />
          ))}
        </div>

        {/* Barra de Ação Inferior: "Clique / Deslize para iniciar" */}
        <motion.div
          className="relative z-30 flex flex-col items-center justify-center pt-1"
          style={{
            y: bottomActionY,
            opacity: bottomActionOpacity,
            pointerEvents: bottomActionPointerEvents,
          }}
        >
          <motion.button
            key="trigger-button"
            type="button"
            onClick={openAuthModal}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="group flex flex-col items-center gap-1.5 rounded-full border border-white/15 bg-white/6 px-6 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-colors hover:border-[oklch(0.7_0.22_40)]/60 hover:bg-white/10"
          >
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <ChevronUp size={20} className="text-[oklch(0.75_0.22_45)]" />
            </motion.div>
            <span className="text-xs md:text-sm font-semibold tracking-wide text-white/90 group-hover:text-white">
              {isMobile ? "Deslize para iniciar" : "Clique para iniciar"}
            </span>
          </motion.button>
        </motion.div>
      </div>

      {/* Modal de Autenticação Contínuo */}
      <AuthModal
        authProgress={authProgress}
        isOpen={isAuthOpen}
        isMobile={isMobile}
        onOpen={openAuthModal}
        onClose={closeAuthModal}
      />
    </div>
  );
}




