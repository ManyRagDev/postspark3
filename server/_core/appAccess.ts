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

/** Server-only authorization. Any due installments come from already-paid periods. */
export async function hasPostSparkAccess(userId: string): Promise<boolean> {
  try {
    const db = getPostSparkAdminClient();
    const { data, error } = await db.rpc("has_app_access", {
      p_user_id: userId,
    });
    if (error) {
      console.error("[AppAccess] Access check failed");
      return false;
    }
    if (data !== true) return false;
    const refill = await db.rpc("refill_pro_sparks", { p_user_id: userId });
    // During rollout the manual access gate is already deployed. It remains
    // available before the paid-membership migration is applied.
    if (refill?.error && refill.error.code !== "PGRST202")
      console.error("[AppAccess] Could not refresh due paid Sparks");
    return true;
  } catch {
    console.error("[AppAccess] Access check unavailable");
    return false;
  }
}

export async function hasStartPilotAccess(userId: string) {
  const { data, error } = await getPostSparkAdminClient().rpc("has_start_pilot", { p_user_id: userId });
  return !error && data === true;
}

export async function hasAgencyAccess(userId: string) {
  const { data, error } = await getPostSparkAdminClient().rpc("has_agency_access", { p_user_id: userId });
  return !error && data === true;
}
