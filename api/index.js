// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// drizzle/schema.ts
import { pgSchema, varchar, text, timestamp, boolean, jsonb, serial, integer } from "drizzle-orm/pg-core";
var postsparkSchema = pgSchema("postspark");
var users = postsparkSchema.table("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 32 }).default("user").notNull(),
  // Using varchar for simplicity instead of pgEnum for now
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  // PostgreSQL doesn't have onUpdateNow natively in the same way, usually needs trigger. For simplicity keeping defaultNow.
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var posts = postsparkSchema.table("posts", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  inputType: varchar("inputType", { length: 16 }).notNull(),
  // text | url | image
  inputContent: text("inputContent").notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  // instagram | twitter | linkedin | facebook
  headline: text("headline"),
  body: text("body"),
  hashtags: jsonb("hashtags").$type(),
  // Changed to jsonb
  callToAction: text("callToAction"),
  tone: varchar("tone", { length: 64 }),
  imagePrompt: text("imagePrompt"),
  imageUrl: text("imageUrl"),
  backgroundColor: varchar("backgroundColor", { length: 32 }),
  textColor: varchar("textColor", { length: 32 }),
  accentColor: varchar("accentColor", { length: 32 }),
  layout: varchar("layout", { length: 32 }),
  postMode: varchar("postMode", { length: 32 }).default("static").notNull(),
  slides: jsonb("slides").$type(),
  textElements: jsonb("textElements").$type(),
  exported: boolean("exported").default(false),
  // Changed to boolean
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
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
  stripePriceTopupMega: process.env.STRIPE_PRICE_TOPUP_MEGA ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = postgres(process.env.DATABASE_URL, { prepare: false });
      _db = drizzle(client, { schema: { ...postsparkSchema, users, posts } });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function createPost(post) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(posts).values(post).returning({ id: posts.id });
  return result.id;
}
async function getUserPosts(userId, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(posts).where(eq(posts.userId, userId)).orderBy(desc(posts.createdAt)).limit(limit);
}
async function updatePost(postId, userId, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { id, ...updateData } = data;
  await db.update(posts).set(updateData).where(eq(posts.id, postId));
}
async function getPostById(postId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  return result[0];
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z2 } from "zod";

// server/_core/llm.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => {
  if (ENV.geminiApiKey) {
    return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  }
  if (ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0) {
    return `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`;
  }
  throw new Error("Nenhuma API configurada. Defina GEMINI_API_KEY no .env");
};
var resolveApiKey = () => ENV.geminiApiKey || ENV.forgeApiKey;
var assertApiKey = () => {
  if (!resolveApiKey()) {
    throw new Error("Nenhuma API key configurada. Defina GEMINI_API_KEY no .env");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format
  } = params;
  const payload = {
    model: "gemini-2.5-flash",
    messages: messages.map(normalizeMessage)
  };
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  payload.max_tokens = 8192;
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${resolveApiKey()}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new TRPCError3({
      code: "BAD_GATEWAY",
      message: `Gemini API failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    });
  }
  return await response.json();
}

// server/storage.ts
function getStorageConfig() {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}
function buildUploadUrl(baseUrl, relKey) {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}
function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function toFormData(data, contentType, fileName) {
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}
function buildAuthHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}` };
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

// server/_core/imageGeneration.ts
async function generateImage(options) {
  if (!ENV.forgeApiUrl) {
    throw new Error("BUILT_IN_FORGE_API_URL is not configured");
  }
  if (!ENV.forgeApiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
  }
  const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
  const fullUrl = new URL(
    "images.v1.ImageService/GenerateImage",
    baseUrl
  ).toString();
  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "connect-protocol-version": "1",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify({
      prompt: options.prompt,
      original_images: options.originalImages || []
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }
  const result = await response.json();
  const base64Data = result.image.b64Json;
  const buffer = Buffer.from(base64Data, "base64");
  const { url } = await storagePut(
    `generated/${Date.now()}.png`,
    buffer,
    result.image.mimeType
  );
  return {
    url
  };
}

// server/screenshotService.ts
var SCREENSHOT_SERVICE_URL = process.env.SCREENSHOT_SERVICE_URL;
var DEFAULT_TIMEOUT_MS = 3e4;
var BATCH_TIMEOUT_MS = 9e4;
function serviceUrl(path3) {
  return `${SCREENSHOT_SERVICE_URL}${path3}`;
}
function warnMissing(fn) {
  console.warn(`[screenshotService] ${fn}: SCREENSHOT_SERVICE_URL not configured`);
  return null;
}
async function captureScreenshot(url, type = "desktop") {
  console.log(`[screenshotService] Capturing ${type} screenshot for: ${url}`);
  if (!SCREENSHOT_SERVICE_URL) return warnMissing("captureScreenshot");
  const endpoint = type === "mobile" ? "/screenshot/mobile" : "/screenshot";
  try {
    const response = await fetch(serviceUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        viewport: type === "desktop" ? { width: 1440, height: 900 } : void 0
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.warn(`[screenshotService] /screenshot error: ${response.status} ${response.statusText}`);
      return null;
    }
    console.log(`[screenshotService] ${type} screenshot captured \u2713`);
    return await response.arrayBuffer();
  } catch (error) {
    console.warn(`[screenshotService] captureScreenshot failed:`, error);
    return null;
  }
}
async function captureMultipleScreenshots(urls, viewport = { width: 1440, height: 900 }, maxPages = 5) {
  if (!SCREENSHOT_SERVICE_URL) {
    warnMissing("captureMultipleScreenshots");
    return {};
  }
  if (urls.length === 0) return {};
  console.log(`[screenshotService] Multi-capture: ${urls.length} URL(s)`);
  try {
    const response = await fetch(serviceUrl("/screenshot/multi"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls, viewport, maxPages }),
      signal: AbortSignal.timeout(BATCH_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.warn(`[screenshotService] /screenshot/multi error: ${response.status}`);
      return {};
    }
    const json = await response.json();
    if (Object.keys(json.errors).length > 0) {
      console.warn("[screenshotService] Multi-capture partial errors:", json.errors);
    }
    const result = {};
    for (const [url, b64] of Object.entries(json.screenshots)) {
      result[url] = Buffer.from(b64, "base64").buffer;
    }
    console.log(`[screenshotService] Multi-capture: ${Object.keys(result).length}/${urls.length} succeeded \u2713`);
    return result;
  } catch (error) {
    console.warn(`[screenshotService] captureMultipleScreenshots failed:`, error);
    return {};
  }
}
async function captureElements(url, selectors, viewport = { width: 1440, height: 900 }) {
  if (!SCREENSHOT_SERVICE_URL) {
    warnMissing("captureElements");
    return {};
  }
  if (selectors.length === 0) return {};
  console.log(`[screenshotService] Element capture: ${selectors.length} selector(s) on ${url}`);
  try {
    const response = await fetch(serviceUrl("/screenshot/element"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, selectors, viewport }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.warn(`[screenshotService] /screenshot/element error: ${response.status}`);
      return {};
    }
    const json = await response.json();
    if (json.notFound.length > 0) {
      console.log(`[screenshotService] Elements not found: ${json.notFound.join(", ")}`);
    }
    const result = {};
    for (const [sel, b64] of Object.entries(json.elements)) {
      result[sel] = Buffer.from(b64, "base64").buffer;
    }
    console.log(`[screenshotService] Element capture: ${Object.keys(result).length}/${selectors.length} found \u2713`);
    return result;
  } catch (error) {
    console.warn(`[screenshotService] captureElements failed:`, error);
    return {};
  }
}
async function discoverPages(url, maxLinks = 8) {
  if (!SCREENSHOT_SERVICE_URL) {
    warnMissing("discoverPages");
    return [];
  }
  console.log(`[screenshotService] Discovering pages for: ${url}`);
  try {
    const response = await fetch(serviceUrl("/discover"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, maxLinks }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.warn(`[screenshotService] /discover error: ${response.status}`);
      return [];
    }
    const json = await response.json();
    console.log(`[screenshotService] Discovered ${json.discoveredPages.length} pages \u2713`);
    return json.discoveredPages;
  } catch (error) {
    console.warn(`[screenshotService] discoverPages failed:`, error);
    return [];
  }
}

// server/visionExtractor.ts
async function extractStylesFromScreenshot(screenshotBase64, url) {
  console.log("[visionExtractor] Analyzing screenshot for:", url);
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert visual design analyst, trained like a Senior Art Director.
Analyze website screenshots and extract precise visual design tokens.

For COLORS: Look at actual pixel colors in the screenshot. Identify:
- The dominant background color of the page
- The main text color
- The primary brand/accent color (buttons, links, highlights)
- A secondary color if visible
Report EXACT hex values from what you see \u2014 not generic defaults.

For TYPOGRAPHY: Identify whether fonts appear to be:
- Serif (like Times, Georgia, Playfair Display)
- Sans-serif (like Inter, Roboto, Helvetica)
- Monospace (like Courier, Fira Code)
- Display/decorative
Report the most likely font category, not exact font names.

For SPACING: Assess overall density and border-radius style from the UI.

Be precise and specific. Every website has a unique visual identity \u2014 capture it.`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this website screenshot (${url}) and extract the visual design system.
Return precise hex color values based on what you actually see in the image.`
          },
          {
            type: "image_url",
            image_url: {
              url: screenshotBase64,
              detail: "high"
            }
          }
        ]
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "vision_style_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            colors: {
              type: "object",
              properties: {
                primary: { type: "string", description: "Primary brand color hex (buttons, links, brand elements)" },
                secondary: { type: "string", description: "Secondary color hex" },
                background: { type: "string", description: "Main page background color hex" },
                text: { type: "string", description: "Main body text color hex" },
                accent: { type: "string", description: "Accent/highlight color hex (CTAs, hover states)" }
              },
              required: ["primary", "secondary", "background", "text", "accent"],
              additionalProperties: false
            },
            typography: {
              type: "object",
              properties: {
                headingFont: { type: "string", description: "Heading font name or category (e.g. 'Inter, sans-serif' or 'serif')" },
                bodyFont: { type: "string", description: "Body font name or category" }
              },
              required: ["headingFont", "bodyFont"],
              additionalProperties: false
            },
            spacing: {
              type: "object",
              properties: {
                density: { type: "string", enum: ["compact", "normal", "spacious"] },
                borderRadius: { type: "string", enum: ["square", "rounded", "pill"] }
              },
              required: ["density", "borderRadius"],
              additionalProperties: false
            },
            effects: {
              type: "object",
              properties: {
                shadows: { type: "boolean", description: "Does the UI use visible box shadows?" },
                gradients: { type: "boolean", description: "Are gradients visible in the design?" },
                darkMode: { type: "boolean", description: "Is this a dark-themed website?" }
              },
              required: ["shadows", "gradients", "darkMode"],
              additionalProperties: false
            },
            aesthetic: {
              type: "string",
              description: "Overall design aesthetic in 2-3 words (e.g. 'modern minimalist', 'bold corporate', 'playful colorful')"
            }
          },
          required: ["colors", "typography", "spacing", "effects", "aesthetic"],
          additionalProperties: false
        }
      }
    }
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from Vision LLM");
  const contentStr = typeof content === "string" ? content : JSON.stringify(content);
  const parsed = JSON.parse(contentStr);
  console.log("[visionExtractor] Vision extraction result:", {
    colors: parsed.colors,
    aesthetic: parsed.aesthetic,
    darkMode: parsed.effects.darkMode
  });
  return parsed;
}
function mergeExtractionResults(html, vision) {
  const isDefaultColor = (hex) => ["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"].includes(hex);
  const isDefaultFont = (font) => font === "Inter, sans-serif" || font === "Inter";
  return {
    colors: {
      // Vision colors take precedence when HTML returned defaults
      primary: isDefaultColor(html.colors.primary) ? vision.colors.primary : html.colors.primary,
      secondary: isDefaultColor(html.colors.secondary) ? vision.colors.secondary : html.colors.secondary,
      background: html.colors.background === "#ffffff" && vision.effects.darkMode ? vision.colors.background : isDefaultColor(html.colors.background) ? vision.colors.background : html.colors.background,
      text: html.colors.text === "#1f2937" && vision.effects.darkMode ? vision.colors.text : isDefaultColor(html.colors.text) ? vision.colors.text : html.colors.text,
      accent: isDefaultColor(html.colors.accent) ? vision.colors.accent : html.colors.accent,
      // Build palette from both sources
      palette: buildMergedPalette(html, vision)
    },
    typography: {
      // HTML font names are more precise (actual font names vs vision guesses)
      // But if HTML returned defaults, use vision's font category
      headingFont: isDefaultFont(html.typography.headingFont) ? vision.typography.headingFont : html.typography.headingFont,
      bodyFont: isDefaultFont(html.typography.bodyFont) ? vision.typography.bodyFont : html.typography.bodyFont,
      headingWeight: html.typography.headingWeight,
      bodyWeight: html.typography.bodyWeight
    },
    spacing: {
      // Vision spacing is usually more accurate (sees the actual rendered layout)
      density: html.spacing.density === "normal" ? vision.spacing.density : html.spacing.density,
      borderRadius: html.spacing.borderRadius === "rounded" ? vision.spacing.borderRadius : html.spacing.borderRadius,
      padding: html.spacing.padding
    },
    effects: {
      shadows: html.effects.shadows || vision.effects.shadows,
      gradients: html.effects.gradients || vision.effects.gradients,
      animations: html.effects.animations,
      glassmorphism: html.effects.glassmorphism,
      noise: html.effects.noise
    },
    metadata: html.metadata
  };
}
function buildMergedPalette(html, vision) {
  const seen = /* @__PURE__ */ new Set();
  const palette = [];
  for (const color of [vision.colors.primary, vision.colors.accent, vision.colors.secondary, vision.colors.background, vision.colors.text]) {
    const lower = color.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      palette.push(lower);
    }
  }
  const defaults = /* @__PURE__ */ new Set(["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ffffff", "#1f2937"]);
  for (const color of html.colors.palette) {
    const lower = color.toLowerCase();
    if (!seen.has(lower) && !defaults.has(lower)) {
      seen.add(lower);
      palette.push(lower);
    }
  }
  return palette.slice(0, 8);
}
function assessExtractionQuality(data) {
  let score = 0;
  const defaultColors = /* @__PURE__ */ new Set(["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"]);
  const realColors = data.colors.palette.filter((c) => !defaultColors.has(c));
  if (realColors.length >= 3) score += 0.3;
  else if (realColors.length >= 1) score += 0.15;
  if (!defaultColors.has(data.colors.primary)) score += 0.2;
  if (data.typography.headingFont !== "Inter, sans-serif") score += 0.15;
  if (data.typography.bodyFont !== "Inter, sans-serif") score += 0.1;
  if (data.effects.shadows || data.effects.gradients || data.effects.animations) score += 0.1;
  if (data.metadata?.siteName) score += 0.05;
  if (data.metadata?.favicon) score += 0.05;
  if (data.metadata?.logo) score += 0.05;
  return Math.min(1, score);
}

// server/styleExtractor.ts
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
}
function parseColorToHex(colorStr) {
  if (colorStr.startsWith("#")) {
    const hex = colorStr.slice(1);
    if (hex.length === 3) {
      return "#" + hex.split("").map((c) => c + c).join("");
    }
    return colorStr.length <= 7 ? colorStr : colorStr.slice(0, 7);
  }
  const rgbMatch = colorStr.match(/rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/i);
  if (rgbMatch) {
    return rgbToHex(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
  }
  const rgbaMatch = colorStr.match(/rgba\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgbaMatch) {
    return rgbToHex(parseInt(rgbaMatch[1]), parseInt(rgbaMatch[2]), parseInt(rgbaMatch[3]));
  }
  return null;
}
function isValidColor(hex) {
  if (hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1e3;
  return brightness > 20 && brightness < 235;
}
function getBrightness(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1e3;
}
function getSaturation(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}
function resolveUrl(url, baseUrl) {
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  try {
    const base = new URL(baseUrl);
    return new URL(url, base).href;
  } catch {
    return url;
  }
}
function getAllStyleContent(html) {
  const styleContent = html.match(/style\s*=\s*["'][^"']*["']/gi) || [];
  const styleTags = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  return [...styleContent, ...styleTags].join("\n");
}
async function fetchExternalStylesheets(html, baseUrl) {
  const linkPatterns = [
    /<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<link[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi
  ];
  const urls = /* @__PURE__ */ new Set();
  for (const pattern of linkPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const resolved = resolveUrl(match[1], baseUrl);
      if (resolved.startsWith("http") && !resolved.includes("fonts.googleapis.com")) {
        urls.add(resolved);
      }
    }
  }
  if (urls.size === 0) return "";
  console.log(`[styleExtractor] Fetching ${urls.size} external stylesheets`);
  const cssPromises = Array.from(urls).slice(0, 5).map(async (cssUrl) => {
    try {
      const res = await fetch(cssUrl, {
        signal: AbortSignal.timeout(5e3),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PostSpark Style Extractor/1.0)",
          "Accept": "text/css,*/*"
        }
      });
      if (!res.ok) return "";
      const text2 = await res.text();
      return text2.slice(0, 5e5);
    } catch {
      return "";
    }
  });
  const results = await Promise.all(cssPromises);
  const totalCss = results.join("\n");
  console.log(`[styleExtractor] Fetched ${totalCss.length} chars of external CSS`);
  return totalCss;
}
function extractGoogleFonts(html) {
  const fonts = [];
  const googleFontsPattern = /fonts\.googleapis\.com\/css2?\?[^"'<>]*family=([^"'<>]+)/gi;
  let match;
  while ((match = googleFontsPattern.exec(html)) !== null) {
    const familyStr = match[1];
    const familyParts = familyStr.split(/&(?:family=)?|\|/);
    for (const part of familyParts) {
      const fontName = decodeURIComponent(part.split(":")[0].replace(/\+/g, " ")).trim();
      if (fontName && !fontName.includes("=") && fontName.length > 1) {
        fonts.push(fontName);
      }
    }
  }
  return Array.from(new Set(fonts));
}
function classifyColor(hex, contextMap) {
  const brightness = getBrightness(hex);
  if (contextMap) {
    const entry = contextMap.get(hex.toLowerCase());
    if (entry) {
      if (entry.contexts.has("background")) return { type: "bg", brightness };
      if (entry.contexts.has("text")) return { type: "text", brightness };
      if (entry.contexts.has("accent") || entry.contexts.has("meta")) return { type: "accent", brightness };
    }
  }
  const saturation = getSaturation(hex);
  if (brightness < 50) return { type: "text", brightness };
  if (brightness > 200) return { type: "bg", brightness };
  if (saturation > 0.3) return { type: "accent", brightness };
  return { type: "bg", brightness };
}
function extractColorsWithContext(html) {
  const colorMap = /* @__PURE__ */ new Map();
  function addColor(hex, score, context) {
    if (!hex) return;
    hex = hex.toLowerCase();
    if (!isValidColor(hex)) return;
    const existing = colorMap.get(hex);
    if (existing) {
      existing.score += score;
      existing.contexts.add(context);
    } else {
      colorMap.set(hex, { hex, score, contexts: /* @__PURE__ */ new Set([context]) });
    }
  }
  const allStyles = getAllStyleContent(html);
  const metaThemeColor = html.match(/<meta[^>]*name\s*=\s*["']theme-color["'][^>]*content\s*=\s*["']([^"']+)["']/i);
  if (metaThemeColor) addColor(parseColorToHex(metaThemeColor[1]), 30, "meta");
  const metaTileColor = html.match(/<meta[^>]*name\s*=\s*["']msapplication-TileColor["'][^>]*content\s*=\s*["']([^"']+)["']/i);
  if (metaTileColor) addColor(parseColorToHex(metaTileColor[1]), 30, "meta");
  const brandVarPatterns = [
    { pattern: /--(?:primary|brand|main)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 25, ctx: "accent" },
    { pattern: /--(?:accent|highlight|cta|action)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 25, ctx: "accent" },
    { pattern: /--(?:bg|background|surface)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 20, ctx: "background" },
    { pattern: /--(?:text|foreground|body)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 20, ctx: "text" },
    { pattern: /--(?:color|secondary)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi, score: 15, ctx: "variable" }
  ];
  for (const { pattern, score, ctx } of brandVarPatterns) {
    let m2;
    while ((m2 = pattern.exec(allStyles)) !== null) {
      addColor(parseColorToHex(m2[1]), score, ctx);
    }
  }
  let m;
  const bodyBgPattern = /(?:body|html|:root)\s*\{[^}]*background(?:-color)?\s*:\s*([^;}\s]+)/gi;
  while ((m = bodyBgPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 20, "background");
  const bodyTextPattern = /(?:body|html)\s*\{[^}]*(?<![a-z-])color\s*:\s*([^;}\s]+)/gi;
  while ((m = bodyTextPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 20, "text");
  const btnPattern = /(?:button|\.btn|\.cta|a\.btn|input\[type=['"]submit['"]\]|\.button)\s*\{[^}]*(?:background(?:-color)?|color)\s*:\s*([^;}\s]+)/gi;
  while ((m = btnPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 15, "accent");
  const bgColorPattern = /background-color\s*:\s*([^;}"'\s]+)/gi;
  while ((m = bgColorPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 5, "background");
  const bgShortPattern = /background\s*:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]+\))/gi;
  while ((m = bgShortPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 5, "background");
  const textColorPattern = /(?<![a-z-])color\s*:\s*([^;}"'\s]+)/gi;
  while ((m = textColorPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 3, "text");
  const borderColorPattern = /border(?:-color)?\s*:\s*(?:\d+px\s+\w+\s+)?(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\))/gi;
  while ((m = borderColorPattern.exec(allStyles)) !== null) addColor(parseColorToHex(m[1]), 2, "border");
  const bgColor = html.match(/bgcolor\s*=\s*["']([^"']+)["']/i);
  if (bgColor) addColor(parseColorToHex(bgColor[1]), 5, "background");
  const hexPattern = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
  while ((m = hexPattern.exec(allStyles)) !== null) {
    let hex = "#" + m[1];
    if (hex.length === 4) hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    hex = hex.slice(0, 7).toLowerCase();
    addColor(hex, 1, "variable");
  }
  const rgbPattern = /rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/g;
  while ((m = rgbPattern.exec(allStyles)) !== null) {
    addColor(rgbToHex(parseInt(m[1]), parseInt(m[2]), parseInt(m[3])), 1, "variable");
  }
  const colors = Array.from(colorMap.values()).sort((a, b) => b.score - a.score).slice(0, 8).map((c) => c.hex);
  return { colors, contextMap: colorMap };
}
function extractTypographyFromHTML(html, googleFonts) {
  const allStyles = getAllStyleContent(html);
  let semanticHeadingFont = null;
  let semanticBodyFont = null;
  const headingCssPattern = /(?:^|\}|\s)(h[1-3])(?:\s*,\s*h[1-3])*\s*\{[^}]*font-family\s*:\s*([^;}"']+)/gi;
  let m;
  while ((m = headingCssPattern.exec(allStyles)) !== null) {
    const font = m[2].split(",")[0].replace(/["']/g, "").trim();
    if (font && font !== "inherit" && font !== "initial") {
      semanticHeadingFont = font;
      break;
    }
  }
  const bodyCssPattern = /(?:^|\}|\s)(?:body|p|\.text|\.content|\.body-text|main)\s*\{[^}]*font-family\s*:\s*([^;}"']+)/gi;
  while ((m = bodyCssPattern.exec(allStyles)) !== null) {
    const font = m[1].split(",")[0].replace(/["']/g, "").trim();
    if (font && font !== "inherit" && font !== "initial") {
      semanticBodyFont = font;
      break;
    }
  }
  if (!semanticHeadingFont) {
    const h1InlinePattern = /<h[1-3][^>]*style\s*=\s*["'][^"']*font-family\s*:\s*([^;}"']+)/gi;
    while ((m = h1InlinePattern.exec(html)) !== null) {
      const font = m[1].split(",")[0].replace(/["']/g, "").trim();
      if (font && font !== "inherit" && font !== "initial") {
        semanticHeadingFont = font;
        break;
      }
    }
  }
  const detectedGoogleFonts = googleFonts ?? extractGoogleFonts(html);
  if (!semanticHeadingFont && detectedGoogleFonts.length >= 1) {
    semanticHeadingFont = detectedGoogleFonts[0];
  }
  if (!semanticBodyFont && detectedGoogleFonts.length >= 2) {
    semanticBodyFont = detectedGoogleFonts[1];
  } else if (!semanticBodyFont && detectedGoogleFonts.length === 1) {
    semanticBodyFont = detectedGoogleFonts[0];
  }
  const fonts = /* @__PURE__ */ new Map();
  const weights = /* @__PURE__ */ new Map();
  const fontMatches = allStyles.match(/font-family\s*:\s*([^;}"']+)/gi) || [];
  for (const match of fontMatches) {
    const fontValue = match.replace(/font-family\s*:\s*/i, "").trim();
    const primaryFont = fontValue.split(",")[0].replace(/["']/g, "").trim();
    if (primaryFont && primaryFont !== "inherit" && primaryFont !== "initial") {
      fonts.set(primaryFont, (fonts.get(primaryFont) || 0) + 1);
    }
  }
  for (const gf of detectedGoogleFonts) {
    fonts.set(gf, (fonts.get(gf) || 0) + 50);
  }
  const weightMatches = allStyles.match(/font-weight\s*:\s*(\d+|normal|bold|lighter|bolder)/gi) || [];
  for (const match of weightMatches) {
    const weight = match.replace(/font-weight\s*:\s*/i, "").trim();
    weights.set(weight, (weights.get(weight) || 0) + 1);
  }
  const sortedFonts = Array.from(fonts.entries()).sort((a, b) => b[1] - a[1]);
  const sortedWeights = Array.from(weights.entries()).sort((a, b) => b[1] - a[1]);
  const bodyFont = semanticBodyFont || sortedFonts[0]?.[0] || "Inter, sans-serif";
  const headingFont = semanticHeadingFont || sortedFonts[1]?.[0] || bodyFont;
  const bodyWeight = sortedWeights.find(([w]) => w === "normal" || w === "400")?.[0] || "400";
  const headingWeight = sortedWeights.find(([w]) => w === "bold" || w === "600" || w === "700")?.[0] || "700";
  return {
    headingFont,
    bodyFont,
    headingWeight,
    bodyWeight
  };
}
function extractSpacingFromHTML(html) {
  const allStyles = getAllStyleContent(html);
  const paddingMatches = allStyles.match(/padding\s*:\s*(\d+)/gi) || [];
  const paddingValues = paddingMatches.map((m) => parseInt(m.match(/\d+/)?.[0] || "0"));
  const avgPadding = paddingValues.length > 0 ? paddingValues.reduce((a, b) => a + b, 0) / paddingValues.length : 16;
  let density = "normal";
  if (avgPadding < 10) density = "compact";
  else if (avgPadding > 24) density = "spacious";
  let padding = "normal";
  if (avgPadding < 12) padding = "tight";
  else if (avgPadding > 20) padding = "loose";
  const radiusMatches = allStyles.match(/border-radius\s*:\s*(\d+)(px|rem|em|%)/gi) || [];
  const radiusValues = radiusMatches.map((m) => parseInt(m.match(/\d+/)?.[0] || "0"));
  const avgRadius = radiusValues.length > 0 ? radiusValues.reduce((a, b) => a + b, 0) / radiusValues.length : 4;
  let borderRadius = "rounded";
  if (avgRadius === 0 || avgRadius < 2) borderRadius = "square";
  else if (avgRadius > 20) borderRadius = "pill";
  return { density, borderRadius, padding };
}
function detectEffectsFromHTML(html) {
  const allStyles = getAllStyleContent(html).toLowerCase();
  return {
    shadows: /box-shadow\s*:|text-shadow\s*:/.test(allStyles),
    gradients: /linear-gradient|radial-gradient|gradient\s*\(/.test(allStyles),
    animations: /animation\s*:|@keyframes|transition\s*:/.test(allStyles),
    glassmorphism: /backdrop-filter\s*:\s*blur|backdrop-filter\s*:\s*saturate/.test(allStyles),
    noise: /noise|grain|texture/.test(html.toLowerCase()) || /url\s*\([^)]*noise/.test(allStyles)
  };
}
function extractMetadata(html, baseUrl) {
  const metadata = {};
  const faviconMatch = html.match(/<link[^>]*rel\s*=\s*["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href\s*=\s*["']([^"']+)["']/i);
  if (faviconMatch) {
    metadata.favicon = resolveUrl(faviconMatch[1], baseUrl);
  }
  const ogImageMatch = html.match(/<meta[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i);
  if (ogImageMatch) {
    metadata.logo = resolveUrl(ogImageMatch[1], baseUrl);
  }
  const siteNameMatch = html.match(/<meta[^>]*property\s*=\s*["']og:site_name["'][^>]*content\s*=\s*["']([^"']+)["']/i);
  if (siteNameMatch) {
    metadata.siteName = siteNameMatch[1];
  }
  return metadata;
}
async function extractStyleFromUrlWithMeta(url) {
  console.log("[styleExtractor] \u2500\u2500 Hybrid Pipeline Start \u2500\u2500");
  console.log("[styleExtractor] URL:", url);
  const htmlResult = await extractFromHTML(url);
  const quality = assessExtractionQuality(htmlResult);
  console.log("[styleExtractor] HTML extraction quality score:", quality.toFixed(2));
  if (quality >= 0.6) {
    console.log("[styleExtractor] HTML extraction sufficient, skipping vision");
    console.log("[styleExtractor] \u2500\u2500 Hybrid Pipeline End (HTML only) \u2500\u2500");
    return { data: htmlResult, visionUsed: false };
  }
  console.log("[styleExtractor] Low quality HTML extraction, attempting vision fallback...");
  try {
    const screenshotBuffer = await captureScreenshot(url);
    if (!screenshotBuffer) {
      console.log("[styleExtractor] Screenshot capture failed, using HTML result as-is");
      return { data: htmlResult, visionUsed: false };
    }
    const screenshotBase64 = `data:image/png;base64,${Buffer.from(screenshotBuffer).toString("base64")}`;
    const visionResult = await extractStylesFromScreenshot(screenshotBase64, url);
    const merged = mergeExtractionResults(htmlResult, visionResult);
    console.log("[styleExtractor] \u2500\u2500 Hybrid Pipeline End (HTML + Vision merged) \u2500\u2500");
    return { data: merged, visionUsed: true };
  } catch (error) {
    console.warn("[styleExtractor] Vision extraction failed:", error);
    console.log("[styleExtractor] \u2500\u2500 Hybrid Pipeline End (HTML fallback) \u2500\u2500");
    return { data: htmlResult, visionUsed: false };
  }
}
async function extractFromHTML(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      },
      signal: AbortSignal.timeout(15e3)
    });
    console.log("[styleExtractor] Response status:", response.status);
    const html = await response.text();
    console.log("[styleExtractor] HTML length:", html.length, "characters");
    const externalCss = await fetchExternalStylesheets(html, url);
    const enrichedHtml = externalCss ? html + `
<style>${externalCss}</style>` : html;
    console.log("[styleExtractor] Enriched HTML length:", enrichedHtml.length, "characters");
    const googleFonts = extractGoogleFonts(html);
    if (googleFonts.length > 0) {
      console.log("[styleExtractor] Google Fonts detected:", googleFonts.join(", "));
    }
    const { colors, contextMap } = extractColorsWithContext(enrichedHtml);
    const typography = extractTypographyFromHTML(enrichedHtml, googleFonts);
    const spacing = extractSpacingFromHTML(enrichedHtml);
    const effects = detectEffectsFromHTML(enrichedHtml);
    const metadata = extractMetadata(html, url);
    const classifiedColors = colors.map((c) => ({ hex: c, ...classifyColor(c, contextMap) }));
    const bgColors = classifiedColors.filter((c) => c.type === "bg").map((c) => c.hex);
    const textColors = classifiedColors.filter((c) => c.type === "text").map((c) => c.hex);
    const accentColors = classifiedColors.filter((c) => c.type === "accent").map((c) => c.hex);
    console.log("[styleExtractor] Classification:", {
      bg: bgColors.slice(0, 2),
      text: textColors.slice(0, 2),
      accent: accentColors.slice(0, 2),
      totalPalette: colors.length
    });
    return {
      colors: {
        primary: accentColors[0] || colors[0] || "#6366f1",
        secondary: accentColors[1] || colors[1] || colors[0] || "#8b5cf6",
        background: bgColors[0] || "#ffffff",
        text: textColors[0] || "#1f2937",
        accent: accentColors[0] || colors[2] || "#f59e0b",
        palette: colors.slice(0, 8)
      },
      typography,
      spacing,
      effects,
      metadata
    };
  } catch (error) {
    console.error("HTML extraction failed:", error);
    return getDefaultStyleData();
  }
}
function getDefaultStyleData() {
  return {
    colors: {
      primary: "#6366f1",
      secondary: "#8b5cf6",
      background: "#ffffff",
      text: "#1f2937",
      accent: "#f59e0b",
      palette: ["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"]
    },
    typography: {
      headingFont: "Inter, sans-serif",
      bodyFont: "Inter, sans-serif",
      headingWeight: "700",
      bodyWeight: "400"
    },
    spacing: {
      density: "normal",
      borderRadius: "rounded",
      padding: "normal"
    },
    effects: {
      shadows: false,
      gradients: false,
      animations: false,
      glassmorphism: false,
      noise: false
    },
    metadata: {}
  };
}

// server/brandDNA.ts
var BRAND_ELEMENT_SELECTORS = [
  "header",
  "nav",
  '.hero, [class*="hero"], [class*="Hero"]',
  "footer",
  'button:not([aria-hidden]), .btn, [class*="btn-"], [class*="button-"]',
  "h1"
];
function mapPersonalityToComposition(dna) {
  const { seriousPlayful, luxuryAccessible, modernClassic, boldSubtle } = dna.personality;
  const { contrast, harmony } = dna.colors.colorRelationships;
  let rhythm;
  if (seriousPlayful < 35 && boldSubtle < 50) {
    rhythm = "staccato";
  } else if (seriousPlayful > 65 || luxuryAccessible > 70) {
    rhythm = "syncopated";
  } else {
    rhythm = "legato";
  }
  let harmonyRule;
  if (harmony === "complementary" || harmony === "split-complementary") {
    harmonyRule = "dissonant";
  } else if (harmony === "triadic") {
    harmonyRule = "resolved";
  } else {
    harmonyRule = "consonant";
  }
  let dynamics;
  if (boldSubtle < 35 && contrast === "high") {
    dynamics = "forte";
  } else if (boldSubtle > 65 || contrast === "low") {
    dynamics = "piano";
  } else {
    dynamics = "mezzo";
  }
  let tempo;
  if (modernClassic < 35 && luxuryAccessible > 60) {
    tempo = "allegro";
  } else if (modernClassic > 65 || luxuryAccessible < 35) {
    tempo = "adagio";
  } else {
    tempo = "andante";
  }
  return { rhythm, harmony: harmonyRule, dynamics, tempo };
}
function compositionToLayout(composition) {
  const densityMap = {
    allegro: "compact",
    andante: "normal",
    adagio: "spacious"
  };
  const radiusMap = {
    staccato: "square",
    legato: "rounded",
    syncopated: "pill"
  };
  const paddingMap = {
    allegro: "tight",
    andante: "normal",
    adagio: "loose"
  };
  const alignmentMap = {
    forte: "left",
    mezzo: "center",
    piano: "center"
  };
  return {
    density: densityMap[composition.tempo],
    borderRadius: radiusMap[composition.rhythm],
    padding: paddingMap[composition.tempo],
    preferredAlignment: alignmentMap[composition.dynamics]
  };
}
async function analyzeWithVision(screenshots, elementScreenshots, url) {
  const pageImages = screenshots.slice(0, 2);
  const elementImages = elementScreenshots.slice(0, 1);
  const allBuffers = [...pageImages, ...elementImages];
  if (allBuffers.length === 0) return null;
  console.log(`[brandDNA] Sending ${allBuffers.length} image(s) to Gemini Vision for brand analysis`);
  const imageContents = allBuffers.map((buf) => ({
    type: "image_url",
    image_url: {
      // Use 'low' detail to reduce token usage and avoid INVALID_ARGUMENT on large batches
      url: `data:image/png;base64,${Buffer.from(buf).toString("base64")}`,
      detail: "low"
    }
  }));
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a Senior Brand Strategist and Art Director who analyzes brand identities holistically.
You are looking at multiple screenshots of a website to extract its complete brand DNA.

Your analysis must be PRECISE and based on what you actually SEE in the images:
- Extract EXACT hex colors from the rendered interface (not guesses)
- Assess brand personality on each spectrum based on visual and tonal cues
- Identify emotional qualities that the design evokes
- Classify the industry/sector based on visual language clues

Be specific. Avoid generic defaults. Every brand has a unique identity.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze these ${allBuffers.length} screenshot(s) from the website: ${url}

I need a complete brand DNA analysis. Extract:
1. The brand name (from logo, title, or domain)
2. Industry/sector
3. Personality spectrum (score each axis 0-100 based on visual/tonal evidence)
4. Exact colors from the UI (primary CTA, background, text, accents)
5. Color relationship type (analogous/complementary/triadic/monochromatic)
6. Typography style (serif/sans/display \u2014 identify actual font names if visible)
7. Visual effects (shadows, gradients, glassmorphism, etc.)
8. Emotional profile (what feeling does this brand evoke?)
9. Card/UI style \u2014 what is the primary design language of the site's cards and components?
   - "neobrutalist": thick solid borders (2px+), hard offset drop shadows, flat colors, bold typography
   - "glass": frosted glass / backdrop blur effects, semi-transparent surfaces
   - "minimal": no borders, no drop shadows, maximum whitespace, typography-driven
   - "editorial": strong typographic hierarchy, serif fonts, accent rules/dividers, print-like grid
   - "flat": flat solid colors, subtle or no borders, no drop shadows (most modern apps/SaaS)

Return ONLY valid JSON matching the schema.`
            },
            ...imageContents
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "vision_brand_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              brandName: { type: "string" },
              industry: { type: "string" },
              personality: {
                type: "object",
                properties: {
                  seriousPlayful: { type: "number", description: "0=serious, 100=playful" },
                  luxuryAccessible: { type: "number", description: "0=luxury, 100=accessible" },
                  modernClassic: { type: "number", description: "0=modern, 100=classic" },
                  boldSubtle: { type: "number", description: "0=bold, 100=subtle" },
                  warmCool: { type: "number", description: "0=warm, 100=cool" }
                },
                required: ["seriousPlayful", "luxuryAccessible", "modernClassic", "boldSubtle", "warmCool"],
                additionalProperties: false
              },
              colors: {
                type: "object",
                properties: {
                  primary: { type: "string", description: "Primary brand/CTA color hex" },
                  secondary: { type: "string", description: "Secondary color hex" },
                  background: { type: "string", description: "Main background color hex" },
                  text: { type: "string", description: "Main body text color hex" },
                  accent: { type: "string", description: "Accent/highlight color hex" },
                  colorRelationships: {
                    type: "object",
                    properties: {
                      harmony: { type: "string", enum: ["complementary", "analogous", "triadic", "monochromatic", "split-complementary"] },
                      contrast: { type: "string", enum: ["high", "medium", "low"] },
                      temperature: { type: "string", enum: ["warm", "cool", "neutral"] }
                    },
                    required: ["harmony", "contrast", "temperature"],
                    additionalProperties: false
                  }
                },
                required: ["primary", "secondary", "background", "text", "accent", "colorRelationships"],
                additionalProperties: false
              },
              typography: {
                type: "object",
                properties: {
                  headingFont: { type: "string", description: "Heading font name or category" },
                  bodyFont: { type: "string", description: "Body font name or category" },
                  fontPairing: { type: "string", enum: ["matching", "contrasting", "complementary"] }
                },
                required: ["headingFont", "bodyFont", "fontPairing"],
                additionalProperties: false
              },
              effects: {
                type: "object",
                properties: {
                  shadows: { type: "boolean" },
                  gradients: { type: "boolean" },
                  animations: { type: "boolean" },
                  glassmorphism: { type: "boolean" },
                  noise: { type: "boolean" }
                },
                required: ["shadows", "gradients", "animations", "glassmorphism", "noise"],
                additionalProperties: false
              },
              emotionalProfile: {
                type: "object",
                properties: {
                  primary: { type: "string", description: "Primary emotional quality: trust, energy, calm, excitement, elegance, etc." },
                  secondary: { type: "string", description: "Secondary emotional quality" },
                  mood: { type: "string", description: '2-3 word mood descriptor, e.g. "confident professional"' }
                },
                required: ["primary", "secondary", "mood"],
                additionalProperties: false
              },
              cardStyle: {
                type: "string",
                enum: ["neobrutalist", "glass", "minimal", "editorial", "flat"],
                description: "Primary design language of the site's UI cards and components: neobrutalist=thick borders+offset shadow, glass=frosted blur, minimal=no borders/shadows, editorial=top accent rule+serif, flat=clean modern default"
              }
            },
            required: ["brandName", "industry", "personality", "colors", "typography", "effects", "emotionalProfile", "cardStyle"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from Vision LLM");
    const str = typeof content === "string" ? content : JSON.stringify(content);
    return JSON.parse(str);
  } catch (err) {
    console.warn("[brandDNA] Vision analysis failed:", err);
    return null;
  }
}
function deriveCardStyle(dna) {
  if (dna.effects.glassmorphism) return "glass";
  if (dna.effects.shadows && !dna.effects.gradients && dna.personality.boldSubtle < 45) return "neobrutalist";
  if (!dna.effects.shadows && !dna.effects.gradients && dna.personality.boldSubtle > 65) return "minimal";
  if (dna.typography.fontPairing === "contrasting" && dna.personality.modernClassic > 55) return "editorial";
  return "flat";
}
function buildFallbackPersonality() {
  return {
    seriousPlayful: 40,
    luxuryAccessible: 50,
    modernClassic: 30,
    boldSubtle: 40,
    warmCool: 50
  };
}
function buildFallbackEmotional() {
  return { primary: "trust", secondary: "competence", mood: "professional and reliable" };
}
async function extractBrandDNA(url) {
  console.log("[brandDNA] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log("[brandDNA] Starting extraction for:", url);
  const discovered = await discoverPages(url, 8);
  const highPriority = discovered.filter((p) => p.priority === "high").slice(0, 3);
  const urlsToCapture = [url, ...highPriority.map((p) => p.url)].slice(0, 5);
  console.log("[brandDNA] Pages to capture:", urlsToCapture);
  const [multiScreenshots, elementScreenshots, htmlResult] = await Promise.all([
    captureMultipleScreenshots(urlsToCapture),
    captureElements(url, BRAND_ELEMENT_SELECTORS),
    extractStyleFromUrlWithMeta(url)
  ]);
  const screenshotBuffers = Object.values(multiScreenshots);
  const elementBuffers = Object.values(elementScreenshots);
  const htmlData = htmlResult.data;
  console.log("[brandDNA] Screenshots:", screenshotBuffers.length, "| Elements:", elementBuffers.length);
  const visionAnalysis = await analyzeWithVision(screenshotBuffers, elementBuffers, url);
  const isDefaultColor = (hex) => ["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ffffff", "#1f2937"].includes(hex.toLowerCase());
  const colors = {
    primary: !isDefaultColor(htmlData.colors.primary) ? htmlData.colors.primary : visionAnalysis?.colors.primary ?? htmlData.colors.primary,
    secondary: !isDefaultColor(htmlData.colors.secondary) ? htmlData.colors.secondary : visionAnalysis?.colors.secondary ?? htmlData.colors.secondary,
    background: !isDefaultColor(htmlData.colors.background) ? htmlData.colors.background : visionAnalysis?.colors.background ?? htmlData.colors.background,
    text: !isDefaultColor(htmlData.colors.text) ? htmlData.colors.text : visionAnalysis?.colors.text ?? htmlData.colors.text,
    accent: !isDefaultColor(htmlData.colors.accent) ? htmlData.colors.accent : visionAnalysis?.colors.accent ?? htmlData.colors.accent,
    palette: htmlData.colors.palette.length >= 4 ? htmlData.colors.palette : [
      visionAnalysis?.colors.primary ?? htmlData.colors.primary,
      visionAnalysis?.colors.secondary ?? htmlData.colors.secondary,
      visionAnalysis?.colors.accent ?? htmlData.colors.accent,
      visionAnalysis?.colors.background ?? htmlData.colors.background,
      visionAnalysis?.colors.text ?? htmlData.colors.text,
      ...htmlData.colors.palette
    ].filter((c, i, arr) => arr.indexOf(c) === i).slice(0, 8),
    colorRelationships: visionAnalysis?.colors.colorRelationships ?? {
      harmony: "analogous",
      contrast: "medium",
      temperature: "neutral"
    }
  };
  const isDefaultFont = (f) => f === "Inter, sans-serif" || f === "Inter";
  const typography = {
    headingFont: !isDefaultFont(htmlData.typography.headingFont) ? htmlData.typography.headingFont : visionAnalysis?.typography.headingFont ?? htmlData.typography.headingFont,
    bodyFont: !isDefaultFont(htmlData.typography.bodyFont) ? htmlData.typography.bodyFont : visionAnalysis?.typography.bodyFont ?? htmlData.typography.bodyFont,
    headingWeight: htmlData.typography.headingWeight,
    bodyWeight: htmlData.typography.bodyWeight,
    fontPairing: visionAnalysis?.typography.fontPairing ?? "complementary"
  };
  const effects = {
    shadows: htmlData.effects.shadows || (visionAnalysis?.effects.shadows ?? false),
    gradients: htmlData.effects.gradients || (visionAnalysis?.effects.gradients ?? false),
    animations: htmlData.effects.animations || (visionAnalysis?.effects.animations ?? false),
    glassmorphism: htmlData.effects.glassmorphism || (visionAnalysis?.effects.glassmorphism ?? false),
    noise: htmlData.effects.noise || (visionAnalysis?.effects.noise ?? false)
  };
  const personality = visionAnalysis?.personality ?? buildFallbackPersonality();
  const emotionalProfile = visionAnalysis?.emotionalProfile ?? buildFallbackEmotional();
  const brandName = visionAnalysis?.brandName ?? htmlData.metadata?.siteName ?? new URL(url).hostname.replace(/^www\./, "");
  const industry = visionAnalysis?.industry ?? "Business";
  const composition = mapPersonalityToComposition({ personality, colors });
  const layoutBase = compositionToLayout(composition);
  const cardStyle = visionAnalysis?.cardStyle ?? deriveCardStyle({ effects, personality, typography });
  const layout = {
    ...layoutBase,
    cardStyle
  };
  console.log("[brandDNA] Card style resolved:", cardStyle, visionAnalysis?.cardStyle ? "(Vision)" : "(fallback)");
  const visionUsed = screenshotBuffers.length > 0 && visionAnalysis !== null;
  const realColors = colors.palette.filter((c) => !isDefaultColor(c));
  const extractionQuality = Math.min(1, (realColors.length >= 4 ? 0.4 : realColors.length * 0.1) + (visionUsed ? 0.4 : 0) + (htmlData.metadata?.siteName ? 0.1 : 0) + (typography.headingFont !== "Inter, sans-serif" ? 0.1 : 0));
  const brandDNA = {
    brandName,
    industry,
    personality,
    colors,
    typography,
    composition,
    layout,
    effects,
    emotionalProfile,
    metadata: {
      sourceUrl: url,
      pagesAnalyzed: urlsToCapture.length,
      extractionQuality,
      visionUsed,
      favicon: htmlData.metadata?.favicon,
      logo: htmlData.metadata?.logo,
      siteName: htmlData.metadata?.siteName
    }
  };
  console.log("[brandDNA] Extraction complete:", {
    brandName: brandDNA.brandName,
    industry: brandDNA.industry,
    mood: brandDNA.emotionalProfile.mood,
    composition: brandDNA.composition,
    quality: brandDNA.metadata.extractionQuality.toFixed(2),
    visionUsed: brandDNA.metadata.visionUsed
  });
  console.log("[brandDNA] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  return brandDNA;
}

// server/brandThemeGenerator.ts
function getBrightness2(hex) {
  const h = hex.replace("#", "");
  if (h.length < 6) return 128;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1e3;
}
function isDark(hex) {
  return getBrightness2(hex) < 128;
}
function mixColors(hex1, hex2, ratio = 0.5) {
  const h1 = hex1.replace("#", "");
  const h2 = hex2.replace("#", "");
  if (h1.length < 6 || h2.length < 6) return hex1;
  const r = Math.round(parseInt(h1.slice(0, 2), 16) * (1 - ratio) + parseInt(h2.slice(0, 2), 16) * ratio);
  const g = Math.round(parseInt(h1.slice(2, 4), 16) * (1 - ratio) + parseInt(h2.slice(2, 4), 16) * ratio);
  const b = Math.round(parseInt(h1.slice(4, 6), 16) * (1 - ratio) + parseInt(h2.slice(4, 6), 16) * ratio);
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}
function invertCardStyle(style) {
  switch (style) {
    case "neobrutalist":
      return "minimal";
    case "minimal":
      return "neobrutalist";
    case "glass":
      return "flat";
    case "editorial":
      return "flat";
    case "flat":
    default:
      return "flat";
  }
}
function rhythmToDecoration(rhythm) {
  return rhythm === "staccato" ? "none" : rhythm === "syncopated" ? "glitch" : "none";
}
function dynamicsToHeadingSize(dynamics) {
  return dynamics === "forte" ? "2.5rem" : dynamics === "mezzo" ? "2rem" : "1.75rem";
}
function buildSurface(bg) {
  const dark = isDark(bg);
  return dark ? mixColors(bg, "#ffffff", 0.08) : mixColors(bg, "#000000", 0.05);
}
function buildEffects(dna, composition) {
  const isGlowStyle = dna.emotionalProfile.primary === "energy" || dna.emotionalProfile.primary === "excitement";
  return {
    glow: isGlowStyle && composition.dynamics === "forte",
    noise: dna.effects.noise || composition.rhythm === "staccato",
    glitch: composition.rhythm === "syncopated" && composition.dynamics === "forte",
    grid: dna.industry.toLowerCase().includes("tech") || dna.industry.toLowerCase().includes("saas")
  };
}
function buildSyntheticPattern(dna, variationName, confidence) {
  const { seriousPlayful, modernClassic, boldSubtle } = dna.personality;
  const category = boldSubtle < 30 && modernClassic < 30 ? "neon" : seriousPlayful > 70 ? "playful" : seriousPlayful < 30 && boldSubtle < 50 ? "corporate" : boldSubtle > 70 ? "minimalist" : modernClassic > 70 ? "classic" : "modern";
  return {
    id: `dna-${variationName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    name: variationName,
    category,
    confidence,
    characteristics: [
      dna.emotionalProfile.mood,
      dna.industry,
      `${dna.composition.rhythm} rhythm`
    ],
    description: `${dna.emotionalProfile.mood} \u2014 extracted from ${dna.metadata.siteName ?? dna.brandName}`,
    suggestedColors: {
      bg: dna.colors.background,
      text: dna.colors.text,
      accent: dna.colors.accent,
      secondary: dna.colors.secondary
    }
  };
}
function buildBrandFaithful(dna, url) {
  const { composition, layout } = dna;
  const effects = buildEffects(dna, composition);
  return {
    id: `temp-brand-${Date.now()}-0`,
    label: `${dna.brandName} \xB7 Original`,
    description: `Fiel ao DNA visual: ${dna.emotionalProfile.mood}`,
    category: "brand",
    source: "website-extraction",
    sourceUrl: url,
    designPattern: buildSyntheticPattern(dna, "Brand Faithful", 92),
    isTemporary: true,
    createdAt: Date.now(),
    colors: {
      bg: dna.colors.background,
      text: dna.colors.text,
      accent: dna.colors.primary,
      surface: buildSurface(dna.colors.background)
    },
    typography: {
      headingFont: dna.typography.headingFont,
      bodyFont: dna.typography.bodyFont,
      headingSize: dynamicsToHeadingSize(composition.dynamics),
      bodySize: "1rem"
    },
    layout: {
      alignment: layout.preferredAlignment,
      borderStyle: layout.borderRadius,
      decoration: rhythmToDecoration(composition.rhythm),
      padding: layout.padding,
      // Brand Faithful: use the extracted cardStyle directly — highest fidelity to the site
      cardStyle: dna.layout.cardStyle
    },
    effects,
    brandMeta: {
      logoUrl: dna.metadata.logo,
      brandName: dna.brandName,
      favicon: dna.metadata.favicon
    }
  };
}
function buildHarmoniousRemix(dna, url) {
  const remixRhythm = dna.composition.rhythm === "staccato" ? "legato" : dna.composition.rhythm === "legato" ? "syncopated" : "staccato";
  const remixComposition = {
    ...dna.composition,
    rhythm: remixRhythm,
    dynamics: dna.composition.dynamics === "forte" ? "mezzo" : "forte"
  };
  const remixLayout = compositionToLayout(remixComposition);
  const bg = isDark(dna.colors.background) ? dna.colors.background : dna.colors.secondary;
  const accent = dna.colors.accent !== dna.colors.primary ? dna.colors.accent : dna.colors.secondary;
  const effects = buildEffects(dna, remixComposition);
  return {
    id: `temp-remix-${Date.now()}-1`,
    label: `${dna.brandName} \xB7 Remix`,
    description: `Mesma personalidade, nova composi\xE7\xE3o: ${remixRhythm} rhythm`,
    category: "remix",
    source: "website-extraction",
    sourceUrl: url,
    designPattern: buildSyntheticPattern(dna, "Harmonious Remix", 78),
    isTemporary: true,
    createdAt: Date.now() + 1,
    colors: {
      bg,
      text: isDark(bg) ? "#f5f5f5" : dna.colors.text,
      accent,
      surface: buildSurface(bg)
    },
    typography: {
      headingFont: dna.typography.headingFont,
      bodyFont: dna.typography.bodyFont,
      headingSize: dynamicsToHeadingSize(remixComposition.dynamics),
      bodySize: "1rem"
    },
    layout: {
      alignment: "center",
      borderStyle: remixLayout.borderRadius,
      decoration: rhythmToDecoration(remixRhythm),
      padding: remixLayout.padding,
      // Harmonious Remix: soften neobrutalist to flat for variety; others carry through
      cardStyle: dna.layout.cardStyle === "neobrutalist" ? "flat" : dna.layout.cardStyle
    },
    effects,
    brandMeta: {
      logoUrl: dna.metadata.logo,
      brandName: dna.brandName,
      favicon: dna.metadata.favicon
    }
  };
}
function buildDisruptiveContrast(dna, url) {
  const { seriousPlayful, boldSubtle, modernClassic } = dna.personality;
  const disruptiveComposition = {
    rhythm: "staccato",
    harmony: dna.composition.harmony === "consonant" ? "dissonant" : "consonant",
    dynamics: "forte",
    tempo: "allegro"
  };
  const disruptiveLayout = compositionToLayout(disruptiveComposition);
  let bg;
  let accent;
  let text2;
  if (isDark(dna.colors.background)) {
    bg = "#f8fafc";
    text2 = "#0f172a";
    accent = dna.colors.primary;
  } else if (seriousPlayful < 40) {
    bg = mixColors(dna.colors.primary, "#0a0a0a", 0.75);
    text2 = "#f5f5f5";
    accent = dna.colors.accent !== dna.colors.primary ? dna.colors.accent : dna.colors.primary;
  } else {
    bg = dna.colors.primary;
    text2 = isDark(dna.colors.primary) ? "#ffffff" : "#000000";
    accent = isDark(dna.colors.primary) ? "#ffffff" : dna.colors.background;
  }
  const effects = {
    glow: boldSubtle < 50,
    noise: modernClassic > 60,
    glitch: seriousPlayful > 60,
    grid: !isDark(bg)
  };
  return {
    id: `temp-disruptive-${Date.now()}-2`,
    label: `${dna.brandName} \xB7 Contraste`,
    description: `Ruptura criativa: invers\xE3o de ${seriousPlayful < 40 ? "tom" : boldSubtle > 60 ? "din\xE2mica" : "paleta"}`,
    category: "disruptive",
    source: "website-extraction",
    sourceUrl: url,
    designPattern: buildSyntheticPattern(dna, "Disruptive Contrast", 65),
    isTemporary: true,
    createdAt: Date.now() + 2,
    colors: {
      bg,
      text: text2,
      accent,
      surface: buildSurface(bg)
    },
    typography: {
      headingFont: dna.typography.headingFont,
      bodyFont: dna.typography.bodyFont,
      headingSize: "2.75rem",
      bodySize: "1rem"
    },
    layout: {
      alignment: disruptiveLayout.preferredAlignment,
      borderStyle: "square",
      decoration: "none",
      padding: disruptiveLayout.padding,
      // Disruptive Contrast: inverts the cardStyle for maximum visual tension
      cardStyle: invertCardStyle(dna.layout.cardStyle)
    },
    effects,
    brandMeta: {
      logoUrl: dna.metadata.logo,
      brandName: dna.brandName,
      favicon: dna.metadata.favicon
    }
  };
}
function generateThemesFromBrandDNA(dna, url) {
  console.log("[brandThemeGenerator] Generating 3 variations for:", dna.brandName);
  const themes = [
    buildBrandFaithful(dna, url),
    buildHarmoniousRemix(dna, url),
    buildDisruptiveContrast(dna, url)
  ];
  themes.forEach((t2, i) => {
    console.log(`[brandThemeGenerator] Variation ${i + 1}:`, {
      label: t2.label,
      category: t2.category,
      bg: t2.colors.bg,
      accent: t2.colors.accent,
      composition: `${t2.layout.borderStyle} \xB7 ${t2.layout.alignment} \xB7 ${t2.layout.padding}`
    });
  });
  return themes;
}

// server/chameleon.ts
function mapFontCategory(headingFont) {
  const lower = headingFont.toLowerCase();
  if (lower.includes("mono") || lower.includes("code") || lower.includes("courier")) return "mono";
  if (lower.includes("serif") || lower.includes("georgia") || lower.includes("playfair") || lower.includes("merriweather") || lower.includes("lora")) return "serif";
  if (lower.includes("display") || lower.includes("bebas") || lower.includes("oswald") || lower.includes("impact") || lower.includes("black")) return "display";
  return "sans";
}
async function analyzeBrandFromUrl(url) {
  try {
    const dna = await extractBrandDNA(url);
    return {
      brandColors: {
        primary: dna.colors.primary,
        secondary: dna.colors.secondary
      },
      logoUrl: dna.metadata.logo,
      fontCategory: mapFontCategory(dna.typography.headingFont),
      summary: `${dna.brandName} \u2014 ${dna.industry}. ${dna.emotionalProfile.mood}. ${dna.emotionalProfile.primary} brand identity.`,
      brandName: dna.brandName,
      dna
    };
  } catch (error) {
    console.warn("[chameleon] extractBrandDNA failed, falling back to mock:", error);
    return mockScrapeUrl(url);
  }
}
async function mockScrapeUrl(url) {
  const mocks = {
    apple: {
      brandColors: { primary: "#555555", secondary: "#FFFFFF" },
      logoUrl: "https://www.apple.com/favicon.ico",
      fontCategory: "sans",
      summary: "Apple Inc. - Technology company known for innovative products and sleek design.",
      brandName: "Apple"
    },
    google: {
      brandColors: { primary: "#4285F4", secondary: "#FFFFFF" },
      logoUrl: "https://www.google.com/favicon.ico",
      fontCategory: "sans",
      summary: "Google - Search engine and technology company with a focus on simplicity.",
      brandName: "Google"
    },
    nike: {
      brandColors: { primary: "#111111", secondary: "#FFFFFF" },
      logoUrl: "https://www.nike.com/favicon.ico",
      fontCategory: "sans",
      summary: "Nike - Athletic footwear and apparel company with a sporty aesthetic.",
      brandName: "Nike"
    },
    starbucks: {
      brandColors: { primary: "#00704A", secondary: "#FFFFFF" },
      logoUrl: "https://www.starbucks.com/favicon.ico",
      fontCategory: "sans",
      summary: "Starbucks - Coffee company known for premium beverages and cozy ambiance.",
      brandName: "Starbucks"
    }
  };
  const lowerUrl = url.toLowerCase();
  for (const [key, data] of Object.entries(mocks)) {
    if (lowerUrl.includes(key)) return data;
  }
  return {
    brandColors: { primary: "#FF6B6B", secondary: "#F5F5F5" },
    fontCategory: "sans",
    summary: "Brand website - Modern design with professional aesthetic.",
    brandName: "Brand"
  };
}
function generateCardThemeVariations(brandAnalysis) {
  if (brandAnalysis.dna) {
    const themes = generateThemesFromBrandDNA(brandAnalysis.dna, brandAnalysis.dna.metadata.sourceUrl);
    return themes.map((t2, i) => ({
      themeId: t2.id,
      themeName: t2.label,
      description: t2.description,
      brandColors: { primary: t2.colors.accent, secondary: t2.colors.bg },
      type: i === 0 ? "brand-match" : i === 1 ? "remix-safe" : "remix-disruptive"
    }));
  }
  return [
    {
      themeId: "brand-custom",
      themeName: "Brand Match",
      description: "Clone your brand identity exactly",
      brandColors: brandAnalysis.brandColors,
      type: "brand-match"
    },
    {
      themeId: "swiss-modern",
      themeName: "Remix Seguro",
      description: "Swiss Modern with your brand accent",
      brandColors: { primary: brandAnalysis.brandColors.primary, secondary: "#FFFFFF" },
      type: "remix-safe"
    },
    {
      themeId: "cyber-core",
      themeName: "Remix Disruptivo",
      description: "Bold neon aesthetic for maximum impact",
      type: "remix-disruptive"
    }
  ];
}

// server/imageGenerateBackground.ts
function wrapPrompt(userPrompt) {
  return `Photorealistic or abstract background art for a social media post. Theme: ${userPrompt}. High quality, vibrant colors. Absolutely no text, no letters, no words, no logos, no typography, no UI elements.`;
}
async function generateBackgroundImage(prompt, provider = "pollinations_fast") {
  console.log(`[ImageGen] Request: provider=${provider}, prompt="${prompt.substring(0, 50)}..."`);
  const modelId = provider === "pollinations_hd" ? "nanobanana-pro" : "nanobanana";
  const enhancedPrompt = wrapPrompt(prompt);
  const encodedPrompt = encodeURIComponent(enhancedPrompt);
  const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${modelId}&nologo=true&width=1080&height=1080&enhance=true`;
  console.log(`[ImageGen] Pollinations Model Select: ${modelId}`);
  const headers = {
    "User-Agent": "PostSpark/1.0",
    "Accept": "image/jpeg, image/png, image/*"
  };
  const apiKey = process.env.POLLINATIONS_API_KEY;
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    console.warn("[ImageGen] WARNING: POLLINATIONS_API_KEY is missing. Using unauthenticated public endpoint (Rate Limits may apply).");
  }
  try {
    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "No error body");
      console.error(`[ImageGen] Pollinations Error: ${response.status} ${response.statusText} - ${errorText}`);
      throw new Error(`Pollinations API failed: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error(`[ImageGen] Critical Request Error:`, error);
    throw error;
  }
}

// server/designPatternAnalyzer.ts
async function analyzeDesignPattern(data, url) {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a design pattern analyst. Analyze website style data and classify the design patterns.

Return JSON with up to 3 design patterns that match the website's visual style.
Each pattern should have:
- id: unique identifier (kebab-case)
- name: display name (title case)
- category: one of: modern, brutalist, neon, classic, playful, corporate, artistic, minimalist, retro, futuristic
- confidence: 0-100 (how confident you are this pattern matches)
- characteristics: array of 3-5 characteristic names
- description: brief description (max 100 chars)

Consider:
- Color palette (dark = modern/brutalist/neon, light = classic/minimalist, colorful = playful/artistic)
- Typography (serif = classic/retro, sans = modern/corporate, mono = neon/futuristic)
- Effects (gradients/glow = neon/futuristic, minimal effects = minimalist/modern)
- Spacing (spacious = modern/minimalist, compact = brutalist/corporate)`
        },
        {
          role: "user",
          content: `Analyze this website style data and classify design patterns:

URL: ${url}

IMPORTANT CONTEXT: This website data may be incomplete because many modern websites (Next.js, React SPAs) 
render content dynamically. The HTML we captured may be minimal (just the app shell).
In that case, use the URL domain name, brand name, and any available clues to make smart inferences about the 
website's visual identity and design style. Do NOT default to generic "modern/corporate" patterns unless truly warranted.

Colors extracted (may be defaults if SPA):
- Primary: ${data.colors.primary}
- Secondary: ${data.colors.secondary}
- Background: ${data.colors.background}
- Text: ${data.colors.text}
- Accent: ${data.colors.accent}
- Palette: ${data.colors.palette.length > 0 ? data.colors.palette.join(", ") : "(none found - likely SPA, infer from brand)"}

Typography:
- Heading Font: ${data.typography.headingFont}
- Body Font: ${data.typography.bodyFont}
- Heading Weight: ${data.typography.headingWeight}
- Body Weight: ${data.typography.bodyWeight}

Spacing:
- Density: ${data.spacing.density}
- Border Radius: ${data.spacing.borderRadius}
- Padding: ${data.spacing.padding}

Effects:
- Shadows: ${data.effects.shadows}
- Gradients: ${data.effects.gradients}
- Animations: ${data.effects.animations}
- Glassmorphism: ${data.effects.glassmorphism}
- Noise: ${data.effects.noise}

${data.metadata?.siteName ? `Site Name: ${data.metadata.siteName}` : ""}

CRITICAL: If the palette is empty (SPA), you MUST infer the brand's likely visual identity from:
1. The URL/domain name (what kind of product/service is it?)
2. The brand name (startup, SaaS, agency, etc.)
3. Industry conventions (productivity apps = modern/clean, events/party = playful/colorful, finance = corporate)

For each pattern you return, also specify the ACTUAL HEX COLORS that best represent this brand, not generic defaults.
Add an optional field "suggestedColors" with {bg, text, accent, secondary} hex values.

Return exactly 2-3 patterns that best describe this website's design.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "design_patterns",
          strict: true,
          schema: {
            type: "object",
            properties: {
              patterns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    category: {
                      type: "string",
                      enum: [
                        "modern",
                        "brutalist",
                        "neon",
                        "classic",
                        "playful",
                        "corporate",
                        "artistic",
                        "minimalist",
                        "retro",
                        "futuristic"
                      ]
                    },
                    confidence: { type: "number", minimum: 0, maximum: 100 },
                    characteristics: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 3,
                      maxItems: 5
                    },
                    description: { type: "string", maxLength: 100 },
                    suggestedColors: {
                      type: "object",
                      properties: {
                        bg: { type: "string" },
                        text: { type: "string" },
                        accent: { type: "string" },
                        secondary: { type: "string" }
                      },
                      required: ["bg", "text", "accent", "secondary"],
                      additionalProperties: false
                    }
                  },
                  required: ["id", "name", "category", "confidence", "characteristics", "description", "suggestedColors"],
                  additionalProperties: false
                },
                minItems: 2,
                maxItems: 3
              }
            },
            required: ["patterns"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from LLM");
    const contentStr = typeof content === "string" ? content : JSON.stringify(content);
    const parsed = JSON.parse(contentStr);
    return parsed.patterns.map((p, i) => ({
      id: p.id || `pattern-${i}`,
      name: p.name,
      category: p.category,
      confidence: Math.min(100, Math.max(0, p.confidence)),
      characteristics: p.characteristics,
      description: p.description,
      suggestedColors: p.suggestedColors
    }));
  } catch (error) {
    console.error("Pattern analysis failed:", error);
    return generateFallbackPatterns(data);
  }
}
function generateFallbackPatterns(data) {
  const patterns = [];
  const bgBrightness = getColorBrightness(data.colors.background);
  const isDark2 = bgBrightness < 128;
  const hasVibrantColors = data.colors.palette.some((c) => getColorSaturation(c) > 0.5);
  if (isDark2 && hasVibrantColors) {
    patterns.push({
      id: "dark-modern",
      name: "Dark Modern",
      category: "modern",
      confidence: 75,
      characteristics: ["Dark background", "Vibrant accents", "High contrast"],
      description: "Modern dark theme with vibrant color accents",
      suggestedColors: CATEGORY_PALETTES.modern
    });
  } else if (isDark2) {
    patterns.push({
      id: "minimalist-dark",
      name: "Minimalist Dark",
      category: "minimalist",
      confidence: 70,
      characteristics: ["Dark theme", "Minimal colors", "Clean layout"],
      description: "Clean dark minimalist design",
      suggestedColors: CATEGORY_PALETTES.minimalist
    });
  } else if (hasVibrantColors) {
    patterns.push({
      id: "playful-modern",
      name: "Playful Modern",
      category: "playful",
      confidence: 70,
      characteristics: ["Colorful palette", "Light background", "Vibrant accents"],
      description: "Light modern design with colorful accents",
      suggestedColors: CATEGORY_PALETTES.playful
    });
  } else {
    patterns.push({
      id: "clean-modern",
      name: "Clean Modern",
      category: "modern",
      confidence: 75,
      characteristics: ["Clean layout", "Balanced colors", "Professional look"],
      description: "Professional modern design",
      suggestedColors: CATEGORY_PALETTES.modern
    });
  }
  const isSerif = data.typography.headingFont.toLowerCase().includes("serif");
  if (isSerif) {
    patterns.push({
      id: "elegant-classic",
      name: "Elegant Classic",
      category: "classic",
      confidence: 65,
      characteristics: ["Serif typography", "Elegant feel", "Traditional style"],
      description: "Classic elegant design with serif typography",
      suggestedColors: CATEGORY_PALETTES.classic
    });
  }
  if (patterns.length < 2) {
    patterns.push({
      id: "professional-clean",
      name: "Professional Clean",
      category: "corporate",
      confidence: 60,
      characteristics: ["Clean design", "Professional look", "Balanced spacing"],
      description: "Professional clean corporate style",
      suggestedColors: CATEGORY_PALETTES.corporate
    });
  }
  return patterns;
}
function generateThemesFromPatterns(patterns, data, url) {
  return patterns.map((pattern, index) => {
    const themeId = `temp-${Date.now()}-${index}`;
    const category = pattern.confidence > 80 ? "brand" : pattern.confidence > 60 ? "remix" : "disruptive";
    const effects = mapPatternToEffects(pattern.category);
    const decoration = mapPatternToDecoration(pattern.category);
    const hasExtractedColors = data.colors.palette.length > 2;
    let themeColors;
    if (!hasExtractedColors && pattern.suggestedColors) {
      console.log(`[generateThemes] Using LLM suggested colors for ${pattern.name}:`, pattern.suggestedColors);
      themeColors = {
        bg: pattern.suggestedColors.bg,
        text: pattern.suggestedColors.text,
        accent: pattern.suggestedColors.accent,
        surface: pattern.suggestedColors.secondary
      };
    } else {
      const colors = adjustColorsForPattern(data.colors, pattern.category);
      themeColors = {
        bg: colors.background,
        text: colors.text,
        accent: colors.accent,
        surface: colors.secondary
      };
    }
    return {
      id: themeId,
      label: pattern.name,
      description: pattern.description,
      category,
      source: "website-extraction",
      sourceUrl: url,
      designPattern: pattern,
      isTemporary: true,
      createdAt: Date.now(),
      colors: themeColors,
      typography: {
        headingFont: mapFontForPattern(data.typography.headingFont, pattern.category),
        bodyFont: mapFontForPattern(data.typography.bodyFont, pattern.category),
        headingSize: mapHeadingSizeForPattern(pattern.category),
        bodySize: mapBodySizeForPattern(pattern.category)
      },
      layout: {
        alignment: mapAlignmentForPattern(pattern.category),
        borderStyle: data.spacing.borderRadius,
        decoration,
        padding: mapPaddingForPattern(data.spacing.padding)
      },
      effects
    };
  });
}
function mapPatternToEffects(category) {
  const effectMap = {
    modern: { glow: false, noise: false },
    brutalist: { noise: true },
    neon: { glow: true, glitch: true },
    classic: {},
    playful: { glow: false },
    corporate: {},
    artistic: { noise: true },
    minimalist: {},
    retro: { noise: true },
    futuristic: { glow: true, grid: true }
  };
  return effectMap[category] || {};
}
function mapPatternToDecoration(category) {
  const decorationMap = {
    modern: "none",
    brutalist: "noise",
    neon: "glitch",
    classic: "none",
    playful: "none",
    corporate: "none",
    artistic: "noise",
    minimalist: "none",
    retro: "noise",
    futuristic: "grid"
  };
  return decorationMap[category] || "none";
}
var CATEGORY_PALETTES = {
  modern: { bg: "#0f0f0f", text: "#ffffff", accent: "#6366f1", secondary: "#1a1a2e" },
  brutalist: { bg: "#111111", text: "#ffffff", accent: "#ff5277", secondary: "#1a1a1a" },
  neon: { bg: "#0a0a0f", text: "#00ffff", accent: "#ff00ff", secondary: "#151520" },
  classic: { bg: "#faf8f3", text: "#2d2d2d", accent: "#8b4513", secondary: "#f0ebe0" },
  playful: { bg: "#fff5f5", text: "#2d2d2d", accent: "#ff6b6b", secondary: "#ffe4e4" },
  corporate: { bg: "#f8fafc", text: "#1e293b", accent: "#0f172a", secondary: "#e2e8f0" },
  artistic: { bg: "#1a1a1a", text: "#f5f5f5", accent: "#ffd700", secondary: "#2a2a2a" },
  minimalist: { bg: "#ffffff", text: "#1a1a1a", accent: "#6366f1", secondary: "#f5f5f5" },
  retro: { bg: "#f4e4bc", text: "#3d2914", accent: "#d4594a", secondary: "#e8d5a3" },
  futuristic: { bg: "#050510", text: "#00ff88", accent: "#00d4ff", secondary: "#0a0a1a" }
};
function adjustColorsForPattern(colors, category) {
  const palette = CATEGORY_PALETTES[category] || CATEGORY_PALETTES.modern;
  const hasExtractedColors = colors.palette.length > 2;
  if (hasExtractedColors) {
    const bgBrightness = getColorBrightness(colors.background);
    if (["neon", "brutalist", "futuristic"].includes(category)) {
      if (bgBrightness > 128) {
        return {
          ...colors,
          background: palette.bg,
          text: palette.text
        };
      }
    }
    if (category === "classic" && bgBrightness < 200) {
      return {
        ...colors,
        background: palette.bg,
        text: palette.text
      };
    }
    return colors;
  }
  return {
    primary: palette.accent,
    secondary: palette.secondary,
    background: palette.bg,
    text: palette.text,
    accent: palette.accent,
    palette: [palette.accent, palette.secondary, palette.text, palette.bg]
  };
}
function mapFontForPattern(originalFont, category) {
  const fontMap = {
    modern: "'Inter', sans-serif",
    brutalist: "'Space Mono', monospace",
    neon: "'Space Mono', monospace",
    classic: "'Playfair Display', serif",
    playful: "'Quicksand', sans-serif",
    corporate: "'Inter', sans-serif",
    artistic: originalFont.includes("serif") ? "'Playfair Display', serif" : "'Inter', sans-serif",
    minimalist: "'Inter', sans-serif",
    retro: "'Garamond', serif",
    futuristic: "'Space Mono', monospace"
  };
  return fontMap[category] || originalFont;
}
function mapHeadingSizeForPattern(category) {
  const sizeMap = {
    modern: "2.5rem",
    brutalist: "3rem",
    neon: "1.8rem",
    classic: "2.8rem",
    playful: "2.2rem",
    corporate: "2rem",
    artistic: "2.6rem",
    minimalist: "2.2rem",
    retro: "2.8rem",
    futuristic: "1.6rem"
  };
  return sizeMap[category] || "2rem";
}
function mapBodySizeForPattern(category) {
  const sizeMap = {
    modern: "1rem",
    brutalist: "0.9rem",
    neon: "0.85rem",
    classic: "1.1rem",
    playful: "1rem",
    corporate: "0.9rem",
    artistic: "1rem",
    minimalist: "0.9rem",
    retro: "1.1rem",
    futuristic: "0.8rem"
  };
  return sizeMap[category] || "1rem";
}
function mapAlignmentForPattern(category) {
  const alignmentMap = {
    modern: "center",
    brutalist: "left",
    neon: "left",
    classic: "left",
    playful: "center",
    corporate: "left",
    artistic: "center",
    minimalist: "center",
    retro: "left",
    futuristic: "left"
  };
  return alignmentMap[category] || "center";
}
function mapPaddingForPattern(padding) {
  const paddingMap = {
    tight: "1rem",
    normal: "1.5rem",
    loose: "2rem"
  };
  return paddingMap[padding] || "1.5rem";
}
function getColorBrightness(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1e3;
}
function getColorSaturation(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return (max - min) / (1 - Math.abs(2 * l - 1));
}

// server/postJudge.ts
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  if (h.length < 6) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}
function relativeLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
function contrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 1;
  const l1 = relativeLuminance(...rgb1);
  const l2 = relativeLuminance(...rgb2);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}
function contrastToScore(ratio) {
  if (ratio >= 7) return 100;
  if (ratio >= 4.5) return 75;
  if (ratio >= 3) return 50;
  if (ratio >= 2) return 30;
  return 15;
}
async function evaluatePostQuality(variations, brandDNA) {
  if (variations.length === 0) return [];
  console.log(`[postJudge] Evaluating ${variations.length} variation(s)...`);
  const contrastScores = variations.map((v) => ({
    textContrast: contrastToScore(contrastRatio(v.backgroundColor, v.textColor)),
    accentContrast: contrastToScore(contrastRatio(v.backgroundColor, v.accentColor))
  }));
  const brandContext = brandDNA ? `
Brand DNA Context:
- Brand: ${brandDNA.brandName} (${brandDNA.industry})
- Mood: ${brandDNA.emotionalProfile.mood}
- Primary color: ${brandDNA.colors.primary}
- Personality: serious=${100 - brandDNA.personality.seriousPlayful}/100, bold=${100 - brandDNA.personality.boldSubtle}/100
- Composition: ${brandDNA.composition.rhythm} rhythm, ${brandDNA.composition.dynamics} dynamics` : "No brand DNA provided \u2014 evaluate without brand alignment context.";
  const variationsSummary = variations.map(
    (v, i) => `
Variation ${i + 1}:
- Headline: "${v.headline}"
- Body: "${v.body.slice(0, 120)}${v.body.length > 120 ? "..." : ""}"
- CTA: "${v.callToAction}"
- Layout: ${v.layout}
- Colors: bg=${v.backgroundColor}, text=${v.textColor}, accent=${v.accentColor}
- Platform: ${v.platform}
- Measured contrast ratio (text/bg): ${contrastRatio(v.backgroundColor, v.textColor).toFixed(1)}:1`
  ).join("\n");
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a Senior Brand Strategist and Social Media Art Director.
Your task is to evaluate ${variations.length} social media post variation(s) as an expert judge.

Evaluate each variation on these dimensions (0-100 each):
1. **brandAlignment** \u2014 how well do the copy/colors/tone match the brand's DNA? (50 if no brand DNA)
2. **aestheticQuality** \u2014 NIMA-inspired: is the visual composition appealing? Consider color harmony, contrast, visual hierarchy
3. **readability** \u2014 Is the text easy to read? Consider contrast, length, hierarchy (use the measured contrast data provided)
4. **messageClarity** \u2014 VQAScore-inspired: does every element serve the main message? Is the CTA clear?
5. **engagement** \u2014 will this catch attention on social media? Consider hook strength, emotional pull, shareability

For each variation, also provide:
- Up to 3 specific, actionable improvement suggestions (concrete, not generic)
- A verdict: "excellent" (avg \u2265 80), "good" (avg \u2265 60), "needs-improvement" (avg < 60)

Be honest and specific. Avoid inflated scores \u2014 real feedback is more valuable.`
        },
        {
          role: "user",
          content: `${brandContext}

${variationsSummary}

Evaluate all ${variations.length} variation(s). Return JSON matching the schema exactly.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "post_quality_evaluation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              evaluations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    overallScore: { type: "number", description: "Average of all dimensions (0-100)" },
                    dimensions: {
                      type: "object",
                      properties: {
                        brandAlignment: { type: "number" },
                        aestheticQuality: { type: "number" },
                        readability: { type: "number" },
                        messageClarity: { type: "number" },
                        engagement: { type: "number" }
                      },
                      required: ["brandAlignment", "aestheticQuality", "readability", "messageClarity", "engagement"],
                      additionalProperties: false
                    },
                    suggestions: {
                      type: "array",
                      items: { type: "string" }
                    },
                    verdict: { type: "string", enum: ["excellent", "good", "needs-improvement"] }
                  },
                  required: ["overallScore", "dimensions", "suggestions", "verdict"],
                  additionalProperties: false
                }
              }
            },
            required: ["evaluations"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from Judge LLM");
    const str = typeof content === "string" ? content : JSON.stringify(content);
    const parsed = JSON.parse(str);
    const merged = parsed.evaluations.map((ev, i) => {
      const cs = contrastScores[i];
      if (!cs) return ev;
      const blendedReadability = Math.round(ev.dimensions.readability * 0.7 + cs.textContrast * 0.3);
      const dims = { ...ev.dimensions, readability: blendedReadability };
      const overall = Math.round(
        (dims.brandAlignment + dims.aestheticQuality + dims.readability + dims.messageClarity + dims.engagement) / 5
      );
      const verdict = overall >= 80 ? "excellent" : overall >= 60 ? "good" : "needs-improvement";
      return { ...ev, dimensions: dims, overallScore: overall, verdict };
    });
    console.log("[postJudge] Evaluation complete:", merged.map((e) => ({
      score: e.overallScore,
      verdict: e.verdict
    })));
    return merged;
  } catch (err) {
    console.warn("[postJudge] LLM evaluation failed:", err);
    return variations.map((v, i) => ({
      overallScore: 70,
      dimensions: {
        brandAlignment: 70,
        aestheticQuality: 70,
        readability: contrastScores[i]?.textContrast ?? 70,
        messageClarity: 70,
        engagement: 70
      },
      suggestions: [],
      verdict: "good"
    }));
  }
}

// server/chameleonVision.ts
function buildChameleonPrompt(siteContent) {
  const contextBlock = siteContent ? `
Contexto textual extra\xEDdo do site:
${siteContent.slice(0, 2e3)}
` : "";
  return `Voc\xEA \xE9 um Desenvolvedor Front-end Senior, Diretor de Arte e Copywriter de elite.
Analise a imagem desta Landing Page / Website anexa e clone a ess\xEAncia do design dela para posts de rede social.

Sua miss\xE3o:

1. EXTRAIR A IDENTIDADE VISUAL (Cores HEX exatas):
   - background: cor predominante de fundo da p\xE1gina
   - card: cor de fundo dos blocos/cards/se\xE7\xF5es de conte\xFAdo
   - primary: cor de destaque principal (bot\xF5es, CTAs, links)
   - secondary: cor de suporte (badges, \xEDcones secund\xE1rios)
   - text: cor do texto principal

2. EXTRAIR DESIGN TOKENS (valores CSS exatos):
   - borderRadius: avalie o site e retorne EXATAMENTE um destes valores:
     "0px" = quinas totalmente retas/secas
     "8px" = cantos levemente arredondados
     "16px" = arredondamento m\xE9dio
     "24px" = bem arredondado
   - boxShadow: qual estilo de sombra o site usa?
     "none" = sem sombra
     "0 10px 25px rgba(0,0,0,0.1)" = sombra suave elegante
     "0 20px 40px rgba(0,0,0,0.2)" = sombra suave forte
     "8px 8px 0px 0px #000000" = sombra neo-brutalista (offset duro)
   - border: qual estilo de borda nos cards/elementos?
     "none" = sem borda
     "1px solid rgba(0,0,0,0.1)" = borda fina sutil
     "2px solid #000000" = borda marcada
     "4px solid #000000" = borda grossa brutalista
   - textAlign: t\xEDtulos e textos principais s\xE3o alinhados \xE0 esquerda ("left") ou centralizados ("center")?
   - textTransform: t\xEDtulos est\xE3o em CAIXA ALTA ("uppercase") ou normal ("none")?
   - decorations: o design \xE9 limpo/minimalista ("minimal") ou usa elementos decorativos soltos como confetes, selos, formas geom\xE9tricas ("playful")?

3. DETECTAR TIPOGRAFIA:
   - originalFont: qual \xE9 a fonte que o site aparenta usar? (seu melhor palpite)
   - fontFamily: escolha a fonte GRATUITA equivalente mais pr\xF3xima do Google Fonts.
     Op\xE7\xF5es comuns: Inter, Roboto, Montserrat, Poppins, Lato, Open Sans, Raleway, Work Sans,
     Quicksand, Space Grotesk, Playfair Display, Merriweather, Lora, PT Serif, Crimson Text,
     Oswald, Bebas Neue, Syne, Anton, Righteous, Space Mono, JetBrains Mono

4. CRIAR 7 OP\xC7\xD5ES DE COPYWRITING baseadas no produto/servi\xE7o do site:
   - Op\xE7\xE3o 1 (dor): Foque no PROBLEMA que o produto resolve. Gancho provocativo.
   - Op\xE7\xE3o 2 (beneficio): Foque no RESULTADO DESEJADO. Gancho aspiracional.
   - Op\xE7\xE3o 3 (objecao): Quebre uma OBJE\xC7\xC3O comum. Gancho desmistificador.
   - Op\xE7\xE3o 4 (autoridade): Use PROVA SOCIAL ou dados. Gancho de credibilidade.
   - Op\xE7\xE3o 5 (escassez): Crie URG\xCANCIA ou exclusividade. Gancho de escassez.
   - Op\xE7\xE3o 6 (storytelling): Conte uma pequena hist\xF3ria de jornada ou transforma\xE7\xE3o. Gancho narrativo.
   - Op\xE7\xE3o 7 (mito_vs_verdade): Desminta um mito de mercado e mostre a verdade do produto. Gancho de revela\xE7\xE3o.

   Para CADA op\xE7\xE3o:
   - badge: nome curto da marca/produto (m\xE1x 15 caracteres)
   - headline: gancho de IMPACTO (m\xE1ximo 5 palavras, sem ponto final)
   - subheadline: explica\xE7\xE3o clara (m\xE1ximo 12 palavras)
   - stickerText: UMA palavra decorativa de impacto (ex: "Magia", "Pr\xE1tico", "F\xE1cil", "Novo", "Top")
${contextBlock}
Retorne ESTRITAMENTE um JSON v\xE1lido no formato especificado. Sem markdown, sem explica\xE7\xF5es.`;
}
var CHAMELEON_SCHEMA = {
  type: "object",
  properties: {
    colors: {
      type: "object",
      properties: {
        background: { type: "string", description: "Background color HEX" },
        primary: { type: "string", description: "Primary/CTA color HEX" },
        secondary: { type: "string", description: "Secondary color HEX" },
        text: { type: "string", description: "Text color HEX" },
        card: { type: "string", description: "Card/surface background HEX" }
      },
      required: ["background", "primary", "secondary", "text", "card"],
      additionalProperties: false
    },
    designTokens: {
      type: "object",
      properties: {
        borderRadius: { type: "string" },
        boxShadow: { type: "string" },
        border: { type: "string" },
        textAlign: { type: "string", enum: ["left", "center"] },
        originalFont: { type: "string" },
        fontFamily: { type: "string" },
        textTransform: { type: "string", enum: ["none", "uppercase"] },
        decorations: { type: "string", enum: ["minimal", "playful"] }
      },
      required: ["borderRadius", "boxShadow", "border", "textAlign", "originalFont", "fontFamily", "textTransform", "decorations"],
      additionalProperties: false
    },
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          angle: { type: "string", enum: ["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"] },
          badge: { type: "string" },
          headline: { type: "string" },
          subheadline: { type: "string" },
          stickerText: { type: "string" }
        },
        required: ["label", "angle", "badge", "headline", "subheadline", "stickerText"],
        additionalProperties: false
      }
    }
  },
  required: ["colors", "designTokens", "posts"],
  additionalProperties: false
};
async function chameleonVision(screenshot, siteContent) {
  console.log("[chameleonVision] Starting direct extraction...");
  const base64 = Buffer.from(screenshot).toString("base64");
  const promptText = buildChameleonPrompt(siteContent);
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "Voc\xEA \xE9 um assistente criativo que s\xF3 responde em JSON v\xE1lido. Nunca inclua markdown, explica\xE7\xF5es ou texto fora do JSON."
        },
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64}`,
                detail: "low"
              }
            }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "chameleon_vision_result",
          strict: true,
          schema: CHAMELEON_SCHEMA
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from Vision LLM");
    const str = typeof content === "string" ? content : JSON.stringify(content);
    let cleaned = str.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    else if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.colors?.background || !parsed.designTokens || !Array.isArray(parsed.posts)) {
      console.warn("[chameleonVision] Invalid response structure, returning null");
      return null;
    }
    const requiredAngles = ["dor", "beneficio", "objecao", "autoridade", "escassez"];
    const existingAngles = new Set(parsed.posts.map((p) => p.angle));
    for (const angle of requiredAngles) {
      if (!existingAngles.has(angle)) {
        parsed.posts.push({
          label: angle.charAt(0).toUpperCase() + angle.slice(1),
          angle,
          badge: parsed.posts[0]?.badge || "Marca",
          headline: "Headline pendente",
          subheadline: "Subheadline pendente",
          stickerText: "Novo"
        });
      }
    }
    console.log(`[chameleonVision] Extraction complete: ${parsed.posts.length} copy angles, font: ${parsed.designTokens.fontFamily}`);
    return parsed;
  } catch (err) {
    console.error("[chameleonVision] Extraction failed:", err);
    return null;
  }
}

// shared/postspark.ts
function chameleonResultToDesignTokens(result) {
  return {
    colors: result.colors,
    typography: {
      fontFamily: result.designTokens.fontFamily,
      customFontUrl: "",
      originalFont: result.designTokens.originalFont,
      textTransform: result.designTokens.textTransform,
      textAlign: result.designTokens.textAlign
    },
    structure: {
      borderRadius: result.designTokens.borderRadius,
      boxShadow: result.designTokens.boxShadow,
      border: result.designTokens.border
    },
    decorations: result.designTokens.decorations
  };
}

// server/routers.ts
import * as fs from "fs";
import * as path from "path";

// server/billing.ts
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
var SPARK_COSTS = {
  GENERATE_TEXT: 10,
  // 3 variações de texto
  GENERATE_IMAGE: 25,
  // imagem IA
  REGEN_IMAGE: 10,
  // regenerar imagem (mesma sessão)
  CHAMELEON: 15,
  // ChameleonProtocol
  CAROUSEL: 40
  // carrossel completo (texto + imagem)
};
var _stripe = null;
function getStripe() {
  if (!_stripe) {
    if (!ENV.stripeSecretKey) throw new Error("STRIPE_SECRET_KEY not set");
    _stripe = new Stripe(ENV.stripeSecretKey, { apiVersion: "2026-01-28.clover" });
  }
  return _stripe;
}
var _supabase = null;
function getSupabase() {
  if (!_supabase) {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
    }
    _supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false },
      db: { schema: "postspark" }
    });
  }
  return _supabase;
}
var FREE_PROFILE_DEFAULTS = {
  plan: "FREE",
  sparks: 150,
  sparks_refill_date: null,
  stripe_customer_id: null
};
async function getBillingProfile(email) {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    return { id: "dev-mock", email, ...FREE_PROFILE_DEFAULTS };
  }
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from("profiles").select("id, email, plan, sparks, sparks_refill_date, stripe_customer_id").eq("email", email).single();
    if (error || !data) {
      return { id: "no-profile", email, ...FREE_PROFILE_DEFAULTS };
    }
    return data;
  } catch {
    return { id: "error", email, ...FREE_PROFILE_DEFAULTS };
  }
}
async function debitSparks(profileId, amount, description) {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) return { success: true };
  if (profileId === "dev-mock" || profileId === "no-profile" || profileId === "error") {
    return { success: true };
  }
  try {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("debit_sparks", {
      p_user_id: profileId,
      p_amount: amount,
      p_description: description
    });
    if (error) return { success: false, reason: error.message };
    return { success: Boolean(data), reason: data ? void 0 : "insufficient_sparks" };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}
async function getTopupPackages() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) return [];
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from("topup_packages").select("*").eq("active", true).order("price_brl", { ascending: true });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}
async function getOrCreateStripeCustomer(profileId, email, name) {
  const sb = getSupabase();
  const { data: profile } = await sb.from("profiles").select("stripe_customer_id").eq("id", profileId).single();
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;
  const stripe = getStripe();
  const customer = await stripe.customers.create({ email, name });
  await sb.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", profileId);
  return customer.id;
}
async function createSubscriptionCheckout(params) {
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
      metadata: { profile_id: params.profileId, email: params.email }
    }
  });
  return session.url;
}
async function createTopupCheckout(params) {
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
      type: "topup"
    }
  });
  return session.url;
}
async function handleStripeWebhook(event) {
  const sb = getSupabase();
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const meta = session.metadata ?? {};
      const profileId = meta.profile_id;
      const email = meta.email;
      if (!profileId || !email) return;
      if (meta.type === "topup") {
        const packageId = meta.package_id;
        if (!packageId || !session.payment_intent) return;
        await sb.rpc("process_topup", {
          p_user_id: profileId,
          p_package_id: packageId,
          p_stripe_payment_intent_id: session.payment_intent
        });
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const meta = sub.metadata ?? {};
      const profileId = meta.profile_id;
      if (!profileId) return;
      const plan = getPlanFromPriceId(sub.items?.data?.[0]?.price?.id ?? "");
      const status = mapStripeStatus(sub.status);
      const periodStart = sub.current_period_start ?? sub.items?.data?.[0]?.period?.start;
      const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.period?.end;
      await sb.from("subscriptions").upsert({
        stripe_subscription_id: sub.id,
        user_id: profileId,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
        plan,
        status,
        current_period_start: periodStart ? new Date(periodStart * 1e3).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1e3).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        billing_cycle: sub.items?.data?.[0]?.price?.recurring?.interval === "year" ? "annual" : "monthly"
      }, { onConflict: "stripe_subscription_id" });
      if (status === "active" || status === "trialing") {
        await sb.from("profiles").update({ plan }).eq("id", profileId);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const meta = sub.metadata ?? {};
      const profileId = meta.profile_id;
      if (!profileId) return;
      await sb.from("profiles").update({ plan: "FREE" }).eq("id", profileId);
      await sb.from("subscriptions").update({ status: "canceled" }).eq("stripe_subscription_id", sub.id);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription ?? invoice.subscription_details?.subscription;
      if (!subscriptionId) return;
      await sb.from("subscriptions").update({ status: "past_due" }).eq("stripe_subscription_id", subscriptionId);
      break;
    }
    case "payment_intent.succeeded": {
      break;
    }
  }
}
function getPlanFromPriceId(priceId) {
  if (priceId === ENV.stripePriceAgencyMonthly || priceId === ENV.stripePriceAgencyAnnual) {
    return "AGENCY";
  }
  return "PRO";
}
function mapStripeStatus(status) {
  switch (status) {
    case "active":
      return "active";
    case "canceled":
      return "canceled";
    case "past_due":
      return "past_due";
    case "trialing":
      return "trialing";
    case "paused":
      return "paused";
    default:
      return "active";
  }
}

// server/routers.ts
import { TRPCError as TRPCError4 } from "@trpc/server";
function safeJsonParse(str, fallback) {
  let cleaned = str.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx !== -1 && (endIdx === -1 || endIdx > startIdx)) {
    cleaned = cleaned.substring(startIdx, endIdx !== -1 ? endIdx + 1 : void 0);
  }
  const tryParse = (jsonStr) => {
    try {
      const repaired = jsonStr.replace(/,\s*([\]}])/g, "$1");
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  };
  let result = tryParse(cleaned);
  if (result) return result;
  console.warn("[safeJsonParse] Initial parse failed. Attempting heuristic repair...");
  let repairAttempt = cleaned;
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < repairAttempt.length; i++) {
    const char = repairAttempt[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") stack.push("{");
    else if (char === "[") stack.push("[");
    else if (char === "}") stack.pop();
    else if (char === "]") stack.pop();
  }
  if (inString) {
    repairAttempt += '"';
  }
  while (stack.length > 0) {
    const last = stack.pop();
    if (last === "{") repairAttempt += "}";
    else if (last === "[") repairAttempt += "]";
  }
  result = tryParse(repairAttempt);
  if (result) {
    console.log("[safeJsonParse] Heuristic repair successful.");
    return result;
  }
  console.error("[safeJsonParse] Failed to parse JSON even after repair.");
  console.error("[safeJsonParse] Input snippet (100 chars):", str.substring(0, 100));
  return fallback;
}
var billingRouter = router({
  /** Retorna perfil de billing do usuário logado (plano, sparks, etc.) */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const email = ctx.user.email ?? "dev@local.dev";
    return getBillingProfile(email);
  }),
  /** Inicia trial de 7 dias (anti-abuso por e-mail + IP) */
  startTrial: protectedProcedure.input(z2.object({
    plan: z2.enum(["PRO", "AGENCY"]).default("PRO")
  })).mutation(async ({ input, ctx }) => {
    const email = ctx.user.email ?? "";
    const ip = ctx.req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? ctx.req.socket.remoteAddress ?? "0.0.0.0";
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      return { success: true, reason: "ok" };
    }
    const profile = await getBillingProfile(email);
    if (profile.id === "no-profile" || profile.id === "error" || profile.id === "dev-mock") {
      return { success: false, reason: "profile_not_found" };
    }
    const sb = getSupabase();
    const { data, error } = await sb.rpc("start_trial", {
      p_user_id: profile.id,
      p_email: email,
      p_ip_address: ip,
      p_plan: input.plan
    });
    if (error) return { success: false, reason: error.message };
    return data;
  }),
  /** Cria Stripe Checkout Session para assinatura */
  createCheckout: protectedProcedure.input(z2.object({
    priceId: z2.string(),
    successPath: z2.string().default("/billing/success"),
    cancelPath: z2.string().default("/pricing")
  })).mutation(async ({ input, ctx }) => {
    const email = ctx.user.email ?? "";
    const name = ctx.user.name ?? void 0;
    const profile = await getBillingProfile(email);
    if (profile.id === "no-profile" || profile.id === "error") {
      throw new TRPCError4({ code: "PRECONDITION_FAILED", message: "Perfil de billing n\xE3o encontrado." });
    }
    const host = `${ctx.req.protocol}://${ctx.req.get("host")}`;
    const url = await createSubscriptionCheckout({
      profileId: profile.id,
      email,
      name,
      priceId: input.priceId,
      successUrl: `${host}${input.successPath}`,
      cancelUrl: `${host}${input.cancelPath}`
    });
    return { url };
  }),
  /** Lista pacotes de top-up ativos */
  getTopupPackages: publicProcedure.query(async () => {
    return getTopupPackages();
  }),
  /** Cria Stripe Checkout Session para top-up avulso */
  createTopupCheckout: protectedProcedure.input(z2.object({
    packageId: z2.string(),
    successPath: z2.string().default("/billing/topup-success"),
    cancelPath: z2.string().default("/billing")
  })).mutation(async ({ input, ctx }) => {
    const email = ctx.user.email ?? "";
    const name = ctx.user.name ?? void 0;
    const packages = await getTopupPackages();
    const pkg = packages.find((p) => p.id === input.packageId);
    if (!pkg) throw new TRPCError4({ code: "NOT_FOUND", message: "Pacote n\xE3o encontrado." });
    const profile = await getBillingProfile(email);
    if (profile.id === "no-profile" || profile.id === "error") {
      throw new TRPCError4({ code: "PRECONDITION_FAILED", message: "Perfil de billing n\xE3o encontrado." });
    }
    const host = `${ctx.req.protocol}://${ctx.req.get("host")}`;
    const url = await createTopupCheckout({
      profileId: profile.id,
      email,
      name,
      priceId: pkg.stripe_price_id,
      packageId: pkg.id,
      successUrl: `${host}${input.successPath}`,
      cancelUrl: `${host}${input.cancelPath}`
    });
    return { url };
  }),
  /** Retorna os price IDs disponíveis (para o frontend montar o checkout) */
  getPriceIds: publicProcedure.query(() => ({
    pro: {
      monthly: ENV.stripePriceProMonthly,
      annual: ENV.stripePriceProAnnual
    },
    agency: {
      monthly: ENV.stripePriceAgencyMonthly,
      annual: ENV.stripePriceAgencyAnnual
    }
  }))
});
var appRouter = router({
  system: systemRouter,
  billing: billingRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  post: router({
    /** Generate 3 post variations from user input */
    generate: protectedProcedure.input(z2.object({
      inputType: z2.enum(["text", "url", "image"]),
      content: z2.string().min(1),
      platform: z2.enum(["instagram", "twitter", "linkedin", "facebook"]),
      imageUrl: z2.string().optional(),
      tone: z2.string().optional(),
      postMode: z2.enum(["static", "carousel"]).default("static"),
      model: z2.enum(["gemini", "llama"]).optional()
    })).mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "dev@local.dev";
      const profile = await getBillingProfile(email);
      const cost = input.postMode === "carousel" ? SPARK_COSTS.CAROUSEL : SPARK_COSTS.GENERATE_TEXT;
      const debit = await debitSparks(profile.id, cost, `Gera\xE7\xE3o de post (${input.postMode})`);
      if (!debit.success) {
        throw new TRPCError4({
          code: "PAYMENT_REQUIRED",
          message: "Sparks insuficientes. Fa\xE7a upgrade ou adquira um pacote de recarga."
        });
      }
      let contextContent = input.content;
      let brandDnaContext = "";
      let chameleonResult = null;
      if (input.inputType === "url") {
        try {
          const scrapeResult = await scrapeUrl(input.content);
          contextContent = `URL: ${input.content}
T\xEDtulo: ${scrapeResult.title}
Descri\xE7\xE3o: ${scrapeResult.description}
Conte\xFAdo: ${scrapeResult.content}`;
          const [screenshot, brandDNA] = await Promise.all([
            captureScreenshot(input.content).catch(() => null),
            extractBrandDNA(input.content).catch((err) => {
              console.warn("Falha ao extrair Brand DNA no processamento da gera\xE7\xE3o.", err);
              return null;
            })
          ]);
          if (screenshot) {
            try {
              chameleonResult = await chameleonVision(screenshot, contextContent);
              if (chameleonResult) {
                console.log("[Chameleon Vision] Extraction successful \u2014 CSS tokens + 5 copy angles ready");
              }
            } catch (cvErr) {
              console.warn("[Chameleon Vision] Failed, falling back to BrandDNA:", cvErr);
            }
          }
          if (brandDNA) {
            brandDnaContext = `

INSTRU\xC7\xD5ES DE CLONAGEM DE MARCA (BRAND SOUL):
Voc\xEA DEVE FOR\xC7AR o post gerado a ser uma extens\xE3o org\xE2nica do site original.
Dados da Marca extra\xEDdos:
- Nome/Setor: ${brandDNA.brandName} (${brandDNA.industry})
- Cores Sugeridas (UTILIZE OBRIGATORIAMENTE ESTAS BASEADAS EM PSICOLOGIA DE CONTRASTE):
  Prim\xE1ria: ${chameleonResult?.colors.primary || brandDNA.colors.primary}
  Secund\xE1rias: ${chameleonResult?.colors.secondary || brandDNA.colors.secondary}
  Background Sugerido: ${chameleonResult?.colors.background || brandDNA.colors.background}
  Accent Sugerido: ${chameleonResult?.colors.primary || brandDNA.colors.accent}
  Paleta Geral: ${brandDNA.colors.palette.join(", ")}
- Ritmo Visual/Din\xE2mica: ${brandDNA.composition.dynamics} / ${brandDNA.composition.rhythm}

REGRA CARDINAL DE CORES (A FONTE \xC9 URL):
1) Voc\xEA N\xC3O PODE IGNORAR a paleta fornecida acima. O post DEVE pertencer ao site visualmente.
2) Selecione backgroundColor, accentColor e textColor EXCLUSIVAMENTE extra\xEDdos dessa paleta extra\xEDda, garantindo ratio > 4.5:1 WCAG.
3) Se o site for Dark Mode, gere posts escuros. Se o site for claro, gere variabilidades claras.
              `;
          }
        } catch {
          contextContent = `URL fornecida: ${input.content} (n\xE3o foi poss\xEDvel extrair conte\xFAdo, crie baseado na URL)`;
        }
      }
      const platformSpecs = {
        instagram: { label: "Instagram", maxChars: 2200 },
        twitter: { label: "Twitter/X", maxChars: 280 },
        linkedin: { label: "LinkedIn", maxChars: 3e3 },
        facebook: { label: "Facebook", maxChars: 63206 }
      };
      const spec = platformSpecs[input.platform];
      const toneHint = input.tone ? `
Tom detectado no input do usu\xE1rio: "${input.tone}" \u2014 calibre o conte\xFAdo gerado para esse estado emocional.
` : "";
      const isCarousel = input.postMode === "carousel";
      const modeInstruction = isCarousel ? `
IMPORTANTE: Gere conte\xFAdo para um CARROSSEL (m\xFAltiplos slides). Cada varia\xE7\xE3o ser\xE1 um carrossel com 5 slides organizados em um array "slides". Cada slide deve ter: headline (t\xEDtulo curto m\xE1x 50 caracteres), body (mensagem m\xE1x 80 caracteres), slideNumber (1-5), isTitleSlide (primeiro slide), isCtaSlide (\xFAltimo slide com call-to-action).` : "\nGere posts individuais (est\xE1tico).";
      const systemPrompt = `Voc\xEA \xE9 um especialista em marketing digital, design visual e cria\xE7\xE3o de conte\xFAdo para redes sociais.
Gere EXATAMENTE 3 varia\xE7\xF5es de post para ${spec.label}.${modeInstruction}
Cada varia\xE7\xE3o deve ter um tom diferente: 1) Profissional/Corporativo, 2) Casual/Engajador, 3) Criativo/Ousado.${toneHint}
${brandDnaContext}

REGRAS DE COPY \u2014 SIGA COM RIGOR:
- Headline: m\xE1ximo 60 caracteres. Seja direto e impactante. Sem ponto final.
- Body: m\xE1ximo 2 frases curtas. M\xE1ximo 100 caracteres no total. Sem rodeios.
- Caption/Legenda: texto para acompanhar o post na rede social. M\xE1ximo 300 caracteres. Engajador, complementando o conte\xFAdo visual. Pode ter emojis moderados.
- NUNCA coloque hashtags ou emojis dentro do headline ou body.
- Hashtags: m\xE1ximo 4, somente no campo separado "hashtags".
- CallToAction: m\xE1ximo 40 caracteres. Verbo de a\xE7\xE3o. Ex: "Saiba mais", "Experimente agora".
- copyAngle: Para cada varia\xE7\xE3o, forne\xE7a um objeto com o Prop\xF3sito e Ganchos do post com type (dor, beneficio, objecao, autoridade, escassez, storytelling, mito_vs_verdade), label (nome da abordagem), badge (palavra curta para o selo da marca/tema) e stickerText (uma palavra de impacto para adesivo decorativo).
- Seja conciso. Corte qualquer palavra desnecess\xE1ria. Menos \xE9 mais.

PRINC\xCDPIOS DE DESIGN VISUAL E MIMETISMO:

1. HIERARQUIA VISUAL (Propor\xE7\xE3o 3:2:1):
   - O headline deve ser a informa\xE7\xE3o MAIS impactante (peso visual m\xE1ximo).
   - O body deve complementar, nunca competir com o headline.

2. LAYOUT INTELIGENTE por objetivo do post:
   - "centered": Inspira\xE7\xE3o, emo\xE7\xE3o, celebra\xE7\xE3o, cita\xE7\xF5es. Melhor em 1:1.
   - "left-aligned": Educa\xE7\xE3o, listas, tutoriais. Melhor em 5:6 e 9:16.
   - "split": Promo\xE7\xF5es, impacto. Vers\xE1til.
   - "minimal": Ultra-limpo, essencial. Para marcas focadas no white-space.

3. PSICOLOGIA E CLONAGEM DE CORES:
   - SE houver [INSTRU\xC7\xD5ES DE CLONAGEM DE MARCA] no prompt, AS CORES S\xC3O MANDAT\xD3RIAS. Mimetize a "Alma" injetando backgroundColor e textColor apenas baseados na Extra\xE7\xE3o Fornecida.
   - SE N\xC3O houver extra\xE7\xE3o, use a psicologia cl\xE1ssica: backgroundColor neutro escuro/azul para tom Corporativo, cores quentes para Criativo, etc.

4. CONTRASTE (WCAG 2.1):
   - SEMPRE garanta contraste alto: fundo escuro \u2192 textColor claro (#FFFFFF). Fundo claro \u2192 textColor escuro (#1A1A1A).
   - NUNCA use texto cinza m\xE9dio sobre fundo cinza m\xE9dio.

5. PACOTE CRIATIVO MULTI-FORMATO:
   - Cada varia\xE7\xE3o deve fluir formatada no aspectRatio correspondente.

6. TEMPLATES ESTRUTURADOS:
   - Use 'feature-grid' ou 'step-by-step' onde listagem for detectada. Default: 'simple'.

7. FLOATING CARDS & ELEMENT STYLING (NEW):
   - O card PRINCIPAL n\xE3o precisa estar sempre centralizado ou ocupar 100% da tela.
   - Use o objeto "card" dentro das otimiza\xE7\xF5es para criar composi\xE7\xF5es din\xE2micas (ex: card inclinado, card menor no canto, layout Figma/Canva).
   - Isso \xE9 especialmente \xFAtil quando o fundo (backgroundImage) \xE9 rico visualmente.
   - Use 'backgroundColor' e 'borderRadius' em 'headline' ou 'body' para criar efeitos de BADGE ou STIKER (texto com fundo colorido e cantos arredondados). Isso ajuda a destacar informa\xE7\xF5es de forma "divertida" e moderna. Use cores contrastantes.
   
Responda APENAS com JSON v\xE1lido.`;
      const userPrompt = input.inputType === "image" ? `Crie posts baseados nesta imagem: ${input.imageUrl || input.content}` : `Crie posts baseados neste conte\xFAdo: ${contextContent}`;
      const layoutPositionSchema = {
        type: "object",
        properties: {
          x: { type: "number", description: "Posi\xE7\xE3o X em % (0-100)" },
          y: { type: "number", description: "Posi\xE7\xE3o Y em % (0-100)" },
          width: { type: "number", description: "Largura em % (10-100)" },
          textAlign: { type: "string", enum: ["left", "center", "right"] },
          backgroundColor: { type: "string", description: "Cor de fundo opcional para o elemento (RGBA ou Hex)" },
          borderRadius: { type: "number", description: "Raio da borda em px (0-40)" }
        },
        required: ["x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
        additionalProperties: false
      };
      const formatOptimizationSchema = {
        type: "object",
        properties: {
          layout: { type: "string", enum: ["centered", "left-aligned", "split", "minimal"] },
          backgroundColor: { type: "string" },
          textColor: { type: "string" },
          accentColor: { type: "string" },
          headline: { $ref: "#/$defs/layoutPosition" },
          body: { $ref: "#/$defs/layoutPosition" },
          card: { $ref: "#/$defs/layoutPosition" },
          padding: { type: "number" }
        },
        required: ["layout", "backgroundColor", "textColor", "accentColor", "headline", "body", "card", "padding"],
        additionalProperties: false
      };
      const layoutDefs = {
        layoutPosition: layoutPositionSchema,
        formatOptimization: formatOptimizationSchema
      };
      const variationSchema = isCarousel ? {
        type: "object",
        properties: {
          headline: { type: "string", description: "T\xEDtulo principal do carrossel" },
          body: { type: "string", description: "Descri\xE7\xE3o geral do carrossel" },
          hashtags: { type: "array", items: { type: "string" }, description: "Hashtags relevantes" },
          callToAction: { type: "string", description: "Call to action final do carrossel" },
          caption: { type: "string", description: "Legenda do post para a rede social, m\xE1ximo 300 caracteres" },
          tone: { type: "string", description: "Tom do post" },
          imagePrompt: { type: "string", description: "Prompt em ingl\xEAs para gerar imagem de fundo" },
          backgroundColor: { type: "string", description: "Cor de fundo hex" },
          textColor: { type: "string", description: "Cor do texto hex" },
          accentColor: { type: "string", description: "Cor de destaque hex" },
          layout: { type: "string", enum: ["centered", "left-aligned", "split", "minimal"], description: "Layout sugerido" },
          aspectRatio: { type: "string", enum: ["1:1", "5:6", "9:16"], description: "Propor\xE7\xE3o de aspecto" },
          slides: {
            type: "array",
            items: {
              type: "object",
              properties: {
                headline: { type: "string", description: "T\xEDtulo do slide" },
                body: { type: "string", description: "Conte\xFAdo do slide" },
                slideNumber: { type: "integer", description: "N\xFAmero do slide (1-5)" },
                isTitleSlide: { type: "boolean", description: "Se \xE9 o primeiro slide" },
                isCtaSlide: { type: "boolean", description: "Se \xE9 o \xFAltimo slide" }
              },
              required: ["headline", "body", "slideNumber", "isTitleSlide", "isCtaSlide"],
              additionalProperties: false
            },
            description: "Slides do carrossel (5 itens)"
          },
          aspectRatioOptimizations: {
            type: "object",
            properties: {
              "1:1": { $ref: "#/$defs/formatOptimization" },
              "5:6": { $ref: "#/$defs/formatOptimization" },
              "9:16": { $ref: "#/$defs/formatOptimization" }
            },
            required: ["1:1", "5:6", "9:16"],
            additionalProperties: false
          },
          copyAngle: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"] },
              label: { type: "string" },
              badge: { type: "string" },
              stickerText: { type: "string" }
            },
            required: ["type", "label", "badge", "stickerText"],
            additionalProperties: false
          }
        },
        required: ["headline", "body", "hashtags", "callToAction", "caption", "tone", "imagePrompt", "backgroundColor", "textColor", "accentColor", "layout", "aspectRatio", "slides", "aspectRatioOptimizations", "copyAngle"],
        additionalProperties: false
      } : {
        type: "object",
        properties: {
          headline: { type: "string", description: "T\xEDtulo chamativo do post" },
          body: { type: "string", description: "Corpo principal do post" },
          hashtags: { type: "array", items: { type: "string" }, description: "Hashtags relevantes" },
          callToAction: { type: "string", description: "Call to action final" },
          caption: { type: "string", description: "Legenda do post para a rede social, m\xE1ximo 300 caracteres" },
          tone: { type: "string", description: "Tom do post" },
          imagePrompt: { type: "string", description: "Prompt em ingl\xEAs para gerar imagem de fundo do post. Deve ser visual, art\xEDstico e relevante ao conte\xFAdo." },
          backgroundColor: { type: "string", description: "Cor de fundo hex" },
          textColor: { type: "string", description: "Cor do texto hex" },
          accentColor: { type: "string", description: "Cor de destaque hex" },
          layout: { type: "string", enum: ["centered", "left-aligned", "split", "minimal"], description: "Layout sugerido" },
          aspectRatio: { type: "string", enum: ["1:1", "5:6", "9:16"], description: "Propor\xE7\xE3o de aspecto: 1:1 quadrado, 5:6 retrato, 9:16 story/reels \u2014 varie entre as varia\xE7\xF5es para oferecer diversidade" },
          template: { type: "string", enum: ["simple", "feature-grid", "numbered-list", "step-by-step"], description: "Template de conte\xFAdo estruturado. Use 'simple' para mensagens \xFAnicas, outros para conte\xFAdo rico." },
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                icon: { type: "string", description: "Nome de \xEDcone lucide (ex: Users, Star, Zap, Heart, Globe)" },
                label: { type: "string", description: "T\xEDtulo curto da se\xE7\xE3o" },
                description: { type: "string", description: "Texto de suporte opcional" },
                number: { type: "integer", description: "N\xFAmero para listas numeradas" }
              },
              required: ["icon", "label", "description", "number"],
              additionalProperties: false
            },
            description: "Se\xE7\xF5es de conte\xFAdo estruturado (3-5 itens). Obrigat\xF3rio quando template != 'simple'."
          },
          aspectRatioOptimizations: {
            type: "object",
            properties: {
              "1:1": { $ref: "#/$defs/formatOptimization" },
              "5:6": { $ref: "#/$defs/formatOptimization" },
              "9:16": { $ref: "#/$defs/formatOptimization" }
            },
            required: ["1:1", "5:6", "9:16"],
            additionalProperties: false
          },
          copyAngle: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"] },
              label: { type: "string" },
              badge: { type: "string" },
              stickerText: { type: "string" }
            },
            required: ["type", "label", "badge", "stickerText"],
            additionalProperties: false
          }
        },
        required: ["headline", "body", "hashtags", "callToAction", "caption", "tone", "imagePrompt", "backgroundColor", "textColor", "accentColor", "layout", "aspectRatio", "template", "sections", "aspectRatioOptimizations", "copyAngle"],
        additionalProperties: false
      };
      const response = await invokeLLM({
        model: input.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "post_variations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                variations: {
                  type: "array",
                  items: variationSchema
                }
              },
              required: ["variations"],
              $defs: layoutDefs,
              additionalProperties: false
            }
          }
        }
      });
      const content = response.choices[0]?.message?.content;
      const contentStr = typeof content === "string" ? content : Array.isArray(content) ? content.filter((c) => "text" in c).map((c) => c.text).join("\n") : "{}";
      const parsed = safeJsonParse(contentStr, { variations: [] });
      let variations = (parsed.variations || []).slice(0, 3);
      if (input.inputType === "url" && brandDnaContext.length > 0) {
        try {
          console.log("[QA Guard] Validating Brand Mimetism...");
          const qaPrompt = `Voc\xEA \xE9 um Quality Assurance rigoroso de Design Visual e Acessibilidade t\xE9cnica (WCAG).
O LLM Anterior gerou 3 varia\xE7\xF5es de Post. O seu \xFAnico objetivo \xE9 VARRER falhas e ARRUMAR o JSON.

DIRETRIZES CARDINAIS DO BRAND SOUL (N\xE3o podem ser violadas):
${brandDnaContext}

AVALIA\xC7\xD5ES A FAZER EM CADA VARIA\xC7\xC3O:
1) A \`backgroundColor\` e a \`textColor\` escolhidas s\xE3o EXATAMENTE (hex) derivadas das Sugeridas pela Marca acima? Se ele alocou hexes azuis num site laranja/vermelho, OVERRIDE para o laranja/vermelho sugerido.
2) O contraste WCAG entre \`backgroundColor\` e \`textColor\` \xE9 vi\xE1vel (>4.5:1)? Se n\xE3o for (ex: texto cinza no fundo cinza, texto branco no fundo creme), inverta a cor de um deles.
3) A \`accentColor\` \xE9 chamativa dentro do Brand DNA?
4) O \`layout\` faz sentido analiticamente para o tipo de conte\xFAdo?

Variations Originais Brutas:
${JSON.stringify(variations, null, 2)}

Retorne um JSON contendo O MESMO ARRAY, de mesmo formato, substituindo estritamente as propriedades listadas caso estejam ruins. Mantenha os textos inteiramente id\xEAnticos.
Respond APENAS COM JSON, usando o mesmo VariationSchema.`;
          const qaResponse = await invokeLLM({
            model: "gemini",
            // O QA pode rodar no gemini-flash fixo pela velocidade
            messages: [{ role: "user", content: qaPrompt }],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "post_variations_qa",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    variations: {
                      type: "array",
                      items: variationSchema
                    }
                  },
                  required: ["variations"],
                  $defs: layoutDefs,
                  additionalProperties: false
                }
              }
            }
          });
          const qaContent = qaResponse.choices[0]?.message?.content;
          const qaContentStr = typeof qaContent === "string" ? qaContent : Array.isArray(qaContent) ? qaContent.filter((c) => "text" in c).map((c) => c.text).join("\n") : "{}";
          const qaParsed = safeJsonParse(qaContentStr, { variations: [] });
          if (qaParsed.variations && qaParsed.variations.length > 0) {
            variations = qaParsed.variations.slice(0, 3);
            console.log("[QA Guard] Mimetism validation approved & patched.");
          }
        } catch (qaErr) {
          console.warn("[QA Guard] Failing gracefull. Returning raw variations.", qaErr);
        }
      }
      const chameleonDesignTokens = chameleonResult ? chameleonResultToDesignTokens(chameleonResult) : void 0;
      const chameleonPosts = chameleonResult?.posts || [];
      return variations.map((v, i) => {
        const chameleonPost = chameleonPosts[i];
        return {
          id: `var-${Date.now()}-${i}`,
          ...v,
          caption: v.caption || "",
          platform: input.platform,
          hashtags: v.hashtags || [],
          postMode: input.postMode,
          slides: isCarousel ? v.slides || [] : void 0,
          // Chameleon Vision enrichments
          ...chameleonDesignTokens ? { designTokens: chameleonDesignTokens } : {},
          ...chameleonPost ? {
            copyAngle: {
              type: chameleonPost.angle,
              label: chameleonPost.label,
              badge: chameleonPost.badge,
              stickerText: chameleonPost.stickerText
            }
          } : {}
        };
      });
    }),
    /** Generate image for a post */
    generateImage: protectedProcedure.input(z2.object({
      prompt: z2.string().min(1)
    })).mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "dev@local.dev";
      const profile = await getBillingProfile(email);
      const debit = await debitSparks(profile.id, SPARK_COSTS.GENERATE_IMAGE, "Gera\xE7\xE3o de imagem IA");
      if (!debit.success) {
        throw new TRPCError4({
          code: "PAYMENT_REQUIRED",
          message: "Sparks insuficientes. Fa\xE7a upgrade ou adquira um pacote de recarga."
        });
      }
      const result = await generateImage({
        prompt: input.prompt
      });
      return { imageUrl: result.url || "" };
    }),
    /** Scrape URL for content extraction */
    scrapeUrl: protectedProcedure.input(z2.object({
      url: z2.string().url()
    })).mutation(async ({ input }) => {
      return scrapeUrl(input.url);
    }),
    /** Save a post to the database */
    save: protectedProcedure.input(z2.object({
      inputType: z2.string(),
      inputContent: z2.string(),
      platform: z2.string(),
      headline: z2.string().optional(),
      body: z2.string().optional(),
      hashtags: z2.array(z2.string()).optional(),
      callToAction: z2.string().optional(),
      tone: z2.string().optional(),
      imagePrompt: z2.string().optional(),
      imageUrl: z2.string().optional(),
      backgroundColor: z2.string().optional(),
      textColor: z2.string().optional(),
      accentColor: z2.string().optional(),
      layout: z2.string().optional(),
      postMode: z2.string().optional(),
      slides: z2.array(z2.any()).optional(),
      textElements: z2.array(z2.any()).optional()
    })).mutation(async ({ input, ctx }) => {
      const postId = await createPost({
        userId: ctx.user.id,
        ...input
      });
      return { id: postId };
    }),
    /** Update a post */
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      headline: z2.string().optional(),
      body: z2.string().optional(),
      hashtags: z2.array(z2.string()).optional(),
      callToAction: z2.string().optional(),
      imageUrl: z2.string().optional(),
      backgroundColor: z2.string().optional(),
      textColor: z2.string().optional(),
      accentColor: z2.string().optional(),
      layout: z2.string().optional(),
      postMode: z2.string().optional(),
      slides: z2.array(z2.any()).optional(),
      textElements: z2.array(z2.any()).optional()
    })).mutation(async ({ input, ctx }) => {
      await updatePost(input.id, ctx.user.id, input);
      return { success: true };
    }),
    /** List user's posts */
    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserPosts(ctx.user.id);
    }),
    /** Get single post */
    get: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ input }) => {
      return getPostById(input.id);
    }),
    /** Generate background image via Pollinations or Gemini */
    generateBackground: protectedProcedure.input(z2.object({
      prompt: z2.string().min(1),
      provider: z2.enum(["pollinations_fast", "pollinations_hd"]).default("pollinations_fast")
    })).mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "dev@local.dev";
      const profile = await getBillingProfile(email);
      const debit = await debitSparks(profile.id, SPARK_COSTS.GENERATE_IMAGE, "Gera\xE7\xE3o de imagem de fundo");
      if (!debit.success) {
        throw new TRPCError4({
          code: "PAYMENT_REQUIRED",
          message: "Sparks insuficientes. Fa\xE7a upgrade ou adquira um pacote de recarga."
        });
      }
      const imageData = await generateBackgroundImage(input.prompt, input.provider);
      return { imageData };
    }),
    /** Automatically adjust layout based on current canvas */
    autoPilotDesign: protectedProcedure.input(z2.object({
      imageBase64: z2.string(),
      currentState: z2.any()
    })).mutation(async ({ input }) => {
      const systemPrompt = `Voc\xEA \xE9 um Diretor de Arte S\xEAnior e Especialista em Qualidade Visual (QA) e Acessibilidade (WCAG).
Seu trabalho \xE9 avaliar a imagem logada (fotografia do render do post) com o JSON do estado atual fornecido.
O objetivo \xE9 garantir Legibilidade perfeita, Hierarquia e Margens de Respiro.

REGRAS:
1. Contraste (WCAG): Verifique se o texto est\xE1 leg\xEDvel contra o fundo. Se o fundo na \xE1rea delimitada pelo texto for muito claro, force a cor do texto para bem escuro (ex: #000000). Se o fundo for muito escuro, texto claro (ex: #FFFFFF). Use hexadecimais de estilo de acordo com a foto caso encontre uma cor que contrasta perfeitamente (color picking).
2. Layout: Sugira novas posi\xE7\xF5es X e Y (em porcentagem 0-100) para evitar que o texto corte nas bordas, e mantenha alinhamento harmonioso de design premium (esquerda, centro).
CR\xCDTICO SOBRE X e Y: As coordenadas (x, y) representam o **CENTRO EXATO** do bloco de texto, e n\xE3o o canto superior esquerdo (pois usamos \`transform: translate(-50%, -50%)\` no Frontend).
- Se voc\xEA quer alinhar um bloco de \`width: 80\` \xE0 esquerda com margem de \`10%\`, o X (centro) N\xC3O deve ser 10, e sim \`50\` (10 de margem + 40 da metade da largura).
- Se voc\xEA usar X=10 para um bloco largo, metade do bloco ficar\xE1 PARA FORA da tela!
- Reflita antes de definir o X e Y, garantindo que o \`width\` inteiro caiba na tela somando/subtraindo do centro.
3. Caso o texto esteja "vazando" do card, reduza \`width\` ou reposicione o \`x\` e \`y\` (lembrando da regra do centro).
4. Retorne as coordenadas ajustadas e corrigidas, para que possamos plugar direto e o texto se alinhar graciosamente no fundo.

JSON ESTADO ATUAL:
${JSON.stringify(input.currentState, null, 2)}
`;
      const response = await invokeLLM({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Analise a imagem e o posicionamento abaixo para gerar o JSON refatorado." },
              { type: "image_url", image_url: { url: input.imageBase64 } }
            ]
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "auto_pilot_design",
            strict: true,
            schema: {
              type: "object",
              properties: {
                score: { type: "number", description: "Sua nota para o design inicial (0 a 100)" },
                feedback: { type: "string", description: "Descri\xE7\xE3o curta em portugu\xEAs sobre o erro vis\xEDvel e por que voc\xEA corrigiu do jeito que corrigiu." },
                suggestedLayoutMoves: {
                  type: "object",
                  properties: {
                    headline: {
                      type: "object",
                      properties: {
                        x: { type: "number" },
                        y: { type: "number" },
                        width: { type: "number" },
                        textAlign: { type: "string" },
                        backgroundColor: { type: "string" },
                        borderRadius: { type: "number" }
                      },
                      required: ["x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
                      additionalProperties: false
                    },
                    body: {
                      type: "object",
                      properties: {
                        x: { type: "number" },
                        y: { type: "number" },
                        width: { type: "number" },
                        textAlign: { type: "string" },
                        backgroundColor: { type: "string" },
                        borderRadius: { type: "number" }
                      },
                      required: ["x", "y", "width", "textAlign", "backgroundColor", "borderRadius"],
                      additionalProperties: false
                    },
                    textColor: { type: "string", description: "Cor HEX sugerida para todos os textos" }
                  },
                  required: ["textColor"],
                  additionalProperties: false
                }
              },
              required: ["score", "feedback", "suggestedLayoutMoves"],
              additionalProperties: false
            }
          }
        }
      });
      const content = response.choices[0]?.message?.content;
      const contentStr = typeof content === "string" ? content : Array.isArray(content) ? content.filter((c) => c.type === "text").map((c) => c.text).join("\n") : "{}";
      const parsed = safeJsonParse(contentStr, {});
      return parsed;
    }),
    /** List curated background images grouped by category */
    listBackgrounds: publicProcedure.query(() => {
      const bgRoot = path.join(process.cwd(), "client", "public", "images", "backgrounds");
      try {
        const categories = fs.readdirSync(bgRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((dir) => {
          const catPath = path.join(bgRoot, dir.name);
          const images = fs.readdirSync(catPath).filter((f) => /\.(webp|jpg|jpeg|png|gif|svg)$/i.test(f)).map((f) => `/ images / backgrounds / ${dir.name} / ${f}`);
          return { id: dir.name, name: dir.name, images };
        }).filter((c) => c.images.length > 0);
        return categories;
      } catch {
        return [];
      }
    }),
    /** Analyze brand from URL and return theme variations */
    analyzeBrand: protectedProcedure.input(z2.object({
      url: z2.string().url()
    })).mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "dev@local.dev";
      const profile = await getBillingProfile(email);
      const debit = await debitSparks(profile.id, SPARK_COSTS.CHAMELEON, "ChameleonProtocol \u2014 an\xE1lise de marca");
      if (!debit.success) {
        throw new TRPCError4({
          code: "PAYMENT_REQUIRED",
          message: "Sparks insuficientes. Fa\xE7a upgrade ou adquira um pacote de recarga."
        });
      }
      const brandAnalysis = await analyzeBrandFromUrl(input.url);
      const themeVariations = generateCardThemeVariations(brandAnalysis);
      return {
        brandAnalysis,
        themeVariations
      };
    }),
    /** Extract visual styles from a website URL (Pomelli-inspired hybrid pipeline) */
    extractStyles: protectedProcedure.input(z2.object({
      url: z2.string().url()
    })).mutation(async ({ input }) => {
      console.log("[extractStyles] ==========================================");
      console.log("[extractStyles] Starting extraction for:", input.url);
      console.log("[extractStyles] Timestamp:", (/* @__PURE__ */ new Date()).toISOString());
      console.log("[extractStyles] Step 1: Running hybrid extraction pipeline...");
      const { data: extractedData, visionUsed } = await extractStyleFromUrlWithMeta(input.url);
      console.log("[extractStyles] Palette found:", extractedData.colors.palette.length, "colors");
      console.log("[extractStyles] Vision used:", visionUsed);
      console.log("[extractStyles] Colors:", {
        primary: extractedData.colors.primary,
        background: extractedData.colors.background,
        accent: extractedData.colors.accent,
        palette: extractedData.colors.palette
      });
      const defaultColors = /* @__PURE__ */ new Set(["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"]);
      const realColors = extractedData.colors.palette.filter((c) => !defaultColors.has(c));
      const fallbackUsed = realColors.length === 0;
      if (fallbackUsed) {
        console.log("[extractStyles] FALLBACK: No real colors extracted (SPA/empty detected)");
      }
      console.log("[extractStyles] Step 2: Analyzing design patterns...");
      const designPatterns = await analyzeDesignPattern(extractedData, input.url);
      console.log("[extractStyles] Patterns returned:", designPatterns.length);
      designPatterns.forEach((p, i) => {
        console.log(`[extractStyles] Pattern ${i + 1}: `, {
          name: p.name,
          category: p.category,
          confidence: p.confidence,
          suggestedColors: p.suggestedColors
        });
      });
      console.log("[extractStyles] Step 3: Generating themes...");
      const themes = generateThemesFromPatterns(designPatterns, extractedData, input.url);
      console.log("[extractStyles] Generated themes:", themes.length);
      themes.forEach((t2, i) => {
        console.log(`[extractStyles] Theme ${i + 1}: `, {
          id: t2.id,
          label: t2.label,
          category: t2.category,
          colors: t2.colors
        });
      });
      console.log("[extractStyles] ==========================================");
      return {
        extractedData,
        designPatterns,
        themes,
        fallbackUsed,
        visionUsed
      };
    }),
    /**
     * Extract full Brand DNA from a website URL (Tom & Matiz enhanced pipeline).
     * Multi-page screenshots + Gemini Vision + synthesis + musical composition mapping.
     * Cost: 20 Sparks (replaces the 15✦ ChameleonProtocol)
     */
    extractBrandDNA: protectedProcedure.input(z2.object({
      url: z2.string().url()
    })).mutation(async ({ input, ctx }) => {
      const email = ctx.user.email ?? "dev@local.dev";
      const profile = await getBillingProfile(email);
      const debit = await debitSparks(profile.id, 20, "Brand DNA \u2014 extra\xE7\xE3o multi-p\xE1gina + an\xE1lise visual");
      if (!debit.success) {
        throw new TRPCError4({
          code: "PAYMENT_REQUIRED",
          message: "Sparks insuficientes. Fa\xE7a upgrade ou adquira um pacote de recarga."
        });
      }
      const brandDNA = await extractBrandDNA(input.url);
      const themes = generateThemesFromBrandDNA(brandDNA, input.url);
      return {
        brandDNA,
        themes,
        fallbackUsed: !brandDNA.metadata.visionUsed
      };
    }),
    /**
     * Evaluate quality of generated post variations (LLM-as-Judge).
     * Inspired by Pomelli's evaluation methodology: NIMA aesthetics, VQAScore, brand alignment.
     * Cost: 0 Sparks (quality signal — included as product differentiator)
     *
     * Variations are passed directly from the client (already in memory after generation).
     */
    evaluateQuality: protectedProcedure.input(z2.object({
      variations: z2.array(z2.object({
        id: z2.string(),
        headline: z2.string(),
        body: z2.string(),
        callToAction: z2.string(),
        backgroundColor: z2.string(),
        textColor: z2.string(),
        accentColor: z2.string(),
        layout: z2.string(),
        platform: z2.string()
      })),
      brandDNA: z2.object({
        brandName: z2.string(),
        industry: z2.string(),
        colors: z2.object({ primary: z2.string() }),
        composition: z2.object({ dynamics: z2.string() }),
        personality: z2.object({
          seriousPlayful: z2.number(),
          boldSubtle: z2.number(),
          luxuryAccessible: z2.number(),
          modernClassic: z2.number(),
          warmCool: z2.number()
        }),
        emotionalProfile: z2.object({ mood: z2.string() })
      }).optional()
    })).mutation(async ({ input }) => {
      if (input.variations.length === 0) {
        return { evaluations: [] };
      }
      const evaluations = await evaluatePostQuality(input.variations, input.brandDNA);
      return { evaluations };
    })
  })
});
async function scrapeUrl(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PostSpark/1.0)",
        "Accept": "text/html"
      },
      signal: AbortSignal.timeout(1e4)
    });
    const html = await response.text();
    const getMetaContent = (htmlSource, property) => {
      const p1 = new RegExp(`< meta[^>] * property=["']${property}["'][^>]*content=["']([^ "']*)["']`, "i");
      const p2 = new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, "i");
      const m1 = htmlSource.match(p1);
      if (m1?.[1]) return m1[1];
      const m2 = htmlSource.match(p2);
      if (m2?.[1]) return m2[1];
      return "";
    };
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = getMetaContent(html, "og:title") || (titleMatch?.[1] || "").trim();
    const description = getMetaContent(html, "og:description") || getMetaContent(html, "description");
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch?.[1] || "";
    const textContent = bodyHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ").replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      title,
      description,
      content: textContent.substring(0, 1e4)
      // Limit reasonable amount for context
    };
  } catch (error) {
    console.warn("Failed to scrape URL:", url, error);
    return {
      title: "",
      description: "",
      content: ""
    };
  }
}

// server/_core/context.ts
var DEV_USER = {
  id: 1,
  openId: "local-dev",
  name: "Dev User",
  email: "dev@local.dev",
  loginMethod: "dev",
  role: "admin",
  createdAt: /* @__PURE__ */ new Date(),
  updatedAt: /* @__PURE__ */ new Date(),
  lastSignedIn: /* @__PURE__ */ new Date()
};
async function createContext(opts) {
  return {
    req: opts.req,
    res: opts.res,
    user: DEV_USER
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    // Let Vite load vite.config.ts on its own (do NOT import it here,
    // otherwise esbuild will embed it + all its devDependencies into the bundle)
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : fs2.existsSync(path2.resolve(import.meta.dirname, "public")) ? path2.resolve(import.meta.dirname, "public") : path2.resolve(import.meta.dirname, "..", "client", "dist");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
var app = express2();
app.post(
  "/api/stripe/webhook",
  express2.raw({ type: "application/json" }),
  async (req, res) => {
    if (!ENV.stripeWebhookSecret || !ENV.stripeSecretKey) {
      res.status(503).json({ error: "Billing not configured" });
      return;
    }
    const sig = req.headers["stripe-signature"];
    if (!sig) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }
    try {
      const stripe = getStripe();
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        ENV.stripeWebhookSecret
      );
      await handleStripeWebhook(event);
      res.json({ received: true });
    } catch (err) {
      console.error("[Webhook] Error:", err.message);
      res.status(400).json({ error: err.message });
    }
  }
);
app.use(express2.json({ limit: "50mb" }));
app.use(express2.urlencoded({ limit: "50mb", extended: true }));
app.post("/api/extract", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    res.status(400).json({ success: false, error: "Missing or invalid URL" });
    return;
  }
  try {
    const [desktopBuffer, mobileBuffer] = await Promise.all([
      captureScreenshot(url, "desktop"),
      captureScreenshot(url, "mobile")
    ]);
    const desktopSizeKB = desktopBuffer ? (desktopBuffer.byteLength / 1024).toFixed(2) : 0;
    const mobileSizeKB = mobileBuffer ? (mobileBuffer.byteLength / 1024).toFixed(2) : 0;
    res.json({
      success: true,
      url,
      desktopSizeKB: Number(desktopSizeKB),
      mobileSizeKB: Number(mobileSizeKB)
    });
  } catch (error) {
    console.error("[/api/extract] Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/brand-dna", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid URL" });
  }
  try {
    const brandDNA = await extractBrandDNA(url);
    const themes = generateThemesFromBrandDNA(brandDNA, url);
    res.json({
      success: true,
      brandDNA,
      themes,
      fallbackUsed: !brandDNA.metadata.visionUsed
    });
  } catch (error) {
    console.error("[/api/brand-dna] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});
registerOAuthRoutes(app);
app.use(
  ["/api/trpc", "/trpc"],
  createExpressMiddleware({
    router: appRouter,
    createContext
  })
);
async function startServer() {
  const server = createServer(app);
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
  }
  if (!process.env.VERCEL) {
    const preferredPort = parseInt(process.env.PORT || "3000");
    const port = await findAvailablePort(preferredPort);
    if (port !== preferredPort) {
      console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
    }
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  }
}
startServer().catch(console.error);
var index_default = app;
export {
  index_default as default
};
