import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { issueSessionPlan, PLAN_COOKIE, PLAN_DURATION_MS, readSessionPlan } from "./planImpersonation";

const token = (sessionId: string, version = 1) =>
  "fixture." + Buffer.from(JSON.stringify({ session_id: sessionId, version })).toString("base64url") + ".fixture";

describe("seleção do plano por sessão", () => {
  it("acompanha a renovação da mesma sessão e expira independentemente do JWT", () => {
    const session = randomUUID(), actor = randomUUID(), key = "fixture-only", now = Date.now();
    const cookie = PLAN_COOKIE + "=" + issueSessionPlan(key, actor, token(session), "PRO_PLUS", now);
    expect(readSessionPlan(key, actor, token(session, 2), cookie, now + 10)).toBe("PRO_PLUS");
    expect(readSessionPlan(key, actor, token(session), cookie, now + PLAN_DURATION_MS)).toBeNull();
    expect(readSessionPlan(key, actor, token(randomUUID()), cookie, now)).toBeNull();
    expect(readSessionPlan(key, randomUUID(), token(session), cookie, now)).toBeNull();
    expect(readSessionPlan(key, actor, token(session), cookie.replace("PRO_PLUS", "AGENCY"), now)).toBeNull();
  });
});
