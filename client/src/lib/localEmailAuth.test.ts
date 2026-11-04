import { expect, it } from "vitest";
import { isLocalEmailAuth } from "./localEmailAuth";

it("limits the email-only test UI to an explicit development profile with two local endpoints", () => {
  const config = {
    development: true,
    mode: "email",
    hostname: "127.0.0.1",
    supabaseUrl: "http://127.0.0.1:55481",
  };
  expect(isLocalEmailAuth(config)).toBe(true);
  for (const change of [
    { development: false },
    { mode: undefined },
    { hostname: "postspark.app" },
    { supabaseUrl: "https://hosted.supabase.co" },
    { supabaseUrl: "http://localhost.attacker.test" },
    { supabaseUrl: "invalid" },
  ])
    expect(isLocalEmailAuth({ ...config, ...change })).toBe(false);
});
