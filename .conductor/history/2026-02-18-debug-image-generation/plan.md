# Plano de Debugging: Image Generation

## Objetivo
Identificar e corrigir falhas na geração de imagens (HTTP 500/530) e adicionar logs.

## Passos

1.  [Backend] Adicionar logs estruturados em `server/imageGenerateBackground.ts`.
2.  [Backend] Testar Pollinations com User-Agent e sem parâmetros opcionais para isolar erro 530.
3.  [Backend] Verificar endpoint alternativo ou fallback para Pollinations se persistir.
4.  [Verify] Validar correção observando o console do servidor e sucesso no frontend.
