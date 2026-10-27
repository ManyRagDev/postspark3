// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession: state.session } } }));
import GoogleAuthCallback from "./GoogleAuthCallback";

let root: Root;
let element: HTMLDivElement;
let navigate: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  window.history.replaceState({}, "", "/auth/google-callback");
  state.session.mockResolvedValue({ data: { session: { access_token: "oauth-token" } }, error: null });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  navigate = vi.spyOn(window.location, "replace").mockImplementation(() => {});
  element = document.createElement("div");
  root = createRoot(element);
});
afterEach(async () => {
  await act(async () => root.unmount());
  element.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("completes Google login after the SDK consumed the URL and repairs a stale bridge marker", async () => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("oauth-token"));
  localStorage.setItem("postspark.session-bridge.v2", Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2,"0")).join(""));
  expect(window.location.hash).toBe("");
  await act(async () => root.render(<GoogleAuthCallback />));
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/thevoid"));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/auth/supabase-session", expect.objectContaining({ method:"POST", credentials:"include", body:JSON.stringify({access_token:"oauth-token"}) }));
});

it("waits for SDK initialization rather than rejecting an empty hash early", async () => {
  let complete!: (value:any)=>void;
  state.session.mockImplementation(() => new Promise(resolve => { complete=resolve; }));
  await act(async () => root.render(<GoogleAuthCallback />));
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => complete({data:{session:{access_token:"initialized"}},error:null}));
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/thevoid"));
});

it("keeps denied application access out of the Studio", async () => {
  vi.mocked(fetch).mockResolvedValue({ok:false,json:async()=>({error:"postspark_access_required"})} as Response);
  await act(async () => root.render(<GoogleAuthCallback />));
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/?auth_error=postspark_access_required"));
  expect(navigate).not.toHaveBeenCalledWith("/thevoid");
});

it("reports a missing session without synchronizing an empty credential", async () => {
  state.session.mockResolvedValue({data:{session:null},error:null});
  await act(async () => root.render(<GoogleAuthCallback />));
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/?auth_error=no_token"));
  expect(fetch).not.toHaveBeenCalled();
});
