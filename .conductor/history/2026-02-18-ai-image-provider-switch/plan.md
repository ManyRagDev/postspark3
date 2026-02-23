# Plano de Implementação: AI Image Provider Switch

## Objetivo
Implementar a seleção manual de provedor de imagem (Pollinations vs Nano Banana) no Workbench.

## Passos

1.  [Backend] Refatorar `server/imageGenerateBackground.ts` para suportar seleção explícita de `provider`.
2.  [Backend] Atualizar RPC `post.generateBackground` em `server/routers.ts`.
3.  [Frontend] Adicionar estado e UI de seleção em `client/src/components/views/WorkbenchRefactored.tsx`.
4.  [Frontend] Integrar a seleção com a chamada de API.
5.  [Frontend] Verificar funcionalidade com ambos os provedores.
