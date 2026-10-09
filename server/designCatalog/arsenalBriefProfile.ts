import type { VariableContentContract } from "@shared/variableContent";
/** Availability is a retrieval hint, never authority to invent copy or evidence. */
export function arsenalBriefProfile(
  sourceText: string,
  instructionText: string
) {
  const request = `${sourceText}\n${instructionText}`;
  const available = [
    "headline",
    "body",
    "eyebrow",
    "label",
    "sectionLabel",
    "callToAction",
  ];
  const intentions: string[] = [];
  const present = ["headline"];
  let items: number | undefined;
  if (/\b(lista|listas|itens|passos|dicas)\b/i.test(request)) {
    available.push("items");
    present.push("items");
    intentions.push("list");
    const cardinality =
      request.match(/\b(\d{1,2})\s+(?:itens|passos|dicas)\b/i) ??
      request.match(/\b(?:lista|listas)\s+(?:com|de)\s+(\d{1,2})\b/i);
    if (cardinality) items = Number(cardinality[1]);
  }
  // Numbers in production instructions are not supplied factual evidence.
  if (/\d/.test(sourceText)) {
    available.push("metric.value", "metric.label");
    if (
      /\b(métrica|metrica|percentual|resultado|dados|faturamento)\b|%/i.test(
        request
      )
    ) {
      intentions.push("metric");
      present.push("metric.value", "metric.label");
    }
  }
  // A quote without an explicit attribution cannot fill a required author binding.
  if (
    /["“][^"”]+["”]/.test(sourceText) &&
    /(?:\b(?:autor|autora|por)\s*:\s*\S|["”]\s*[—–-]\s*[a-zà-ÿ])/i.test(
      sourceText
    )
  ) {
    available.push("attribution.quote", "attribution.author");
    intentions.push("attribution");
    present.push("attribution.quote", "attribution.author");
  }
  if (
    /\b(comparar|comparação|comparacao|versus|vs)\b|\bantes\b[\s\S]*\bdepois\b/i.test(
      request
    )
  ) {
    available.push(
      "comparison.left.label",
      "comparison.left.text",
      "comparison.right.label",
      "comparison.right.text"
    );
    intentions.push("comparison");
    present.push("comparison.left.text", "comparison.right.text");
  }
  return {
    present,
    available,
    items,
    intentions: intentions.length ? intentions : ["headline-body"],
  };
}

/** V3 does not invent a required headline. Evidence availability remains only a retrieval hint. */
export function variableArsenalBriefProfile(
  contract: VariableContentContract,
  sourceText: string,
  instructionText: string
) {
  const legacy = arsenalBriefProfile(sourceText, instructionText);
  const factual = legacy.available.filter(
    s =>
      (s.startsWith("metric.") && contract.allowedTypes.includes("metric")) ||
      (s.startsWith("attribution.") &&
        contract.allowedTypes.includes("quote")) ||
      (s.startsWith("comparison.") &&
        contract.allowedTypes.includes("comparison"))
  );
  if (
    contract.allowedTypes.includes("quote") &&
    /["“][^"”]+["”]/.test(sourceText)
  )
    factual.push("attribution.quote");
  const fields = {
    list: ["items"],
    metric: ["metric.value", "metric.label"],
    quote: ["attribution.quote"],
    comparison: ["comparison.left.text", "comparison.right.text"],
    text: [],
  } as const;
  return {
    variable: true,
    present: [
      ...contract.requiredTextRoles,
      ...contract.requiredTypes.flatMap(t => fields[t]),
    ],
    available: Array.from(
      new Set([
        ...(contract.allowedTypes.includes("text")
          ? contract.allowedTextRoles
          : []),
        ...(contract.allowedTypes.includes("list") ? ["items"] : []),
        ...factual,
      ])
    ),
    items:
      contract.requiredTypes.includes("list") &&
      contract.listItems &&
      contract.listItems.min === contract.listItems.max
        ? contract.listItems.min
        : undefined,
    intentions: legacy.intentions,
  };
}
