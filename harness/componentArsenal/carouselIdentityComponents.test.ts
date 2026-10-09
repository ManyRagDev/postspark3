import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ComponentPackage } from "./extract";
import { carouselIdentityComponents } from "./carouselIdentityComponents";

const packageFor = (referenceId: string): ComponentPackage => {
  const directory = path.resolve("artifacts/component-arsenal/revision-5/packages");
  const file = readdirSync(directory).find(name => {
    const value = JSON.parse(readFileSync(path.join(directory, name), "utf8"));
    return value.source.referenceId === referenceId;
  });
  if (!file) throw new Error(`Fixture ausente para ${referenceId}`);
  return JSON.parse(readFileSync(path.join(directory, file), "utf8"));
};

describe("carouselIdentityComponents", () => {
  it("emite slots canônicos e CTA apenas quando há autoria de CTA", () => {
    const paper = carouselIdentityComponents(packageFor("0623fb1c14937cd1e67e980b566710ba"));
    const window = carouselIdentityComponents(packageFor("1c2fb00a82a764bab2f4374d03f67886"));
    expect(paper).toHaveLength(2);
    expect(paper[1].fragment.bindings.map(b => b.source)).toEqual([
      "block:headline:0:text", "block:body:0:text", "block:callToAction:0:text",
    ]);
    expect(window).toHaveLength(2);
    expect(window[1].fragment.bindings.map(b => b.source)).toContain("block:callToAction:0:text");
    expect(window[0].fragment.instances.find(i => i.id === "cartao-conteudo")?.width).not.toBe(
      packageFor("1c2fb00a82a764bab2f4374d03f67886").components.find(c => c.kind === "content" && !c.source.variantKey.includes("quiet"))?.fragment.instances.find(i => i.id === "cartao-conteudo")?.width,
    );
    expect(window[0].fragment.instances.find(i => i.id === "titulo-principal")?.width).not.toBe(
      window[1].fragment.instances.find(i => i.id === "titulo-principal")?.width,
    );
  });

  it("mantém hash de fonte, densidade da origem e não altera o package", () => {
    const source = packageFor("c5d8dcc1ddabea113d4f4a5ea76cde0d");
    const before = JSON.stringify(source);
    const authored = carouselIdentityComponents(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(authored.every(c => c.source.kind === "recipe" && c.source.recipeHash === source.source.recipeHash)).toBe(true);
    expect(authored.every(c => c.densities.every(d => d === "balanced" || d === "expressive"))).toBe(true);
    expect(authored.every(c => c.hash.length === 64)).toBe(true);
    expect(authored.every(c => c.densities.includes("expressive"))).toBe(true);
    const headline = authored[0].fragment.bindings.find(b => b.source === "block:headline:0:text")!;
    expect(headline.targetIds.every(id => {
      const instance = authored[0].fragment.instances.find(i => i.id === id)!;
      const piece = authored[0].pieces[instance.pieceHash];
      return piece.kind !== "text" || piece.strokeWidth >= 3 / Math.min(1080 / authored[0].fragment.artboard.width, 1350 / authored[0].fragment.artboard.height);
    })).toBe(true);
  });
});
