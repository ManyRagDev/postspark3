/**
 * Analytics Backend Module - PostSpark 3
 *
 * Sistema de analytics minimamente invasivo e LGPD-compliant.
 * Apenas dados agregados são armazenados, sem identificadores pessoais.
 *
 * @module analytics
 */

import { getDb } from "../db";

interface PageViewData {
  path: string;
  referrer?: string;
  timestamp: number;
}

interface EventData {
  event: string;
  properties?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Registra page view
 * @param data Dados do page view
 */
export async function trackPageView(data: PageViewData): Promise<void> {
  try {
    const { path, referrer, timestamp } = data;

    // Extrair informações agregadas do path
    const pathCategory = categorizePath(path);

    // Extrair informações do referrer (se disponível)
    let referrerDomain: string | undefined;
    if (referrer) {
      try {
        const url = new URL(referrer);
        referrerDomain = url.hostname;
      } catch {
        // Ignorar referrer inválido
      }
    }

    // Inserir em tabela de analytics
    try {
      await getDb().schema("postspark").from("analytics_pageviews").insert({
        path,
        path_category: pathCategory,
        referrer_domain: referrerDomain || null,
        timestamp: new Date(timestamp).toISOString(),
        created_at: new Date(),
      });
    } catch (error) {
      // Tabela pode não existir, usar console.log como fallback
      console.log("[Analytics] PageView:", {
        path,
        pathCategory,
        referrerDomain,
      });

      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[Analytics] Table analytics_pageviews does not exist. Create it for proper analytics."
        );
      }
    }
  } catch (error) {
    console.error("[Analytics] Error tracking page view:", error);
    // Não throw para não quebrar a aplicação
  }
}

/**
 * Registra evento
 * @param data Dados do evento
 */
export async function trackEvent(data: EventData): Promise<void> {
  try {
    const { event, properties, timestamp } = data;

    // Sanitizar propriedades (remover dados sensíveis)
    const sanitizedProperties = sanitizeProperties(properties || {});

    // Inserir em tabela de eventos
    try {
      await getDb().schema("postspark").from("analytics_events").insert({
        event_name: event,
        properties: sanitizedProperties,
        timestamp: new Date(timestamp).toISOString(),
        created_at: new Date(),
      });
    } catch (error) {
      // Tabela pode não existir
      console.log("[Analytics] Event:", {
        event,
        properties: sanitizedProperties,
      });
    }
  } catch (error) {
    console.error("[Analytics] Error tracking event:", error);
  }
}

/**
 * Obtém estatísticas agregadas de page views
 * @param days Número de dias para buscar
 */
export async function getPageViewStats(days: number = 30): Promise<{
  totalPageViews: number;
  uniquePaths: number;
  topPaths: Array<{ path: string; count: number }>;
  dailyViews: Array<{ date: string; count: number }>;
}> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Buscar page views do período
    const pageViews = await getDb()
      .schema("postspark")
      .from("analytics_pageviews")
      .where("created_at", ">=", since.toISOString())
      .select("path, created_at");

    if (!pageViews || pageViews.length === 0) {
      return {
        totalPageViews: 0,
        uniquePaths: 0,
        topPaths: [],
        dailyViews: [],
      };
    }

    // Contar total
    const totalPageViews = pageViews.length;

    // Contar paths únicos
    const pathCounts = new Map<string, number>();
    for (const pv of pageViews) {
      const path = (pv as { path: string }).path;
      pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
    }
    const uniquePaths = pathCounts.size;

    // Top paths
    const topPaths = Array.from(pathCounts.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Views por dia
    const dailyCounts = new Map<string, number>();
    for (const pv of pageViews) {
      const date = new Date((pv as { created_at: string }).created_at)
        .toISOString()
        .split("T")[0];
      dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
    }
    const dailyViews = Array.from(dailyCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalPageViews,
      uniquePaths,
      topPaths,
      dailyViews,
    };
  } catch (error) {
    console.error("[Analytics] Error getting page view stats:", error);
    return {
      totalPageViews: 0,
      uniquePaths: 0,
      topPaths: [],
      dailyViews: [],
    };
  }
}

/**
 * Obtém estatísticas de eventos
 * @param days Número de dias para buscar
 */
export async function getEventStats(days: number = 30): Promise<{
  totalEvents: number;
  topEvents: Array<{ event: string; count: number }>;
}> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const events = await getDb()
      .schema("postspark")
      .from("analytics_events")
      .where("created_at", ">=", since.toISOString())
      .select("event_name");

    if (!events || events.length === 0) {
      return {
        totalEvents: 0,
        topEvents: [],
      };
    }

    const totalEvents = events.length;

    const eventCounts = new Map<string, number>();
    for (const e of events) {
      const eventName = (e as { event_name: string }).event_name;
      eventCounts.set(eventName, (eventCounts.get(eventName) || 0) + 1);
    }

    const topEvents = Array.from(eventCounts.entries())
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEvents,
      topEvents,
    };
  } catch (error) {
    console.error("[Analytics] Error getting event stats:", error);
    return {
      totalEvents: 0,
      topEvents: [],
    };
  }
}

/**
 * Categoriza path para agregação
 */
function categorizePath(path: string): string {
  if (path === "/") return "home";
  if (path.startsWith("/pricing")) return "pricing";
  if (path.startsWith("/billing")) return "billing";
  if (path.startsWith("/privacy")) return "privacy";
  if (path.startsWith("/terms")) return "legal";
  if (path.startsWith("/cookies")) return "legal";
  if (path.includes("/post/")) return "post_detail";
  if (path.includes("/settings")) return "settings";
  return "other";
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
  ];

  for (const [key, value] of Object.entries(properties)) {
    const lowerKey = key.toLowerCase();

    // Verificar se é chave sensível
    if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
      continue;
    }

    // Limitar tamanho
    if (typeof value === "string") {
      sanitized[key] = value.length > 500 ? value.substring(0, 500) + "..." : value;
    } else if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        sanitized[key] = value.slice(0, 10);
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
 * Limpa dados antigos de analytics
 * @param daysToKeep Dias para manter (padrão: 90)
 */
export async function cleanupOldAnalyticsData(daysToKeep: number = 90): Promise<{
  pageViewsDeleted: number;
  eventsDeleted: number;
}> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    let pageViewsDeleted = 0;
    let eventsDeleted = 0;

    // Deletar page views antigos
    try {
      const pvResult = await getDb()
        .schema("postspark")
        .from("analytics_pageviews")
        .where("created_at", "<", cutoff.toISOString())
        .delete({ count: "exact" });

      pageViewsDeleted = pvResult.count || 0;
    } catch (error) {
      console.log("[Analytics] No old pageviews to delete or table doesn't exist");
    }

    // Deletar eventos antigos
    try {
      const eResult = await getDb()
        .schema("postspark")
        .from("analytics_events")
        .where("created_at", "<", cutoff.toISOString())
        .delete({ count: "exact" });

      eventsDeleted = eResult.count || 0;
    } catch (error) {
      console.log("[Analytics] No old events to delete or table doesn't exist");
    }

    return {
      pageViewsDeleted,
      eventsDeleted,
    };
  } catch (error) {
    console.error("[Analytics] Error cleaning up old data:", error);
    return {
      pageViewsDeleted: 0,
      eventsDeleted: 0,
    };
  }
}
