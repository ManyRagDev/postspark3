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

### 4.1 Sistema de Projeção de Coordenadas (Padding-Aware)
Para garantir que elementos em (0,0) ou (100,100) não toquem a borda do card, implementamos um sistema de mapeamento projetado:
*   **Input**: Coordenadas abstratas 0-100% (armazenadas no DB).
*   **Projeção**: O componente `DraggableBlock` projeta esses valores apenas para a área interna (*inner area*) subtraindo o `padding` do card.
*   **Visualização**: A grade 5x5 renderizada é a própria projeção, garantindo paridade visual absoluta entre o arrasto e o snap.

### 4.2 Professional Glow System
A interface V2 utiliza um sistema de brilho reativo baseado em `framer-motion`:
*   **Accent Sync**: O brilho usa o `accentColor` da variação ativa.
*   **Feedback Tátil**: Botões de ação (Salvar/Exportar) e seletores de estado (Magnet/Ratio) usam pulse e glow para indicar atividade.

## 5. Resgate High-Ticket
- **Geração de Imagem Pro:** Garantir o switch para consumo fidedigno entre endpoints rápidos (flux/nanobanana flash) e premium.
- **Ajustar com IA**: Restauro do prompt multimodal injetando visualização via Canvas Output para LLM Gemini 1.5 Pro/2.5 Pro no node server.
