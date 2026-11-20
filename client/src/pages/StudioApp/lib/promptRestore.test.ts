import { describe, expect, it } from "vitest";
import { restorePromptFromContent } from "./promptRestore";

describe("Phase 2 — restorePromptFromContent", () => {
  it("preserves multi-paragraph prompt when legacy project art direction block is present", () => {
    const input = [
      "Parágrafo 1 sobre a proposta de valor do produto.",
      "Parágrafo 2 com detalhes importantes, métricas e comprovações.",
      "Parágrafo 3 com chamada para ação final.",
    ].join("\n\n") + "\n\n[DIREÇÃO DE ARTE DO PROJETO ATIVA — OBRIGATÓRIA]\nO usuário ativou o design extraído do projeto \"ReUNE\".\nEstilo visual: Neubrutalismo.\nPaleta de cores a aplicar: #FFFDF5, #F05728.\nTipografia a aplicar: Space Grotesk, Space Mono.\nCrie os posts aplicando com fidelidade este ecossistema visual.";

    const expected = [
      "Parágrafo 1 sobre a proposta de valor do produto.",
      "Parágrafo 2 com detalhes importantes, métricas e comprovações.",
      "Parágrafo 3 com chamada para ação final.",
    ].join("\n\n");

    // Demonstração da falha com a regex anterior com classe aberta:
    const legacyBrokenResult = input.replace(/\n\n[INSTRUÇÃO DE DIREÇÃO DE ARTE[\s\S]*$/, "");
    expect(legacyBrokenResult).toBe("Parágrafo 1 sobre a proposta de valor do produto."); // Truncava no 1º parágrafo!

    // Com a nova função corrigida:
    const restored = restorePromptFromContent(input);
    expect(restored).toBe(expected);
  });

  it("removes legacy [INSTRUÇÃO DE DIREÇÃO DE ARTE] blocks without affecting multi-paragraph body", () => {
    const input = [
      "Primeira parte do texto.",
      "Segunda parte do texto.",
    ].join("\n\n") + "\n\n[INSTRUÇÃO DE DIREÇÃO DE ARTE — OBRIGATÓRIA]\nO usuário declarou preferência visual pela família \"acervo82-concept-01\".\nUse essa família em EXATAMENTE UMA das 3 variações.";

    const expected = "Primeira parte do texto.\n\nSegunda parte do texto.";
    expect(restorePromptFromContent(input)).toBe(expected);
  });

  it("removes legacy 'Preferência visual:' blocks while keeping content intact", () => {
    const input = [
      "Passo 1: planeje.",
      "Passo 2: execute.",
      "Passo 3: meça os resultados.",
    ].join("\n\n") + "\n\nPreferência visual: REF-01 · Minimal. Grade limpa e espaçamento contido. Considere essa direção quando compatível com o conteúdo, mídia e formato pedidos.";

    const expected = "Passo 1: planeje.\n\nPasso 2: execute.\n\nPasso 3: meça os resultados.";
    expect(restorePromptFromContent(input)).toBe(expected);
  });

  it("leaves clean multi-paragraph prompts completely unchanged", () => {
    const clean = [
      "Título chamativo sobre o tema.",
      "Desenvolvimento em duas linhas com contexto.",
      "Conclusão com convite para comentar.",
    ].join("\n\n");

    expect(restorePromptFromContent(clean)).toBe(clean);
  });

  it("strips the 'Crie 3 novos ganchos' prefix and removes legacy block if present", () => {
    const input = "Crie 3 novos ganchos criativos e direções de arte alternativas sobre: Café artesanal em grãos selecionados.\n\nMais detalhes sobre o produtor.\n\n[DIREÇÃO DE ARTE DO PROJETO ATIVA — OBRIGATÓRIA]\nPaleta: #112233";
    const expected = "Café artesanal em grãos selecionados.\n\nMais detalhes sobre o produtor.";
    expect(restorePromptFromContent(input)).toBe(expected);
  });
});
