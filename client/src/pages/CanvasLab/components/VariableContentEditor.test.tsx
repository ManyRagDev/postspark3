// @vitest-environment happy-dom
import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import VariableContentEditor from "./VariableContentEditor";
import type { VariableContent } from "@shared/variableContent";
let root: Root | undefined;
const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});
describe("painel de conteúdo variável", () => {
  it("adiciona e reordena blocos com IDs estáveis; adiciona/exclui itens", () => {
    let current: VariableContent = {
      schemaVersion: 3,
      blocks: [{ id: "first", type: "text", role: "body", text: "Primeiro" }],
      caption: "",
      hashtags: [],
    };
    function Host() {
      const [value, setValue] = useState(current);
      current = value;
      return <VariableContentEditor value={value} onChange={setValue} />;
    }
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(<Host />));
    const click = (label: string) => {
      const b = Array.from(host.querySelectorAll("button")).find(
        b => b.getAttribute("aria-label") === label || b.textContent === label
      );
      expect(b).toBeTruthy();
      act(() => b!.click());
    };
    click("Adicionar lista");
    expect(current.blocks).toHaveLength(2);
    const listId = current.blocks[1].id;
    click("Subir bloco 2");
    expect(current.blocks[0].id).toBe(listId);
    click("Adicionar item ao bloco 1");
    expect(
      current.blocks[0].type === "list" && current.blocks[0].items.length
    ).toBe(2);
    click("Excluir item 1 do bloco 1");
    expect(
      current.blocks[0].type === "list" && current.blocks[0].items.length
    ).toBe(1);
    click("Excluir bloco 1");
    expect(current.blocks.map(b => b.id)).toEqual(["first"]);
    expect(host.querySelector("textarea[maxlength]")).toBeNull();
  });
});
