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
import StudioHomePage from "./pages/StudioHome/StudioHomePage";
import CanvasLabPage from "./pages/CanvasLab/CanvasLabPage";
import StudioAppV2BPage from "./pages/StudioApp/StudioAppV2BPage";
import UserTopMenu from "./components/UserTopMenu";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Cookies from "./pages/Cookies";
import PrivacySettings from "./pages/PrivacySettings";
import ConsentModal from "./components/ConsentModal";
import CookieBanner from "./components/CookieBanner";
import { useAuth } from "./_core/hooks/useAuth";
import { useEffect, type ComponentType } from "react";

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
  setTimeout(() => { window.location.href = "/"; }, 3000);
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
 * O Supabase redireciona para /auth/google-callback#access_token=...
 * Capturamos o token do hash e trocamos pela sessão PostSpark.
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
    if (loading || !isAuthenticated) return;
    setLocation("/thevoid");
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

  if (isAuthenticated) return null;
  return <StudioHomePage />;
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
    if (loading || isAuthenticated) return;
    setLocation("/");
  }, [isAuthenticated, loading, setLocation]);

  if (loading || !isAuthenticated) return null;
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

function Router() {
  return (
    <Switch>
      {/* 1. Página Inicial Oficial para Não Logados */}
      <Route path={"/"} component={PublicLandingRoute} />
      <Route path={"/studio-home"} component={PublicLandingRoute} />

      {/* 2. Página Oficial de Alta Conversão para Tráfego / Anúncios */}
      <Route path={"/criar"} component={PreviewHomePage} />
      <Route path={"/p"} component={PreviewHomePage} />
      <Route path={"/preview-home"} component={PreviewHomePage} />
      <Route path={"/crie-posts-incriveis"} component={PreviewHomePage} />

      {/* 3. Estúdio Oficial Logado (/thevoid, /studio, /studio-v2b) */}
      <Route path={"/thevoid"} component={() => <ProtectedRoute component={StudioAppV2BPage} />} />
      <Route path={"/studio"} component={() => <ProtectedRoute component={StudioAppV2BPage} />} />
      <Route path={"/studio-v2b"} component={() => <ProtectedRoute component={StudioAppV2BPage} />} />
      <Route path={"/canvas-lab"} component={() => <CanvasLabPage />} />

      {/* 4. Redirecionamentos de Rotas Legadas */}
      <Route path={"/thevoid2"} component={() => <RedirectToRoute to="/" />} />
      <Route path={"/thevoid-clean"} component={() => <RedirectToRoute to="/thevoid" />} />
      <Route path={"/studio-v2"} component={() => <RedirectToRoute to="/thevoid" />} />
      <Route path={"/landing"} component={() => <RedirectToRoute to="/criar" />} />
      <Route path={"/landing2"} component={() => <RedirectToRoute to="/criar" />} />
      <Route path={"/landing3"} component={() => <RedirectToRoute to="/criar" />} />

      {/* 5. Páginas do Sistema & Billing */}
      <Route path={"/pricing"} component={Pricing} />
      <Route path={"/billing"} component={() => <ProtectedRoute component={Billing} />} />
      <Route path={"/history"} component={() => <ProtectedRoute component={History} />} />
      <Route path={"/saved-posts"} component={() => <ProtectedRoute component={SavedPosts} />} />
      <Route path={"/privacy"} component={Privacy} />
      <Route path={"/terms"} component={Terms} />
      <Route path={"/cookies"} component={Cookies} />
      <Route path={"/privacy-settings"} component={() => <ProtectedRoute component={PrivacySettings} />} />
      <Route path={"/billing/success"} component={PostCheckoutSuccess} />
      <Route path={"/billing/topup-success"} component={TopupSuccess} />
      <Route path={"/admin"} component={() => <AdminRoute component={Admin} />} />
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
    location === "/studio-home" ||
    location === "/studio" ||
    location === "/thevoid" ||
    location === "/studio-v2b" ||
    location === "/canvas-lab" ||
    location === "/criar" ||
    location === "/p" ||
    location === "/preview-home" ||
    location === "/crie-posts-incriveis";

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
