# Plano de Implementação: Crawler Railway Screenshot

## Domínio 1: Utilitários e Variáveis de Ambiente
*Isolamento: Este passo afeta exclusivamente arquivos de configuração na raiz e a modularização do utilitário de screenshot do backend.*
1. Adicionar `SCREENSHOT_SERVICE_URL="https://screenshot-service-production-2177.up.railway.app"` aos arquivos `.env` e `.env.example`.
2. Remover arquivo incorreto (contexto Next.js/padrão incorreto) e suas dependências: deletar `lib/screenshot.ts`.
3. Atualizar `server/screenshotService.ts` com a nova função `captureScreenshot`. A função assumirá uma assinatura `(url: string, type: 'desktop' | 'mobile' = 'desktop')` e retornará no formato esperado de Buffer Array, adicionando o endpoint condicional `const endpoint = type === 'mobile' ? '/screenshot/mobile' : '/screenshot'` e o timeout/try-catch herdado da nossa arquitetura base.

## Domínio 2: API Route do Backend Express
*Isolamento: Lida diretamente com as rotas do tRPC e Express no diretório `server/` sem encostar no client (React/Vite). O core da lógica fica protegido contra colisões.*
1. Abrir `server/_core/index.ts` e registrar um endpoint via `app.post('/api/extract', ...)` diretamente injetado nas rotas base (antes ou paralelamente ao mount tRPC).
2. Escrever a lógica do endpoint, recuperando a `url` do `req.body` e verificando sua validade.
3. Chamar assincronamente (Promise.all) o serviço de captura recém-modificado: `captureScreenshot(url, 'desktop')` e `captureScreenshot(url, 'mobile')`.
4. Converter as respostas (ArrayBuffer/Buffer) para calcular o peso final: `byteLength / 1024` recebendo o peso em KB.
5. Retornar um JSON `{ success: true, url, desktopSizeKB, mobileSizeKB }`. Tratar respostas de erro formatando em HTTP status 500 no bloco catch para compatibilidade.
