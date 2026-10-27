import { describe, it, expect } from "vitest";
import {
  compileProjectDossier,
  parseDossierContract,
  EXTERNAL_DOSSIER_PROMPT_TEMPLATE,
} from "./brandProjects";

describe("Brand Projects - Compilador e Parser", () => {
  it("deve compilar dados estruturados do formulário em um dossiê Markdown", () => {
    const compiled = compileProjectDossier("Clínica DermaLuz", "Dermatologia Estética", {
      offerAndTransformation: "Séruns veganos de alta concentração para peles sensíveis.",
      factualDifferentials: "Aprovado por dermatologistas; embalagem refilável.",
      targetAudience: "Mulheres de 25 a 45 anos.",
      painsAndObjections: "Medo de alergia e efeito rebote.",
      voiceTone: "Científico & Técnico",
      forbiddenTerms: "milagre; baratinho; 100% garantido",
      defaultCta: "Converse com nossa equipe no Direct.",
    });

    expect(compiled).toContain("# DOSSIÊ DE MARCA: Clínica DermaLuz");
    expect(compiled).toContain("**Segmento / Nicho:** Dermatologia Estética");
    expect(compiled).toContain("## O QUE FAZEMOS & TRANSFORMAÇÃO\nSéruns veganos de alta concentração para peles sensíveis.");
    expect(compiled).toContain("## DIFERENCIAIS FACTUAIS\nAprovado por dermatologistas; embalagem refilável.");
    expect(compiled).toContain("## PÚBLICO-ALVO\nMulheres de 25 a 45 anos.");
    expect(compiled).toContain("## DORES E OBJEÇÕES DO CLIENTE\nMedo de alergia e efeito rebote.");
    expect(compiled).toContain("## POSTURA E TOM DE VOZ\nCientífico & Técnico");
    expect(compiled).toContain("## TERMOS E ABORDAGENS PROIBIDAS\nmilagre; baratinho; 100% garantido");
    expect(compiled).toContain("## CHAMADA PARA AÇÃO (CTA PADRÃO)\nConverse com nossa equipe no Direct.");
  });

  it("deve extrair dados do contrato externo delimitado por [POSTSPARK_DOSSIER_START] e [POSTSPARK_DOSSIER_END]", () => {
    const rawExternalResponse = `
Olá! Aqui está o dossiê que você pediu:

[POSTSPARK_DOSSIER_START]
## NOME_DO_PROJETO
Café do Brejo

## NICHO
Cafeteria e Torrefação Artesanal

## OFERTA_E_TRANSFORMACAO
Cafés especiais colhidos à mão e torrados semanalmente, entregando frescor absoluto e notas florais reais.

## DIFERENCIAIS_FACTUAIS
Grãos 100% arábica acima de 86 pontos SCA; torra semanal rastreável.

## PUBLICO_ALVO
Apreciadores de café e profissionais criativos que valorizam rituais diários de qualidade.

## DORES_E_OBJECOES
Acham que café especial é amargo demais ou muito caro comparado aos de gôndola de mercado.

## TOM_DE_VOZ
Acolhedor & Empático | Didático & Acessível

## FRONTEIRAS_E_TERMOS_PROIBIDOS
gourmet tradicional; extra forte; pó queimado; promoção relâmpago

## CTA_PADRAO
Peça seu pacote fresco pelo link da bio.
[POSTSPARK_DOSSIER_END]

Espero que ajude nos seus posts!
`;

    const parsed = parseDossierContract(rawExternalResponse);

    expect(parsed.success).toBe(true);
    expect(parsed.name).toBe("Café do Brejo");
    expect(parsed.niche).toBe("Cafeteria e Torrefação Artesanal");
    expect(parsed.structuredData?.offerAndTransformation).toContain("Cafés especiais colhidos à mão");
    expect(parsed.structuredData?.factualDifferentials).toContain("acima de 86 pontos SCA");
    expect(parsed.structuredData?.targetAudience).toContain("Apreciadores de café");
    expect(parsed.structuredData?.painsAndObjections).toContain("Acham que café especial é amargo");
    expect(parsed.structuredData?.voiceTone).toContain("Acolhedor & Empático");
    expect(parsed.structuredData?.forbiddenTerms).toContain("gourmet tradicional");
    expect(parsed.structuredData?.defaultCta).toContain("Peça seu pacote fresco pelo link da bio.");
    expect(parsed.compiledDocument).toContain("# DOSSIÊ DE MARCA: Café do Brejo");
  });

  it("deve aceitar e extrair dados de documentos Markdown gerais trazidos pelo usuário", () => {
    const rawMarkdown = `
# Studio Lumina Fotografia
Nicho: Fotografia de Casamento e Ensaios

A Studio Lumina é especializada em coberturas fotográficas espontâneas para noivos que prezam por memórias autênticas, sem poses forçadas.

Nosso diferencial é o olhar documental e a entrega rápida de prévia em até 48 horas.
`;
    const parsed = parseDossierContract(rawMarkdown);

    expect(parsed.success).toBe(true);
    expect(parsed.name).toBe("Studio Lumina Fotografia");
    expect(parsed.niche).toBe("Fotografia de Casamento e Ensaios");
    expect(parsed.structuredData?.offerAndTransformation).toContain("Studio Lumina é especializada em coberturas");
    expect(parsed.compiledDocument).toContain("Studio Lumina Fotografia");
  });

  it("deve rejeitar texto vazio ou muito curto", () => {
    const invalidText = "Oi tudo bem";
    const parsed = parseDossierContract(invalidText);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("muito curto");
  });

  it("deve conter o template de prompt com as instruções e delimitadores esperados", () => {
    expect(EXTERNAL_DOSSIER_PROMPT_TEMPLATE).toContain("[POSTSPARK_DOSSIER_START]");
    expect(EXTERNAL_DOSSIER_PROMPT_TEMPLATE).toContain("[POSTSPARK_DOSSIER_END]");
    expect(EXTERNAL_DOSSIER_PROMPT_TEMPLATE).toContain("## NOME_DO_PROJETO");
    expect(EXTERNAL_DOSSIER_PROMPT_TEMPLATE).toContain("## NICHO");
    expect(EXTERNAL_DOSSIER_PROMPT_TEMPLATE).toContain("## OFERTA_E_TRANSFORMACAO");
  });
});
