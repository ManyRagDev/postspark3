import { getDb } from "../../db";
import { requestRecord, type RequestRecord } from "./generationStore";
export async function localRequests(scope: string): Promise<RequestRecord[]> {
  const r = await getDb()
    .from("generation_v5_requests")
    .select("*")
    .eq("execution_mode", "local-demand")
    .eq("executor_scope", scope)
    .or(
      "status.in.(queued,running,awaiting_reconciliation),and(billing_mode.eq.reserved,billing_settled_at.is.null)"
    )
    .order("created_at");
  if (r.error) throw r.error;
  return (r.data ?? []).map(requestRecord);
}
export async function localRequest(
  id: string,
  scope: string
): Promise<RequestRecord | null> {
  const r = await getDb()
    .from("generation_v5_requests")
    .select("*")
    .eq("id", id)
    .eq("execution_mode", "local-demand")
    .eq("executor_scope", scope)
    .maybeSingle();
  if (r.error) throw r.error;
  return r.data ? requestRecord(r.data) : null;
}
export async function reconcileLocal(id: string, scope: string) {
  const r = await getDb().rpc("generation_reconcile_request", {
    p_id: id,
    p_scope: scope,
  });
  if (r.error) throw r.error;
}
export async function claimLocal(id: string, scope: string, workerId: string) {
  const r = await getDb().rpc("generation_claim_request", {
    p_id: id,
    p_scope: scope,
    p_worker_id: workerId,
  });
  if (r.error) throw r.error;
  if (r.data?.blockedUntil)
    return { blockedUntil: Date.parse(r.data.blockedUntil) };
  return r.data
    ? { record: requestRecord(r.data), leaseToken: String(r.data.leaseToken) }
    : null;
}
export async function markDispatchError(id: string, scope: string) {
  const r = await getDb()
    .from("generation_v5_requests")
    .update({ dispatch_error: "local_dispatch_failed" })
    .eq("id", id)
    .eq("executor_scope", scope);
  if (r.error) throw r.error;
}

export async function ownedGenerationSubscription(id: string, owner: string) {
  const result = await getDb()
    .from("generation_v5_requests")
    .select("id,execution_mode")
    .eq("id", id)
    .eq("owner_id", owner)
    .maybeSingle();
  if (result.error) throw result.error;
  if(result.data)return {id:result.data.id,executionMode:result.data.execution_mode};
  const capture=await getDb().from("brand_captures").select("id,execution_mode").eq("id",id).eq("owner_id",owner).maybeSingle();
  if(capture.error)throw capture.error;
  return capture.data?{id:capture.data.id,executionMode:capture.data.execution_mode}:null;
}
