import { pgSchema, varchar, text, timestamp, boolean, uuid, jsonb, serial, bigint, integer, numeric } from "drizzle-orm/pg-core";

// Define the schema explicitly
export const postsparkSchema = pgSchema("postspark");

/**
 * Core user table backing auth flow.
 */
export const users = postsparkSchema.table("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 32 }).default("user").notNull(), // Using varchar for simplicity instead of pgEnum for now
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(), // PostgreSQL doesn't have onUpdateNow natively in the same way, usually needs trigger. For simplicity keeping defaultNow.
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Posts table - stores generated social media posts
 */
export const posts = postsparkSchema.table("posts", {
  id: serial("id").primaryKey(),
  userUuid: uuid("user_uuid"),
  userId: text("userId"),
  inputType: varchar("inputType", { length: 16 }).notNull(), // text | url | image
  inputContent: text("inputContent").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(), // instagram | twitter | linkedin | facebook
  headline: text("headline"),
  body: text("body"),
  caption: text("caption"),
  hashtags: jsonb("hashtags").$type<string[]>(), // Changed to jsonb
  callToAction: text("callToAction"),
  tone: varchar("tone", { length: 64 }),
  imagePrompt: text("imagePrompt"),
  imageUrl: text("imageUrl"),
  backgroundColor: varchar("backgroundColor", { length: 32 }),
  textColor: varchar("textColor", { length: 32 }),
  accentColor: varchar("accentColor", { length: 32 }),
  layout: varchar("layout", { length: 32 }),
  postMode: varchar("postMode", { length: 32 }).default("static").notNull(),
  slides: jsonb("slides").$type<any[]>(),
  textElements: jsonb("textElements").$type<any[]>(),
  imageSettings: jsonb("image_settings").$type<any>(),
  layoutSettings: jsonb("layout_settings").$type<any>(),
  bgValue: jsonb("bg_value").$type<any>(),
  bgOverlay: jsonb("bg_overlay").$type<any>(),
  copyAngle: jsonb("copy_angle").$type<any>(),
  variationSnapshot: jsonb("variation_snapshot").$type<any>(),
  exported: boolean("exported").default(false), // Changed to boolean
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;

export const backgroundAssets = postsparkSchema.table("background_assets", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  userUuid: uuid("user_uuid").notNull(),
  imageUrl: text("image_url").notNull(),
  sourceType: varchar("source_type", { length: 32 }).notNull(),
  prompt: text("prompt"),
  label: text("label"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type BackgroundAsset = typeof backgroundAssets.$inferSelect;
export type InsertBackgroundAsset = typeof backgroundAssets.$inferInsert;

export const siteIntelligence = postsparkSchema.table("site_intelligence", {
  id: uuid("id").defaultRandom().primaryKey(),
  userUuid: uuid("user_uuid").notNull(),
  sourceUrl: text("source_url").notNull(),
  normalizedUrl: text("normalized_url").notNull(),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  snapshot: jsonb("snapshot").$type<any>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SiteIntelligenceRecord = typeof siteIntelligence.$inferSelect;
export type InsertSiteIntelligence = typeof siteIntelligence.$inferInsert;

export const generationRuns = postsparkSchema.table("generation_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userUuid: uuid("user_uuid").notNull(),
  siteIntelligenceId: uuid("site_intelligence_id"),
  status: varchar("status", { length: 32 }).notNull(),
  inputType: varchar("input_type", { length: 16 }).notNull(),
  inputContent: text("input_content").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  postMode: varchar("post_mode", { length: 32 }).notNull(),
  creationMode: varchar("creation_mode", { length: 32 }).notNull(),
  requestedModel: varchar("requested_model", { length: 64 }).notNull(),
  effectiveModels: jsonb("effective_models").$type<string[]>().notNull(),
  promptSnapshot: jsonb("prompt_snapshot").$type<any>(),
  strategySnapshot: jsonb("strategy_snapshot").$type<any>(),
  evaluationSnapshot: jsonb("evaluation_snapshot").$type<any>(),
  outputSnapshot: jsonb("output_snapshot").$type<any>(),
  revisionCount: integer("revision_count").default(0).notNull(),
  candidateCount: integer("candidate_count").default(0).notNull(),
  acceptedCount: integer("accepted_count").default(0).notNull(),
  averageQualityScore: numeric("average_quality_score", { precision: 6, scale: 2 }).default("0").notNull(),
  strategyFallbackUsed: boolean("strategy_fallback_used").default(false).notNull(),
  originalityFallbackUsed: boolean("originality_fallback_used").default(false).notNull(),
  promptTokens: integer("prompt_tokens").default(0).notNull(),
  completionTokens: integer("completion_tokens").default(0).notNull(),
  totalTokens: integer("total_tokens").default(0).notNull(),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }).default("0").notNull(),
  latencyMs: integer("latency_ms").default(0).notNull(),
  errorMessage: text("error_message"),
  events: jsonb("events").$type<any[]>().notNull().default([]),
  eventsVersion: integer("events_version").default(1).notNull(),
  graphState: jsonb("graph_state").$type<any>().notNull().default({}),
  sparkCost: integer("spark_cost"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type GenerationRun = typeof generationRuns.$inferSelect;
export type InsertGenerationRun = typeof generationRuns.$inferInsert;

export const contentFingerprints = postsparkSchema.table("content_fingerprints", {
  id: uuid("id").defaultRandom().primaryKey(),
  userUuid: uuid("user_uuid").notNull(),
  generationRunId: uuid("generation_run_id"),
  sourceType: varchar("source_type", { length: 32 }).notNull(),
  sourceId: text("source_id").notNull(),
  textHash: varchar("text_hash", { length: 64 }).notNull(),
  embedding: jsonb("embedding").$type<number[]>().notNull(),
  metadata: jsonb("metadata").$type<any>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContentFingerprint = typeof contentFingerprints.$inferSelect;
export type InsertContentFingerprint = typeof contentFingerprints.$inferInsert;

// ─── High Ticket Pipeline ──────────────────────────────────────────────────────

export const brandKits = postsparkSchema.table("brand_kits", {
  id: uuid("id").defaultRandom().primaryKey(),
  userUuid: uuid("user_uuid").notNull().unique(),
  tone: varchar("tone", { length: 32 }).notNull().default("professional"),
  formattingRules: jsonb("formatting_rules").$type<string[]>().notNull(),
  forbiddenTerms: jsonb("forbidden_terms").$type<string[]>().notNull(),
  mustInclude: jsonb("must_include").$type<string[]>().notNull(),
  dictionary: jsonb("dictionary").$type<Record<string, string>>().notNull(),
  visualPalette: jsonb("visual_palette").$type<string[]>().notNull(),
  fontFamily: text("font_family").default("Inter"),
  borderRadius: text("border_radius").default("16px"),
  boxShadow: text("box_shadow").default("none"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BrandKit = typeof brandKits.$inferSelect;
export type InsertBrandKit = typeof brandKits.$inferInsert;

export const personas = postsparkSchema.table("personas", {
  id: uuid("id").defaultRandom().primaryKey(),
  userUuid: uuid("user_uuid").notNull().unique(),
  audience: text("audience").notNull().default("publico geral"),
  pains: jsonb("pains").$type<string[]>().notNull(),
  goals: jsonb("goals").$type<string[]>().notNull(),
  languageStyle: text("language_style").default("direto e profissional"),
  objections: jsonb("objections").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Persona = typeof personas.$inferSelect;
export type InsertPersona = typeof personas.$inferInsert;

// ─── Billing transacional (Fase C) ────────────────────────────────────────────
// spark_reservations implementa reserve-on-start / commit-on-approval /
// refund-on-fail. A reserva apenas BLOQUEIA saldo; commit_spark_reservation
// debita de fato. Referência: DOCUMENTO_MESTRE §72, drizzle/0014_spark_reservations.sql.

export const sparkReservations = postsparkSchema.table("spark_reservations", {
  id: uuid("id").defaultRandom().primaryKey(),
  idempotencyKey: text("idempotency_key").notNull(),
  userUuid: uuid("user_uuid").notNull(),
  generationRunId: text("generation_run_id"),
  amount: integer("amount").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("reserved"),
  description: text("description"),
  errorDetail: text("error_detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
});

export type SparkReservation = typeof sparkReservations.$inferSelect;
export type InsertSparkReservation = typeof sparkReservations.$inferInsert;
