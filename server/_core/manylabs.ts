import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _postsparkAdminClient: any = null;

function getPostSparkAdminClient() {
  if (!_postsparkAdminClient) {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    _postsparkAdminClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false },
      db: { schema: "postspark" },
    } as any);
  }

  return _postsparkAdminClient;
}

/**
 * Checks whether a user has active access to PostSpark via the postspark RPC wrapper.
 * Returns true only if the RPC confirms access. Returns false on any error (fail-closed).
 */
export async function hasPostSparkAccess(userId: string): Promise<boolean> {
  try {
    const supabase = getPostSparkAdminClient();
    const { data, error } = await supabase.rpc("has_manylabs_app_access", {
      p_user_id: userId,
    });

    if (error) {
      console.error("[ManyLabs] has_manylabs_app_access RPC error:", error.message);
      return false;
    }

    return Boolean(data);
  } catch (err) {
    console.error("[ManyLabs] has_manylabs_app_access unexpected error:", err);
    return false;
  }
}

/**
 * Ensures a user has access to PostSpark via the postspark RPC wrapper.
 * The SQL function owns all direct manylabs schema writes and status rules.
 * Returns false on any error (fail-closed).
 */
export async function ensurePostSparkAccess(
  userId: string,
  email: string | null,
  name: string | null
): Promise<boolean> {
  try {
    const supabase = getPostSparkAdminClient();
    const { data, error } = await supabase.rpc("ensure_manylabs_app_access", {
      p_user_id: userId,
      p_email: email,
      p_display_name: name,
    });

    if (error) {
      console.error("[ManyLabs] ensure_manylabs_app_access RPC error:", error.message);
      return false;
    }

    return Boolean(data);
  } catch (err) {
    console.error("[ManyLabs] ensure_manylabs_app_access unexpected error:", err);
    return false;
  }
}
