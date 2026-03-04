# Plano de Refatoração: Workbench V2 (Strangler Fig)

## Visão Geral
Este plano estrutura a solução definitiva para o monolito de 2.300+ linhas (`WorkbenchRefactored.tsx`).
O trânsito de dados complexos do `HoloDeck` para o `Workbench` por meio do Router state vinha causando regressões (sumiço de stickers, badges e ferramentas Pro). Construiremos paralelamente a infraestrutura V2, centralizando o estado de domínio.

## Fases da Arquitetura
O detalhamento exaustivo das interfaces e fluxos encontra-se no artefato principal: `docs/arquitetura_workbench_v2.md`.

1. **Fase 1: Fonte Única de Verdade (Zustand)**
   Migração completa do prop drilling entre páginas para mutações centralizadas num state global de editor (`client/src/store/editorStore.ts`).

2. **Fase 2: Type-Driven Development (Contratos Estritos)**
   Fortalecimento dos tipos em `client/src/types/editor.ts`, extirpando parciais e injetando obrigatoriedade em `AdvancedLayoutSettings`. Evita dados perdidos durante clones assíncronos.

3. **Fase 3: Desidratação do PostCard.tsx**
   Substituição das lógicas UI-bound intrincadas. O PostCard não terá mais código de `architectProps`. O PostCard passa a ser puramente visual (MVC View literal), reagindo à store.

4. **Fase 4: Modularização (Workbench V2)**
   Fatiamento físico para reuso e manutenibilidade em `client/src/components/views/WorkbenchV2/`:
   `SidebarText`, `SidebarImage`, `SidebarDesign`, `SidebarLayout` e `CanvasWorkspace`.

5. **Fase 5: Resgate Premium**
   Reintrodução das features elitizadas do PostSpark: o "Ajustar com IA" utilizando Visão Multimodal e o switch de capacidade para modelos "Pro" que haviam quebrado na esteira V1.
