// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Pricing from "./Pricing";

const mocks = vi.hoisted(() => ({
  offers: vi.fn(),
  checkout: vi.fn(),
  session: vi.fn(),
}));

vi.mock("@/lib/membershipApi", () => ({
  readEnrollmentOffers: mocks.offers,
  startProCheckout: mocks.checkout,
}));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession: mocks.session } } }));
vi.mock("@/pages/StudioHome/components/StudioAuthModal", () => ({
  default: ({ isOpen, checkoutPlan, checkoutCycle }: { isOpen: boolean; checkoutPlan?: string; checkoutCycle?: string }) =>
    isOpen ? <span role="dialog">{checkoutPlan} {checkoutCycle}</span> : null,
}));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/lib/authBridge", () => ({ resyncSupabaseSession: vi.fn() }));

const host = document.createElement("div");
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.session.mockResolvedValue({ data: { session: null } });
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const result = Array.from(host.querySelectorAll("button")).find(item => item.textContent?.includes(label));
  if (!result) throw new Error(`Botão ausente: ${label}`);
  return result;
}

it("shows every plan even when the public catalog can sell only PRO", async () => {
  mocks.offers.mockResolvedValue({ start: false, paid: ["PRO"] });
  await act(async () => root.render(<Pricing />));
  expect(Array.from(host.querySelectorAll("h2"), heading => heading.textContent)).toEqual([
    "START Grátis", "Solo", "PRO", "PRO+", "AGENCY",
  ]);
  expect(Array.from(host.querySelectorAll("button:disabled"), item => item.textContent)).toEqual([
    "Em breve", "Em breve", "Em breve",
  ]);
});

it("shows each annual total and its monthly equivalent without opening unconfigured checkouts", async () => {
  mocks.offers.mockResolvedValue({ start: false, paid: ["SOLO", "PRO", "PRO_PLUS"] });
  await act(async () => root.render(<Pricing />));
  const pro = host.querySelector('article[aria-labelledby="pricing-PRO"]')!;
  expect(pro.textContent).toMatch(/147,00\s*por mês/);
  expect(pro.textContent).not.toContain("Equivale a");

  await act(async () => button("Anual").click());
  expect(button("Anual").getAttribute("aria-pressed")).toBe("true");
  expect(pro.textContent).toMatch(/1\.404,00\s*por ano[\s\S]*Equivale a R\$\s*117,00 por mês\./);
  for (const [plan, total, equivalent] of [
    ["SOLO", /479,04\s*por ano/, /39,92 por mês/],
    ["PRO_PLUS", /2\.399,04\s*por ano/, /199,92 por mês/],
    ["AGENCY", /2\.879,04\s*por ano/, /239,92 por mês/],
  ] as const) {
    const card = host.querySelector(`article[aria-labelledby="pricing-${plan}"]`)!;
    expect(card.textContent).toMatch(total);
    expect(card.textContent).toMatch(equivalent);
    const annualButton = card.querySelector("button");
    expect(annualButton?.textContent).toBe("Adesão anual em breve");
    expect(annualButton?.disabled).toBe(true);
  }

  await act(async () => button("Assinar o Pro").click());
  expect(host.querySelector('[role="dialog"]')?.textContent).toBe("PRO annual");
  expect(mocks.checkout).not.toHaveBeenCalled();
});

it("opens registration for a pilot only after enrollment is enabled", async () => {
  mocks.offers.mockResolvedValue({ start: true, paid: ["SOLO", "PRO"] });
  await act(async () => root.render(<Pricing />));
  expect(button("Criar minha primeira peça").disabled).toBe(false);
  await act(async () => button("Assinar Solo").click());
  expect(host.querySelector('[role="dialog"]')?.textContent).toBe("SOLO monthly");
});

it("passes the selected pilot and annual cycle into registration", async () => {
  mocks.offers.mockResolvedValue({ start: false, paid: ["PRO", "SOLO"], annualPaid: ["PRO", "PRO_PLUS"] });
  await act(async () => root.render(<Pricing />));
  await act(async () => button("Anual").click());
  const solo = host.querySelector('article[aria-labelledby="pricing-SOLO"] button') as HTMLButtonElement;
  expect(solo.disabled).toBe(true);
  await act(async () => button("Assinar PRO+").click());
  expect(host.querySelector('[role="dialog"]')?.textContent).toBe("PRO_PLUS annual");
});
