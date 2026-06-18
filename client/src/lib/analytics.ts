/**
 * Analytics Module - PostSpark 3
 *
 * Sistema minimamente invasivo de analytics conforme LGPD.
 * Apenas dados agregados e anonimizados são coletados.
 *
 * Dados coletados:
 * - Page views (sem identificadores pessoais)
 * - Sessões únicas (via fingerprint de sessão, sem IP)
 * - Eventos de navegação principais
 * - Dispositivo/resolução (agregado)
 *
 * NÃO coletados:
 * - Email, UUID ou outros identificadores pessoais
 * - IP exato
 * - Scroll heatmaps
 * - Gravação de sessão
 *
 * @module analytics
 */

interface AnalyticsEvent {
  event: string;
  properties?: Record<string, unknown>;
  timestamp?: number;
}

interface PageViewEvent {
  path: string;
  referrer?: string;
  title?: string;
}

/**
 * Cliente de Analytics
 */
export const analytics = {
  /**
   * Rastreia page view
   * @param path Caminho da página
   * @param referrer Referrer (opcional)
   */
  trackPageView: (path: string, referrer?: string): void => {
    try {
      // Não enviar em development
      if (process.env.NODE_ENV === "development") return;

      // Sanitizar path
      const sanitizedPath = sanitizePath(path);

      fetch("/api/analytics/pageview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: sanitizedPath,
          referrer: referrer ? sanitizeReferrer(referrer) : undefined,
          timestamp: Date.now(),
        }),
        // Keepalive para não bloquear navegação
        keepalive: true,
      }).catch(() => {
        // Silenciar erros de analytics
      });
    } catch (error) {
      // Silenciar erros de analytics para não quebrar a aplicação
    }
  },

  /**
   * Rastreia evento
   * @param event Nome do evento
   * @param properties Propriedades do evento (serão sanitizadas)
   */
  trackEvent: (event: string, properties?: Record<string, unknown>): void => {
    try {
      // Não enviar em development
      if (process.env.NODE_ENV === "development") return;

      // Sanitizar propriedades
      const sanitizedProperties = properties
        ? sanitizeProperties(properties)
        : undefined;

      fetch("/api/analytics/event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event: sanitizeEventName(event),
          properties: sanitizedProperties,
          timestamp: Date.now(),
        }),
        keepalive: true,
      }).catch(() => {
        // Silenciar erros de analytics
      });
    } catch (error) {
      // Silenciar erros de analytics
    }
  },

  /**
   * Rastreia erro
   * @param error Mensagem de erro
   * @param context Contexto do erro
   */
  trackError: (error: string, context?: Record<string, unknown>): void => {
    try {
      // Não enviar em development
      if (process.env.NODE_ENV === "development") return;

      analytics.trackEvent("error", {
        message: error.substring(0, 200), // Limitar tamanho
        context: context ? sanitizeProperties(context) : undefined,
      });
    } catch (e) {
      // Silenciar
    }
  },
};

/**
 * Sanitiza path removendo possíveis identificadores
 */
function sanitizePath(path: string): string {
  // Remover UUIDs do path
  return path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "[id]"
  );
}

/**
 * Sanitiza referrer removendo query params sensíveis
 */
function sanitizeReferrer(referrer: string): string {
  try {
    const url = new URL(referrer);
    // Remover query params que podem conter dados sensíveis
    url.search = "";
    return url.origin + url.pathname;
  } catch {
    return "[referrer]";
  }
}

/**
 * Sanitiza nome do evento
 */
function sanitizeEventName(name: string): string {
  // Apenas caracteres alfanuméricos e underscore
  return name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
}

/**
 * Sanitiza propriedades removendo dados sensíveis
 */
function sanitizeProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = [
    "email",
    "uuid",
    "userid",
    "user_id",
    "token",
    "password",
    "secret",
    "apikey",
    "api_key",
    "ssn",
    "cpf",
  ];

  for (const [key, value] of Object.entries(properties)) {
    const lowerKey = key.toLowerCase();

    // Verificar se é chave sensível
    if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
      continue; // Pular campos sensíveis
    }

    // Sanitizar valor
    if (typeof value === "string") {
      // Truncar strings longas
      sanitized[key] = value.length > 500 ? value.substring(0, 500) + "..." : value;
    } else if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        sanitized[key] = value.slice(0, 10); // Limitar arrays
      } else {
        sanitized[key] = sanitizeProperties(value as Record<string, unknown>);
      }
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Hook para rastrear page views automaticamente
 */
export function usePageTracking(): void {
  if (typeof window === "undefined") return;

  // Rastrear page view inicial
  analytics.trackPageView(window.location.pathname, document.referrer);

  // Rastrear mudanças de rota (para SPAs)
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    analytics.trackPageView(window.location.pathname);
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    analytics.trackPageView(window.location.pathname);
  };

  // Rastrear popstate (back/forward)
  window.addEventListener("popstate", () => {
    analytics.trackPageView(window.location.pathname);
  });
}

/**
 * Constantes para eventos de analytics
 */
export const AnalyticsEvents = {
  // Auth
  SIGN_UP: "auth_sign_up",
  LOGIN: "auth_login",
  LOGOUT: "auth_logout",

  // Geração
  POST_GENERATED: "post_generated",
  CAROUSEL_GENERATED: "carousel_generated",
  BACKGROUND_GENERATED: "background_generated",
  GENERATION_FAILED: "generation_failed",

  // Salvamento
  POST_SAVED: "post_saved",
  POST_EXPORTED: "post_exported",

  // UI
  PRICING_VIEWED: "pricing_viewed",
  CHECKOUT_INITIATED: "checkout_initiated",
  CHECKOUT_COMPLETED: "checkout_completed",

  // Privacidade
  PRIVACY_CONSENT_GIVEN: "privacy_consent_given",
  PRIVACY_CONSENT_DECLINED: "privacy_consent_declined",
  DATA_EXPORTED: "data_exported",
  DELETION_REQUESTED: "deletion_requested",
} as const;
