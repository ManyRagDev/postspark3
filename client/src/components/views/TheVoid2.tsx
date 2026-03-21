import { useAuth } from "@/_core/hooks/useAuth";
import SparkLogo from "@/components/SparkLogo";
import SparkParticles from "@/components/SparkParticles";
import { exchangeSupabaseSession } from "@/lib/authBridge";
import { showcaseCards, type ShowcaseCard } from "@/lib/showcaseCards";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { gsap } from "gsap";
import { motion } from "framer-motion";
import type { PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Chrome, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";

type AuthMode = "login" | "register";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  if (inMax === inMin) return outMin;
  const progress = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return outMin + (outMax - outMin) * progress;
}

function renderBackground(post: ShowcaseCard) {
  if (post.backgroundKind === "photo" && post.backgroundImageUrl) {
    return (
      <>
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${post.backgroundImageUrl})` }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${post.palette.background}12 0%, ${post.palette.background}7A 54%, ${post.palette.background}EC 100%)` }} />
      </>
    );
  }
  if (post.backgroundKind === "glass") {
    return (
      <>
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 18% 18%, ${post.palette.accent}42 0%, transparent 34%), radial-gradient(circle at 82% 22%, #ffffff12 0%, transparent 28%), linear-gradient(135deg, ${post.palette.surface ?? post.palette.background} 0%, ${post.palette.background} 100%)` }} />
        <div className="absolute left-6 top-8 h-28 w-28 rounded-[2rem] border border-white/10 bg-white/6 backdrop-blur-2xl" />
        <div className="absolute right-5 top-[4.5rem] h-20 w-20 rounded-full border border-white/10 bg-white/6 backdrop-blur-2xl" />
        <div className="absolute bottom-24 right-7 h-24 w-36 rounded-[1.75rem] border border-white/10 bg-white/8 backdrop-blur-xl" />
      </>
    );
  }
  if (post.backgroundKind === "pattern") {
    return (
      <>
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${post.palette.surface ?? post.palette.background} 0%, ${post.palette.background} 100%)` }} />
        <div className="absolute inset-0 opacity-55" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "34px 34px" }} />
      </>
    );
  }
  if (post.backgroundKind === "mesh") {
    return <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 16% 24%, ${post.palette.accent}3F 0%, transparent 26%), radial-gradient(circle at 78% 24%, #ffffff10 0%, transparent 18%), radial-gradient(circle at 62% 78%, ${post.palette.accent}22 0%, transparent 22%), linear-gradient(135deg, ${post.palette.surface ?? post.palette.background} 0%, ${post.palette.background} 100%)` }} />;
  }
  if (post.backgroundKind === "editorial" && post.backgroundImageUrl) {
    return (
      <>
        <div className="absolute inset-y-0 right-0 w-[58%] bg-cover bg-center" style={{ backgroundImage: `url(${post.backgroundImageUrl})` }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${post.palette.background} 0%, ${post.palette.background}F0 48%, ${post.palette.background}60 72%, transparent 100%)` }} />
      </>
    );
  }
  return <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${post.palette.surface ?? post.palette.background} 0%, ${post.palette.background} 100%)` }} />;
}

function renderDecorations(post: ShowcaseCard) {
  if (post.layoutType === "grid") {
    return (
      <>
        <div className="absolute left-6 top-14 grid w-[70%] grid-cols-2 gap-3">
          {[0, 1, 2].map((item) => <div key={item} className={`rounded-2xl border border-white/8 bg-black/22 backdrop-blur-md ${item === 2 ? "col-span-2 h-16" : "h-20"}`} />)}
        </div>
        <div className="absolute right-6 top-6 h-10 w-10 rounded-full" style={{ backgroundColor: `${post.palette.accent}20`, border: `1px solid ${post.palette.accent}35` }} />
      </>
    );
  }
  if (post.layoutType === "split") return <div className="absolute inset-y-0 left-[48%] w-px" style={{ background: `linear-gradient(180deg, transparent 0%, ${post.palette.accent}90 50%, transparent 100%)` }} />;
  if (post.layoutType === "minimal") return <><div className="absolute left-6 top-6 h-20 w-20 rounded-full" style={{ border: `2px solid ${post.palette.accent}` }} /><div className="absolute right-6 top-10 h-3 w-14" style={{ backgroundColor: post.palette.accent }} /></>;
  if (post.layoutType === "conversion") return <><div className="absolute left-0 top-0 h-28 w-full" style={{ background: `linear-gradient(135deg, ${post.palette.accent}28 0%, transparent 58%)` }} /><div className="absolute right-5 top-5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em]" style={{ backgroundColor: post.palette.accent, color: "#0A0A0A" }}>Spark</div></>;
  if (post.layoutType === "editorial") return <><div className="absolute left-6 top-16 h-px w-24" style={{ backgroundColor: `${post.palette.accent}AA` }} /><div className="absolute left-6 top-6 h-2 w-2 rounded-full" style={{ backgroundColor: post.palette.accent }} /></>;
  return <div className="absolute left-6 top-6 h-1.5 rounded-full" style={{ width: "2.75rem", backgroundColor: post.palette.accent }} />;
}

function getTextBlockClasses(post: ShowcaseCard) {
  return post.layoutType === "editorial" ? "justify-between" : "justify-end";
}

function getHeadlineClasses(post: ShowcaseCard) {
  if (post.layoutType === "minimal") return "max-w-[12ch] text-[1.9rem] uppercase leading-[0.9]";
  if (post.layoutType === "editorial") return "max-w-[12ch] text-[2.15rem] leading-[0.96]";
  if (post.layoutType === "conversion") return "max-w-[11ch] text-[2.05rem] uppercase leading-[0.92]";
  if (post.layoutType === "grid") return "max-w-[12ch] text-[1.9rem] leading-[1]";
  return "max-w-[12ch] text-[2rem] leading-tight";
}

function LoginPanel({ visible, interactive, onSuccess, onBack }: { visible: boolean; interactive: boolean; onSuccess: () => void; onBack: () => void }) {
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
      if (!isSupabaseConfigured || !supabase) throw new Error("Login indisponivel: configure o Supabase.");
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
      if (result.error) throw result.error;
      const accessToken = result.data.session?.access_token;
      if (!accessToken) {
        if (mode === "register") {
          setError("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
          return;
        }
        throw new Error("Sessao nao encontrada.");
      }
      await exchangeSupabaseSession(accessToken);
      onSuccess();
    } catch (err: any) {
      const message = err?.message || "Nao foi possivel autenticar agora.";
      if (message.includes("Invalid login credentials")) setError("E-mail ou senha incorretos.");
      else if (message.includes("User already registered")) setError("Este e-mail ja esta cadastrado. Faca login.");
      else setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      if (!isSupabaseConfigured || !supabase) throw new Error("Login com Google indisponivel: configure o Supabase.");
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
      className="fixed inset-x-4 bottom-4 z-40 mx-auto w-auto max-w-md rounded-[2rem] border p-6"
      style={{
        background: "linear-gradient(180deg, rgba(12,15,25,0.72) 0%, rgba(8,10,16,0.92) 100%)",
        borderColor: "rgba(255,255,255,0.12)",
        backdropFilter: "blur(26px)",
        WebkitBackdropFilter: "blur(26px)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.08)",
        pointerEvents: interactive ? "auto" : "none",
      }}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 42, scale: visible ? 1 : 0.96 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <button onClick={onBack} className="absolute left-4 top-4 rounded-full border border-white/10 bg-white/6 p-2 text-white/50 transition-all hover:bg-white/10 hover:text-white" aria-label="Voltar aos cards">
        <ChevronDown size={18} />
      </button>
      <div className="mb-5 text-center">
        <div className="text-[11px] uppercase tracking-[0.34em] text-white/40">Identificacao</div>
        <h2 className="mt-3 text-2xl font-semibold text-white/92">Entre para criar posts</h2>
        <p className="mt-2 text-sm text-white/56">O showcase termina aqui. A criacao real comeca no TheVoid.</p>
      </div>

      <button onClick={handleGoogle} disabled={!interactive || loading || googleLoading || !isSupabaseConfigured} className="flex w-full items-center justify-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition-all" style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.9)" }}>
        {googleLoading ? <Loader2 size={18} className="animate-spin" /> : <Chrome size={18} />}
        {googleLoading ? "Conectando..." : "Continuar com Google"}
      </button>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[11px] uppercase tracking-[0.28em] text-white/36">ou</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={handleEmailAuth} className="space-y-3">
        <div className="relative">
          <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(null); }} required placeholder="seu@email.com" className="w-full rounded-2xl border bg-white/6 py-3 pl-10 pr-4 text-sm outline-none" style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.92)" }} />
        </div>

        <div className="relative">
          <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setError(null); }} required minLength={6} placeholder={mode === "register" ? "Minimo 6 caracteres" : "Sua senha"} className="w-full rounded-2xl border bg-white/6 py-3 pl-10 pr-11 text-sm outline-none" style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.92)" }} />
          <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40">
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {error ? <div className="rounded-2xl border border-[rgba(212,90,60,0.35)] bg-[rgba(212,90,60,0.12)] px-3 py-2 text-xs text-[rgba(255,190,170,0.92)]">{error}</div> : null}
        {!isSupabaseConfigured ? <div className="rounded-2xl border border-[rgba(212,175,55,0.28)] bg-[rgba(212,175,55,0.1)] px-3 py-2 text-xs text-[rgba(255,235,190,0.92)]">Login indisponivel ate configurar VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.</div> : null}

        <motion.button type="submit" disabled={!interactive || loading || googleLoading || !isSupabaseConfigured} className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg, oklch(0.7 0.22 40), oklch(0.6 0.2 20))", boxShadow: "0 0 22px oklch(0.7 0.22 40 / 28%)" }} whileTap={{ scale: 0.985 }}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
        </motion.button>
      </form>

      <div className="mt-4 text-center text-sm text-white/52">
        {mode === "login" ? "Nao tem conta? " : "Ja tem conta? "}
        <button type="button" onClick={() => { setMode((value) => (value === "login" ? "register" : "login")); setError(null); }} className="font-semibold text-[oklch(0.7_0.22_40)]">
          {mode === "login" ? "Criar conta gratis" : "Entrar"}
        </button>
      </div>
    </motion.div>
  );
}

export default function TheVoid2() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [currentIndex, setCurrentIndex] = useState(4);
  const [hoverRotation, setHoverRotation] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);
  const [progress, setProgress] = useState(0); // Progress como STATE para causar re-renders
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authGoogleLoading, setAuthGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const MOBILE_PREVIEW_SNAP = 0.42;
  const MOBILE_DRAG_DISTANCE = 320;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const drawerContentRef = useRef<HTMLDivElement | null>(null);
  const drawerInitialRef = useRef<HTMLDivElement | null>(null);
  const drawerLoginRef = useRef<HTMLFormElement | null>(null);
  const cardsStageRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const touchStartYRef = useRef(0);
  const touchStartProgressRef = useRef(0);
  const progressRef = useRef(0);
  const progressRafRef = useRef<number | null>(null);
  const drawerPointerActiveRef = useRef(false);
  const drawerDidDragRef = useRef(false);
  const suppressChevronClickRef = useRef(false);
  const isAnimatingRef = useRef(false);
  const scrollStartYRef = useRef(0);

  useEffect(() => {
    if (!loading && isAuthenticated) setLocation("/thevoid");
  }, [isAuthenticated, loading, setLocation]);

  useEffect(() => {
    const syncViewport = () => setIsMobile(window.innerWidth < 768);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    return () => {
      if (progressRafRef.current !== null) {
        window.cancelAnimationFrame(progressRafRef.current);
      }
    };
  }, []);

  const handleDrawerEmailAuth = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error("Login indisponivel: configure o Supabase.");
      }

      const result = authMode === "login"
        ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
        : await supabase.auth.signUp({ email: authEmail, password: authPassword });

      if (result.error) throw result.error;

      const accessToken = result.data.session?.access_token;
      if (!accessToken) {
        if (authMode === "register") {
          setAuthError("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
          return;
        }
        throw new Error("Sessao nao encontrada.");
      }

      await exchangeSupabaseSession(accessToken);
      window.location.href = "/thevoid";
    } catch (err: any) {
      const message = err?.message || "Nao foi possivel autenticar agora.";
      if (message.includes("Invalid login credentials")) setAuthError("E-mail ou senha incorretos.");
      else if (message.includes("User already registered")) setAuthError("Este e-mail ja esta cadastrado. Faca login.");
      else setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  }, [authEmail, authMode, authPassword]);

  const handleDrawerGoogleAuth = useCallback(async () => {
    setAuthError(null);
    setAuthGoogleLoading(true);

    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error("Login com Google indisponivel: configure o Supabase.");
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
      setAuthError(err?.message || "Falha ao iniciar login com Google.");
      setAuthGoogleLoading(false);
    }
  }, []);

  // ============================================================
  // FÍSICA DE COLISÃO - PARÂMETROS
  // ============================================================
  const LOCK_THRESHOLD = 0.75;  // Ponto irreversível
  const CARDS_COLLISION_START = 0.15; // Quando drawer começa a atingir cards

  // Calcula espalhamento dos cards baseado na posição Y do drawer
  const getCollisionFactor = (cardOffset: number, drawerY: number) => {
    // drawerY vai de 0 (início) até 1 (fim)
    // Cards começam a ser afetados quando drawerY > CARDS_COLLISION_START
    if (drawerY < CARDS_COLLISION_START) return 0;
    
    const collisionProgress = mapRange(drawerY, CARDS_COLLISION_START, 0.7, 0, 1);
    return clamp(collisionProgress, 0, 1);
  };

  const cardStyles = useMemo(() => {
    const drawerY = progress; // 0 = início, 1 = fim
    
    return showcaseCards.map((_, index) => {
      const offset = index - currentIndex;
      const absOffset = Math.abs(offset);
      
      let scale = 1;
      let x = "0%";
      let y = 0;
      let z = 0;
      let rotateY = 0;
      let rotateX = 0;
      let opacity = 1;
      let zIndex = 10;
      let brightness = 1;
      let pointerEvents: "auto" | "none" = "auto";

      // ============================================================
      // FASE 1: Carrossel normal (antes da colisão)
      // ============================================================
      const collisionFactor = getCollisionFactor(offset, drawerY);
      
      if (collisionFactor === 0) {
        // Estado normal do carrossel
        if (offset !== 0) {
          if (absOffset > 2) {
            opacity = 0;
            pointerEvents = "none";
          } else {
            scale = 1 - absOffset * 0.15;
            z = -absOffset * 100;
            zIndex = 10 - absOffset;
            opacity = 1 - absOffset * 0.25;
            brightness = 1 - absOffset * 0.3;
            if (offset < 0) {
              rotateY = 20 + absOffset * 10;
              x = `calc(-${45 + absOffset * 35}%)`;
            } else {
              rotateY = -(20 + absOffset * 10);
              x = `calc(${45 + absOffset * 35}%)`;
            }
          }
        }
      } 
      // ============================================================
      // FASE 2: ESPALHAMENTO DOS CARDS (física de colisão)
      // ============================================================
      else {
        const mobileSpread = isMobile ? 0.55 : 1;
        const mobileRise = isMobile ? 0.75 : 1;
        const mobileRotation = isMobile ? 0.45 : 1;
        const mobileOpacityLoss = isMobile ? 0.72 : 1;
        // Direção baseada na posição no carrossel
        const direction = offset === 0 ? 0 : offset < 0 ? -1 : 1;
        
        // Cards espalham para os lados + sobem
        // Central vai mais para cima, laterais vão para os lados
        const sideForce = direction * (200 + absOffset * 150) * collisionFactor * mobileSpread;
        const riseForce = -(100 + absOffset * 50) * collisionFactor * mobileRise;
        
        // Rotação dramática baseada na direção
        const rotY = direction * (30 + absOffset * 15) * collisionFactor * mobileRotation;
        const rotX = -20 * collisionFactor * mobileRotation; // Todos caem um pouco para tr�s
        
        // Scale e fade
        const scaleFactor = 1 - collisionFactor * (isMobile ? 0.14 : 0.2);
        const opacityFactor = 1 - collisionFactor * (absOffset === 0 ? 0.5 : 0.95) * mobileOpacityLoss;
        
        x = `${sideForce}px`;
        y = riseForce;
        scale = scaleFactor;
        rotateY = rotY;
        rotateX = rotX;
        opacity = opacityFactor;
        zIndex = 10 - absOffset;
        brightness = 1 - collisionFactor * 0.3;
        pointerEvents = opacityFactor < 0.1 ? "none" : "auto";
      }

      return { 
        x, y, z, scale, rotateY, rotateX, opacity, zIndex, pointerEvents, 
        filter: isMobile ? "none" : `brightness(${brightness})` 
      };
    });
  }, [currentIndex, isMobile, progress]);

  // ============================================================
  // NAVEGAÇÃO DE CARDS (só funciona quando colisão inativa)
  // ============================================================
  const collisionActive = progress > CARDS_COLLISION_START;

  const goPrevious = useCallback(() => {
    if (collisionActive) return;
    setHoverRotation({ x: 0, y: 0 });
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, [collisionActive]);

  const goNext = useCallback(() => {
    if (collisionActive) return;
    setHoverRotation({ x: 0, y: 0 });
    setCurrentIndex((prev) => Math.min(showcaseCards.length - 1, prev + 1));
  }, [collisionActive]);

  const handleCardDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (collisionActive) return;
    const isLeftSwipe = info.offset.x < -50 || info.velocity.x < -400;
    const isRightSwipe = info.offset.x > 50 || info.velocity.x > 400;
    if (isLeftSwipe && currentIndex < showcaseCards.length - 1) return void goNext();
    if (isRightSwipe && currentIndex > 0) goPrevious();
  }, [currentIndex, goNext, goPrevious, collisionActive]);

  const getDrawerY = useCallback((nextProgress: number) => {
    const desktopY = -nextProgress * 800;
    if (!drawerRef.current || typeof window === "undefined") return desktopY;

    const drawerHeight = drawerRef.current.offsetHeight;
    const centeredY = -(((window.innerHeight - drawerHeight) / 2) - 16);

    if (!isMobile) {
      const centerBlend = mapRange(nextProgress, 0.82, 1, 0, 1);
      return desktopY + (centeredY - desktopY) * centerBlend;
    }

    const previewY = -(window.innerHeight * 0.24);
    if (nextProgress <= MOBILE_PREVIEW_SNAP) {
      return mapRange(nextProgress, 0, MOBILE_PREVIEW_SNAP, 0, previewY);
    }

    return mapRange(nextProgress, MOBILE_PREVIEW_SNAP, 1, previewY, centeredY);
  }, [MOBILE_PREVIEW_SNAP, isMobile]);

  const getCurrentProgress = useCallback(() => {
    return isMobile ? progressRef.current : progress;
  }, [isMobile, progress]);

  const getChevronTargetProgress = useCallback((nextProgress: number) => {
    if (!isMobile) {
      return nextProgress > LOCK_THRESHOLD ? 0 : 1;
    }

    return nextProgress >= MOBILE_PREVIEW_SNAP ? 0 : 1;
  }, [LOCK_THRESHOLD, MOBILE_PREVIEW_SNAP, isMobile]);

  const getProgressSnapTarget = useCallback((nextProgress: number) => {
    if (!isMobile) {
      if (nextProgress > LOCK_THRESHOLD) return 1;
      if (nextProgress < 0.05) return 0;
      return nextProgress;
    }

    const snapPoints = [0, MOBILE_PREVIEW_SNAP, 1];
    return snapPoints.reduce((closest, candidate) => (
      Math.abs(candidate - nextProgress) < Math.abs(closest - nextProgress) ? candidate : closest
    ), snapPoints[0]);
  }, [MOBILE_PREVIEW_SNAP, isMobile]);

  const syncProgressState = useCallback((nextProgress: number) => {
    progressRef.current = nextProgress;

    if (!isMobile) {
      setProgress(nextProgress);
      return;
    }

    if (progressRafRef.current !== null) return;

    progressRafRef.current = window.requestAnimationFrame(() => {
      progressRafRef.current = null;
      setProgress(progressRef.current);
    });
  }, [isMobile]);

  // ============================================================
  // CONTROLE DE PROGRESS (drawer + wheel/scroll)
  // ============================================================
  const applyProgress = useCallback((nextProgress: number) => {
    const clamped = clamp(nextProgress, 0, 1);
    syncProgressState(clamped);

    // O drawer segue o scroll - posição absoluta baseada no progress
    // drawerY vai de 0 (bottom) até 1 (top/invisível)
    if (drawerRef.current) {
      gsap.set(drawerRef.current, {
        y: getDrawerY(clamped),
        opacity: 1,
      });
    }
  }, [getDrawerY, syncProgressState]);

  const animateProgressTo = useCallback((target: number, duration = 0.5, fromProgress?: number) => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    const tweenState = { value: clamp(fromProgress ?? getCurrentProgress(), 0, 1) };
    gsap.to(tweenState, {
      value: clamp(target, 0, 1),
      duration,
      ease: "power3.inOut",
      onUpdate: function() {
        const newProgress = tweenState.value;
        syncProgressState(newProgress);
        if (drawerRef.current) {
          gsap.set(drawerRef.current, {
            y: getDrawerY(newProgress),
            opacity: 1,
          });
        }
      },
      onComplete: () => {
        isAnimatingRef.current = false;
      },
    });
  }, [getCurrentProgress, getDrawerY, syncProgressState]);

  // ============================================================
  // WHEEL HANDLER (Desktop) - scroll DESCER = drawer sobe
  // ============================================================
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      
      // Desktop apenas
      if (isMobile) return;
      
      // Não interferir se já está no fim ou animado
      if (isAnimatingRef.current && progress >= 0.99) return;
      
      // Scroll PARA BAIXO (deltaY > 0) = drawer SOBE (progress++)
      // Scroll PARA CIMA (deltaY < 0) = drawer DESCE (progress--)
      const delta = event.deltaY * 0.0008;
      const newProgress = clamp(progress + delta, 0, 1);
      applyProgress(newProgress);
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [progress, applyProgress, isMobile]);

  useEffect(() => {
    if (!isMobile || typeof window === "undefined") return;

    const syncDrawerPosition = () => {
      if (!drawerRef.current) return;
      gsap.set(drawerRef.current, { y: getDrawerY(progress), opacity: 1 });
    };

    syncDrawerPosition();
    window.addEventListener("resize", syncDrawerPosition);
    window.visualViewport?.addEventListener("resize", syncDrawerPosition);

    return () => {
      window.removeEventListener("resize", syncDrawerPosition);
      window.visualViewport?.removeEventListener("resize", syncDrawerPosition);
    };
  }, [getDrawerY, isMobile, progress]);

  // ============================================================
  // POINTER HANDLERS (Mobile) - drag no drawer
  // ============================================================
  const handleDrawerPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (isAnimatingRef.current) return;
    drawerPointerActiveRef.current = true;
    drawerDidDragRef.current = false;
    touchStartYRef.current = event.clientY;
    touchStartProgressRef.current = getCurrentProgress();
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [getCurrentProgress]);

  const handleDrawerPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (isAnimatingRef.current || !drawerPointerActiveRef.current) return;
    const delta = touchStartYRef.current - event.clientY;
    if (!drawerDidDragRef.current && Math.abs(delta) < 8) return;

    drawerDidDragRef.current = true;
    const progressDistance = isMobile
      ? Math.max(MOBILE_DRAG_DISTANCE, window.innerHeight * 0.38)
      : 200;
    const progressDelta = delta / progressDistance;
    const newProgress = clamp(touchStartProgressRef.current + progressDelta, 0, 1);
    applyProgress(newProgress);
  }, [MOBILE_DRAG_DISTANCE, applyProgress, isMobile]);

  const handleDrawerPointerEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    drawerPointerActiveRef.current = false;
    if (!drawerDidDragRef.current) return;

    suppressChevronClickRef.current = true;
    window.setTimeout(() => {
      suppressChevronClickRef.current = false;
    }, 0);

    const currentProgress = getCurrentProgress();
    const snapTarget = getProgressSnapTarget(currentProgress);
    if (snapTarget !== currentProgress) animateProgressTo(snapTarget, isMobile ? 0.38 : 0.5, currentProgress);
  }, [animateProgressTo, getCurrentProgress, getProgressSnapTarget, isMobile]);

  const loginVisible = progress >= 0.85;
  const loginInteractive = progress >= 0.97;
  
  // Calcula transformação do drawer
  const drawerTransformProgress = mapRange(progress, 0.7, 0.97, 0, 1);
  const isTransformed = progress > 0.85;
  useLayoutEffect(() => {
    const content = drawerContentRef.current;
    const initial = drawerInitialRef.current;
    const login = drawerLoginRef.current;

    if (!content || !initial || !login) return;

    gsap.killTweensOf([content, initial, login]);

    if (isTransformed) {
      gsap.set(login, { display: "flex" });
      const targetHeight = login.offsetHeight;
      gsap.set(content, { height: content.offsetHeight || targetHeight });
      gsap.to(initial, {
        opacity: 0,
        y: -10,
        duration: 0.16,
        ease: "power2.out",
        onComplete: () => gsap.set(initial, { display: "none" }),
      });
      gsap.fromTo(login, {
        opacity: 0,
        y: 14,
      }, {
        opacity: 1,
        y: 0,
        duration: 0.24,
        ease: "power2.out",
        delay: 0.06,
      });
      gsap.to(content, {
        height: targetHeight,
        duration: 0.28,
        ease: "power2.out",
        onUpdate: () => {
          if (drawerRef.current) gsap.set(drawerRef.current, { y: getDrawerY(getCurrentProgress()) });
        },
      });
    } else {
      gsap.set(initial, { display: "block" });
      const targetHeight = initial.offsetHeight;
      gsap.set(content, { height: content.offsetHeight || targetHeight });
      gsap.to(login, {
        opacity: 0,
        y: 10,
        duration: 0.16,
        ease: "power2.out",
        onComplete: () => gsap.set(login, { display: "none" }),
      });
      gsap.fromTo(initial, {
        opacity: 0,
        y: -8,
      }, {
        opacity: 1,
        y: 0,
        duration: 0.22,
        ease: "power2.out",
        delay: 0.04,
      });
      gsap.to(content, {
        height: targetHeight,
        duration: 0.28,
        ease: "power2.out",
        onUpdate: () => {
          if (drawerRef.current) gsap.set(drawerRef.current, { y: getDrawerY(getCurrentProgress()) });
        },
      });
    }
    if (drawerRef.current) {
      gsap.to(drawerRef.current, {
        y: getDrawerY(getCurrentProgress()),
        duration: 0.28,
        ease: "power2.out",
      });
    }
  }, [getDrawerY, isTransformed, progress]);

  return (
    <div ref={rootRef} className="h-[100dvh] min-h-screen overflow-hidden text-white selection:bg-[#00f5ff] selection:text-black" style={{ background: "linear-gradient(180deg, #050505 0%, #090b11 100%)" }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <SparkParticles count={isMobile ? 10 : 30} performanceMode={isMobile ? "reduced" : "full"} variant="default" />
        <div className={`${isMobile ? "left-[-12%] top-[-10%] h-[18rem] w-[18rem] blur-[72px]" : "left-[-8%] top-[-12%] h-[34rem] w-[34rem] blur-[140px]"} absolute rounded-full bg-[#00f5ff]/8`} />
        <div className={`${isMobile ? "bottom-[-8%] right-[-12%] h-[20rem] w-[20rem] blur-[84px]" : "bottom-[-15%] right-[-10%] h-[38rem] w-[38rem] blur-[160px]"} absolute rounded-full bg-[#d4af37]/8`} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_40%)]" />
      </div>

      <div className="relative z-10 flex h-full min-h-[100dvh] flex-col px-5 pb-28 pt-8 md:min-h-screen md:px-8 md:pb-20 md:pt-12">
        <motion.div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 text-center" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }}>
          <SparkLogo size={isMobile ? 72 : 144} />
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl" style={{ fontFamily: "var(--font-display)", textShadow: "0 4px 20px rgba(0,0,0,0.6)" }}>
              <span className="text-foreground">Post</span>
              <span style={{ color: "oklch(0.7 0.22 40)" }}>Spark</span>
            </h1>
            <p className="text-sm font-light text-white/62 md:text-base">Capture a alma. Crie o novo.</p>
          </div>
        </motion.div>

        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center pt-10 md:pt-14">
          <div ref={cardsStageRef} className="relative flex h-[560px] items-center justify-center" style={{ perspective: "1200px", transformStyle: "preserve-3d", transform: isMobile ? "scale(0.576)" : undefined, transformOrigin: "center center" }}>
            <button type="button" onClick={goPrevious} disabled={currentIndex === 0 || collisionActive} aria-label="Card anterior" className="absolute left-0 z-40 hidden rounded-full border border-white/10 bg-white/5 p-3 text-white/50 shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-all duration-300 hover:scale-110 hover:bg-white/10 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-0 md:left-6 md:block">
              <ChevronLeft className="h-6 w-6 md:h-8 md:w-8" />
            </button>

            {showcaseCards.map((post, index) => {
              const styles = cardStyles[index];
              const isCenter = index === currentIndex;

              return (
                <motion.button
                  key={post.id}
                  ref={(el) => { cardRefs.current[index] = el; }}
                  type="button"
                  drag={isCenter && !collisionActive ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.6}
                  onDragEnd={isCenter ? handleCardDragEnd : undefined}
                  initial={false}
                  animate={{ x: styles.x, z: styles.z, scale: styles.scale, rotateX: isCenter ? hoverRotation.x : 0, rotateY: isCenter ? hoverRotation.y : styles.rotateY, opacity: styles.opacity, zIndex: styles.zIndex, filter: styles.filter }}
                  transition={{ type: "spring", stiffness: 150, damping: 22, mass: 0.8 }}
                  onTap={() => {
                    if (collisionActive) return;
                    if (!isCenter) {
                      setHoverRotation({ x: 0, y: 0 });
                      setCurrentIndex(index);
                    }
                  }}
                  onMouseMove={(event) => {
                    if (!isCenter || collisionActive) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const x = event.clientX - rect.left;
                    const y = event.clientY - rect.top;
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    setHoverRotation({ x: ((y - centerY) / centerY) * -12, y: ((x - centerX) / centerX) * 12 });
                  }}
                  onMouseLeave={() => { if (isCenter) setHoverRotation({ x: 0, y: 0 }); }}
                  className="absolute h-[460px] w-[320px] overflow-hidden rounded-[28px] text-left shadow-2xl outline-none"
                  style={{ transformStyle: "preserve-3d", pointerEvents: styles.pointerEvents, background: post.palette.background, border: isCenter ? `1px solid ${post.palette.accent}66` : "1px solid rgba(255,255,255,0.06)", boxShadow: isMobile ? (isCenter ? `0 0 22px ${post.palette.accent}18, 0 18px 44px rgba(0,0,0,0.34)` : "0 16px 36px rgba(0,0,0,0.28)") : (isCenter ? `0 0 40px ${post.palette.accent}22, 0 30px 80px rgba(0,0,0,0.45)` : "0 26px 60px rgba(0,0,0,0.38)") }}
                >
                  {renderBackground(post)}
                  {renderDecorations(post)}
                  <div className="absolute inset-0" style={{ background: post.layoutType === "minimal" ? "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))" : `linear-gradient(180deg, transparent 0%, transparent 35%, ${post.palette.background}22 58%, ${post.palette.background}CC 100%)` }} />
                  <div className={`absolute inset-0 flex flex-col p-7 ${getTextBlockClasses(post)}`}>
                    {post.layoutType === "editorial" ? <div className="text-[10px] uppercase tracking-[0.34em]" style={{ color: `${post.palette.text}88`, fontFamily: post.fontFamily }}>{post.title}</div> : null}
                    <div>
                      <span className="mb-3 block text-[11px] font-bold uppercase tracking-[0.32em]" style={{ color: post.palette.accent, fontFamily: post.fontFamily }}>{post.category}</span>
                      {post.layoutType !== "editorial" ? <div className="mb-2 text-[10px] uppercase tracking-[0.24em]" style={{ color: `${post.palette.text}82`, fontFamily: post.fontFamily }}>{post.title}</div> : null}
                      <h2 className={`font-semibold ${getHeadlineClasses(post)}`} style={{ color: post.palette.text, fontFamily: post.fontFamily, textTransform: post.layoutType === "minimal" || post.titleCase === "upper" ? "uppercase" : "none" }}>{post.headline}</h2>
                      <p className={`mt-3 max-w-[23ch] text-sm font-light leading-relaxed ${post.layoutType === "minimal" ? "text-[13px]" : ""}`} style={{ color: `${post.palette.text}B8`, fontFamily: post.fontFamily }}>{post.subtext}</p>
                    </div>
                  </div>
                </motion.button>
              );
            })}

            <button type="button" onClick={goNext} disabled={currentIndex === showcaseCards.length - 1 || collisionActive} aria-label="Proximo card" className="absolute right-0 z-40 hidden rounded-full border border-white/10 bg-white/5 p-3 text-white/50 shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-all duration-300 hover:scale-110 hover:bg-white/10 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-0 md:right-6 md:block">
              <ChevronRight className="h-6 w-6 md:h-8 md:w-8" />
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* DRAWER QUE SE TRANSFORMA - Único elemento que cresce */}
      {/* ============================================================ */}
      <div
        ref={drawerRef}
        className="fixed inset-x-4 z-30 mx-auto flex w-auto max-w-md flex-col items-center text-center"
        style={{
          touchAction: "none",
          bottom: "16px",
          pointerEvents: "auto",
        }}
      >
        {/* Chevron - muda de direção baseado no estado */}
        <div
          className="flex w-full justify-center pt-4"
          onPointerDown={isMobile ? handleDrawerPointerDown : undefined}
          onPointerMove={isMobile ? handleDrawerPointerMove : undefined}
          onPointerUp={isMobile ? handleDrawerPointerEnd : undefined}
          onPointerCancel={isMobile ? handleDrawerPointerEnd : undefined}
        >
        <motion.button
          type="button"
          onClick={() => {
            if (suppressChevronClickRef.current) return;
            const currentProgress = getCurrentProgress();
            animateProgressTo(getChevronTargetProgress(currentProgress), isMobile ? 0.38 : 0.5, currentProgress);
          }}
          onPointerCancel={!isMobile && !isTransformed ? handleDrawerPointerEnd : undefined}
          className="transition-all"
          animate={{ 
            y: isTransformed ? 0 : [0, -7, 0],
          }}
          transition={{ 
            y: isTransformed ? { duration: 0.3 } : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
          }}
        >
          {isTransformed ? (
            <ChevronDown size={isMobile ? 22 : 18} className="text-[oklch(0.7_0.22_40)]" />
          ) : (
            <ChevronUp size={isMobile ? 22 : 18} className="text-[oklch(0.7_0.22_40)]" />
          )}
        </motion.button>
        </div>

        {/* Conteúdo que se transforma */}
        <div ref={drawerContentRef} className="mt-2 max-h-[calc(100dvh-7rem)] w-full overflow-y-auto overflow-x-hidden pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:max-h-none md:overflow-visible">
          <div ref={drawerInitialRef} className={`${isMobile ? "text-lg" : "text-base"} font-medium leading-tight text-white/88`}>
            Deslize para iniciar
          </div>

          <form
            ref={drawerLoginRef}
            onSubmit={handleDrawerEmailAuth}
            className="mt-1 w-full flex-col gap-3"
          >
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-[0.34em] text-white/40">Identificacao</div>
                <h2 className="mt-1 text-lg font-semibold text-white/92">Entre para criar posts</h2>
              </div>

              <button type="button" onClick={handleDrawerGoogleAuth} disabled={authLoading || authGoogleLoading || !isSupabaseConfigured} className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all disabled:opacity-60" style={{ background: "rgba(18,22,34,0.98)", borderColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.94)" }}>
                <Chrome size={16} />
                <span>{authGoogleLoading ? "Conectando..." : "Google"}</span>
              </button>

              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/36">ou</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                <input type="email" value={authEmail} onChange={(event) => { setAuthEmail(event.target.value); setAuthError(null); }} placeholder="Email" required className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none" style={{ background: "rgba(16,20,30,0.98)", borderColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.95)" }} />
              </div>

              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                <input type={showAuthPassword ? "text" : "password"} value={authPassword} onChange={(event) => { setAuthPassword(event.target.value); setAuthError(null); }} placeholder={authMode === "register" ? "Minimo 6 caracteres" : "Senha"} required minLength={6} className="w-full rounded-xl border py-2.5 pl-9 pr-10 text-sm outline-none" style={{ background: "rgba(16,20,30,0.98)", borderColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.95)" }} />
                <button type="button" onClick={() => setShowAuthPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40">
                  {showAuthPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {authError ? <div className="rounded-xl border border-[rgba(212,90,60,0.35)] bg-[rgba(212,90,60,0.12)] px-3 py-2 text-xs text-[rgba(255,190,170,0.92)]">{authError}</div> : null}
              {!isSupabaseConfigured ? <div className="rounded-xl border border-[rgba(212,175,55,0.28)] bg-[rgba(212,175,55,0.1)] px-3 py-2 text-xs text-[rgba(255,235,190,0.92)]">Login indisponivel ate configurar VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.</div> : null}

              <button
                type="submit"
                disabled={authLoading || authGoogleLoading || !isSupabaseConfigured}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-black"
                style={{ background: "linear-gradient(135deg, oklch(0.7 0.22 40), oklch(0.6 0.2 20))", boxShadow: "0 0 18px oklch(0.7 0.22 40 / 28%)" }}
              >
                {authLoading ? "Aguarde..." : authMode === "login" ? "Entrar" : "Criar conta"}
              </button>

              <div className="text-center text-xs text-white/52">
                {authMode === "login" ? "Sem conta? " : "Ja tem conta? "}
                <button type="button" onClick={() => { setAuthMode((value) => (value === "login" ? "register" : "login")); setAuthError(null); }} className="font-semibold text-[oklch(0.7_0.22_40)]">
                  {authMode === "login" ? "Criar" : "Entrar"}
                </button>
              </div>
          </form>
        </div>
      </div>
    </div>
  );
}






