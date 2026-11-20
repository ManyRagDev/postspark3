import type Stripe from "stripe";
import { z } from "zod";
import { PAID_PLAN_OFFERS, PRO_MEMBERSHIP, type MembershipCycle, type PaidStudioPlan } from "@shared/membership";
import { getStripe, getSubscriptionPriceId, getSupabase, rpcCall } from "./billing";
import { ENV } from "./_core/env";

export const paidStudioPlanSchema = z.enum(["SOLO", "PRO", "PRO_PLUS", "AGENCY"]);
const membershipMetadata = z.object({
  postspark_membership: z.literal("pro_v1"),
  profile_id: z.string().uuid(),
  checkout_id: z.string().uuid(),
  cycle: z.enum(["monthly", "annual"]),
  offer: paidStudioPlanSchema.optional(),
});
const checkoutAttempt = z.object({
  id: z.string().uuid(),
  cycle: z.enum(["monthly", "annual"]),
  expiresAt: z.string(),
  customerId: z.string().nullable(),
  offer: paidStudioPlanSchema.optional(),
});
const membershipState = z.object({
  cycle: z.enum(["monthly", "annual"]).optional(),
  paidUntil: z.string().optional(),
  active: z.boolean().optional(),
  customerId: z.string().optional(),
  plan: paidStudioPlanSchema.optional(),
});

export class MembershipError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function membershipRpc<T>(name: string, params: Record<string, unknown>) {
  const { data, error } = await rpcCall<T>(name, params);
  if (error?.code === "PT403")
    throw new MembershipError(403, "A assinatura está indisponível para esta conta.");
  if (error?.code === "PT409")
    throw new MembershipError(409, "Esta conta já tem uma assinatura ou um pagamento em andamento.");
  if (error) throw new Error(`Membership RPC ${name}: ${error.code ?? "unknown"}`);
  return data;
}

export async function readMembership(userId: string) {
  return membershipState.parse(await membershipRpc("get_pro_membership", { p_user_id: userId }));
}

function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

async function membershipCustomer(userId: string, customerId: string | null) {
  if (customerId) return customerId;
  const customer = await getStripe().customers.create(
    { metadata: { postspark_user_id: userId } },
    { idempotencyKey: `postspark-pro:customer:${userId}` }
  );
  const sb = getSupabase();
  const { error: writeError } = await sb.from("profiles")
    .update({ stripe_customer_id: customer.id }).eq("id", userId).is("stripe_customer_id", null);
  if (writeError) throw new Error("Membership customer persistence failed");
  const { data, error } = await sb.from("profiles").select("stripe_customer_id").eq("id", userId).single();
  if (error || !data?.stripe_customer_id) throw new Error("Membership customer not found");
  return String(data.stripe_customer_id);
}

const pilotPriceKeys = {
  SOLO: { monthly: "STRIPE_PRICE_SOLO_MONTHLY", annual: "STRIPE_PRICE_SOLO_ANNUAL" },
  PRO_PLUS: { monthly: "STRIPE_PRICE_PRO_PLUS_MONTHLY", annual: "STRIPE_PRICE_PRO_PLUS_ANNUAL" },
  AGENCY: { monthly: "STRIPE_PRICE_PILOT_AGENCY_MONTHLY", annual: "STRIPE_PRICE_PILOT_AGENCY_ANNUAL" },
} as const;

function pilotPrice(plan: keyof typeof pilotPriceKeys, cycle: MembershipCycle) {
  return process.env[pilotPriceKeys[plan][cycle]]?.trim();
}

function canEnroll(plan: PaidStudioPlan, cycle: MembershipCycle) {
  if (plan === "PRO") return true;
  if (plan === "AGENCY" && process.env.POSTSPARK_AGENCY_ENROLLMENT_ENABLED !== "true") return false;
  return Boolean(pilotPrice(plan, cycle));
}

export function enrollmentOffers() {
  return {
    paid: paidStudioPlanSchema.options.filter(plan => canEnroll(plan, "monthly")),
    annualPaid: paidStudioPlanSchema.options.filter(plan => canEnroll(plan, "annual")),
    start: Number(process.env.POSTSPARK_START_PILOT_MAX_MEMBERS) > 0,
  };
}

function stripeOffer(plan: PaidStudioPlan, cycle: MembershipCycle) {
  if (plan === "PRO") return {
    ...PRO_MEMBERSHIP[cycle], priceId: getSubscriptionPriceId("PRO", cycle),
  };
  const priceId = pilotPrice(plan, cycle);
  if (!priceId) return null;
  const offer = PAID_PLAN_OFFERS[plan];
  return {
    priceId,
    amount: cycle === "annual" ? offer.annualCents : offer.monthlyCents,
    interval: PRO_MEMBERSHIP[cycle].interval,
  };
}

export async function startMembershipCheckout(userId: string, cycle: MembershipCycle, origin: string, offer: PaidStudioPlan = "PRO") {
  if (!ENV.stripeSecretKey || !ENV.stripeWebhookSecret || !ENV.stripePortalConfigurationId)
    throw new MembershipError(503, "As assinaturas estão indisponíveis no momento.");
  const expected = canEnroll(offer, cycle) ? stripeOffer(offer, cycle) : null;
  if (!expected) throw new MembershipError(404, "Este plano ainda está indisponível.");
  const attempt = checkoutAttempt.parse(await membershipRpc(offer === "PRO" ? "prepare_pro_checkout" : "prepare_studio_checkout", {
    p_user_id: userId,
    p_cycle: cycle,
    ...(offer !== "PRO" ? { p_offer: offer } : {}),
  }));
  if ((attempt.offer ?? "PRO") !== offer)
    throw new MembershipError(409, "Aguarde expirar o checkout do plano que você já selecionou.");
  if (cycle !== attempt.cycle)
    throw new MembershipError(409, `Já existe uma tentativa no ciclo ${PRO_MEMBERSHIP[attempt.cycle].label.toLowerCase()}. Selecione esse ciclo para retomar.`);

  const stripe = getStripe();
  const customer = await membershipCustomer(userId, attempt.customerId);
  const subscriptions = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
  if (subscriptions.has_more || subscriptions.data.some(sub => sub.status !== "canceled" && sub.status !== "incomplete_expired"))
    throw new MembershipError(409, "Já existe uma assinatura ou um pagamento em andamento. Use Gerenciar assinatura.");

  const open = await stripe.checkout.sessions.list({ customer, status: "open", limit: 100 });
  const current = open.data.find(session => session.metadata?.checkout_id === attempt.id);
  if (current?.url) return { url: current.url };
  if (open.has_more || open.data.some(session => session.mode === "subscription"))
    throw new MembershipError(409, "Já existe um checkout de assinatura aberto. Conclua-o antes de iniciar outro.");

  const expiresAt = Date.parse(attempt.expiresAt);
  if (expiresAt - Date.now() <= 30 * 60_000)
    throw new MembershipError(409, "A tentativa expira em instantes. Aguarde o encerramento antes de iniciar outra.");

  const { priceId } = expected;
  const price = await stripe.prices.retrieve(priceId);
  if (!price.active || price.currency !== PRO_MEMBERSHIP.currency ||
      price.unit_amount !== expected.amount || price.recurring?.interval !== expected.interval ||
      price.recurring.interval_count !== 1)
    throw new Error("Stripe membership price differs from the advertised offer");

  const metadata = membershipMetadata.parse({
    postspark_membership: "pro_v1",
    profile_id: userId,
    checkout_id: attempt.id,
    cycle,
    ...(offer === "PRO" ? {} : { offer }),
  });
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_types: ["card"],
    metadata,
    subscription_data: { metadata },
    expires_at: Math.floor(expiresAt / 1000),
    success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?cycle=${cycle}`,
  }, { idempotencyKey: `postspark-pro:checkout:${attempt.id}` });
  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return { url: session.url };
}

async function applyPaidInvoice(invoice: Stripe.Invoice, metadata: z.infer<typeof membershipMetadata>) {
  const subscriptionId = stripeId(invoice.parent?.subscription_details?.subscription);
  const customerId = stripeId(invoice.customer);
  const allowedReason = invoice.billing_reason === "subscription_create" || invoice.billing_reason === "subscription_cycle";
  const expected = stripeOffer(metadata.offer ?? "PRO", metadata.cycle);
  if (!expected) throw new Error("Missing Stripe Price for an existing subscription");
  const { priceId, amount } = expected;
  const line = invoice.lines.data.find(item =>
    stripeId(item.pricing?.price_details?.price) === priceId &&
    item.parent?.subscription_item_details?.subscription === subscriptionId &&
    !item.parent?.subscription_item_details?.proration && item.quantity === 1 && item.amount === amount
  );
  if (!subscriptionId || !customerId || !allowedReason || invoice.status !== "paid" ||
      invoice.amount_paid < amount || invoice.currency !== PRO_MEMBERSHIP.currency || !line) return false;

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const current = membershipMetadata.safeParse(subscription.metadata);
  if (!current.success || current.data.profile_id !== metadata.profile_id ||
      current.data.cycle !== metadata.cycle || current.data.checkout_id !== metadata.checkout_id ||
      current.data.offer !== metadata.offer || stripeId(subscription.customer) !== customerId) return false;
  if (subscription.status === "canceled" || subscription.status === "incomplete_expired") return false;
  if (subscription.status !== "active" && subscription.status !== "past_due")
    throw new Error("Stripe subscription not active yet");

  await membershipRpc("apply_pro_paid_period", {
    p_user_id: metadata.profile_id,
    p_checkout_id: metadata.checkout_id,
    p_customer_id: customerId,
    p_subscription_id: subscriptionId,
    p_invoice_id: invoice.id,
    p_cycle: metadata.cycle,
    p_period_start: new Date(line.period.start * 1000).toISOString(),
    p_period_end: new Date(line.period.end * 1000).toISOString(),
  });
  return true;
}

/** Stripe's verified invoice is the authority, including when a webhook is delayed. */
export async function confirmMembershipCheckout(userId: string, sessionId: string) {
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["invoice"] });
  const metadata = membershipMetadata.safeParse(session.metadata);
  if (!metadata.success || metadata.data.profile_id !== userId || session.client_reference_id !== userId)
    throw new MembershipError(404, "Pagamento não encontrado para esta conta.");
  if (session.status === "expired")
    throw new MembershipError(409, "O checkout expirou. Escolha um plano para continuar.");
  if (session.status !== "complete" || session.payment_status !== "paid" ||
      !session.invoice || typeof session.invoice === "string") return { active: false };
  await applyPaidInvoice(session.invoice, metadata.data);
  return { active: (await readMembership(userId)).active === true };
}

export async function createMembershipPortal(userId: string, origin: string) {
  if (!ENV.stripePortalConfigurationId)
    throw new MembershipError(503, "O portal de assinaturas está indisponível no momento.");
  const member = await readMembership(userId);
  let customerId = member.customerId;
  if (!customerId) {
    const { data, error } = await getSupabase().from("profiles")
      .select("stripe_customer_id").eq("id", userId).maybeSingle();
    if (error) throw new Error("Membership customer lookup failed");
    customerId = data?.stripe_customer_id ?? undefined;
  }
  if (!customerId) throw new MembershipError(404, "Ainda não há uma assinatura para gerenciar.");
  const portal = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    configuration: ENV.stripePortalConfigurationId,
    return_url: `${origin}/pricing`,
  });
  return { url: portal.url };
}

export async function handleMembershipWebhook(event: Stripe.Event): Promise<boolean> {
  if (event.type === "invoice.paid") {
    const invoice = event.data.object;
    const metadata = membershipMetadata.safeParse(invoice.parent?.subscription_details?.metadata);
    if (!metadata.success) return false;
    await applyPaidInvoice(invoice, metadata.data);
    return true;
  }
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const metadata = membershipMetadata.safeParse(subscription.metadata);
    if (!metadata.success) return false;
    if (!subscription.ended_at) throw new Error("Missing subscription end");
    await membershipRpc("end_pro_subscription", {
      p_user_id: metadata.data.profile_id,
      p_checkout_id: metadata.data.checkout_id,
      p_subscription_id: subscription.id,
      p_ended_at: new Date(subscription.ended_at * 1000).toISOString(),
    });
    return true;
  }
  if (event.type === "customer.subscription.updated" || event.type === "checkout.session.completed")
    return event.data.object.metadata?.postspark_membership === "pro_v1";
  return false;
}
