import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type PostRecord = {
  id: number;
  user_uuid: string | null;
  inputType: string;
  inputContent: string;
  platform: string;
  headline: string | null;
  body: string | null;
  hashtags: string[] | null;
  callToAction: string | null;
  tone: string | null;
  imagePrompt: string | null;
  imageUrl: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  accentColor: string | null;
  layout: string | null;
  postMode: string;
  slides: JsonValue[] | null;
  textElements: JsonValue[] | null;
  image_settings: JsonValue | null;
  layout_settings: JsonValue | null;
  bg_value: JsonValue | null;
  bg_overlay: JsonValue | null;
  exported: boolean | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePostInput = {
  userUuid: string;
  inputType: string;
  inputContent: string;
  platform: string;
  headline?: string;
  body?: string;
  hashtags?: string[];
  callToAction?: string;
  tone?: string;
  imagePrompt?: string;
  imageUrl?: string;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  layout?: string;
  postMode?: string;
  slides?: JsonValue[];
  textElements?: JsonValue[];
  imageSettings?: JsonValue;
  layoutSettings?: JsonValue;
  bgValue?: JsonValue;
  bgOverlay?: JsonValue;
};

export type UpdatePostInput = Partial<Omit<CreatePostInput, "userUuid">> & {
  id?: number;
};

let _supabaseDbClient: any = null;

function getSupabaseDbClient() {
  if (!_supabaseDbClient) {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    _supabaseDbClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false },
      db: { schema: "postspark" },
    } as any);
  }

  return _supabaseDbClient;
}

function removeUndefined<T extends Record<string, unknown>>(payload: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export function getDb() {
  return getSupabaseDbClient();
}

export async function createPost(post: CreatePostInput): Promise<number> {
  const db = getSupabaseDbClient();

  const payload = {
    user_uuid: post.userUuid,
    inputType: post.inputType,
    inputContent: post.inputContent,
    platform: post.platform,
    headline: post.headline ?? null,
    body: post.body ?? null,
    hashtags: post.hashtags ?? null,
    callToAction: post.callToAction ?? null,
    tone: post.tone ?? null,
    imagePrompt: post.imagePrompt ?? null,
    imageUrl: post.imageUrl ?? null,
    backgroundColor: post.backgroundColor ?? null,
    textColor: post.textColor ?? null,
    accentColor: post.accentColor ?? null,
    layout: post.layout ?? null,
    postMode: post.postMode ?? "static",
    slides: post.slides ?? null,
    textElements: post.textElements ?? null,
    image_settings: post.imageSettings ?? null,
    layout_settings: post.layoutSettings ?? null,
    bg_value: post.bgValue ?? null,
    bg_overlay: post.bgOverlay ?? null,
  };

  const { data, error } = await db
    .from("posts")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`[Database] createPost failed: ${error?.message ?? "unknown error"}`);
  }

  return data.id as number;
}

export async function getUserPosts(userUuid: string, limit = 50): Promise<PostRecord[]> {
  const db = getSupabaseDbClient();

  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("user_uuid", userUuid)
    .order("createdAt", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`[Database] getUserPosts failed: ${error.message}`);
  }

  return (data ?? []) as PostRecord[];
}

export async function updatePost(
  postId: number,
  userUuid: string,
  data: UpdatePostInput
): Promise<void> {
  const db = getSupabaseDbClient();

  const payload = removeUndefined({
    headline: data.headline,
    body: data.body,
    hashtags: data.hashtags,
    callToAction: data.callToAction,
    tone: data.tone,
    imagePrompt: data.imagePrompt,
    imageUrl: data.imageUrl,
    backgroundColor: data.backgroundColor,
    textColor: data.textColor,
    accentColor: data.accentColor,
    layout: data.layout,
    postMode: data.postMode,
    slides: data.slides,
    textElements: data.textElements,
    image_settings: data.imageSettings,
    layout_settings: data.layoutSettings,
    bg_value: data.bgValue,
    bg_overlay: data.bgOverlay,
  });

  if (Object.keys(payload).length === 0) {
    return;
  }

  const { error } = await db
    .from("posts")
    .update(payload)
    .eq("id", postId)
    .eq("user_uuid", userUuid);

  if (error) {
    throw new Error(`[Database] updatePost failed: ${error.message}`);
  }
}

export async function getPostById(
  postId: number,
  userUuid: string
): Promise<PostRecord | undefined> {
  const db = getSupabaseDbClient();

  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("id", postId)
    .eq("user_uuid", userUuid)
    .maybeSingle();

  if (error) {
    throw new Error(`[Database] getPostById failed: ${error.message}`);
  }

  return (data ?? undefined) as PostRecord | undefined;
}
