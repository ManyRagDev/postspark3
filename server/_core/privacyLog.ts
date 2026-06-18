/**
 * Privacy Logging Module
 *
 * Sistema de logging para eventos de privacidade conforme LGPD.
 * Registra consentimentos, acessos, exportações e solicitações de exclusão.
 *
 * @module privacyLog
 */

import { getDb } from "../db";

/**
 * Evento de privacidade logado
 */
interface PrivacyEvent {
  userId: string;
  action: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Log de evento de privacidade
 *
 * Registra eventos como:
 * - consent_given: Usuário aceitou política
 * - consent_revoked: Usuário revogou consentimento
 * - data_exported: Dados exportados pelo usuário
 * - soft_delete_initiated: Solicitação de exclusão iniciada
 * - content_anonymized: Conteúdo anonimizado
 * - hard_delete_completed: Exclusão permanente concluída
 * - deletion_cancelled: Exclusão cancelada pelo usuário
 * - admin_data_access: Admin acessou dados de usuário
 *
 * @param event Evento a ser logado
 */
export async function logPrivacyEvent(event: PrivacyEvent): Promise<void> {
  try {
    const { userId, action, timestamp = new Date(), metadata = {} } = event;

    // Sanitizar metadata para não incluir dados sensíveis
    const sanitizedMetadata = sanitizeMetadata(metadata);

    // Inserir em tabela de logs (se existir)
    try {
      await getDb().schema("postspark").from("privacy_logs").insert({
        user_id: userId,
        action,
        timestamp: timestamp.toISOString(),
        metadata: sanitizedMetadata,
        created_at: new Date()
      });
    } catch (error) {
      // Tabela pode não existir ainda, usar console como fallback
      console.log("[PrivacyLog]", {
        userId,
        action,
        timestamp: timestamp.toISOString(),
        metadata: sanitizedMetadata
      });

      // Criar tabela se não existir (em dev)
      if (process.env.NODE_ENV === "development") {
        console.warn("[PrivacyLog] Table privacy_logs does not exist. Create it for proper logging.");
      }
    }
  } catch (error) {
    console.error("[PrivacyLog] Error logging event:", error);
    // Não throw para não quebrar operação principal
  }
}

/**
 * Remove dados sensíveis do metadata antes de logar
 */
function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ["password", "token", "apiKey", "secret", "creditCard", "ssn", "cpf"];

  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();

    // Verificar se é chave sensível
    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive.toLowerCase()))) {
      sanitized[key] = "[REDACTED]";
      continue;
    }

    // Sanitizar objetos recursivamente
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === "object" && item !== null
          ? sanitizeMetadata(item as Record<string, unknown>)
          : item
      );
    } else if (typeof value === "string") {
      // Truncar strings longas
      sanitized[key] = value.length > 1000 ? value.substring(0, 1000) + "...[truncated]" : value;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Busca logs de privacidade de um usuário
 *
 * @param userId UUID do usuário
 * @param limit Limite de registros
 */
export async function getPrivacyLogs(
  userId: string,
  limit: number = 50
): Promise<Array<{ action: string; timestamp: string; metadata: Record<string, unknown> }>> {
  try {
    const logs = await getDb().schema("postspark").from("privacy_logs")
      .where("user_id", userId)
      .select("action", "timestamp", "metadata")
      .orderBy("created_at", { ascending: false })
      .limit(limit);

    return logs || [];
  } catch (error) {
    console.error("[PrivacyLog] Error fetching logs:", error);
    return [];
  }
}

/**
 * Log de acesso de admin a dados de usuário
 *
 * Conforme Art. 15 da LGPD (dever de transparência).
 *
 * @param adminId UUID do admin
 * @param targetUserId UUID do usuário cujos dados foram acessados
 * @param reason Motivo do acesso
 */
export async function logAdminDataAccess(
  adminId: string,
  targetUserId: string,
  reason: string
): Promise<void> {
  await logPrivacyEvent({
    userId: targetUserId,
    action: "admin_data_access",
    metadata: {
      adminId,
      reason,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Log de consentimento (aceitação)
 *
 * @param userId UUID do usuário
 * @param version Versão do documento aceito
 * @param aiImprovements Consentimento para melhorias de IA
 */
export async function logConsentGiven(
  userId: string,
  version: string,
  aiImprovements: boolean
): Promise<void> {
  await logPrivacyEvent({
    userId,
    action: "consent_given",
    metadata: {
      version,
      aiImprovements,
      ipAddress: "[REDACTED]", // IP não armazenado por padrão
      userAgent: "[REDACTED]"
    }
  });
}

/**
 * Log de revogação de consentimento
 *
 * @param userId UUID do usuário
 * @param fields Campos do consentimento revogados
 */
export async function logConsentRevoked(
  userId: string,
  fields: string[]
): Promise<void> {
  await logPrivacyEvent({
    userId,
    action: "consent_revoked",
    metadata: {
      fields
    }
  });
}
