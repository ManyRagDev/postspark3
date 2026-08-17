import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { runVerification } from "../verifyRuntime";

// Cache curto (60s): o health pode ser chamado com frequência e as sondas
// remotas custam round-trips. Em dev sem credenciais, as sondas são no-ops.
let cachedAt = 0;
let cachedResult: Awaited<ReturnType<typeof runVerification>> | null = null;
const CACHE_TTL_MS = 60_000;

async function runtimeHealth() {
  const now = Date.now();
  if (!cachedResult || now - cachedAt > CACHE_TTL_MS) {
    cachedResult = await runVerification();
    cachedAt = now;
  }
  return cachedResult;
}

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(async () => {
      const verification = await runtimeHealth();

      if (verification.remote.mode === "not_configured") {
        return {
          ok: true,
          mode: "dev" as const,
          note: "SUPABASE_URL/SERVICE_ROLE_KEY ausentes — ambiente de desenvolvimento; execute npm run verify:runtime para auditoria completa.",
        };
      }

      const critical = verification.remote.results.filter(
        (result) => result.critical && (result.status === "absent" || result.status === "incompatible"),
      );
      const issues = critical.map(
        (result) =>
          `[${result.status}] ${result.requirement}${result.detail ? ` — ${result.detail.slice(0, 140)}` : ""}`,
      );

      return {
        ok: issues.length === 0,
        mode: "probed" as const,
        issues,
        // Mensagem acionável sem expor segredos.
        action: issues.length > 0
          ? "Requisito crítico ausente/incompatível. Consulte npm run verify:runtime (relatório JSON em verify-output/) e aplique a migration corretiva drizzle/0015_harden_manifest_corrective.sql com autorização do dono."
          : undefined,
      };
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
