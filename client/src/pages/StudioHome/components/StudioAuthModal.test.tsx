// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  bridge: vi.fn(),
}));
vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: { auth },
}));
vi.mock("@/lib/authBridge", () => ({ exchangeSupabaseSession: auth.bridge }));
import StudioAuthModal from "./StudioAuthModal";

let element: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  vi.stubEnv("VITE_POSTSPARK_LOCAL_AUTH", "email");
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:55481");
  window.location.href = "http://127.0.0.1:3182/";
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
});
afterEach(async () => {
  await act(async () => root.unmount());
  element.remove();
  vi.unstubAllEnvs();
});
const render = () =>
  act(async () =>
    root.render(<StudioAuthModal isOpen isMobile={false} onClose={() => {}} />)
  );
async function submit() {
  await act(async () => {
    for (const [label, value] of [
      ["E-mail", "acervo82@postspark.test"],
      ["Senha", "local-test-password"],
    ]) {
      const input = element.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`
      )!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await act(async () => {
    element
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

it("uses password auth and completes the backend bridge before entering the Studio", async () => {
  auth.signInWithPassword.mockResolvedValue({
    data: { session: { access_token: "local-token" } },
    error: null,
  });
  auth.bridge.mockResolvedValue(undefined);
  await render();
  expect(element.textContent).not.toContain("Continuar com Google");
  expect(element.textContent).not.toContain("Criar conta");
  await submit();
  expect(auth.signInWithPassword).toHaveBeenCalledWith({
    email: "acervo82@postspark.test",
    password: "local-test-password",
  });
  expect(auth.bridge).toHaveBeenCalledWith("local-token");
  expect(window.location.pathname).toBe("/thevoid");
  expect(auth.signUp).not.toHaveBeenCalled();
  expect(auth.signInWithOAuth).not.toHaveBeenCalled();
});

it("keeps a rejected password on the form without calling the bridge", async () => {
  auth.signInWithPassword.mockResolvedValue({
    data: { session: null },
    error: { message: "Invalid login credentials" },
  });
  await render();
  await submit();
  expect(element.textContent).toContain("E-mail ou senha incorretos.");
  expect(auth.bridge).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe("/");
});

it("preserves Google and registration outside the local test profile", async () => {
  vi.stubEnv("VITE_POSTSPARK_LOCAL_AUTH", "");
  await render();
  expect(element.textContent).toContain("Continuar com Google");
  expect(element.textContent).toContain("Criar conta");
});
