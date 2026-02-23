import { pgSchema, varchar, text, timestamp, boolean, uuid, jsonb, serial, integer } from "drizzle-orm/pg-core";

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
  userId: integer("userId").notNull(),
  inputType: varchar("inputType", { length: 16 }).notNull(), // text | url | image
  inputContent: text("inputContent").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(), // instagram | twitter | linkedin | facebook
  headline: text("headline"),
  body: text("body"),
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
  exported: boolean("exported").default(false), // Changed to boolean
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;
