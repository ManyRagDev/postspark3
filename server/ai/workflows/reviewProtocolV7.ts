import {
  proposalReviewResponseV7Schema,
  findingV7Schema,
  requirementCheckV7Schema,
} from "@shared/proposalReviewV7";
/** JSON.parse alone discards duplicate keys. Reject them before interpreting decisions. */
export function decodeReviewV7(raw: string) {
  const tokens =
    raw.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g) ?? [];
  let i = 0;
  const walk = (): void => {
    const t = tokens[i++];
    if (t === "{") {
      const keys = new Set<string>();
      if (tokens[i] === "}") {
        i++;
        return;
      }
      for (;;) {
        const key = JSON.parse(tokens[i++]);
        if (typeof key !== "string" || keys.has(key))
          throw new Error("proposal_review_response_invalid");
        keys.add(key);
        if (tokens[i++] !== ":")
          throw new Error("proposal_review_response_invalid");
        walk();
        const sep = tokens[i++];
        if (sep === "}") break;
        if (sep !== ",") throw new Error("proposal_review_response_invalid");
      }
    } else if (t === "[") {
      if (tokens[i] === "]") {
        i++;
        return;
      }
      for (;;) {
        walk();
        const sep = tokens[i++];
        if (sep === "]") break;
        if (sep !== ",") throw new Error("proposal_review_response_invalid");
      }
    } else {
      if (t === undefined) throw new Error("proposal_review_response_invalid");
      JSON.parse(t);
    }
  };
  let decoded: unknown;
  try {
    if (raw.length > 100000) throw new Error();
    walk();
    if (i !== tokens.length) throw new Error();
    decoded = JSON.parse(raw);
  } catch {
    throw new Error("proposal_review_response_invalid");
  }
  const discarded: string[] = [];
  const pick = (value: unknown, keys: string[], path: string) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return value;
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => {
        if (keys.includes(key)) return true;
        discarded.push(`${path}.${key}`);
        return false;
      })
    );
  };
  const value = pick(
    decoded,
    Object.keys(proposalReviewResponseV7Schema.shape),
    "review"
  ) as Record<string, unknown>;
  if (value && typeof value === "object") {
    if (Array.isArray(value.findings))
      value.findings = value.findings.map((v, i) =>
        pick(v, Object.keys(findingV7Schema.shape), `findings.${i}`)
      );
    if (Array.isArray(value.requirementChecks))
      value.requirementChecks = value.requirementChecks.map((v, i) =>
        pick(
          v,
          Object.keys(requirementCheckV7Schema.shape),
          `requirements.${i}`
        )
      );
    value.messageAssessment = pick(
      value.messageAssessment,
      ["status", "explanation"],
      "messageAssessment"
    );
  }
  const parsed = proposalReviewResponseV7Schema.safeParse(value);
  if (!parsed.success) throw new Error("proposal_review_response_invalid");
  return { response: parsed.data, discarded };
}
