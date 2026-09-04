import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Pricing from "./pages/Pricing";
import Billing from "./pages/Billing";
import History from "./pages/History";
import SavedPosts from "./pages/SavedPosts";
import Admin from "./pages/Admin";
import FamilyCatalog from "./pages/FamilyCatalog";
import PreviewHomePage from "./pages/PreviewHome/PreviewHomePage";
import StudioAppV2BPage from "./pages/StudioApp/StudioAppV2BPage";
import UserTopMenu from "./components/UserTopMenu";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Cookies from "./pages/Cookies";
import PrivacySettings from "./pages/PrivacySettings";
import ConsentModal from "./components/ConsentModal";
import CookieBanner from "./components/CookieBanner";
import { useAuth } from "./_core/hooks/useAuth";
import { useEffect, lazy, Suspense, type ComponentType } from "react";

// Lazy loading da vitrine de inspiração com isolamento total de bundle
const InspiracaoShowcasePage = lazy(() => import("./pages/InspiracaoShowcase/InspiracaoShowcasePage"));

function PostCheckoutSuccess() {
  setTimeout(() => { window.location.href = "/"; }, 3000);
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "oklch(0.04 0.06 280)" }}>
      <div className="text-center">
        <p className="text-2xl mb-2">✅</p>
        <p className="text-foreground font-semibold">Assinatura ativada!</p>
        <p className="text-muted-foreground text-sm mt-1">Redirecionando...</p>
      </div>
    </div>
  );
}

function TopupSuccess() {
  setTimeout(() => { window.location.href = "/thevoid"; }, 3000);
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "oklch(0.04 0.06 280)" }}>
      <div className="text-center">
        <p className="text-2xl mb-2">⚡</p>
        <p className="text-foreground font-semibold">Sparks adicionados!</p>
        <p className="text-muted-foreground text-sm mt-1">Redirecionando...</p>
      </div>
    </div>
  );
}

/**
 * Callback do Google OAuth via Supabase.
 */
function GoogleAuthCallback() {
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', ''));
    const access_token = params.get('access_token');

    if (!access_token) {
      window.location.href = '/?auth_error=no_token';
      return;
    }

    fetch('/api/auth/supabase-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ access_token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) {
            const body = await res.json().catch(() => ({}));
            if (body.error === 'postspark_access_required') {
              window.location.href = '/?auth_error=postspark_access_required';
              return;
            }
          }
          window.location.href = '/?auth_error=session_failed';
          return;
        }
        window.location.href = '/thevoid';
      })
      .catch(() => { window.location.href = '/?auth_error=session_failed'; });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "oklch(0.04 0.06 280)" }}>
      <div className="text-center">
        <div className="text-2xl mb-3 animate-spin inline-block">✦</div>
        <p className="text-foreground font-semibold">Autenticando...</p>
        <p className="text-muted-foreground text-sm mt-1">Aguarde um instante</p>
      </div>
    </div>
  );
}

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
      toast.error('Não conseguimos ativar o PostSpark para sua Conta ManyLabs. Tente novamente ou fale com o suporte.');
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

function ProtectedRoute({ component: Component }: { component: ComponentType }) {
  const { loading, isAuthenticated } = useAuth();
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
  return <Component />;
}

function AdminRoute({ component: Component }: { component: ComponentType }) {
  const { loading, isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || user?.role !== "admin") {
      setLocation("/");
    }
  }, [isAuthenticated, loading, user, setLocation]);

  if (loading || !isAuthenticated || user?.role !== "admin") return null;
  return <Component />;
}

/* Componentes de rota estáveis para evitar recriação de nós virtuais */
function TheVoidRoute() {
  return <ProtectedRoute component={StudioAppV2BPage} />;
}
function BillingRoute() {
  return <ProtectedRoute component={Billing} />;
}
function HistoryRoute() {
  return <ProtectedRoute component={History} />;
}
function SavedPostsRoute() {
  return <ProtectedRoute component={SavedPosts} />;
}
function PrivacySettingsRoute() {
  return <ProtectedRoute component={PrivacySettings} />;
}
function AdminPageRoute() {
  return <AdminRoute component={Admin} />;
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
      <Route path={"/studio"} component={TheVoidRoute} />
      <Route path={"/studio-v2b"} component={TheVoidRoute} />

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
      <Route path={"/billing/success"} component={PostCheckoutSuccess} />
      <Route path={"/billing/topup-success"} component={TopupSuccess} />
      <Route path={"/admin"} component={AdminPageRoute} />
      <Route path={"/familias"} component={FamilyCatalog} />
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
  const isImmersiveRoute =
    location === "/" ||
    location === "/thevoid" ||
    location === "/studio" ||
    location === "/studio-v2b" ||
    location === "/criar";

  return (
    <>
      <Router />
      {isAuthenticated && !isImmersiveRoute ? <UserTopMenu /> : null}
      {/* Consentimento LGPD e Cookies - apenas fora da landing imersiva */}
      {!isImmersiveRoute && <ConsentModal />}
      {!isImmersiveRoute && <CookieBanner />}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            position="bottom-right"
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
          <AppInner />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
