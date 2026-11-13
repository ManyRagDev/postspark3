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
vi.mock("@/lib/authBridge", () => ({ resyncSupabaseSession: auth.bridge }));
import StudioAuthModal from "./StudioAuthModal";

let element: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_POSTSPARK_LOCAL_AUTH", "");
  vi.stubEnv("VITE_POSTSPARK_AUTH_MODE", "");
  vi.stubEnv("VITE_POSTSPARK_SIGNUP_ENABLED", "");
  vi.stubEnv("VITE_POSTSPARK_EMAIL_DELIVERY_ENABLED", "");
  vi.stubEnv("VITE_SUPABASE_URL", "https://auth.example.test");
  window.location.href = "https://postspark.com.br/";
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

it("offers Google only when explicitly enabled, retaining password login", async () => {
  vi.stubEnv("VITE_POSTSPARK_AUTH_MODE", "email-google");
  auth.signInWithOAuth.mockResolvedValue({ error: null });
  await render();
  expect(element.textContent).toContain("Continuar com Google");
  expect(element.textContent).not.toContain("Criar conta");
  expect(element.querySelector('input[aria-label="Senha"]')).not.toBeNull();
  await act(async () => {
    Array.from(element.querySelectorAll("button")).find(b => b.textContent?.includes("Continuar com Google"))!.click();
  });
  expect(auth.signInWithOAuth).toHaveBeenCalledWith({
    provider: "google",
    options: { redirectTo: "https://postspark.com.br/auth/google-callback", queryParams: { access_type: "offline", prompt: "consent" } },
  });
});

it("does not advertise signup without email delivery even when signup is requested", async () => {
  vi.stubEnv("VITE_POSTSPARK_SIGNUP_ENABLED", "true");
  await render();
  expect(element.textContent).not.toContain("Criar conta");
  expect(element.textContent).not.toMatch(/recuperar|esqueci/i);
});

it("retains signup when explicitly enabled with email delivery", async () => {
  vi.stubEnv("VITE_POSTSPARK_SIGNUP_ENABLED", "true");
  vi.stubEnv("VITE_POSTSPARK_EMAIL_DELIVERY_ENABLED", "true");
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  await render();
  expect(element.textContent).toContain("Criar conta");
  await act(async () => {
    Array.from(element.querySelectorAll("button")).find(b => b.textContent === "Criar conta")!.click();
  });
  await submit();
  expect(auth.signUp).toHaveBeenCalledOnce();
  expect(auth.signInWithPassword).not.toHaveBeenCalled();
  expect(auth.bridge).not.toHaveBeenCalled();
  expect(element.textContent).toContain("Verifique seu e-mail");
});

it("does not enter the Studio until the backend grants access and synchronizes the cookie", async () => {
  auth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: "token" } }, error: null });
  let reject!: (error: Error) => void;
  auth.bridge.mockReturnValue(new Promise((_, failure) => { reject = failure; }));
  await render();
  await submit();
  expect(window.location.pathname).toBe("/");
  expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  await act(async () => { reject(new Error("postspark_access_required")); });
  expect(window.location.pathname).toBe("/");
  expect(element.querySelector('[role="alert"]')!.textContent).toBe("Sua conta ainda não tem acesso ao PostSpark. Fale com o suporte.");
});
