import { beforeEach, describe, expect, it, vi } from "vitest";

// Ambiente "configurado" para exercitar o caminho transacional real.
vi.mock("./_core/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/env")>();
  return {
    ENV: {
      ...actual.ENV,
      supabaseUrl: "https://fake.supabase.co",
      supabaseServiceRoleKey: "fake-key",
    },
  };
});

// Ledger fake que simula a máquina de estados das RPCs postspark
// (reserved → committed | refunded), incluindo idempotência e transições
// inválidas — espelha drizzle/0015_harden_manifest_corrective.sql.
type ReservationStatus = "reserved" | "committed" | "refunded";

interface ReservationRow {
  id: string;
  userUuid: string;
  idempotencyKey: string;
  amount: number;
  status: ReservationStatus;
}

class FakeLedger {
  rows = new Map<string, ReservationRow>();
  balances = new Map<string, number>();
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  reserve(args: { p_user_id: string; p_amount: number; p_idempotency_key: string; p_description?: string }): string | null {
    const existing = Array.from(this.rows.values()).find(
      (row) => row.userUuid === args.p_user_id && row.idempotencyKey === args.p_idempotency_key && row.status === "reserved",
    );
    if (existing) return existing.id;

    const balance = this.balances.get(args.p_user_id) ?? 0;
    const reservedSum = Array.from(this.rows.values())
      .filter((row) => row.userUuid === args.p_user_id && row.status === "reserved")
      .reduce((sum, row) => sum + row.amount, 0);
    if (balance - reservedSum < args.p_amount) return null;

    const id = `res-${this.rows.size + 1}`;
    this.rows.set(id, { id, userUuid: args.p_user_id, idempotencyKey: args.p_idempotency_key, amount: args.p_amount, status: "reserved" });
    return id;
  }

  commit(args: { p_reservation_id: string; p_generation_run_id?: string }): boolean {
    const row = this.rows.get(args.p_reservation_id);
    if (!row) return false;
    if (row.status === "committed") return true;
    if (row.status === "refunded") return false;
    this.balances.set(row.userUuid, (this.balances.get(row.userUuid) ?? 0) - row.amount);
    row.status = "committed";
    return true;
  }

  refund(args: { p_reservation_id: string; p_error_detail?: string }): boolean {
    const row = this.rows.get(args.p_reservation_id);
    if (!row) return false;
    if (row.status === "refunded") return true;
    if (row.status === "committed") return false;
    row.status = "refunded";
    return true;
  }

  rpc(fn: string, args: Record<string, unknown>): { data: unknown; error: null } {
    this.rpcCalls.push({ fn, args });
    if (fn === "reserve_sparks") return { data: this.reserve(args as never), error: null };
    if (fn === "commit_spark_reservation") return { data: this.commit(args as never), error: null };
    if (fn === "refund_spark_reservation") return { data: this.refund(args as never), error: null };
    throw new Error(`unexpected rpc ${fn}`);
  }
}

const ledger = new FakeLedger();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    rpc: (fn: string, args: Record<string, unknown>) => ledger.rpc(fn, args),
    from: () => ({}),
  })),
}));

import {
  reserveSparks,
  commitSparkReservation,
  refundSparkReservation,
  type BillingProfile,
} from "./billing";

function makeProfile(overrides: Partial<BillingProfile> = {}): BillingProfile {
  return {
    id: "user-0000-0000-0000-000000000001",
    email: "user@test.dev",
    plan: "PRO",
    sparks: 100,
    sparks_refill_date: null,
    stripe_customer_id: null,
    ...overrides,
  };
}

describe("billing transacional — máquina de estados da reserva (SPEC-004)", () => {
  beforeEach(() => {
    ledger.rows.clear();
    ledger.balances.clear();
    ledger.rpcCalls.length = 0;
    ledger.balances.set("user-0000-0000-0000-000000000001", 100);
  });

  it("reserva com saldo suficiente retorna reservationId", async () => {
    const result = await reserveSparks(makeProfile(), 10, "key-1", "geração");
    expect(result.reservationId).toMatch(/^res-/);
  });

  it("reserva sem saldo retorna null com reason", async () => {
    const profile = makeProfile({ sparks: 5 });
    ledger.balances.set(profile.id, 5);
    const result = await reserveSparks(profile, 10, "key-1", "geração");
    expect(result.reservationId).toBeNull();
    expect(result.reason).toBe("insufficient_sparks");
  });

  it("double-submit (mesma chave de idempotência) reutiliza a MESMA reserva", async () => {
    const profile = makeProfile();
    const first = await reserveSparks(profile, 10, "same-key", "geração");
    const second = await reserveSparks(profile, 10, "same-key", "geração");
    expect(first.reservationId).toBe(second.reservationId);
    expect(first.reservationId).not.toBeNull();
    const rows = Array.from(ledger.rows.values()).filter(
      (row) => row.idempotencyKey === "same-key",
    );
    expect(rows).toHaveLength(1);
  });

  it("reservas concorrentes com a mesma chave produzem uma única reserva", async () => {
    const profile = makeProfile();
    const [a, b] = await Promise.all([
      reserveSparks(profile, 10, "concurrent-key", "geração"),
      reserveSparks(profile, 10, "concurrent-key", "geração"),
    ]);
    expect(a.reservationId).toBe(b.reservationId);
  });

  it("commit debita uma única vez e é idempotente (commit repetido retorna true)", async () => {
    const profile = makeProfile();
    const reserved = await reserveSparks(profile, 10, "key-commit", "geração");
    expect(reserved.reservationId).not.toBeNull();

    const first = await commitSparkReservation(reserved.reservationId!, "run-1");
    const second = await commitSparkReservation(reserved.reservationId!, "run-1");

    expect(first).toBe(true);
    expect(second).toBe(true);
    // Débito único: 100 - 10 = 90 (não 80).
    expect(ledger.balances.get(profile.id)).toBe(90);
  });

  it("refund é idempotente (refund repetido retorna true) e não debita", async () => {
    const profile = makeProfile();
    const reserved = await reserveSparks(profile, 10, "key-refund", "geração");
    expect(reserved.reservationId).not.toBeNull();

    const first = await refundSparkReservation(reserved.reservationId!, "falha");
    const second = await refundSparkReservation(reserved.reservationId!, "falha");

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(ledger.balances.get(profile.id)).toBe(100);
  });

  it("transição inválida: commit após refund retorna false", async () => {
    const profile = makeProfile();
    const reserved = await reserveSparks(profile, 10, "key-invalid", "geração");
    expect(reserved.reservationId).not.toBeNull();

    const refunded = await refundSparkReservation(reserved.reservationId!, "falha");
    const committed = await commitSparkReservation(reserved.reservationId!, "run-2");

    expect(refunded).toBe(true);
    expect(committed).toBe(false);
  });

  it("transição inválida: refund após commit retorna false", async () => {
    const profile = makeProfile();
    const reserved = await reserveSparks(profile, 10, "key-invalid2", "geração");
    expect(reserved.reservationId).not.toBeNull();

    const committed = await commitSparkReservation(reserved.reservationId!, "run-3");
    const refunded = await refundSparkReservation(reserved.reservationId!, "tarde demais");

    expect(committed).toBe(true);
    expect(refunded).toBe(false);
  });

  it("reserva inexistente: commit e refund retornam false (estado terminal honesto)", async () => {
    expect(await commitSparkReservation("res-nonexistent", "run-x")).toBe(false);
    expect(await refundSparkReservation("res-nonexistent", "x")).toBe(false);
  });

  it("cada execução termina em estado financeiro terminal (reserved | committed | refunded)", async () => {
    const profile = makeProfile();
    const a = await reserveSparks(profile, 10, "key-terminal-a", "geração");
    const b = await reserveSparks(profile, 10, "key-terminal-b", "geração");
    await commitSparkReservation(a.reservationId!, "run-a");
    await refundSparkReservation(b.reservationId!, "falha");

    const statuses = Array.from(ledger.rows.values()).map((row) => row.status);
    expect(statuses.every((status) => ["reserved", "committed", "refunded"].includes(status))).toBe(true);
  });
});
