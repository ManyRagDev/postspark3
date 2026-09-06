---
name: post-visual-snapshot
description: >
  Invariante mandatória do repositório: normalizador canônico PostVisualSnapshot, 
  ciclo de vida no Zustand, persistência e prevenção de vazamento de estado entre slides.
---

# Skill: Ciclo de Vida do PostVisualSnapshot (PostSpark)

Esta habilidade detalha a invariante arquitetural mais crítica do repositório: a **Fonte Única da Verdade dos Posts**.

---

## 1. A Invariante Mandatória (AGENTS.md)

Após a chamada de geração `post.generate`, cada variação de post (`PostVariation`) **DEVE atravessar uma única vez o normalizador canônico** em `client/src/lib/variationSnapshot.ts` e tornar-se um `PostVisualSnapshot`.

### Regras Mandatórias:
1. **Consumo Universal:** O HoloDeck, o Workbench, o CanvasLab, as rotas de exportação e as telas de posts salvos **DEVEM consumir o mesmo `PostVisualSnapshot`**.
2. **Sem Precedência Paralela:** Renderizadores nunca podem remover `designTokens`, recalcular prioridades de cor de forma divergente ou reconstruir backgrounds por conta própria.
3. **Projeções Compatíveis:** O Zustand mantém o `visualSnapshot` como documento autoritativo; os demais campos do editor são projeções compatíveis e não podem ser usados diretamente na persistência.
4. **Atualização Atômica:** Toda edição do Workbench ou CanvasLab deve atualizar o `visualSnapshot` atomicamente antes da renderização seguinte.
5. **Versionamento Estrito:** Qualquer alteração no contrato de dados exige incremento de `snapshotVersion`, suporte retrocompatível e atualização simultânea do `DOCUMENTO_MESTRE.md`.

---

## 2. Isolamento Estrito de Slides em Carrosséis

Ao editar posts em formato de carrossel, **o slide ativo nunca pode vazar suas propriedades para os campos-base do documento**.

* **Estrutura Correta:**
  ```ts
  post.slides[currentIndex].editorState = {
    headlinePos: { x: 24, y: 120 },
    bgImage: "https://...",
    bgTransform: { scaleX: 1.2, ... }
  };
  ```
* **O Perigo do Vazamento (Cross-Talk):**
  Se a edição do slide 2 alterar `post.headlinePos` em vez de `post.slides[1].headlinePos`, todos os outros slides herdarão indevidamente essa posição, corrompendo o carrossel.
* **Resolução Canônica:**
  ```ts
  const currentSlide = post.slides[post.currentSlideIndex] || post.slides[0];
  const activeBg = currentSlide?.bgImage || post.bgImage;
  const activeHeadline = currentSlide ? currentSlide.headline : post.headline;
  const headlinePos = currentSlide?.headlinePos || defaultHeadlinePos;
  ```

---

## 3. Persistência & Handoff para Banco

A persistência do modelo visual em runtime utiliza a coluna `canvas_model` da tabela `posts` (gerenciada em `client/src/pages/CanvasLab/lib/saveAdapter.ts` e `server/db.ts`):
* O `normalizeCanvasModel` sanitiza cores, famílias visuais válidas e efeitos de texto.
* Ao reabrir posts salvos em `/saved-posts`, o snapshot normalizado é deserializado sem perdas nem distorções geométricas.
