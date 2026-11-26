import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { armPayload, cases, hash, read, root } from "./inputs.mjs";

const dir = join(root, "jev");
mkdirSync(dir, { recursive: true, mode: 0o700 });
assert(process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY ausente");
const requested = process.argv[2] ?? "all";
const all = cases();
assert(requested === "all" || all.some(c => c.id === requested));
for (const c of all.filter(c => requested === "all" || c.id === requested)) {
  const arms =
    c.set === "historical"
      ? ["B", "A"]
      : all.indexOf(c) % 2
        ? ["B", "A"]
        : ["A", "B"];
  let effective;
  for (const arm of arms) {
    if (
      c.set === "historical" &&
      arm === "A" &&
      effective === c.run.jev.trace.effectiveModel
    )
      continue;
    const payload = armPayload(c.payload, arm);
    const body = JSON.stringify(payload);
    const bytes = Buffer.byteLength(body);
    assert(bytes <= 48000);
    const file = join(dir, c.id + "-" + arm + ".json");
    const payloadHash = hash([payload]);
    if (existsSync(file)) {
      const cached = read(file);
      assert.equal(cached.payloadHash, payloadHash);
      if (effective) assert.equal(effective, cached.result.model);
      effective = cached.result.model;
      continue;
    }
    const claim = file + ".pending";
    writeFileSync(
      claim,
      JSON.stringify({ payloadHash, started: new Date().toISOString() }),
      { flag: "wx", mode: 0o600 }
    );
    const start = performance.now();
    let response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/systemone", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
        },
        body,
      });
    } catch (error) {
      if (
        ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"].includes(error.cause?.code)
      )
        unlinkSync(claim);
      throw new Error("JEV transport " + (error.cause?.code ?? error.name));
    }
    if (!response.ok)
      throw new Error("JEV HTTP " + response.status + " em " + c.id);
    const result = await response.json();
    const ms = performance.now() - start;
    writeFileSync(
      claim,
      JSON.stringify({
        caseId: c.id,
        arm,
        sourceRequest: c.run.r.id,
        payloadHash,
        bytes,
        ms,
        payload,
        result,
      }),
      { mode: 0o600 }
    );
    renameSync(claim, file);
    assert.deepEqual(
      Object.keys(result.answers).sort(),
      Object.keys(payload.questions).sort()
    );
    assert(result.model && result.usage);
    for (const a of Object.values(result.answers))
      assert(
        a.score >= 0 && a.score <= 4 && a.confidence >= 0 && a.confidence <= 1
      );
    if (effective) assert.equal(effective, result.model);
    effective = result.model;
    console.log(
      c.id,
      arm,
      effective,
      bytes,
      result.usage,
      Math.round(ms) + "ms"
    );
  }
}
