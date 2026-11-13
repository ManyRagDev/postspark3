import { expect, it } from "vitest";
import { classifyProviderFailure, observeProviderFailure, withProviderFailureObserver } from "./providerCooldown";

it.each([[401,"credentials"],[403,"credentials"],[402,"quota"],[429,"rate_limit"],[503,"transient"]] as const)("classifies provider HTTP %i without guessing from content", (status, expected) => {
  expect(classifyProviderFailure({ name: "ProviderRequestError", status })).toBe(expected);
  expect(classifyProviderFailure(new Error(`Customer asked about ${status}`))).toBeUndefined();
});
it("isolates concurrent observation scopes and does not authorize retries of ambiguous operations", async () => {
  const first: string[] = [], second: string[] = [];
  await Promise.all([
    withProviderFailureObserver(kind => first.push(kind), async () => { await Promise.resolve(); await observeProviderFailure({ name: "ProviderRequestError", status: 401 }); }),
    withProviderFailureObserver(kind => second.push(kind), async () => { await Promise.resolve(); await observeProviderFailure({ name: "ProviderRequestError", status: 429 }); }),
  ]);
  expect(first).toEqual(["credentials"]);
  expect(second).toEqual(["rate_limit"]);
  expect(classifyProviderFailure({ name: "LlmTransportTimeoutError", code: "TIMEOUT" })).toBeUndefined();
});
