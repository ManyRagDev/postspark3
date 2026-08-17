/**
 * billing.ts — PostSpark billing module
 *
 * Responsabilidades:
 * - Cliente Stripe + helpers de checkout
 * - Cliente Supabase service role para leitura/escrita de billing data
 * - Funções que chamam as stored functions do schema postspark
 *
 * Bridge email: o app usa auth própria (integer IDs), o Supabase billing usa
 * UUIDs de auth.users. A ponte entre os dois sistemas é o e-mail do usuário.
 */

import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { ENV } from "./_core/env";

// ─── Spark costs (keep in sync with BILLING_HANDOFF.md) ──────────────────────
export const SPARK_COSTS = {
  GENERATE_TEXT: 10,   // 3 variações de texto
  GENERATE_IMAGE: 25,  // imagem IA
  REGEN_IMAGE: 10,     // regenerar imagem (mesma sessão)
  CHAMELEON: 15,       // ChameleonProtocol
  CAROUSEL: 40,        // carrossel completo (texto + imagem)
} as const;

// ─── Stripe client ────────────────────────────────────────────────────────────
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!ENV.stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not set");
    _stripe = new Stripe(ENV.stripeSecretKey, { apiVersion: "2026-01-28.clover" });
  }
  return _stripe;
}

// ─── Supabase service role client ─────────────────────────────────────────────
let _supabase: SupabaseClient<any, "postspark"> | null = null;

export function getSupabase(): SupabaseClient<any, "postspark"> {
  if (!_supabase) {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
    }
    _supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false },
      db: { schema: "postspark" },
    });
  }
  return _supabase;
}

/**
 * SPEC-004 — wrapper tipado de chamadas RPC. Elimina os casts `as any` das
 * chamadas críticas de billing e normaliza o erro para { message, code }.
 */
export interface RpcError {
  message: string;
  code?: string;
  details?: string;
}

export interface RpcResult<T> {
  data: T | null;
  error: RpcError | null;
}

export async function rpcCall<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcResult<T>> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc(fn, args);
  return {
    data: (data as T | null) ?? null,
    error: error ? { message: error.message, code: error.code, details: error.details } : null,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type BillingPlan = "FREE" | "LITE" | "PRO" | "AGENCY" | "FOUNDER" | "DEV";
export type PaidPlan = "PRO" | "AGENCY";
export type BillingCycle = "monthly" | "annual";

export type BillingProfile = {
  id: string;           // UUID (postspark.profiles.id)
  email: string;
  plan: BillingPlan;
  sparks: number;
  sparks_refill_date: string | null;
  stripe_customer_id: string | null;
};

export type TopupPackage = {
  id: string;           // 'starter' | 'power' | 'mega'
  name: string;
  sparks: number;
  price_brl: number;
  stripe_price_id: string;
  active: boolean;
};

const FREE_PROFILE_DEFAULTS: Omit<BillingProfile, "id" | "email"> = {
  plan: "FREE",
  sparks: 150,
  sparks_refill_date: null,
  stripe_customer_id: null,
};

// ─── Profile helpers ──────────────────────────────────────────────────────────

/**
 * Busca o perfil de billing pelo e-mail.
 * Retorna defaults do plano FREE se não encontrado (usuário ainda não tem perfil Supabase).
 */
export async function getBillingProfile(email: string): Promise<BillingProfile> {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    // Billing não configurado — retorna mock FREE
    return { id: "dev-mock", email, ...FREE_PROFILE_DEFAULTS };
  }

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("profiles")
      .select("id, email, plan, sparks, sparks_refill_date, stripe_customer_id")
      .eq("email", email)
      .single();

    if (error || !data) {
      return { id: "no-profile", email, ...FREE_PROFILE_DEFAULTS };
    }

    return data as BillingProfile;
  } catch {
    return { id: "error", email, ...FREE_PROFILE_DEFAULTS };
  }
}

/**
 * Debita Sparks chamando postspark.debit_sparks().
 * Retorna { success, reason } — FOUNDER/DEV sempre passam.
 */
export async function debitSparks(
  profileId: string,
  amount: number,
  description: string
): Promise<{ success: boolean; reason?: string }> {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) return { success: true };
  if (profileId === "dev-mock" || profileId === "no-profile" || profileId === "error") {
    return { success: true };
  }

  try {
    const { data, error } = await rpcCall<boolean>("debit_sparks", {
      p_user_id: profileId,
      p_amount: amount,
      p_description: description,
    });

    if (error) return { success: false, reason: error.message };
    return { success: Boolean(data), reason: data ? undefined : "insufficient_sparks" };
  } catch (err: any) {
    return { success: false, reason: err.message };
  }
}

// ─── Transactional billing (Fase C): reserve / commit / refund ────────────────
// Substitui o débito imediato não-idempotente em post.generate por um modelo
// de reserva. A reserva BLOQUEIA saldo; commit_spark_reservation debita de
// fato; refund_spark_reservation libera sem custo em falha. Referência:
// DOCUMENTO_MESTRE §72, drizzle/0014_spark_reservations.sql.

/** Sentinel profile IDs que bypassam billing (dev mode / perfil não encontrado). */
function isSentinelProfile(profileId: string): boolean {
  return profileId === "dev-mock" || profileId === "no-profile" || profileId === "error";
}

/**
 * Planos com Sparks ilimitados (FOUNDER/DEV). A RPC debit_sparks legada tem
 * bypass total para esses planos (débito simbólico sem consumo real — ver
 * BILLING_HANDOFF.md:123). Replicamos o bypass no modelo transacional: a
 * reserva/commit/refund torna-se no-op (handle mock), sem tocar o banco.
 */
function isUnlimitedPlan(plan: BillingPlan): boolean {
  return plan === "FOUNDER" || plan === "DEV";
}

/** True quando o Supabase não está configurado (dev local). */
function isBillingDisabled(): boolean {
  return !ENV.supabaseUrl || !ENV.supabaseServiceRoleKey;
}

/**
 * Deriva uma chave de idempotência estável a partir do usuário e do input.
 * Dois requests idênticos do mesmo usuário (duplo-click no botão Gerar)
 * produzem a mesma chave → a RPC reutiliza a reserva existente em vez de
 * criar uma segunda. O client pode opcionalmente enviar sua própria chave.
 */
export function deriveIdempotencyKey(
  userUuid: string,
  input: { inputType: string; content: string; postMode: string; platform: string },
): string {
  const normalized = `${userUuid}:${input.inputType}:${input.postMode}:${input.platform}:${input.content.trim()}`;
  return "gen_" + createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

/**
 * Reserva Sparks de forma idempotente. Bloqueia saldo sem debitar.
 * Retorna { reservationId } em sucesso; { reservationId: null, reason } em falha.
 * Dev mode (Supabase desconfigurado, perfil sentinel ou plano ilimitado
 * FOUNDER/DEV) retorna handle mock sem tocar o banco — espelhando o bypass
 * da RPC debit_sparks legada (BILLING_HANDOFF.md:123).
 */
export async function reserveSparks(
  profile: BillingProfile,
  amount: number,
  idempotencyKey: string,
  description: string,
): Promise<{ reservationId: string | null; reason?: string }> {
  if (isBillingDisabled() || isSentinelProfile(profile.id) || isUnlimitedPlan(profile.plan)) {
    return { reservationId: "dev-mock" };
  }

  try {
    const { data, error } = await rpcCall<string>("reserve_sparks", {
      p_user_id: profile.id,
      p_amount: amount,
      p_idempotency_key: idempotencyKey,
      p_description: description,
    });
    if (error) return { reservationId: null, reason: error.message };
    if (!data) return { reservationId: null, reason: "insufficient_sparks" };
    return { reservationId: data };
  } catch (err: any) {
    return { reservationId: null, reason: err.message };
  }
}

/**
 * Confirma a reserva, debitando de profiles.sparks de forma definitiva.
 * Idempotente: commit repetido retorna true sem debitar duas vezes.
 * Víncula a reserva ao generationRunId ao confirmar.
 */
export async function commitSparkReservation(
  reservationId: string,
  generationRunId: string,
): Promise<boolean> {
  if (isBillingDisabled() || reservationId === "dev-mock") {
    return true;
  }

  try {
    const { data, error } = await rpcCall<boolean>("commit_spark_reservation", {
      p_reservation_id: reservationId,
      p_generation_run_id: generationRunId,
    });
    if (error) {
      console.warn("[billing] commit_spark_reservation failed:", error.message);
      return false;
    }
    return Boolean(data);
  } catch (err: any) {
    console.warn("[billing] commit_spark_reservation error:", err.message);
    return false;
  }
}

/**
 * Libera a reserva em falha, sem custo para o usuário. Idempotente.
 * Não decrementa sparks (a reserva só bloqueava). Falha (false) se a
 * reserva já foi commitada.
 */
export async function refundSparkReservation(
  reservationId: string,
  errorDetail: string,
): Promise<boolean> {
  if (isBillingDisabled() || reservationId === "dev-mock") {
    return true;
  }

  try {
    const { data, error } = await rpcCall<boolean>("refund_spark_reservation", {
      p_reservation_id: reservationId,
      p_error_detail: errorDetail,
    });
    if (error) {
      console.warn("[billing] refund_spark_reservation failed:", error.message);
      return false;
    }
    return Boolean(data);
  } catch (err: any) {
    console.warn("[billing] refund_spark_reservation error:", err.message);
    return false;
  }
}

// ─── Top-up packages ──────────────────────────────────────────────────────────

export async function getTopupPackages(): Promise<TopupPackage[]> {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) return [];

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("topup_packages")
      .select("*")
      .eq("active", true)
      .order("price_brl", { ascending: true });

    if (error || !data) return [];
    return data as TopupPackage[];
  } catch {
    return [];
  }
}

// ─── Stripe helpers ───────────────────────────────────────────────────────────

/**
 * Cria ou recupera o Stripe Customer para o usuário.
 */
export async function getOrCreateStripeCustomer(
  profileId: string,
  email: string,
  name?: string
): Promise<string> {
  const sb = getSupabase();

  // Verifica se já tem customer_id salvo
  const { data: profile } = await sb
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", profileId)
    .single();

  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  // Cria novo customer no Stripe
  const stripe = getStripe();
  const customer = await stripe.customers.create({ email, name });

  // Salva no perfil
  await sb
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", profileId);

  return customer.id;
}

/**
 * Cria uma Stripe Checkout Session para assinatura.
 */
export async function createSubscriptionCheckout(params: {
  profileId: string;
  email: string;
  name?: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(params.profileId, params.email, params.name);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    currency: "brl",
    metadata: { profile_id: params.profileId, email: params.email },
    subscription_data: {
      metadata: { profile_id: params.profileId, email: params.email },
    },
  });

  return session.url!;
}

export function getSubscriptionPriceId(plan: PaidPlan, cycle: BillingCycle): string {
  if (plan === "PRO") {
    const priceId = cycle === "annual" ? ENV.stripePriceProAnnual : ENV.stripePriceProMonthly;
    if (!priceId) throw new Error(`Stripe price for ${plan} (${cycle}) not configured`);
    return priceId;
  }

  const priceId = cycle === "annual" ? ENV.stripePriceAgencyAnnual : ENV.stripePriceAgencyMonthly;
  if (!priceId) throw new Error(`Stripe price for ${plan} (${cycle}) not configured`);
  return priceId;
}

/**
 * Cria uma Stripe Checkout Session para top-up avulso.
 */
export async function createTopupCheckout(params: {
  profileId: string;
  email: string;
  name?: string;
  priceId: string;
  packageId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(params.profileId, params.email, params.name);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    currency: "brl",
    metadata: {
      profile_id: params.profileId,
      email: params.email,
      package_id: params.packageId,
      type: "topup",
    },
  });

  return session.url!;
}

// ─── Webhook handlers ─────────────────────────────────────────────────────────

/**
 * Processa eventos do webhook Stripe.
 * Chamado pela rota POST /api/stripe/webhook com body raw verificado.
 */
export async function handleStripeWebhook(event: Stripe.Event): Promise<void> {
  const sb = getSupabase();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta = session.metadata ?? {};
      const profileId = meta.profile_id;
      const email = meta.email;

      if (!profileId || !email) return;

      if (meta.type === "topup") {
        // Top-up avulso confirmado
        const packageId = meta.package_id;
        if (!packageId || !session.payment_intent) return;

        await rpcCall<boolean>("process_topup", {
          p_user_id: profileId,
          p_package_id: packageId,
          p_stripe_payment_intent_id: session.payment_intent as string,
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = event.data.object as any;
      const meta = (sub.metadata ?? {}) as Record<string, string>;
      const profileId = meta.profile_id;
      if (!profileId) return;

      const plan = getPlanFromPriceId(sub.items?.data?.[0]?.price?.id ?? "");
      const status = mapStripeStatus(sub.status);

      // period fields differ by API version — try both locations
      const periodStart = sub.current_period_start ?? sub.items?.data?.[0]?.period?.start;
      const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.period?.end;

      // Upsert na tabela subscriptions
      await sb.from("subscriptions").upsert({
        stripe_subscription_id: sub.id,
        user_id: profileId,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
        plan,
        status,
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        billing_cycle: sub.items?.data?.[0]?.price?.recurring?.interval === "year" ? "annual" : "monthly",
      }, { onConflict: "stripe_subscription_id" });

      // Atualiza o plano no perfil
      if (status === "active" || status === "trialing") {
        await sb.from("profiles").update({ plan }).eq("id", profileId);
      }
      break;
    }

    case "customer.subscription.deleted": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = event.data.object as any;
      const meta = (sub.metadata ?? {}) as Record<string, string>;
      const profileId = meta.profile_id;
      if (!profileId) return;

      // Downgrade para FREE (mantém sparks acumulados)
      await sb.from("profiles").update({ plan: "FREE" }).eq("id", profileId);
      await sb
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("stripe_subscription_id", sub.id);
      break;
    }

    case "invoice.payment_failed": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice = event.data.object as any;
      // subscription field location varies by API version
      const subscriptionId = invoice.subscription ?? invoice.subscription_details?.subscription;
      if (!subscriptionId) return;

      await sb
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("stripe_subscription_id", subscriptionId);
      break;
    }

    case "payment_intent.succeeded": {
      // Top-up é tratado via checkout.session.completed — este evento é backup
      break;
    }
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function getPlanFromPriceId(priceId: string): "PRO" | "AGENCY" {
  if (
    priceId === ENV.stripePriceAgencyMonthly ||
    priceId === ENV.stripePriceAgencyAnnual
  ) {
    return "AGENCY";
  }
  if (
    priceId === ENV.stripePriceProMonthly ||
    priceId === ENV.stripePriceProAnnual
  ) {
    return "PRO";
  }

  throw new Error(`Unknown Stripe price id received in webhook: ${priceId}`);
}

function mapStripeStatus(
  status: Stripe.Subscription.Status
): "active" | "canceled" | "past_due" | "trialing" | "paused" {
  switch (status) {
    case "active": return "active";
    case "canceled": return "canceled";
    case "past_due": return "past_due";
    case "trialing": return "trialing";
    case "paused": return "paused";
    default: return "active";
  }
}
