export const ENV = {
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  groqApiKey: process.env.GROQ_API_KEY ?? "",

  // Supabase (service role — backend only)
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePriceProMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
  stripePriceProAnnual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? "",
  stripePriceAgencyMonthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY ?? "",
  stripePriceAgencyAnnual: process.env.STRIPE_PRICE_AGENCY_ANNUAL ?? "",
  stripePriceTopupStarter: process.env.STRIPE_PRICE_TOPUP_STARTER ?? "",
  stripePriceTopupPower: process.env.STRIPE_PRICE_TOPUP_POWER ?? "",
  stripePriceTopupMega: process.env.STRIPE_PRICE_TOPUP_MEGA ?? "",

  // SMTP (Hostinger)
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parseInt(process.env.SMTP_PORT || "465"),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "",
};
