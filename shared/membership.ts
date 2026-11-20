export const PRO_MEMBERSHIP = {
  sparksPerMonth: 2000,
  currency: "brl",
  monthly: { amount: 14_700, interval: "month", label: "Mensal" },
  annual: { amount: 140_400, interval: "year", label: "Anual" },
} as const;

export type MembershipCycle = "monthly" | "annual";

export const STUDIO_PLANS = ["START", "SOLO", "PRO", "PRO_PLUS", "AGENCY"] as const;
export type StudioPlan = (typeof STUDIO_PLANS)[number];
export type PaidStudioPlan = Exclude<StudioPlan, "START">;

// Checkout availability is configured separately from the public prices.
export const PAID_PLAN_OFFERS = {
  SOLO: { name: "Solo", monthlyCents: 4_990, annualCents: 47_904, sparksPerMonth: 600 },
  PRO: {
    name: "PRO",
    monthlyCents: PRO_MEMBERSHIP.monthly.amount,
    annualCents: PRO_MEMBERSHIP.annual.amount,
    sparksPerMonth: PRO_MEMBERSHIP.sparksPerMonth,
  },
  PRO_PLUS: { name: "PRO+", monthlyCents: 24_990, annualCents: 239_904, sparksPerMonth: 4_500 },
  AGENCY: { name: "AGENCY", monthlyCents: 29_990, annualCents: 287_904, sparksPerMonth: 4_500 },
} as const satisfies Record<PaidStudioPlan, { name: string; monthlyCents: number; annualCents: number; sparksPerMonth: number }>;

export const SPARK_REFILL = { id: "sparks-600", sparks: 600, amount: 6_490 } as const;

export function studioPlanForProfile(plan: string | null | undefined): StudioPlan {
  if (plan === "START" || plan === "SOLO" || plan === "PRO_PLUS" || plan === "AGENCY") return plan;
  // Existing operators and paid/legacy accounts retain their prior editor tools.
  return "PRO";
}

export function hasProfessionalEditor(plan: StudioPlan) {
  return plan === "PRO" || plan === "PRO_PLUS" || plan === "AGENCY";
}

export const PRO_ANNUAL_DISCOUNT = Math.round(
  100 * (1 - PRO_MEMBERSHIP.annual.amount / (12 * PRO_MEMBERSHIP.monthly.amount))
);
