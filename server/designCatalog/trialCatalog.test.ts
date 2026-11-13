import { afterEach, beforeEach, expect, it } from "vitest";
import { ENV } from "../_core/env";
import { assertTrialCatalogAdmission, readTrialCatalogConfig, trialCatalogRevisionForUser } from "./trialCatalog";

const owner = "00000000-0000-4000-8000-000000000011";
const original = { trialCatalogRevision: ENV.trialCatalogRevision, trialCatalogAdminUuid: ENV.trialCatalogAdminUuid, generationWorkerMode: ENV.generationWorkerMode };
beforeEach(() => Object.assign(ENV, { trialCatalogRevision: "23", trialCatalogAdminUuid: owner, generationWorkerMode: "external" }));
afterEach(() => Object.assign(ENV, original));

it("exposes the inactive pin only to the configured administrator", () => {
  expect(trialCatalogRevisionForUser({ id: owner, role: "admin" })).toBe("23");
  expect(trialCatalogRevisionForUser({ id: owner, role: "user" })).toBeUndefined();
  expect(trialCatalogRevisionForUser({ id: "00000000-0000-4000-8000-000000000012", role: "admin" })).toBeUndefined();
  expect(() => assertTrialCatalogAdmission(owner, "24")).toThrow("not_allowed");
  expect(() => assertTrialCatalogAdmission("00000000-0000-4000-8000-000000000012", "23")).toThrow("not_allowed");
});

it("keeps ordinary catalog selection when the trial is unset", () => {
  ENV.trialCatalogRevision = ""; ENV.trialCatalogAdminUuid = "";
  expect(readTrialCatalogConfig()).toBeNull();
  expect(trialCatalogRevisionForUser({ id: owner, role: "admin" })).toBeUndefined();
  expect(() => assertTrialCatalogAdmission(owner, "23")).toThrow("not_allowed");
});

it.each(["", "0", "23 or 1=1", "9223372036854775808"])("fails closed on partial or invalid revision %s", revision => {
  ENV.trialCatalogRevision = revision;
  expect(() => readTrialCatalogConfig()).toThrow("configuration_invalid");
});

it("requires both an explicit admin UUID and external executor", () => {
  ENV.trialCatalogAdminUuid = "";
  expect(() => readTrialCatalogConfig()).toThrow("configuration_invalid");
  ENV.trialCatalogAdminUuid = owner;
  ENV.generationWorkerMode = "local-demand";
  expect(() => readTrialCatalogConfig()).toThrow("configuration_invalid");
});
