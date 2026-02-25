# Bug Report: Groq Fallback Error `json_schema`

## 1. Causa Raiz (Root Cause)
O erro ocorre na função de fallback para o Groq localizada em `server/_core/llm.ts`. Quando a API principal falha, o sistema tenta usar a API do Groq passando o mesmo `payload` originalmente construído para o modelo primário. O `payload` inclui a nova funcionalidade `response_format: { type: "json_schema", ... }`, que infelizmente não é suportada pelo modelo estipulado no fallback (`llama-3.3-70b-versatile`). A API da Groq retorna o erro 400 Bad Request por incompatibilidade de parâmetro.

## 2. Arquivos exatos que precisam ser modificados
- `server/_core/llm.ts`

**Ação planejada:** No bloco `catch` (linha 340+), antes de realizar a requisição ao Groq, ajustar o `groqPayload.response_format`. Se for do tipo `json_schema`, converter para `{ type: "json_object" }` (que é retrocompatível) e, se aplicável, inserir as instruções de schema originais como string diretamente no final da mensagem do `system`, garantindo que o Llama saiba o formato desejado através do prompt, ou apenas confiar que o esquema já formatado via prompt original será eficaz somado ao `json_object`.

## 3. Avaliação de Degradação
A degradação estrutural é **Mínima e Isolada**. 
Não precisamos sugerir rollback atômico do Git, pois trata-se apenas do contorno (fallback) da API que está submetendo um parâmetro bloqueado por um de seus provedores. A correção é segura e pontual.
