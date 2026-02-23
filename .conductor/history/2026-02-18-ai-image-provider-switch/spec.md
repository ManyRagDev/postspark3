# Especificação Técnica: Seleção de Provedor de Imagem IA

## Contexto
Atualmente, o sistema escolhe automaticamente entre Pollinations e Gemini baseando-se na flag `isComplex`. O usuário deseja controle manual sobre qual provedor utilizar (Pollinations ou Nano Banana Pro/Gemini) na interface.

## Mudanças Propostas

### Backend
1.  **`server/imageGenerateBackground.ts`**:
    *   Alterar a assinatura de `generateBackgroundImage` para aceitar `provider` ('pollinations' | 'gemini') em vez de (ou além de) `isComplex`.
2.  **`server/routers.ts`**:
    *   Atualizar o esquema de validação do procedimento `post.generateBackground` para incluir o campo `provider`.

### Frontend
1.  **`client/src/components/views/WorkbenchRefactored.tsx`**:
    *   Adicionar estado `imageProvider` ('pollinations' | 'gemini').
    *   Adicionar seletor visual na seção de Imagem para escolher o provedor.
    *   Passar o provedor selecionado na chamada da mutation `generateBackground`.

## UX/UI
*   **Localização**: Dentro da aba "Imagem" no Workbench.
*   **Estilo**: Switch ou Tabs.
*   **Default**: Pollinations.
