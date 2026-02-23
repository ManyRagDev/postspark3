# Especificação Técnica: Debugging de Geração de Imagem

## Contexto
O usuário relata erros 500 ao gerar imagens.
*   **Pollinations**: Retorna erro HTTP 530 (Origin DNS Error/Cloudflare).
*   **Gemini (Nano Banana Pro)**: Funciona intermitentemente, mas falha ocasionalmente.
*   **Logs**: O usuário solicitou logs explícitos para saber qual API está sendo chamada.

## Diagnóstico Inicial
*   **Pollinations**: O erro 530 geralmente indica DNS falho na origem (servidor da Pollinations) ou URL malformada que o Cloudflare rejeita.
*   **Gemini**: Instabilidade pode ser quota ou timeout. O modelo `gemini-2.0-flash-exp-image-generation` é experimental e pode ter mudado.

## Mudanças Propostas

### 1. Adicionar Logs de Observabilidade (`server/imageGenerateBackground.ts`)
*   Logar início da chamada com o `provider` e `prompt` (truncado).
*   Logar URL final (para Pollinations) para debug.
*   Logar erro específico com stack trace no catch.

### 2. Revisão da Integração
*   **Pollinations**: Verificar se o parâmetro `nologo=true` ou `enhance=true` está causando problemas. Adicionar `User-Agent`.
*   **Gemini**: Adicionar tratamento de erro mais robusto para QuotaExceeded.

### 3. Frontend
*   Nenhuma mudança visual necessária, apenas validação de correção.

## Plano de Teste
1.  Verificar logs no terminal ao tentar gerar.
2.  Confirmar se Pollinations volta a funcionar (ou se é outage do serviço).
