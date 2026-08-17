/**
 * Helpers de parsing de respostas LLM compartilhados entre a borda (router)
 * e o orquestrador canônico de geração (SPEC-003).
 */

/** Extrai o texto de um content LLM (string ou array de partes). */
export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: "text"; text: string } =>
        Boolean(part) &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part,
      )
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

/**
 * Parses JSON safely from LLM responses, handling markdown blocks and basic
 * malformations (truncation, trailing commas).
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
  let cleaned = str.trim();

  // 1. Markdown stripping
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  // 2. Bound recovery (find the outermost { ... })
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx !== -1 && (endIdx === -1 || endIdx > startIdx)) {
    cleaned = cleaned.substring(startIdx, endIdx !== -1 ? endIdx + 1 : undefined);
  }

  // Helper to attempt parsing
  const tryParse = (jsonStr: string): T | null => {
    try {
      // Basic repair: remove trailing commas before closing braces/brackets
      const repaired = jsonStr.replace(/,\s*([\]}])/g, "$1");
      return JSON.parse(repaired) as T;
    } catch {
      return null;
    }
  };

  // 3. First attempt
  let result = tryParse(cleaned);
  if (result) return result;

  // 4. Heuristic Repair: Handling truncation
  // LLMs often stop in the middle of a string, or deep in nested objects.
  console.warn("[safeJsonParse] Initial parse failed. Attempting heuristic repair...");

  let repairAttempt = cleaned;
  const stack: ("{" | "[")[] = [];
  let inString = false;
  let escaped = false;

  // Walk through to find the state of open structures
  for (let i = 0; i < repairAttempt.length; i++) {
    const char = repairAttempt[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") stack.push("{");
    else if (char === "[") stack.push("[");
    else if (char === "}") stack.pop();
    else if (char === "]") stack.pop();
  }

  // If we are inside a string, close it
  if (inString) {
    repairAttempt += '"';
  }

  // Close all open braces/brackets in reverse order
  while (stack.length > 0) {
    const last = stack.pop();
    if (last === "{") repairAttempt += "}";
    else if (last === "[") repairAttempt += "]";
  }

  // Try again with the surgically repaired JSON
  result = tryParse(repairAttempt);
  if (result) {
    console.log("[safeJsonParse] Heuristic repair successful.");
    return result;
  }

  console.error("[safeJsonParse] Failed to parse JSON even after repair.");
  console.error("[safeJsonParse] Input snippet (100 chars):", str.substring(0, 100));
  return fallback;
}
