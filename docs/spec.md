# Especificação Técnica: Workbench V2

## 1. Visão Geral
O Workbench atual atingiu limites insustentáveis de complexidade estrutural em seu arquivo raiz (`WorkbenchRefactored.tsx`), o que afeta drasticamente a propagação consistente das props originárias do workflow anterior (`HoloDeck`). Como resultado de bugs arquiteturais, as features "Ajustar com IA" e "Modelo de Imagens Pro" foram corrompidas, juntamente com badges e adesivos que sumiam ao fazer deep cloning via router.

## 2. Padrões Impostos (Strangler Fig)
- Todo o desenvolvimento se dará sobre `WorkbenchV2.tsx` e subcomponentes da pasta homônima.
- O arquivo antigo NÃO deve ser tocado durante o processo, agindo como seguro de roll-back.
- **Tipagem Exata**: Tipos que antes permitiam margens opcionais devem ser consolidados via `AdvancedLayoutSettings` restrito.

## 3. Arquitetura de Estado
Será abolido qualquer uso nativo do Router do React ou props contextuais em cascatas.
* **Componente de Origem (`HoloDeck`)**: Irá "puxar" um hook setter da Store Zustand e despachar a variação integralizada gerada por LLM antes do redirecionamento de URL. 
* **Componente de Destino (`WorkbenchV2`)**: Reagirá nativamente e escutará mudanças da Store com re-renders seletivos, prevenindo freeze ou delays na digitação/arrastes (drag).

## 4. O Componente PostCard (Visual Puro)
A camada visual deve seguir restritamente ser uma manifestação reativa do Zustand.
Camadas complexas de lógica do Architect (Acesso às quinas, giros, grid snap de 5x5 posições de ímã) vão viver exclusivamente num invólucro (Wrapper) ou `ArchitectOverlay` transparente posto por Traz ou Frente ao Canvas puro. O PostCard final receberá a injeção seca das propriedades visuais via Store.

## 5. Resgate High-Ticket
- **Geração de Imagem Pro:** Garantir o switch para consumo fidedigno entre endpoints rápidos (flux/nanobanana flash) e premium.
- **Ajustar com IA**: Restauro do prompt multimodal injetando visualização via Canvas Output para LLM Gemini 1.5 Pro/2.5 Pro no node server.
