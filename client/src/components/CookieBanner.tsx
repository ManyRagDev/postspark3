import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * CookieBanner - Banner de Cookies
 *
 * Banner de cookies para usuários não autenticados em conformidade com LGPD/GDPR.
 * Aparece apenas na landing page antes de login/registro.
 *
 * Design minimalista integrado com identidade dark studio do PostSpark.
 */

const COOKIE_CONSENT_KEY = "postspark_cookie_consent";
const COOKIE_CONSENT_VERSION = "1.0";

interface CookieConsentRecord {
  accepted: boolean;
  version: string;
  timestamp: string;
}

export function useCookieConsent() {
  const [consent, setConsent] = useState<CookieConsentRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (stored) {
      try {
        setConsent(JSON.parse(stored));
      } catch {
        setConsent(null);
      }
    }
    setLoading(false);
  }, []);

  const acceptCookies = () => {
    const record: CookieConsentRecord = {
      accepted: true,
      version: COOKIE_CONSENT_VERSION,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(record));
    setConsent(record);
  };

  return { consent, loading, acceptCookies };
}

export default function CookieBanner() {
  const { isAuthenticated } = useAuth();
  const { consent, loading, acceptCookies } = useCookieConsent();

  // Don't show if authenticated, already consented, or loading
  if (isAuthenticated || loading || consent?.accepted) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 30,
          delay: 1000 // Show after page load
        }}
        className="fixed bottom-0 left-0 right-0 z-40 p-4"
      >
        <div
          className="max-w-4xl mx-auto rounded-xl p-4 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center gap-4"
          style={{
            background: "oklch(0.08 0.05 280)",
            backdropFilter: "blur(24px) saturate(180%)",
            border: "1px solid oklch(1 0 0 / 10%)"
          }}
        >
          {/* Icon */}
          <div
            className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full"
            style={{
              background: "oklch(0.55 0.22 280 / 15%)",
              border: "1px solid oklch(0.55 0.22 280 / 30%)"
            }}
          >
            <Cookie className="w-5 h-5" style={{ color: "oklch(0.55 0.22 280)" }} />
          </div>

          {/* Content */}
          <div className="flex-1">
            <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
              Cookies e Privacidade
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Usamos cookies essenciais para o funcionamento do serviço e analytics básico
              para melhorar sua experiência. Ao continuar, você concorda com nossa{" "}
              <Link
                href="/cookies"
                className="underline hover:opacity-80"
                style={{ color: "oklch(0.55 0.22 280)" }}
              >
                Política de Cookies
              </Link>
              {" "}e{" "}
              <Link
                href="/privacy"
                className="underline hover:opacity-80"
                style={{ color: "oklch(0.55 0.22 280)" }}
              >
                Política de Privacidade
              </Link>
              .
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="h-9 text-xs glass"
            >
              <Link href="/cookies">
                <ExternalLink className="w-3 h-3 mr-1" />
                Configurar
              </Link>
            </Button>
            <Button
              onClick={acceptCookies}
              size="sm"
              className="h-9 text-xs"
              style={{ background: "oklch(0.55 0.22 280)" }}
            >
              Aceitar Tudo
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
