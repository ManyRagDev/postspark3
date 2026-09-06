---
name: contrast-color-guardian
description: >
  Diretrizes de contraste de acessibilidade WCAG 2.1, regras de inversão automática por metade (Brutal Split),
  efeitos com contraste garantido e política de overrides manuais de cores no PostSpark.
---

# Skill: Guardião de Contraste & Ciência de Cores (PostSpark)

Esta habilidade orienta a implementação e regras de contraste, cores e legibilidade tipográfica no PostSpark, garantindo acessibilidade em todas as 14 famílias visuais oficiais.

---

## 1. Funções Centrais do Guardião (`client/src/pages/CanvasLab/lib/contrast.ts`)

O módulo de contraste resolve deterministamente a cor ideal de texto contra qualquer fundo:
* `isDarkColor(hexColor: string): boolean`: Determina se uma cor de fundo é escura calculando a luminância relativa WCAG.
* `resolveLegibleTextColor(backgroundColor: string, fallbackColor: string): string`:
  * Fundo escuro &rarr; retorna `#FFFFFF`.
  * Fundo claro &rarr; retorna `#121214` (preto editorial profundo).
  * Se o contraste com o `fallbackColor` já atender ao índice mínimo de 4.5:1, preserva a intenção artística da marca.

---

## 2. Regra de Ouro do Contraste Assimétrico: Brutal Split

A família visual `brutal-split` possui uma divisão 50/50 em dois blocos cromáticos distintos:
1. **Metade Superior:** Preenchida com a cor base (`palette.background`, ex.: preto `#171717`). O título reside nesta metade.
2. **Metade Inferior:** Preenchida com a cor de acento vibrante (`palette.accent`, ex.: verde neon `#21F1A8` ou amarelo). O subtítulo reside nesta metade.

### Invariante de Contraste no Split:
* O título **DEVE** resolver seu contraste contra `palette.background`.
* O subtítulo **DEVE** resolver seu contraste contra `palette.accent`.
* **Nunca** aplique uma cor única de texto para o post inteiro no Brutal Split, sob pena de tornar o subtítulo completamente invisível sobre a cor de destaque.

---

## 3. Cores com Efeitos de Legibilidade Tipográfica

Alguns efeitos visuais de letras (`TextLegibilityEffect`) impõem regras próprias de contraste sobre os textos:
* `box-accent` (Caixa na Cor da Marca): Como o fundo do texto passa a ser a cor de destaque da marca (`palette.accent`), o texto deve recalcular dinamicamente sua legibilidade contra o `accent`, e não contra o fundo geral do post.
* `box-brutal` (Tarja Neobrutalista):
  * Fundo branco &rarr; Texto preto (`#000000`).
  * Fundo preto &rarr; Texto branco (`#FFFFFF`).
* `shadow` e `outline`: Devem usar sombras claras em fundos escuros e sombras escuras e densas em fundos claros para garantir legibilidade.

---

## 4. Política de Overrides Manuais do Usuário

O PostSpark respeita a agência do usuário, mas protege a qualidade do design:
1. Quando o usuário seleciona uma cor manual na paleta (`manualHeadlineColor` ou `manualSubtextColor`), essa cor tem prioridade sobre o cálculo automático.
2. Se a cor escolhida pelo usuário tiver contraste insuficiente (< 4.5:1), a interface exibe o selo `LowContrastBadge` avisando sobre baixa legibilidade.
3. O painel disponibiliza o botão "Limpar", que reverte imediatamente para a cor recomendada pelo Guardião de Contraste.
