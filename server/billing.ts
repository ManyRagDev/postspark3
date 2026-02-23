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
import { createClient } from "@supabase/supabase-js";
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
let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!_supabase) {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false },
      db: { schema: "postspark" },
    }) as any;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return _supabase as any;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type BillingPlan = "FREE" | "LITE" | "PRO" | "AGENCY" | "FOUNDER" | "DEV";

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
    const sb = getSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any).rpc("debit_sparks", {
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).rpc("process_topup", {
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
  return "PRO";
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
