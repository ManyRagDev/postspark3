import GoogleAuthCallback from "./components/auth/GoogleAuthCallback";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation, useSearch } from "wouter";
import { isTheVoidLabSearch, THEVOID_LAB_PATH } from "@/lib/studioRoutes";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Pricing from "./pages/Pricing";
import Billing from "./pages/Billing";
import MembershipSuccess from "./pages/MembershipSuccess";
import History from "./pages/History";
import SavedPosts from "./pages/SavedPosts";
import Admin from "./pages/Admin";
import FamilyCatalog from "./pages/FamilyCatalog";
import PreviewHomePage from "./pages/PreviewHome/PreviewHomePage";
import StudioAppV2BPage from "./pages/StudioApp/StudioAppV2BPage";
import AgencyStudio from "./pages/AgencyStudio";
import StartStudio from "./pages/StartStudio";
import SparkRefillSuccess from "./pages/SparkRefillSuccess";
import UserTopMenu from "./components/UserTopMenu";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Cookies from "./pages/Cookies";
import PrivacySettings from "./pages/PrivacySettings";
import ConsentModal from "./components/ConsentModal";
import CookieBanner from "./components/CookieBanner";
import { useAuth } from "./_core/hooks/useAuth";
import StudioAuthModal from "./pages/StudioHome/components/StudioAuthModal";
import { useSupabaseUserId } from "@/hooks/useSupabaseUserId";
import { useIsMobile } from "@/hooks/useMobile";
import { useEffect, useState, lazy, Suspense, type ComponentType } from "react";

// Lazy loading da vitrine de inspiração com isolamento total de bundle
const InspiracaoShowcasePage = lazy(() => import("./pages/InspiracaoShowcase/InspiracaoShowcasePage"));
const Admin2 = lazy(() => import("./pages/Admin2"));

/**
 * Rota Inicial Pública (Não Logados):
 * Exibe StudioHomePage como vitrine oficial do PostSpark.
 * Se autenticado, redireciona para o estúdio oficial (/thevoid).
 */
function PublicLandingRoute() {
  const { loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      setLocation("/thevoid");
    }
  }, [isAuthenticated, loading, setLocation]);

  // Show auth error toast from query params (e.g. Google OAuth 403)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    if (authError === 'postspark_access_required') {
      toast.error('Sua conta ainda não tem acesso ao PostSpark. Fale com o suporte.');
    } else if (authError) {
      toast.error('Falha na autenticação. Tente novamente.');
    }
    if (authError) {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  if (loading) {
    return null;
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#080706] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="text-2xl animate-spin text-[#FF5C00]">✦</div>
          <p className="text-xs font-mono text-white/50 tracking-wider uppercase">Entrando no estúdio...</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d0b09]" />}>
      <InspiracaoShowcasePage />
    </Suspense>
  );
}

function RedirectToRoute({ to }: { to: string }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(to);
  }, [setLocation, to]);

  return null;
}

function ProtectedRoute({ component: Component, personal = false }: { component: ComponentType; personal?: boolean }) {
  const { loading, isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#080706] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="text-2xl animate-spin text-[#FF5C00]">✦</div>
          <p className="text-xs font-mono text-white/50 tracking-wider uppercase">Carregando estúdio...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if (personal && user?.access) return <RedirectToRoute to={user.access === "agency" ? "/agency" : "/thevoid"} />;
  return <Component />;
}

function AdminRoute({ component: Component }: { component: ComponentType }) {
  const { loading, isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || user?.role !== "admin" || user.access || user.impersonatedPlan) {
      setLocation("/");
    }
  }, [isAuthenticated, loading, user, setLocation]);

  if (loading || !isAuthenticated || user?.role !== "admin" || user.access || user.impersonatedPlan) return null;
  return <Component />;
}

/* Componentes de rota estáveis para evitar recriação de nós virtuais */
function TheVoidRoute() {
  return <ProtectedRoute component={MembershipStudio} />;
}
function TheVoidLabRoute() {
  return <ProtectedRoute component={MembershipLabStudio} />;
}
function MembershipLabStudio() {
  return <MembershipStudio lab />;
}
function MembershipStudio({ lab = false }: { lab?: boolean } = {}) {
  const { user } = useAuth();
  if (user?.studioPlan === "START") return <StartStudio lab={lab} />;
  if (user?.access === "agency") return <RedirectToRoute to="/agency" />;
  return <StudioAppV2BPage studioPlan={user?.studioPlan}
    lab={lab}
    debuggerOwnerId={user?.role === "admin" && !user.access ? user.id : undefined}
    teamShareUserId={user?.studioPlan === "AGENCY" ? user.id : undefined} />;
}
function StartPieceRoute() {
  return <ProtectedRoute component={StartPieceArchive} />;
}
function StartPieceArchive() {
  const { user } = useAuth();
  return <StartStudio archive={user?.studioPlan !== "START"} />;
}
function BillingRoute() {
  return <ProtectedRoute component={Billing} />;
}
function StudioHistory() {
  const lab = isTheVoidLabSearch(useSearch());
  return <History lab={lab} />;
}
function HistoryRoute() {
  return <ProtectedRoute personal component={StudioHistory} />;
}
function StudioSavedPosts() {
  const lab = isTheVoidLabSearch(useSearch());
  return <SavedPosts lab={lab} />;
}
function SavedPostsRoute() {
  return <ProtectedRoute personal component={StudioSavedPosts} />;
}
function PrivacySettingsRoute() {
  return <ProtectedRoute component={PrivacySettings} />;
}
function PaymentReturnRoute() {
  const actor = useSupabaseUserId();
  const mobile = useIsMobile();
  const [loginOpen, setLoginOpen] = useState(false);
  const [location] = useLocation();
  if (actor === undefined) return <p role="status" className="p-6">Verificando sessão…</p>;
  if (!actor) return <main className="mx-auto max-w-lg space-y-4 px-6 py-12">
    <h1 className="text-2xl font-semibold">Confirmação de pagamento</h1>
    <p>Entre com a conta usada no checkout para conferir o pagamento.</p>
    <button className="min-h-11 rounded-lg border px-4" onClick={() => setLoginOpen(true)}>Entrar na conta</button>
    <StudioAuthModal isOpen={loginOpen} isMobile={mobile} resumePayment onClose={() => setLoginOpen(false)} />
  </main>;
  return location === "/billing/topup-success" ? <SparkRefillSuccess key={actor} /> : <MembershipSuccess key={actor} />;
}
function FamilyCatalogRoute() {
  return <AdminRoute component={FamilyCatalog} />;
}
function AdminPageRoute() {
  return <AdminRoute component={Admin} />;
}
function Admin2PageRoute() {
  return <Suspense fallback={<div className="min-h-screen bg-[#080d14] p-8 text-slate-300">Carregando laboratório…</div>}><AdminRoute component={Admin2} /></Suspense>;
}

function Router() {
  return (
    <Switch>
      {/* 1. Página Inicial Oficial para Não Logados (Showcase Interativo) */}
      <Route path={"/"} component={PublicLandingRoute} />

      {/* 2. Landing Page Oficial de Anúncios / Tráfego */}
      <Route path={"/criar"} component={PreviewHomePage} />

      {/* 3. Estúdio Oficial Logado (/thevoid) */}
      <Route path={"/thevoid"} component={TheVoidRoute} />
      <Route path={THEVOID_LAB_PATH} component={TheVoidLabRoute} />
      <Route path={"/studio"} component={TheVoidRoute} />
      <Route path={"/studio-v2b"} component={TheVoidRoute} />
      <Route path={"/agency"} component={AgencyStudio} />
      <Route path={"/start/peca"} component={StartPieceRoute} />
      {/* 4. Redirecionamentos Canônicos de Rotas Experimentais e Legadas */}
      {/* 4.1 Experimentos de Landing Page ➔ /criar */}
      <Route path={"/criar-new"} component={() => <RedirectToRoute to="/criar" />} />
      <Route path={"/p"} component={() => <RedirectToRoute to="/criar" />} />
      <Route path={"/preview-home"} component={() => <RedirectToRoute to="/criar" />} />
      <Route path={"/crie-posts-incriveis"} component={() => <RedirectToRoute to="/criar" />} />
      <Route path={"/landing"} component={() => <RedirectToRoute to="/criar" />} />
      <Route path={"/landing2"} component={() => <RedirectToRoute to="/criar" />} />
      <Route path={"/landing3"} component={() => <RedirectToRoute to="/criar" />} />

      {/* 4.2 Experimentos 3D / Showcases Anteriores ➔ / */}
      <Route path={"/stage-3d"} component={() => <RedirectToRoute to="/" />} />
      <Route path={"/3d-home"} component={() => <RedirectToRoute to="/" />} />
      <Route path={"/studio-home"} component={() => <RedirectToRoute to="/" />} />
      <Route path={"/inspiracao"} component={() => <RedirectToRoute to="/" />} />
      <Route path={"/showcase-stage"} component={() => <RedirectToRoute to="/" />} />
      <Route path={"/thevoid2"} component={() => <RedirectToRoute to="/" />} />

      {/* 4.3 Experimentos de Estúdio ➔ /thevoid */}
      <Route path={"/canvas-lab"} component={() => <RedirectToRoute to="/thevoid" />} />
      <Route path={"/thevoid-clean"} component={() => <RedirectToRoute to="/thevoid" />} />
      <Route path={"/studio-v2"} component={() => <RedirectToRoute to="/thevoid" />} />

      {/* 5. Páginas do Sistema & Billing */}
      <Route path={"/pricing"} component={Pricing} />
      <Route path={"/billing"} component={BillingRoute} />
      <Route path={"/history"} component={HistoryRoute} />
      <Route path={"/saved-posts"} component={SavedPostsRoute} />
      <Route path={"/privacy"} component={Privacy} />
      <Route path={"/terms"} component={Terms} />
      <Route path={"/cookies"} component={Cookies} />
      <Route path={"/privacy-settings"} component={PrivacySettingsRoute} />
      <Route path={"/billing/success"} component={PaymentReturnRoute} />
      <Route path={"/billing/topup-success"} component={PaymentReturnRoute} />
      <Route path={"/admin"} component={AdminPageRoute} />
      <Route path={"/admin2"} component={Admin2PageRoute} />
      <Route path={"/familias"} component={FamilyCatalogRoute} />
      <Route path={"/auth/google-callback"} component={GoogleAuthCallback} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * AppInner: responsável pela camada de autenticação global.
 * Mostra AuthGate + LoginModal para usuários não autenticados.
 */
function AppInner() {
  const { isAuthenticated } = useAuth();
  const [location] = useLocation();
  const isMobile = useIsMobile();

  // Nas rotas de estúdio (/thevoid, /studio, /studio-v2b), cada etapa (Criação, Galeria e CanvasLab)
  // renderiza o UserTopMenu de forma nativa e integrada ao seu respectivo layout/header.
  // Posts salvos também integra o menu ao cabeçalho. Nas demais páginas
  // (/history, /billing, /pricing, landing logada, etc.), o menu global permanece ativo.
  const isStudioRoute =
    location === "/thevoid" ||
    location === THEVOID_LAB_PATH ||
    location === "/studio" ||
    location === "/studio-v2b";

  return (
    <>
      <Toaster
        position={isStudioRoute && isMobile ? "top-center" : "bottom-right"}
        mobileOffset={isStudioRoute && isMobile ? { top: "4.5rem" } : undefined}
        toastOptions={{
          style: {
            background: "oklch(0.13 0.025 280)",
            border: "1px solid oklch(1 0 0 / 8%)",
            color: "oklch(0.93 0.01 280)",
          },
          classNames: {
            success: "toast-success",
            error: "toast-error",
          },
        }}
      />
      <Router />
      {isAuthenticated && !isStudioRoute && location !== "/saved-posts" ? <UserTopMenu /> : null}
      {/* Consentimento LGPD e Cookies - fora das páginas imersivas */}
      {location !== "/" && location !== "/criar" && <ConsentModal />}
      {location !== "/" && location !== "/criar" && <CookieBanner />}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <AppInner />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
