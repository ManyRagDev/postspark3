/** Read-only evidence: pnpm verify:e2e --id UUID [--post-id INTEGER] [--output file.json] */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  inspectGenerationEvidence,
  parseGenerationEvidenceArgs,
} from "../server/generationEvidence";

async function main() {
  // Validate before loading an environment-backed database module.
  const options = parseGenerationEvidenceArgs(process.argv.slice(2));
  const { getDb } = await import("../server/db");
  const db = getDb();
  const requestResult = await db
    .from("generation_v5_requests")
    .select(
      "id,status,owner_id,input,prepared,proposals,billing_mode,billing_ledger,billing_reservation_id,billing_reserved,billing_preparation,billing_per_proposal,billing_debited,billing_settled_at,billing_error,created_at,updated_at"
    )
    .eq("id", options.id)
    .single();
  if (requestResult.error || !requestResult.data)
    throw new Error("Request read failed or request does not exist");
  const request = requestResult.data;
  const [operations, post, reservation] = await Promise.all([
    db
      .from("generation_v5_operations")
      .select("operation_key,state,result")
      .eq("request_id", options.id),
    options.postId
      ? db
          .from("posts")
          .select("id,user_uuid,canvas_model")
          .eq("id", options.postId)
          .eq("user_uuid", request.owner_id)
          .maybeSingle()
      : null,
    request.billing_mode === "reserved" &&
    request.billing_reservation_id &&
    ["next", "canonical"].includes(request.billing_ledger)
      ? db
          .from(
            request.billing_ledger === "next"
              ? "next_spark_reservations"
              : "spark_reservations"
          )
          .select("id,user_uuid,status,amount")
          .eq("id", request.billing_reservation_id)
          .eq("user_uuid", request.owner_id)
          .maybeSingle()
      : null,
  ]);
  if (operations.error || post?.error || reservation?.error)
    throw new Error("Evidence dependency read failed");
  const report = inspectGenerationEvidence({
    request,
    operations: operations.data ?? [],
    post: options.postId ? (post?.data ?? null) : undefined,
    reservation: reservation?.data ?? null,
  });
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      requestId: report.requestId,
      passed: report.passed,
      failedChecks: report.checks.filter(check => !check.passed),
      providerEvidence: report.providerEvidence,
      designElection: { status: report.designElection.status, complete: report.designElection.complete, stage: report.designElection.stage },
      evidenceFile: options.output,
      browserVerified: false,
    })
  );
  process.exitCode = report.passed ? 0 : 1;
}

main().catch(() => {
  // Avoid logging database errors, environment values, private content or URLs.
  console.error(
    "Persisted generation verification failed. Use --id UUID [--post-id INTEGER] [--output evidence.json]; confirm local DB configuration and read access."
  );
  process.exitCode = 2;
});
