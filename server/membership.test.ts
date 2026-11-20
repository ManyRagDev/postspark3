import type Stripe from "stripe";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PAID_PLAN_OFFERS, PRO_MEMBERSHIP } from "@shared/membership";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  subscription: vi.fn(),
  session: vi.fn(),
  listSubscriptions: vi.fn(),
  listSessions: vi.fn(),
  createSession: vi.fn(),
  price: vi.fn(),
}));

vi.mock("./_core/env", () => ({
  ENV: { stripeSecretKey: "test", stripeWebhookSecret: "test", stripePortalConfigurationId: "bpc_test" },
}));
vi.mock("./billing", () => ({
  getSubscriptionPriceId: (_plan: string, cycle: string) => `price_${cycle}`,
  getStripe: () => ({
    subscriptions: { retrieve: mocks.subscription, list: mocks.listSubscriptions },
    checkout: { sessions: { retrieve: mocks.session, list: mocks.listSessions, create: mocks.createSession } },
    prices: { retrieve: mocks.price },
  }),
  rpcCall: mocks.rpc,
}));

import { confirmMembershipCheckout, enrollmentOffers, handleMembershipWebhook, startMembershipCheckout } from "./membership";

const owner = "00000000-0000-4000-8000-000000000001";
const checkout = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const metadata = {
  postspark_membership: "pro_v1",
  profile_id: owner,
  checkout_id: checkout,
  cycle: "annual",
};
const amount = PRO_MEMBERSHIP.annual.amount;

function makeInvoice(overrides: Partial<Stripe.Invoice> = {}, offer = { metadata, amount, priceId: "price_annual" }) {
  return {
    id: "in_postspark",
    status: "paid",
    billing_reason: "subscription_create",
    currency: "brl",
    amount_paid: offer.amount,
    customer: "cus_postspark",
    parent: { subscription_details: { metadata: offer.metadata, subscription: "sub_postspark" } },
    lines: { data: [{
      pricing: { price_details: { price: offer.priceId } },
      parent: { subscription_item_details: { subscription: "sub_postspark", proration: false } },
      amount: offer.amount,
      quantity: 1,
      period: { start: 1794782800, end: 1826318800 },
    }] },
    ...overrides,
  } as Stripe.Invoice;
}

function event(type: Stripe.Event.Type, object: unknown): Stripe.Event {
  return { type, data: { object } } as Stripe.Event;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.subscription.mockResolvedValue({ metadata, status: "active", customer: "cus_postspark" });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "get_pro_membership" ? { active: true } : null,
    error: null,
  }));
});
afterEach(() => vi.unstubAllEnvs());

it("treats a checkout completion as handled without granting access before the invoice is paid", async () => {
  expect(await handleMembershipWebhook(event("checkout.session.completed", { metadata }))).toBe(true);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(await handleMembershipWebhook(event("invoice.paid", makeInvoice({ amount_paid: 0 })))).toBe(true);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("uses the subscription price and paid period to fulfill the matching member", async () => {
  expect(await handleMembershipWebhook(event("invoice.paid", makeInvoice({ billing_reason: "subscription_cycle" })))).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledWith("apply_pro_paid_period", expect.objectContaining({
    p_user_id: owner, p_checkout_id: checkout, p_customer_id: "cus_postspark",
    p_subscription_id: "sub_postspark", p_invoice_id: "in_postspark", p_cycle: "annual",
  }));
});

it("rejects a checkout return from a different identity before granting Sparks", async () => {
  mocks.session.mockResolvedValue({
    metadata, client_reference_id: owner, status: "complete", payment_status: "paid", invoice: makeInvoice(),
  });
  await expect(confirmMembershipCheckout(other, "cs_test_payment")).rejects.toHaveProperty("status", 404);
  expect(mocks.rpc).not.toHaveBeenCalled();
  await expect(confirmMembershipCheckout(owner, "cs_test_payment")).resolves.toEqual({ active: true });
});

it("ends only the explicitly linked subscription", async () => {
  await handleMembershipWebhook(event("customer.subscription.deleted", {
    id: "sub_postspark", metadata, ended_at: 1794782800,
  }));
  expect(mocks.rpc).toHaveBeenCalledWith("end_pro_subscription", expect.objectContaining({
    p_user_id: owner, p_checkout_id: checkout, p_subscription_id: "sub_postspark",
  }));
});

it("uses exactly the annual Stripe price and one idempotency key for the saved checkout", async () => {
  mocks.rpc.mockResolvedValue({
    data: { id: checkout, cycle: "annual", expiresAt: new Date(Date.now() + 40 * 60_000).toISOString(), customerId: "cus_postspark" },
    error: null,
  });
  mocks.listSubscriptions.mockResolvedValue({ has_more: false, data: [] });
  mocks.listSessions.mockResolvedValue({ has_more: false, data: [] });
  mocks.price.mockResolvedValue({
    active: true, currency: "brl", unit_amount: amount, recurring: { interval: "year", interval_count: 1 },
  });
  mocks.createSession.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_test_example" });
  await expect(startMembershipCheckout(owner, "monthly", "https://postspark.com.br")).rejects.toHaveProperty("status", 409);
  expect(mocks.createSession).not.toHaveBeenCalled();

  await expect(startMembershipCheckout(owner, "annual", "https://postspark.com.br"))
    .resolves.toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_example" });
  expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
    mode: "subscription", customer: "cus_postspark", client_reference_id: owner, metadata,
    line_items: [{ price: "price_annual", quantity: 1 }],
    success_url: "https://postspark.com.br/billing/success?session_id={CHECKOUT_SESSION_ID}",
  }), { idempotencyKey: `postspark-pro:checkout:${checkout}` });
  mocks.price.mockResolvedValueOnce({
    active: true, currency: "brl", unit_amount: 1, recurring: { interval: "year", interval_count: 1 },
  });
  await expect(startMembershipCheckout(owner, "annual", "https://postspark.com.br")).rejects.toThrow("differs");
  expect(mocks.createSession).toHaveBeenCalledTimes(1);
});

it.each([
  ["SOLO", "STRIPE_PRICE_SOLO_ANNUAL"],
  ["PRO_PLUS", "STRIPE_PRICE_PRO_PLUS_ANNUAL"],
  ["AGENCY", "STRIPE_PRICE_PILOT_AGENCY_ANNUAL"],
] as const)("uses the configured annual amount to open checkout and fulfill %s", async (plan, envKey) => {
  vi.stubEnv(envKey, undefined);
  expect(enrollmentOffers().annualPaid).not.toContain(plan);
  await expect(startMembershipCheckout(owner, "annual", "http://localhost:3000", plan))
    .rejects.toHaveProperty("status", 404);
  expect(mocks.rpc).not.toHaveBeenCalled();

  const priceId = `price_${plan.toLowerCase()}_annual`;
  const paidOffer = { priceId, amount: PAID_PLAN_OFFERS[plan].annualCents, metadata: { ...metadata, offer: plan } };
  vi.stubEnv(envKey, priceId);
  if (plan === "AGENCY") {
    vi.stubEnv("POSTSPARK_AGENCY_ENROLLMENT_ENABLED", undefined);
    expect(enrollmentOffers().annualPaid).not.toContain(plan);
    await expect(startMembershipCheckout(owner, "annual", "http://localhost:3000", plan))
      .rejects.toHaveProperty("status", 404);
    vi.stubEnv("POSTSPARK_AGENCY_ENROLLMENT_ENABLED", "true");
  }
  expect(enrollmentOffers().annualPaid).toContain(plan);
  mocks.rpc.mockResolvedValueOnce({
    data: { id: checkout, cycle: "annual", offer: plan, expiresAt: new Date(Date.now() + 40 * 60_000).toISOString(), customerId: "cus_postspark" },
    error: null,
  });
  mocks.listSubscriptions.mockResolvedValue({ has_more: false, data: [] });
  mocks.listSessions.mockResolvedValue({ has_more: false, data: [] });
  mocks.price.mockResolvedValue({
    active: true, currency: "brl", unit_amount: paidOffer.amount, recurring: { interval: "year", interval_count: 1 },
  });
  mocks.createSession.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_test_example" });

  await expect(startMembershipCheckout(owner, "annual", "http://localhost:3000", plan))
    .resolves.toHaveProperty("url");
  expect(mocks.rpc).toHaveBeenCalledWith("prepare_studio_checkout", { p_user_id: owner, p_cycle: "annual", p_offer: plan });
  expect(mocks.price).toHaveBeenCalledWith(priceId);
  expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: paidOffer.metadata,
    subscription_data: { metadata: paidOffer.metadata },
  }), expect.anything());

  mocks.subscription.mockResolvedValue({ ...paidOffer, status: "active", customer: "cus_postspark" });
  if (plan === "AGENCY") vi.stubEnv("POSTSPARK_AGENCY_ENROLLMENT_ENABLED", undefined);
  await handleMembershipWebhook(event("invoice.paid", makeInvoice({ amount_paid: paidOffer.amount - 1 }, paidOffer)));
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  await handleMembershipWebhook(event("invoice.paid", makeInvoice({}, paidOffer)));
  expect(mocks.rpc).toHaveBeenLastCalledWith("apply_pro_paid_period", expect.objectContaining({
    p_checkout_id: checkout, p_cycle: "annual", p_invoice_id: "in_postspark",
  }));
});
