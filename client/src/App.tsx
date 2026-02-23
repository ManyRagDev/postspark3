import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Pricing from "./pages/Pricing";
import Billing from "./pages/Billing";
import SparkBalance from "./components/SparkBalance";

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

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/pricing"} component={Pricing} />
      <Route path={"/billing"} component={Billing} />
      <Route path={"/billing/success"} component={PostCheckoutSuccess} />
      <Route path={"/billing/topup-success"} component={TopupSuccess} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
          <SparkBalance />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
