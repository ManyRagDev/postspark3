# Especificação Técnica (Specs) - Experiência Inteligente

Este documento consolida as interfaces e contratos necessários para as próximas implementações no ecossistema do PostSpark (Etapas 4 a 8).

## 1. Contrato de Briefing (Etapa 4)
Este contrato define o estado persistido das intenções do usuário antes da geração final, separando o "o que ele pediu" do "o que a IA entendeu e estruturou".

```typescript
// Local: shared/postsparkSchemas.ts (Tipos inferidos do Zod)

export interface CreationBrief {
  version: number; // Controle de migração
  rawInput: string; // Texto original digitado
  format: "static" | "carousel";
  slideCount?: number;
  objective?: string;
  audience?: string;
  brandEssence?: string;
  positioning?: string;
  tone?: string;
  keyMessage?: string;
  proofPoints?: string[];
  requiredTerms?: string[];
  forbiddenTerms?: string[];
  callToAction?: string;
  sourceUrls?: string[]; // URLs identificadas e validadas
}
```

## 2. Controle de Fundo e Crop (Etapa 6)
O `CanvasPostModel` precisa deixar de assumir preenchimentos absolutos ou base64 diretos, e passar a usar intenções de enquadramento em imagens fornecidas via URI/Storage.

```typescript
// Local: client/src/pages/CanvasLab/components/types.ts

export type FitMode = "cover" | "contain" | "original" | "custom";

export interface BackgroundPlacement {
  fitMode: FitMode;
  focalPoint?: { x: number; y: number }; // Centro semântico (hotspot)
  crop?: { 
    x: number; 
    y: number; 
    width: number; 
    height: number 
  };
  transform?: {
    scaleX: number;
    scaleY: number;
    rotation: number;
    x: number;
    y: number;
  };
}

// Em CanvasPostModel.slides[]:
export interface CanvasSlideOverride {
   // ...
   bgPlacement?: BackgroundPlacement;
   // ...
}
```

## 3. Paridade de Elementos Livres (Etapa 7)
Qualquer novo `extraText` ou `extraImage` injetado pelo usuário deve persistir suas transformações finais de maneira isolada e determinística, evitando degradação de estado ao recarregar.

```typescript
export interface CanvasExtraElement {
  id: string; // DEVE ser um UUID novo a cada clone/duplicação
  zIndex: number; // Para gestão via 'bring to front' e 'send to back'
  opacity?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  x: number;
  y: number;
}
```

## 4. Autosave e Editor Assistido (Etapa 8)
A máquina de estado local para salvar deve garantir lock no documento para não corromper submissões paralelas ao Supabase, nem enfileirar promises que sobrescrevam a mais recente.

```typescript
export type AutoSaveState = "idle" | "dirty" | "saving" | "saved" | "error";

// Regras de Implementação para o Debouncer de AutoSave
// 1. Mutação em documento dispara state = 'dirty'.
// 2. Após 1000ms de inatividade, state = 'saving' e requisição API inicia.
// 3. Se nova mutação ocorrer durante 'saving', o payload pendente é atualizado, mas uma nova request só acontece quando a anterior terminar ou falhar.
```
