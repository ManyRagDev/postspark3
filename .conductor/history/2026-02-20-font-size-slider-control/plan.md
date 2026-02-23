# Plano de Execução: Controle de Tamanho da Fonte

## Objetivo
Implementar sliders para controle de tamanho individual da fonte (Título e Corpo) através de multiplicadores no PostVariation.

## Domínios Afetados
- **Core (Types)**: Tipagem compartilhada (`shared/postspark.ts`)
- **Frontend (UI / Estilizador)**: `WorkbenchRefactored.tsx` e `PostCard.tsx`

## Alterações Planejadas
### 1. `shared/postspark.ts` (Domínio Tipagem)
- Modificar a interface `PostVariation` ou sua ramificação relevante no esquema Drizzle para incluir as propriedades opcionais em `client/src`:
  - `headlineFontSize?: number;` // padrão implicado é 1 (escala 1x)
  - `bodyFontSize?: number;` // padrão implicado é 1 (escala 1x)
*(Sincronizar com esquema de banco opcionalmente, mas a tabela `posts` no PostgreSQL só possui os campos cruciais atuais - como layout é varchar e colors são varchars, as fontes podem ser apenas transient props via JSON de layouts, porém, pra este escopo, definiremos as tipagens client-side na interface typescript `PostVariation` do Zod e do Drizzle para estarem preparadas).*
Correção: Conforme inspecionado em Drizzle (`drizzle/schema.ts`), não temos um campo `headlineFontSize` restrito, a variação persistida como `PostVariation` no backend pode não aceitar se a regra exigir a atualização do banco de dados ou da coluna JSON. Vamos nos ater à interface do Typescript `PostVariation` no monorepo e focar apenas na persistência visual durante a sessão.

### 2. `client/src/components/views/WorkbenchRefactored.tsx` (Interface Humana)
- Acima ou abaixo da parte de "Cor do Texto", adicionar os sub-toggles ou sub-sliders de "Tamanho da Fonte". 
- Injetar o novo controle utilizando `PrecisionSlider` variando de 50 (0.5x) a 200 (2.0x) operando no state.

### 3. `client/src/components/PostCard.tsx` (Camada de Renderização Pura)
- No destructuring das varations, incorporar `headlineFontSize = 1` e `bodyFontSize = 1` como fallback.
- No `centeredLayout`, `leftAlignedLayout`, `storyContent` e afins, substituir diretamente os `fontSize` hardcoded injetando a manipulação `calc()`.
  Ex: Antes: `fontSize: headingSize`. Agora: `fontSize: \`calc(\${headingSize} * \${headlineFontSize})\``.

## Validação de Segurança
- Essa alteração só impacta CSS visual (renderização nativa React).
- Os blocos `ArchitectOverlay` e `DraggableTextBlock` continuarão respeitando o *bounding box* natural ajustado de texto.
