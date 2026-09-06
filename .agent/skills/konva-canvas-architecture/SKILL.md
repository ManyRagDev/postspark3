---
name: konva-canvas-architecture
description: >
  Padrão arquitetural canônico para manipulação de palcos, tipografia, eventos e transformadores no Konva.js 
  (CanvasLab e renderizadores visuais do PostSpark). Use sempre que criar ou editar componentes que envolvam 
  Konva Stage, Text, Transformer, efeitos de legibilidade ou seleção e edição direta de elementos no canvas.
---

# Skill: Arquitetura Canônica Konva.js (PostSpark)

Esta habilidade estabelece as diretrizes obrigatórias para manipulação do motor gráfico interativo baseado em Konva.js no PostSpark, prevenindo regressões de "dois motores", perdas de eventos e desproporções visuais.

---

## 1. Regra de Ouro: Fonte Única da Verdade Tipográfica (Single Engine)

**NUNCA** utilize heurísticas ad-hoc ou estimativas matemáticas paralelas para medir texto (ex.: `text.length * 0.55 * fontSize`, `avgCharWidth = fontSize * 0.52`).

* **O Problema Histórico:** Fontes condensadas (como *Anton*, *Bebas Neue*, *Impact*) possuem largura de glifo de ~0.35 da altura, enquanto fontes normais/serifadas possuem ~0.55. Fórmulas heurísticas estimavam 2 linhas onde o Konva desenhava 1 linha, criando "linhas fantasmas vazias" e dobrando a altura dos efeitos (`box-card`, `strip-line`).
* **A Solução Canônica:** Sempre derive quebras de linha (`lines`), contagem de linhas e alturas (`height`) através do módulo canônico `getKonvaTextMetrics` (`client/src/pages/CanvasLab/components/textMetrics.ts`), que utiliza a própria classe `Konva.Text` e o Canvas 2D nativo.
* **Garantia:** O texto renderizado, os efeitos de fundo e a caixa do `Transformer` devem compartilhar rigorosamente a mesma medição.

---

## 2. Propagação de Eventos e Duplo-Clique com Transformer

No Konva, o nó `<Transformer>` fica posicionado no topo da camada e intercepta eventos de ponteiro sobre o elemento selecionado.

* **O Problema:** Quando o usuário clica para selecionar um texto, o `Transformer` é anexado. Um duplo-clique posterior atinge o `Transformer` e não o nó `<Text>` ou `<Group>`, engolindo o evento de edição.
* **A Solução Canônica:**
  1. Adicione sempre ouvintes de `onDblClick` e `onDblTap` diretamente no `<Transformer>`:
     ```tsx
     <Transformer
       ref={transformerRef}
       onDblClick={() => {
         if (selectedId === "headline" || selectedId === "subtext" || selectedId === "badge") {
           startEditing(selectedId);
         }
       }}
       onDblTap={() => {
         if (selectedId === "headline" || selectedId === "subtext" || selectedId === "badge") {
           startEditing(selectedId);
         }
       }}
     />
     ```
  2. Mantenha os ouvintes de `onDblClick` e `onDblTap` também nos nós `<Group>` e `<Text>` para permitir edição direta mesmo quando o elemento ainda não estiver selecionado.

---

## 3. Desseleção Canônica no Stage (Click Outside)

No Konva, o fundo do canvas frequentemente contém retângulos (`Rect`) coloridos, gradientes lineares ou imagens de fundo (`KonvaImage`) que cobrem 100% da área do palco.

* **O Problema:** Verificar `e.target === stageRef.current` falha sempre, pois `e.target` é o nó `Rect` ou `Image` do fundo, e nunca a instância pura do `Stage`.
* **A Solução Canônica:**
  Utilize a verificação de descendência e exclusão:
  ```tsx
  function isDescendantOf(node: any, targetParent: any): boolean {
    if (!node || !targetParent) return false;
    let curr = node;
    while (curr) {
      if (curr === targetParent) return true;
      curr = curr.getParent?.();
    }
    return false;
  }

  const handleStagePointerDown = (e: any) => {
    // 1. Ignora se o clique foi no Transformer ou suas alças
    const isTransformer =
      e.target?.getParent?.()?.className === "Transformer" ||
      e.target?.className === "Transformer";
    if (isTransformer) return;

    // 2. Se o clique foi em um elemento selecionável, permite que seu próprio handler atue
    const isSelectable =
      isDescendantOf(e.target, headlineRef.current) ||
      isDescendantOf(e.target, subtextRef.current) ||
      isDescendantOf(e.target, badgeRef.current) ||
      isDescendantOf(e.target, barRef.current) ||
      isDescendantOf(e.target, logoRef.current);

    if (isSelectable) return;

    // 3. Se estiver em modo de edição de fundo, o clique é consumido pelo fundo
    if (isEditingBackground) return;

    // 4. Clique em qualquer área neutra (fundo, margens, imagem de fundo): desseleciona
    if (editingTarget) handleCommitText();
    setSelectedId(null);
    if (onSelectElement) onSelectElement(null);
  };
  ```

---

## 4. Silenciamento de Elementos Decorativos (`listening={false}`)

Formas geométricas decorativas que acompanham o texto (caixas de fundo, sombras sólidas, gradientes e tarjas de marca-texto) **NUNCA** devem interceptar eventos de ponteiro.

* Configure explicitamente `listening={false}` em todos os `Rect`, `Line` e `Circle` de efeitos em `renderBackgroundEffect`.
* Marque as formas do plano de fundo com `name="canvas-bg"` para facilitar identificação e testes.
