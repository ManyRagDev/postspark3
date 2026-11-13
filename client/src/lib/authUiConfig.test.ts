import { expect, it } from "vitest";
import { resolveAuthUiConfig } from "./authUiConfig";

it("defaults to email login without advertising unavailable providers or signup", () => {
  expect(resolveAuthUiConfig({})).toEqual({ googleEnabled: false, signupEnabled: false });
  expect(resolveAuthUiConfig({ mode: "google", signupEnabled: "true" })).toEqual({
    googleEnabled: false, signupEnabled: false,
  });
});

it("requires explicit Google and working email delivery configuration for signup", () => {
  expect(resolveAuthUiConfig({ mode: "email-google" })).toEqual({ googleEnabled: true, signupEnabled: false });
  expect(resolveAuthUiConfig({ signupEnabled: "true", emailDeliveryEnabled: "false" }).signupEnabled).toBe(false);
  expect(resolveAuthUiConfig({ signupEnabled: "false", emailDeliveryEnabled: "true" }).signupEnabled).toBe(false);
  expect(resolveAuthUiConfig({ signupEnabled: "true", emailDeliveryEnabled: "true" }).signupEnabled).toBe(true);
});

it("keeps the isolated local email profile even when production features are enabled", () => {
  expect(resolveAuthUiConfig({ localEmailOnly: true, mode: "email-google", signupEnabled: "true", emailDeliveryEnabled: "true" }))
    .toEqual({ googleEnabled: false, signupEnabled: false });
});
