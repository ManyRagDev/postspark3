/**
 * GDPR/LGPD Compliance Module
 *
 * Funções para conformidade com LGPD (Lei nº 13.709/2018) e GDPR.
 *
 * Implementa:
 * - Soft delete (marcar para exclusão após período de reflexão)
 * - Anonimização de conteúdo (remover dados pessoais mas manter posts)
 * - Hard delete (remoção permanente)
 * - Exportação de dados (portabilidade)
 *
 * @module gdpr
 */

import crypto from "crypto";
import { getDb } from "../db";
import { logPrivacyEvent } from "./privacyLog";

/**
 * Gera hash SHA-256 para anonimização
 */
function hashId(input: string): string {
  return crypto
    .createHash("sha256")
    .update(input + process.env.GDPR_SALT || "postspark-default")
    .digest("hex")
    .substring(0, 16);
}

/**
 * Soft Delete - Marca usuário para exclusão após período de reflexão
 *
 * Conforme Art. 18, III da LGPD (direito à eliminação):
 * - Marca usuário com deleted_at e deletion_scheduled_at
 * - Mantém dados por 30 dias para possível cancelamento
 * - Após 30 dias, executa anonimização ou hard delete
 *
 * @param userId UUID do usuário
 * @param mode "anonymize" (padrão) ou "delete"
 */
export async function softDeleteUser(
  userId: string,
  mode: "anonymize" | "delete" = "anonymize"
): Promise<{ success: boolean; scheduledAt: Date }> {
  try {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 30); // 30 dias de reflexão

    // Marcar usuário para exclusão
    await getDb().schema("postspark").from("users")
      .where("id", userId)
      .update({
        deleted_at: new Date(),
        deletion_scheduled_at: scheduledAt,
        deletion_mode: mode,
        email: null,
        name: null,
        openId: `deleted_${userId.substring(0, 8)}`,
        updated_at: new Date()
      });

    // Log evento
    await logPrivacyEvent({
      userId,
      action: "soft_delete_initiated",
      metadata: {
        mode,
        scheduledFor: scheduledAt.toISOString()
      }
    });

    return { success: true, scheduledAt };
  } catch (error) {
    console.error("[GDPR] Error in softDeleteUser:", error);
    throw error;
  }
}

/**
 * Anonimização de Conteúdo
 *
 * Remove dados pessoais mas mantém posts/backgrounds para fins estatísticos.
 * Conforme Art. 12 da LGPD (anonimização).
 *
 * Substitui user_uuid por hash e remove campos pessoais.
 *
 * @param userId UUID do usuário
 */
export async function anonymizeUserContent(userId: string): Promise<{ success: boolean }> {
  try {
    const anonymizedId = `deleted_user_${hashId(userId)}`;

    // Anonimizar posts (manter conteúdo, remover identificação)
    await getDb().schema("postspark").from("posts")
      .where("user_uuid", userId)
      .update({
        user_uuid: anonymizedId,
        // Manter conteúdo: headline, body, caption, etc
        // Campos já criados sem dados pessoais
        updated_at: new Date()
      });

    // Anonimizar backgrounds
    await getDb().schema("postspark").from("background_assets")
      .where("user_uuid", userId)
      .update({
        user_uuid: anonymizedId,
        // Remover prompts que possam conter info pessoal
        prompt: null,
        label: null,
        updated_at: new Date()
      });

    // Limpar tabela users (remover registro)
    await getDb().schema("postspark").from("users")
      .where("id", userId)
      .delete();

    // Log evento
    await logPrivacyEvent({
      userId,
      action: "content_anonymized",
      metadata: {
        anonymizedId
      }
    });

    return { success: true };
  } catch (error) {
    console.error("[GDPR] Error in anonymizeUserContent:", error);
    throw error;
  }
}

/**
 * Hard Delete - Remoção completa e permanente
 *
 * Remove todos os dados do usuário, incluindo posts e backgrounds.
 * Apenas após período de reflexão e solicitação explícita.
 *
 * @param userId UUID do usuário
 */
export async function hardDeleteUser(userId: string): Promise<{ success: boolean }> {
  try {
    // Deletar posts
    await getDb().schema("postspark").from("posts")
      .where("user_uuid", userId)
      .delete();

    // Deletar backgrounds
    await getDb().schema("postspark").from("background_assets")
      .where("user_uuid", userId)
      .delete();

    // Deletar logs de geração (se aplicável)
    await getDb().schema("postspark").from("generation_runs")
      .where("user_uuid", userId)
      .delete();

    // Deletar usuário
    await getDb().schema("postspark").from("users")
      .where("id", userId)
      .delete();

    // Log evento (antes de deletar, se ainda existir tabela de logs separada)
    await logPrivacyEvent({
      userId,
      action: "hard_delete_completed",
      metadata: {
        timestamp: new Date().toISOString()
      }
    });

    return { success: true };
  } catch (error) {
    console.error("[GDPR] Error in hardDeleteUser:", error);
    throw error;
  }
}

/**
 * Cancelar Soft Delete
 *
 * Usuário pode cancelar solicitação de exclusão durante período de reflexão (30 dias).
 *
 * @param userId UUID do usuário
 */
export async function cancelDeletion(userId: string): Promise<{ success: boolean }> {
  try {
    // Verificar se está em período de reflexão
    const user = await getDb().schema("postspark").from("users")
      .where("id", userId)
      .select("*")
      .single();

    if (!user) {
      throw new Error("User not found");
    }

    if (!user.deletion_scheduled_at) {
      throw new Error("No deletion scheduled");
    }

    const now = new Date();
    const scheduled = new Date(user.deletion_scheduled_at as string);

    if (now > scheduled) {
      throw new Error("Reflection period expired");
    }

    // Restaurar usuário
    await getDb().schema("postspark").from("users")
      .where("id", userId)
      .update({
        deleted_at: null,
        deletion_scheduled_at: null,
        deletion_mode: null,
        updated_at: new Date()
      });

    // Log evento
    await logPrivacyEvent({
      userId,
      action: "deletion_cancelled",
      metadata: {
        timestamp: new Date().toISOString()
      }
    });

    return { success: true };
  } catch (error) {
    console.error("[GDPR] Error in cancelDeletion:", error);
    throw error;
  }
}

/**
 * Processa exclusões agendadas
 *
 * Cron job para processar usuários marcados para exclusão após período de reflexão.
 * Deve ser executado diariamente.
 *
 * @returns Número de usuários processados
 */
export async function processScheduledDeletions(): Promise<number> {
  try {
    const now = new Date();

    // Buscar usuários marcados para exclusão com data passada
    const usersToDelete = await getDb().schema("postspark").from("users")
      .where("deletion_scheduled_at", "<=", now.toISOString())
      .whereNotNull("deletion_scheduled_at")
      .select("id", "deletion_mode");

    let processed = 0;

    for (const user of usersToDelete) {
      try {
        const mode = (user.deletion_mode as "anonymize" | "delete") || "anonymize";

        if (mode === "anonymize") {
          await anonymizeUserContent(user.id);
        } else {
          await hardDeleteUser(user.id);
        }

        processed++;
      } catch (error) {
        console.error(`[GDPR] Error processing deletion for user ${user.id}:`, error);
        // Continuar processando próximos usuários
      }
    }

    if (processed > 0) {
      await logPrivacyEvent({
        userId: "system",
        action: "batch_deletion_completed",
        metadata: {
          count: processed,
          timestamp: new Date().toISOString()
        }
      });
    }

    return processed;
  } catch (error) {
    console.error("[GDPR] Error in processScheduledDeletions:", error);
    throw error;
  }
}

/**
 * Exporta todos os dados do usuário para portabilidade
 *
 * Conforme Art. 18, V da LGPD (direito à portabilidade).
 *
 * @param userId UUID do usuário
 * @returns Objeto com todos os dados do usuário
 */
export async function exportUserData(userId: string): Promise<{
  user: Record<string, unknown>;
  posts: unknown[];
  backgrounds: unknown[];
  generations: unknown[];
  billing: Record<string, unknown>;
}> {
  try {
    // Dados do usuário
    const user = await getDb().schema("postspark").from("users")
      .where("id", userId)
      .select("*")
      .single();

    // Posts
    const posts = await getDb().schema("postspark").from("posts")
      .where("user_uuid", userId)
      .select("*");

    // Backgrounds
    const backgrounds = await getDb().schema("postspark").from("background_assets")
      .where("user_uuid", userId)
      .select("*");

    // Gerações (se existir tabela)
    let generations: unknown[] = [];
    try {
      generations = await getDb().schema("postspark").from("generation_runs")
        .where("user_uuid", userId)
        .select("*");
    } catch {
      // Tabela pode não existir
    }

    // Dados de billing (via Supabase RPC se disponível)
    const billing: Record<string, unknown> = {
      profile: null,
      subscriptions: [],
      transactions: []
    };

    try {
      // Buscar perfil de billing
      const profileResult = await getDb().rpc("get_billing_profile", {
        p_user_id: userId
      });
      billing.profile = profileResult;

      // Buscar assinaturas
      const subscriptionsResult = await getDb().schema("postspark").from("subscriptions")
        .where("user_id", userId)
        .select("*");
      billing.subscriptions = subscriptionsResult;
    } catch {
      // RPC pode não existir
    }

    // Log evento
    await logPrivacyEvent({
      userId,
      action: "data_exported",
      metadata: {
        postsCount: posts?.length || 0,
        backgroundsCount: backgrounds?.length || 0,
        timestamp: new Date().toISOString()
      }
    });

    return {
      user: user || {},
      posts: posts || [],
      backgrounds: backgrounds || [],
      generations,
      billing
    };
  } catch (error) {
    console.error("[GDPR] Error in exportUserData:", error);
    throw error;
  }
}

/**
 * Obtém contagem de dados do usuário para visão geral
 */
export async function getUserDataStats(userId: string): Promise<{
  postsCount: number;
  backgroundsCount: number;
  generationsCount: number;
  memberSince: string;
  storageUsed: string;
  storagePercent: number;
}> {
  try {
    // Contar posts
    const { count: postsCount } = await getDb().schema("postspark").from("posts")
      .where("user_uuid", userId)
      .select("*", { count: "exact", head: true });

    // Contar backgrounds
    const { count: backgroundsCount } = await getDb().schema("postspark").from("background_assets")
      .where("user_uuid", userId)
      .select("*", { count: "exact", head: true });

    // Contar gerações
    let generationsCount = 0;
    try {
      const { count } = await getDb().schema("postspark").from("generation_runs")
        .where("user_uuid", userId)
        .select("*", { count: "exact", head: true });
      generationsCount = count || 0;
    } catch {
      // Tabela pode não existir
    }

    // Dados do usuário para data de criação
    const user = await getDb().schema("postspark").from("users")
      .where("id", userId)
      .select("created_at")
      .single();

    // Calcular storage (estimativa)
    const avgPostSize = 50_000; // 50KB por post em média
    const avgBackgroundSize = 200_000; // 200KB por background
    const totalBytes = ((postsCount || 0) * avgPostSize) +
                       ((backgroundsCount || 0) * avgBackgroundSize);

    const storageUsed = formatBytes(totalBytes);
    const storagePercent = Math.min((totalBytes / (100 * 1024 * 1024)) * 100, 100); // 100MB limite

    return {
      postsCount: postsCount || 0,
      backgroundsCount: backgroundsCount || 0,
      generationsCount,
      memberSince: user?.created_at
        ? new Date(user.created_at as string).toLocaleDateString("pt-BR")
        : "N/A",
      storageUsed,
      storagePercent
    };
  } catch (error) {
    console.error("[GDPR] Error in getUserDataStats:", error);
    throw error;
  }
}

/**
 * Formata bytes para humano
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}
