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

/** Server-only authorization. Login never creates or reactivates an access grant. */
export async function hasPostSparkAccess(userId: string): Promise<boolean> {
  try {
    const { data, error } = await getPostSparkAdminClient().rpc("has_app_access", {
      p_user_id: userId,
    });
    if (error) {
      console.error("[AppAccess] Access check failed");
      return false;
    }
    return data === true;
  } catch {
    console.error("[AppAccess] Access check unavailable");
    return false;
  }
}
