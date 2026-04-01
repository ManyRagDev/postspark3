import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Pricing from "./pages/Pricing";
import Billing from "./pages/Billing";
import SavedPosts from "./pages/SavedPosts";
import Admin from "./pages/Admin";
import TheVoid2Page from "./pages/TheVoid2Page";
import UserTopMenu from "./components/UserTopMenu";
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
      .then(() => { window.location.href = '/thevoid'; })
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

function RootEntry() {
  const { loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    setLocation(isAuthenticated ? "/thevoid" : "/thevoid2");
  }, [isAuthenticated, loading, setLocation]);

  return null;
}

function PublicLandingRoute() {
  const { loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading || !isAuthenticated) return;
    setLocation("/thevoid");
  }, [isAuthenticated, loading, setLocation]);

  if (loading || isAuthenticated) return null;
  return <TheVoid2Page />;
}

function LegacyTheVoid2Route() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/");
  }, [setLocation]);

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
      <Route path={"/"} component={PublicLandingRoute} />
      <Route path={"/thevoid"} component={() => <ProtectedRoute component={Home} />} />
      <Route path={"/thevoid2"} component={LegacyTheVoid2Route} />
      <Route path={"/pricing"} component={Pricing} />
      <Route path={"/billing"} component={() => <ProtectedRoute component={Billing} />} />
      <Route path={"/saved-posts"} component={() => <ProtectedRoute component={SavedPosts} />} />
      <Route path={"/billing/success"} component={PostCheckoutSuccess} />
      <Route path={"/billing/topup-success"} component={TopupSuccess} />
      <Route path={"/admin"} component={() => <AdminRoute component={Admin} />} />
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
  const isTheVoid2Route = location === "/" || location === "/thevoid2";

  return (
    <>
      <Router />
      {isAuthenticated && !isTheVoid2Route ? <UserTopMenu /> : null}
      {/* AuthGate: aparece apenas para usuários não autenticados */}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            position="top-center"
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

