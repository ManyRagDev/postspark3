import { describe, expect, it } from "vitest";
import { detectScriptStructure } from "./scriptDetector";

describe("scriptDetector", () => {
  it.each([
    ["slide1:", "slide2:"],
    ["Slide 1", "Slide 2"],
    ["SLIDE01 —", "SLIDE02 —"],
    ["## Slide1", "## Slide2"],
    ["**Slide 1:**", "**Slide 2:**"],
    ["**Slide1**:", "**Slide2**:"],
    ["[Slide1]", "[Slide2]"],
    ["Lâmina1:", "Lâmina2:"],
    ["Lamina 1 -", "Lamina 2 -"],
    ["Tela1.", "Tela2."],
    ["Página1:", "Página2:"],
    ["Slide #1:", "Slide #2:"],
  ])(
    "recognizes %s markers without changing slide content",
    (first, second) => {
      const result = detectScriptStructure(
        `${first}\n**Título original**\n\nCorpo com 123.\n\n${second}\nOutro texto!`
      );
      expect(result.isScript).toBe(true);
      expect(result.slides.map(slide => slide.rawText)).toEqual([
        "**Título original**\n\nCorpo com 123.",
        "Outro texto!",
      ]);
    }
  );
  it("accepts short inline scripts and keeps body markdown after a decorated marker", () => {
    expect(
      detectScriptStructure("slide1: Oi\nslide2: Tchau").slides.map(
        s => s.rawText
      )
    ).toEqual(["Oi", "Tchau"]);
    expect(
      detectScriptStructure(
        "**Slide1**: **Oi**\n**Slide2:** **Tchau**"
      ).slides.map(s => s.rawText)
    ).toEqual(["**Oi**", "**Tchau**"]);
  });
  it("splits a standalone separator and retains internal paragraph breaks and Unicode", () => {
    const text =
      "Cafe\u0301\n\nSegundo parágrafo.\r\n---\r\nFinal com **ênfase**.";
    expect(detectScriptStructure(text).slides.map(s => s.rawText)).toEqual([
      "Cafe\u0301\n\nSegundo parágrafo.",
      "Final com **ênfase**.",
    ]);
    expect(
      detectScriptStructure("Preço --- condição. Continua no mesmo texto.")
        .isScript
    ).toBe(false);
  });
  it("does not treat ordinary mentions or identifiers as slide boundaries", () => {
    for (const text of [
      "Veja o slide1 e compare com slide2.",
      "slide1arquivo\nAlgo\nslide2arquivo\nOutro",
      "slide1_id\nTexto\nslide2_id\nTexto",
    ])
      expect(detectScriptStructure(text).isScript).toBe(false);
  });
  it("keeps numbered lists and horizontal rules inside explicitly marked slides", () => {
    expect(
      detectScriptStructure(
        "slide1:\n1. Primeiro\n2. Segundo\n3. Terceiro\n---\nNota\nslide2:\nFim"
      ).slides.map(s => s.rawText)
    ).toEqual(["1. Primeiro\n2. Segundo\n3. Terceiro\n---\nNota", "Fim"]);
  });
  it("retains all source slides beyond the supported count so the UI can stop instead of truncating", () => {
    const result = detectScriptStructure(
      Array.from(
        { length: 12 },
        (_, i) => `Slide ${i + 1}:\nConteúdo original ${i + 1}`
      ).join("\n\n")
    );
    expect(result.slideCount).toBe(10);
    expect(result.slides).toHaveLength(12);
    expect(result.slides[11].rawText).toContain("original 12");
  });
  it("detects 8 slides correctly in ZHUB briefing", () => {
    const zhubBriefing = `BRIEFING — ARQUÉTIPO: Governança
============================================================
## Roteiro Reels

**Ato 1: Gancho**  
*Cena: Um escritório bagunçado, com papéis espalhados e uma equipe estressada.*  
**Fala:** "Você já se viu correndo para resolver uma emergência de abastecimento?"

**Ato 2: Desenvolvimento**  
*Cena: Corta para um funcionário olhando para um papel com números e faturas altas.*  
**Fala:** "Compras emergenciais são como um imposto invisível. Elas drenam seu orçamento sem que você perceba!"

**Ato 3: CTA**  
*Cena: Uma tela com a logo da ZHUB e a frase "Transforme sua gestão de suprimentos!"*  
**Fala:** "Mapeie desperdícios e ganhe previsibilidade com nosso diagnóstico gratuito. Acesse zhubsp.com.br!"

## Carrossel

**Slide 1:**  
Título: O Imposto Invisível da Sua Operação  

**Slide 2:**  
Texto: Emergências de abastecimento podem sair muito caro.  

**Slide 3:**  
Texto: Cada compra emergencial é um custo oculto que afeta seu orçamento.  

**Slide 4:**  
Texto: Planeje a reposição com base no consumo real.  

**Slide 5:**  
Texto: Padronize marcas de alto rendimento e reduza desperdícios.  

**Slide 6:**  
Texto: Acompanhe indicadores mensais para evitar surpresas.  

**Slide 7:**  
Texto: Ganhe previsibilidade financeira e controle total da sua operação.  

**Slide 8:**  
Texto: Faça um diagnóstico gratuito em zhubsp.com.br!

## Legenda

Você sabia que as compras emergenciais podem ser um "imposto invisível" na sua operação?`;

    const result = detectScriptStructure(zhubBriefing);
    expect(result.isScript).toBe(true);
    expect(result.slideCount).toBe(8);
    expect(result.slides).toHaveLength(8);
    expect(result.hasExtraneousSections).toBe(true);
    expect(result.slides[0].title).toBe("O Imposto Invisível da Sua Operação");
    expect(result.slides[1].body).toContain(
      "Emergências de abastecimento podem sair muito caro."
    );
    expect(result.slides[7].body).toContain(
      "Faça um diagnóstico gratuito em zhubsp.com.br!"
    );
  });

  it("detects numbered list sequence (ReUNE amigo secreto format)", () => {
    const reuneInput = `Apresente o Sorteador Relâmpago do ReUNE para quem ficou encarregado do amigo secreto.
1. Gancho: sobrou pra você organizar o amigo secreto? Brinque com o drama do papelzinho.
2. Solução: apresente o Sorteador Relâmpago. Destaque “Sem baixar app” e “Sem cadastro”.
3. Sigilo: ninguém tira a si mesmo. Cada pessoa recebe seu Envelope Digital Lacrado pelo WhatsApp.
4. Fechamento: ano passado no papelzinho, este ano no ReUNE. Convide a testar.`;

    const result = detectScriptStructure(reuneInput);
    expect(result.isScript).toBe(true);
    expect(result.slideCount).toBe(4);
    expect(result.slides).toHaveLength(4);
    expect(result.slides[0].title).toContain("Gancho:");
  });

  it("returns isScript false for general open topics or themes", () => {
    const openTopic =
      "Crie 3 opções de posts sobre ergonomia no home office com dicas para evitar dor na coluna.";
    const result = detectScriptStructure(openTopic);
    expect(result.isScript).toBe(false);
    expect(result.slideCount).toBe(0);
    expect(result.slides).toHaveLength(0);
  });
});
