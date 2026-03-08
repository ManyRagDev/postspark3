import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Pricing from "./pages/Pricing";
import Billing from "./pages/Billing";
import AuthGate from "./components/AuthGate";
import LoginModal from "./components/LoginModal";
import { useAuth } from "./_core/hooks/useAuth";
import { useState, useEffect } from "react";

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
 * O Supabase redireciona para /api/auth/google-callback#access_token=...
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
      .then(() => { window.location.href = '/'; })
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

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/pricing"} component={Pricing} />
      <Route path={"/billing"} component={Billing} />
      <Route path={"/billing/success"} component={PostCheckoutSuccess} />
      <Route path={"/billing/topup-success"} component={TopupSuccess} />
      <Route path={"/api/auth/google-callback"} component={GoogleAuthCallback} />
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
  const { isAuthenticated, loading } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <>
      <Router />
      {/* AuthGate: aparece apenas para usuários não autenticados */}
      {!loading && (
        <AuthGate onLogin={() => setLoginOpen(true)} />
      )}
      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
      />
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
