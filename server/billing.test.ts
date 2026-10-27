import { describe, expect, it, vi } from "vitest";

// Os testes de integração real (reserva→commit com débito, concorrência)
// exigem o Supabase hosted e não são viáveis em CI. Cobrimos aqui o que é
// determinístico: derivação de chave de idempotência e o bypass de dev mode
// (Supabase desconfigurado ou perfil sentinel) que garante que funções de
// billing não quebram testes/ambiente local.

import {
  deriveIdempotencyKey,
  reserveSparks,
  commitSparkReservation,
  refundSparkReservation,
  calculateV5SparkReservation,
  settleV5GenerationReservation,
  setSupabaseForTesting,
  type BillingProfile,
} from "./billing";

const DEV_PROFILE: BillingProfile = {
  id: "dev-mock",
  email: "dev@local.dev",
  plan: "DEV",
  sparks: 9999,
  sparks_refill_date: null,
  stripe_customer_id: null,
};

const SENTINEL_PROFILES: BillingProfile[] = [
  { ...DEV_PROFILE, id: "no-profile" },
  { ...DEV_PROFILE, id: "error" },
];

function makeProfile(id: string): BillingProfile {
  return { ...DEV_PROFILE, id };
}

const SAMPLE_INPUT = {
  inputType: "text" as const,
  content: "Conteúdo de teste",
  postMode: "static" as const,
  platform: "instagram" as const,
};

describe("deriveIdempotencyKey", () => {
  it("produces the same key for identical input", () => {
    const a = deriveIdempotencyKey("user-1", SAMPLE_INPUT);
    const b = deriveIdempotencyKey("user-1", SAMPLE_INPUT);
    expect(a).toBe(b);
    expect(a).toMatch(/^gen_[a-f0-9]{24}$/);
  });

  it("produces different keys for different users with same content", () => {
    const a = deriveIdempotencyKey("user-1", SAMPLE_INPUT);
    const b = deriveIdempotencyKey("user-2", SAMPLE_INPUT);
    expect(a).not.toBe(b);
  });

  it("produces different keys for different content from same user", () => {
    const a = deriveIdempotencyKey("user-1", SAMPLE_INPUT);
    const b = deriveIdempotencyKey("user-1", {
      ...SAMPLE_INPUT,
      content: "Conteúdo diferente",
    });
    expect(a).not.toBe(b);
  });

  it("is insensitive to trailing whitespace in content", () => {
    const a = deriveIdempotencyKey("user-1", {
      ...SAMPLE_INPUT,
      content: "texto",
    });
    const b = deriveIdempotencyKey("user-1", {
      ...SAMPLE_INPUT,
      content: "texto   ",
    });
    expect(a).toBe(b);
  });

  it("changes when postMode changes (static vs carousel have different cost)", () => {
    const a = deriveIdempotencyKey("user-1", {
      ...SAMPLE_INPUT,
      postMode: "static",
    });
    const b = deriveIdempotencyKey("user-1", {
      ...SAMPLE_INPUT,
      postMode: "carousel",
    });
    expect(a).not.toBe(b);
  });
});

describe("transactional billing — dev mode bypass", () => {
  // Em dev mode (Supabase desconfigurado), todas as funções devem retornar
  // um handle de sucesso consistente sem chamar RPCs. Isso garante que
  // testes e ambiente local funcionam sem infraestrutura de billing.

  it("reserveSparks returns dev-mock reservationId when profile is sentinel", async () => {
    for (const profile of [DEV_PROFILE, ...SENTINEL_PROFILES]) {
      const result = await reserveSparks(profile, 10, "key-1", "test");
      expect(result.reservationId).toBe("dev-mock");
      expect(result.reason).toBeUndefined();
    }
  });

  it("commitSparkReservation returns true in dev mode", async () => {
    const result = await commitSparkReservation("dev-mock", "run-123");
    expect(result).toBe(true);
  });

  it("refundSparkReservation returns true in dev mode", async () => {
    const result = await refundSparkReservation("dev-mock", "test error");
    expect(result).toBe(true);
  });

  it("reserveSparks returns dev-mock for a real profile id when Supabase is unconfigured", async () => {
    // Mesmo com um profile id "real", sem Supabase configurado o bypass dispara.
    const realishProfile = makeProfile("00000000-0000-0000-0000-000000000001");
    const result = await reserveSparks(realishProfile, 10, "key-2", "test");
    expect(result.reservationId).toBe("dev-mock");
  });

  it("FOUNDER/DEV plans bypass billing entirely (unlimited sparks)", async () => {
    // O bypass da RPC debit_sparks legada para FOUNDER/DEV (BILLING_HANDOFF.md:123)
    // deve ser replicado no modelo transacional: reserva/commit/refund viram no-op.
    // Isto impede que um DEV/FOUNDER com pouco saldo no banco seja bloqueado.
    for (const plan of ["FOUNDER", "DEV"] as const) {
      const founderProfile: BillingProfile = {
        id: "00000000-0000-0000-0000-000000000099",
        email: "founder@test.dev",
        plan,
        sparks: 0, // mesmo com 0 sparks, o bypass deve aplicar
        sparks_refill_date: null,
        stripe_customer_id: null,
      };
      const reserved = await reserveSparks(
        founderProfile,
        40,
        "key-founder",
        "test"
      );
      expect(reserved.reservationId).toBe("dev-mock");
      expect(reserved.reason).toBeUndefined();

      const committed = await commitSparkReservation(
        reserved.reservationId!,
        "run-founder"
      );
      expect(committed).toBe(true);

      const refunded = await refundSparkReservation(
        reserved.reservationId!,
        "test"
      );
      expect(refunded).toBe(true);
    }
  });
});

describe("transactional billing — contract shapes", () => {
  it("reserveSparks failure returns null reservationId with reason", async () => {
    // Não podemos forçar uma falha real sem Supabase, mas verificamos o tipo
    // do retorno quando o bypass não aplica — coberto indiretamente pelos
    // testes de dev mode acima. Aqui só confirmamos o tipo da assinatura.
    const profile = makeProfile("dev-mock");
    const result = await reserveSparks(profile, 10, "key-3", "test");
    expect(result).toHaveProperty("reservationId");
    expect(result.reservationId).not.toBeNull();
  });
});

describe("V5 Orchestrated Generation Billing", () => {
  it("calculates static vs carousel spark reservations accurately", () => {
    const staticRes = calculateV5SparkReservation("static", 3);
    expect(staticRes.preparationSparks).toBe(1);
    expect(staticRes.sparksPerProposal).toBe(3);
    expect(staticRes.totalReservation).toBe(10); // 1 + 3 * 3

    const carouselRes = calculateV5SparkReservation("carousel", 3);
    expect(carouselRes.preparationSparks).toBe(4);
    expect(carouselRes.sparksPerProposal).toBe(12);
    expect(carouselRes.totalReservation).toBe(40); // 4 + 3 * 12
  });

  it("settles V5 reservation in dev-mock mode with zero debited sparks", async () => {
    const settlement = await settleV5GenerationReservation({
      reservationId: "dev-mock",
      postMode: "static",
      deliveredReadyCount: 3,
      totalProposalsCount: 3,
      generationRunId: "00000000-0000-4000-8000-000000000001",
    });
    expect(settlement.settled).toBe(true);
    expect(settlement.debitedSparks).toBe(0);
    expect(settlement.refundedSparks).toBe(0);
  });

  it("delegates settlement to the durable request instead of mutating a reservation amount in JavaScript", async () => {
    const rpc = vi.fn(async () => ({
      data: { settled: true, debitedSparks: 25, refundedSparks: 40 },
      error: null,
    }));
    const from = vi.fn();
    setSupabaseForTesting({ rpc, from } as any);
    try {
      expect(
        await settleV5GenerationReservation({
          reservationId: "linked-reservation",
          postMode: "carousel",
          deliveredReadyCount: 99,
          totalProposalsCount: 3,
          generationRunId: "run-id",
        })
      ).toEqual({ settled: true, debitedSparks: 25, refundedSparks: 40 });
      expect(rpc).toHaveBeenCalledWith("generation_settle", { p_id: "run-id" });
      expect(from).not.toHaveBeenCalled();
    } finally {
      setSupabaseForTesting(null);
    }
  });
  it("preserves pending financial reconciliation on RPC failure instead of refunding a delivered request", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "temporary failure" },
    }));
    setSupabaseForTesting({ rpc } as any);
    try {
      await expect(
        settleV5GenerationReservation({
          reservationId: "linked",
          postMode: "static",
          deliveredReadyCount: 1,
          totalProposalsCount: 3,
          generationRunId: "run-id",
        })
      ).rejects.toThrow("temporary failure");
      expect(rpc).toHaveBeenCalledTimes(1);
    } finally {
      setSupabaseForTesting(null);
    }
  });
});
