# Especificação Técnica — Resiliência de Layout e Recuperação em 3 Camadas

## 1. Contexto e Objetivo
Evitar que propostas de geração de posts (V5) retornem com status `failed` ao usuário devido a estouros pontuais de geometria ou caixas de texto incompatíveis.
O sistema deve operar uma política em 3 camadas de resiliência:
1. **Auto-resolução elástica:** ajuste fino de tamanho de fonte quando um token indivisível estiver prestes a caber na caixa autorada (até 20% de tolerância abaixo do `minFontSize`).
2. **Revisão cirúrgica explicativa (Prompt Feedback):** fornecer métricas reais de largura/caracteres no prompt de `copy_recovery` para o modelo gerar palavras compatíveis com a caixa.
3. **Substituição de Template via JEV (Fallback até 3x):** se o template persistir inviável após recuperação, trocar o template por outra oferta compatível do shortlist do JEV em vez de falhar a proposta.

---

## 2. Contratos e Parâmetros

### 2.1. Camada 1: Resiliência Elástica Geométrica (`shared/arsenalGeometry.ts`)
- **Parâmetro de tolerância de token:** `TOKEN_OVERFLOW_ELASTICITY_FACTOR = 0.80` (permite que `fontSize` chegue a até 80% de `minFontSize`, desde que `fontSize >= 12px` para garantir legibilidade WCAG).
- Se a redução elástica acomodar o token indivisível (`!overflowsTokenWidth()` e `layout.height <= p.maxHeight`), a relação `textFit` é considerada bem-sucedida e **nenhum issue fatal é emitido**.

### 2.2. Camada 2: Prompt Diagnóstico de Recuperação (`server/ai/workflows/proposalGraph.ts`)
- Ao detectar `overflow:token:<targetId>` ou `overflow:<targetId>`, o prompt de `copy_recovery` calcula:
  - Largura autorada da caixa (`width` em pixels).
  - Comprimento da palavra gerada vs. limite recomendado de caracteres (`Math.floor(boxWidth / charWidthEstimate)`).
- O prompt injeta uma instrução explícita:  
  `"O fragmento <id> da caixa possui largura restrita. Use palavras de no máximo <N> caracteres neste trecho."`

### 2.3. Camada 3: Substituição de Template por Slot (`server/ai/workflows/generationRuntime.ts` / `proposalGraph.ts`)
- Se após a etapa de recuperação a proposta ainda registrar defeito fatal insuperável:
  - O slot não é imediatamente marcado como `failed`.
  - O coordenador seleciona a próxima oferta compatível do shortlist do JEV (`selectedOffers` ou `electionReceipt.choices` alternativas).
  - O loop permite até **3 tentativas de substituição de template (3x)** por slot antes de emitir erro final ao usuário.
  - Toda a liquidação e integridade de ledger transacional são mantidas.
