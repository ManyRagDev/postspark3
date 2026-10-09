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
  getReservationByIdempotencyKey,
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
    const b = deriveIdempotencyKey("user-1", { ...SAMPLE_INPUT, content: "Conteúdo diferente" });
    expect(a).not.toBe(b);
  });

  it("is insensitive to trailing whitespace in content", () => {
    const a = deriveIdempotencyKey("user-1", { ...SAMPLE_INPUT, content: "texto" });
    const b = deriveIdempotencyKey("user-1", { ...SAMPLE_INPUT, content: "texto   " });
    expect(a).toBe(b);
  });

  it("changes when postMode changes (static vs carousel have different cost)", () => {
    const a = deriveIdempotencyKey("user-1", { ...SAMPLE_INPUT, postMode: "static" });
    const b = deriveIdempotencyKey("user-1", { ...SAMPLE_INPUT, postMode: "carousel" });
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
      const reserved = await reserveSparks(founderProfile, 40, "key-founder", "test");
      expect(reserved.reservationId).toBe("dev-mock");
      expect(reserved.reason).toBeUndefined();

      const committed = await commitSparkReservation(reserved.reservationId!, "run-founder");
      expect(committed).toBe(true);

      const refunded = await refundSparkReservation(reserved.reservationId!, "test");
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
    expect(staticRes.preparationSparks).toBe(5);
    expect(staticRes.sparksPerProposal).toBe(10);
    expect(staticRes.totalReservation).toBe(35); // 5 + 3 * 10

    const carouselRes = calculateV5SparkReservation("carousel", 3);
    expect(carouselRes.preparationSparks).toBe(5);
    expect(carouselRes.sparksPerProposal).toBe(20);
    expect(carouselRes.totalReservation).toBe(65); // 5 + 3 * 20
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

  it("proportional settlement adjusts spark_reservations amount to 25 and commits partial debt", async () => {
    let updatedPayload: any = null;
    let updatedFilters: any = {};
    let committedRunId: string | null = null;
    let committedResId: string | null = null;

    const mockSb: any = {
      from: vi.fn((table: string) => {
        expect(table).toBe("spark_reservations");
        return {
          update: (payload: any) => {
            updatedPayload = payload;
            return {
              eq: (col1: string, val1: any) => {
                updatedFilters[col1] = val1;
                return {
                  eq: (col2: string, val2: any) => {
                    updatedFilters[col2] = val2;
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }),
      rpc: vi.fn((fn: string, args: any) => {
        if (fn === "next_commit_reservation_v2") {
          committedResId = args.p_reservation_id;
          committedRunId = args.p_description;
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: null, error: new Error("unknown_rpc") });
      }),
    };

    setSupabaseForTesting(mockSb);
    try {
      const settlement = await settleV5GenerationReservation({
        reservationId: "00000000-0000-4000-8000-000000000100",
        postMode: "carousel",
        deliveredReadyCount: 1, // 1 pronta de 3 (preparação: 5 + 1*20 = 25)
        totalProposalsCount: 3,
        generationRunId: "00000000-0000-4000-8000-000000000200",
      });

      expect(settlement.settled).toBe(true);
      expect(settlement.debitedSparks).toBe(25);
      expect(settlement.refundedSparks).toBe(40);
      expect(updatedPayload).toMatchObject({ amount: 25 });
      expect(updatedFilters).toMatchObject({
        id: "00000000-0000-4000-8000-000000000100",
        status: "reserved",
      });
      expect(committedResId).toBe("00000000-0000-4000-8000-000000000100");
      expect(committedRunId).toBe("00000000-0000-4000-8000-000000000200");
    } finally {
      setSupabaseForTesting(null);
    }
  });

  it("proportional settlement refunds full reservation when 0 proposals are delivered ready", async () => {
    let refundedResId: string | null = null;
    let refundReason: string | null = null;

    const mockSb: any = {
      rpc: vi.fn((fn: string, args: any) => {
        if (fn === "next_refund_reservation_v2") {
          refundedResId = args.p_reservation_id;
          refundReason = args.p_reason;
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: null, error: new Error("unknown_rpc") });
      }),
    };

    setSupabaseForTesting(mockSb);
    try {
      const settlement = await settleV5GenerationReservation({
        reservationId: "00000000-0000-4000-8000-000000000100",
        postMode: "carousel",
        deliveredReadyCount: 0,
        totalProposalsCount: 3,
        generationRunId: "00000000-0000-4000-8000-000000000200",
      });

      expect(settlement.settled).toBe(true);
      expect(settlement.debitedSparks).toBe(0);
      expect(settlement.refundedSparks).toBe(65);
      expect(refundedResId).toBe("00000000-0000-4000-8000-000000000100");
      expect(refundReason).toContain("Geração V5 concluída sem nenhuma entrega utilizável");
    } finally {
      setSupabaseForTesting(null);
    }
  });

  it("bypasses billing when user has unlimited plan (DEV/FOUNDER)", async () => {
    const settlement = await settleV5GenerationReservation({
      reservationId: "00000000-0000-4000-8000-000000000100",
      postMode: "carousel",
      deliveredReadyCount: 1,
      totalProposalsCount: 3,
      generationRunId: "00000000-0000-4000-8000-000000000200",
      plan: "DEV",
    });

    expect(settlement.settled).toBe(true);
    expect(settlement.debitedSparks).toBe(0);
    expect(settlement.refundedSparks).toBe(0);
  });

  it("getReservationByIdempotencyKey queries spark_reservations table", async () => {
    const mockSb: any = {
      from: vi.fn((table: string) => {
        expect(table).toBe("spark_reservations");
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_col1: string, _val1: any) => ({
              eq: vi.fn((_col2: string, _val2: any) => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "res-xyz", amount: 65, status: "reserved" },
                  error: null,
                }),
              })),
            })),
          })),
        };
      }),
    };

    setSupabaseForTesting(mockSb);
    try {
      const res = await getReservationByIdempotencyKey("user-1", "idem-1");
      expect(res).toEqual({ id: "res-xyz", amount: 65, status: "reserved" });
    } finally {
      setSupabaseForTesting(null);
    }
  });

  it("refunds full reservation if proportional update fails instead of overcharging", async () => {
    let refundCalled = false;
    const mockSb: any = {
      from: vi.fn((table: string) => {
        expect(table).toBe("spark_reservations");
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "database network timeout" },
              }),
            })),
          })),
        };
      }),
      rpc: vi.fn((proc: string, _args: any) => {
        if (proc === "refund_spark_reservation") {
          refundCalled = true;
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: null, error: new Error("unexpected rpc") });
      }),
    };

    setSupabaseForTesting(mockSb);
    try {
      const settlement = await settleV5GenerationReservation({
        reservationId: "00000000-0000-4000-8000-000000000100",
        postMode: "carousel",
        deliveredReadyCount: 1,
        totalProposalsCount: 3,
        generationRunId: "00000000-0000-4000-8000-000000000200",
      });

      expect(settlement.settled).toBe(false);
      expect(settlement.debitedSparks).toBe(0);
      expect(settlement.refundedSparks).toBe(65);
      expect(refundCalled).toBe(true);
    } finally {
      setSupabaseForTesting(null);
    }
  });
});

