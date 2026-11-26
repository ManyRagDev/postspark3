import { describe, expect, it, vi } from "vitest";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { resolveGenerationModelConfig } from "../generationModel";
import { readLongEditorialSource } from "./editorialSourceReading";

const input = orchestratedGenerationInputSchema.parse({
  ownerId: "00000000-0000-4000-8000-000000000001", inputType: "text", platform: "instagram",
  content: "Apresente o catálogo.", idempotencyKey: "source-reading-test",
});
const team = resolveGenerationModelConfig(input, true, true, true, true).editorialTeam;
const content = "O kit inclui duas canecas. ".repeat(320);
const context = { version: 1 as const, text: content, sources: [
  { id: "catalog", kind: "page" as const, purpose: "content" as const, origin: "site", text: content },
  { id: "style", kind: "page" as const, purpose: "guidance" as const, origin: "visual_reference", text: "Campanha de outra loja" },
] };
const operation = <T>(_key: string, run: () => Promise<T>) => run();

describe("source reading of long catalogs", () => {
  it("selects verbatim excerpts once and excludes visual references", async () => {
    const generate = vi.fn().mockResolvedValue({choices:[{message:{content:JSON.stringify({
      quotes:["O kit inclui duas canecas.", "O kit é grátis.", "Campanha de outra loja", "O kit inclui duas canecas."],
    })}}]});
    const quotes = await readLongEditorialSource(input, context, team, {generate, operation, deadlineMs:Date.now()+10000});
    expect(quotes).toEqual(["O kit inclui duas canecas."]);
    expect(generate).toHaveBeenCalledOnce();
    const [call] = generate.mock.calls[0];
    expect(call.pinnedModel).toBe("moonshotai/kimi-k3.1-pro");
    expect(JSON.stringify(call.messages)).not.toContain("Campanha de outra loja");
  });
  it("skips short sources and historical requests", async () => {
    const deps = {generate:vi.fn(), operation, deadlineMs:Date.now()+10000};
    expect(await readLongEditorialSource(input, "", team, deps)).toEqual([]);
    expect(await readLongEditorialSource(input, context, undefined, deps)).toEqual([]);
    expect(deps.generate).not.toHaveBeenCalled();
  });
});
