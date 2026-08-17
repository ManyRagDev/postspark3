import { beforeEach, describe, expect, it, vi } from "vitest";

// Ambiente "configurado" para exercitar o caminho real de db.ts.
vi.mock("./_core/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/env")>();
  return {
    ENV: {
      ...actual.ENV,
      supabaseUrl: "https://fake.supabase.co",
      supabaseServiceRoleKey: "fake-key",
    },
  };
});

// Client fake: encadeamento mínimo (from/select/insert/update/eq/order/limit/
// single/maybeSingle) que captura payloads e responde com dados configurados.
interface CapturedCall {
  table: string;
  operation: "insert" | "select" | "update";
  payload?: Record<string, unknown>;
}

const capturedCalls: CapturedCall[] = [];
let fakeResponse: { data: unknown; error: unknown } = { data: null, error: null };
let fakeRow: Record<string, unknown> | null = null;

function chain() {
  const builder: Record<string, unknown> = {
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => fakeResponse,
    maybeSingle: async () => ({ data: fakeRow, error: null }),
    select: () => builder,
    insert: () => builder,
    update: () => builder,
  };
  return builder;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => ({
      select: (columns?: string) => {
        capturedCalls.push({ table, operation: "select" });
        return chain();
      },
      insert: (payload: Record<string, unknown>) => {
        capturedCalls.push({ table, operation: "insert", payload });
        return chain();
      },
      update: (payload: Record<string, unknown>) => {
        capturedCalls.push({ table, operation: "update", payload });
        return chain();
      },
    }),
  })),
}));

import { createPost, getPostById, updatePost, type PostRecord } from "./db";

function snapshotV4(): Record<string, unknown> {
  return {
    snapshotVersion: 4,
    id: "var-1",
    headline: "Cafe artesanal: o ponto exato da torra",
    body: "Torra media preserva acidez e doce do grao.",
    resolvedTypography: {
      headline: { text: "Cafe artesanal: o ponto exato da torra", fontSizePx: 44 },
    },
    designTokens: { colors: { primary: "#1a1a2e" } },
    slides: [],
  };
}

describe("persistência de snapshot — ida e volta (SPEC-004)", () => {
  beforeEach(() => {
    capturedCalls.length = 0;
    fakeResponse = { data: null, error: null };
    fakeRow = null;
  });

  it("createPost persiste variation_snapshot v4 e campos legados no payload", async () => {
    fakeResponse = { data: { id: 42 }, error: null };
    const snapshot = snapshotV4();

    const id = await createPost({
      userUuid: "user-uuid-1",
      inputType: "text",
      inputContent: "cafe artesanal",
      platform: "instagram",
      headline: "Cafe artesanal: o ponto exato da torra",
      body: "Torra media preserva acidez e doce do grao.",
      caption: "A torra define o sabor.",
      hashtags: ["#cafe"],
      callToAction: "Saiba mais",
      tone: "Profissional",
      imagePrompt: "coffee cup",
      imageUrl: null,
      backgroundColor: "#1a1a2e",
      textColor: "#ffffff",
      accentColor: "#FF5F1F",
      layout: "centered",
      postMode: "static",
      slides: null,
      textElements: null,
      imageSettings: { padding: 10 },
      layoutSettings: { sectionLayouts: {} },
      bgValue: { type: "solid", color: "#1a1a2e" },
      bgOverlay: { opacity: 0.2 },
      copyAngle: { type: "beneficio", label: "x", badge: "x", stickerText: "x" },
      variationSnapshot: snapshot as PostRecord["variationSnapshot"],
    });

    expect(id).toBe(42);
    const insert = capturedCalls.find((call) => call.operation === "insert");
    expect(insert?.table).toBe("posts");
    expect(insert?.payload?.user_uuid).toBe("user-uuid-1");
    expect(insert?.payload?.variation_snapshot).toEqual(snapshot);
    expect(insert?.payload?.image_settings).toEqual({ padding: 10 });
    expect(insert?.payload?.copy_angle).toEqual({ type: "beneficio", label: "x", badge: "x", stickerText: "x" });
  });

  it("getPostById devolve o snapshot exatamente como foi persistido (v4)", async () => {
    const snapshot = snapshotV4();
    fakeRow = {
      id: 42,
      user_uuid: "user-uuid-1",
      headline: "Cafe artesanal: o ponto exato da torra",
      body: "Torra media preserva acidez e doce do grao.",
      variation_snapshot: snapshot,
    };

    const post = await getPostById(42, "user-uuid-1");

    expect(post?.variation_snapshot).toEqual(snapshot);
    expect(post?.variation_snapshot?.snapshotVersion).toBe(4);
    expect(post?.headline).toBe("Cafe artesanal: o ponto exato da torra");
  });

  it("getPostById devolve snapshot legado (v1) sem transformação destrutiva", async () => {
    const legacy = {
      snapshotVersion: 1,
      id: "legacy-1",
      headline: "Legado",
      designTokens: { colors: { primary: "#000" } },
    };
    fakeRow = { id: 7, user_uuid: "user-uuid-1", variation_snapshot: legacy };

    const post = await getPostById(7, "user-uuid-1");

    expect(post?.variation_snapshot).toEqual(legacy);
    expect(post?.variation_snapshot?.snapshotVersion).toBe(1);
  });

  it("updatePost atualiza variation_snapshot quando fornecido e não inventa campos", async () => {
    fakeResponse = { data: null, error: null };
    const snapshot = snapshotV4();

    await updatePost(42, "user-uuid-1", {
      variationSnapshot: snapshot as PostRecord["variationSnapshot"],
      headline: "Headline nova",
    } as Parameters<typeof updatePost>[2]);

    const update = capturedCalls.find((call) => call.operation === "update");
    expect(update?.payload?.variation_snapshot).toEqual(snapshot);
    expect(update?.payload?.headline).toBe("Headline nova");
    expect(update?.payload?.body).toBeUndefined();
  });

  it("updatePost sem campos definidos não dispara chamada ao banco", async () => {
    fakeResponse = { data: null, error: null };

    await updatePost(42, "user-uuid-1", {} as Parameters<typeof updatePost>[2]);

    expect(capturedCalls.some((call) => call.operation === "update")).toBe(false);
  });
});
