# Especificação: Integração do Railway Screenshot Service

## Contexto e Delta Lógico
- **Comportamento Atual:** A aplicação utiliza a API do Google PageSpeed Insights (via `server/screenshotService.ts`) para tirar prints de páginas. Este método apresenta timeouts frequentes, falhas em SPAs pesados e não suporta diretamente a separação confiável nativa de capturas desktop e mobile em alta fidelidade. Além disso, o usuário assumiu inicialmente o uso de um padrão Next.js (App/Pages router), colocando funções em `lib/screenshot.ts`.
- **Comportamento Esperado:** Integrar o recém-criado microsserviço de Playwright no Railway (`https://screenshot-service-production-2177.up.railway.app`) à base de código. O serviço retornará buffers de imagens (`/screenshot` e `/screenshot/mobile`).
- **Camada Estrita:** Backend. A arquitetura correta do PostSpark é um servidor Express com tRPC hospedado na raiz, configurado no diretório `server/`. O frontend é um app Vite em `client/`. Portanto, o domínio das alterações será exclusivamente o diretório `server/` e o `.env`.

## Arquitetura Proposta (Resolução de Diretório)
1. **Configuração Variáveis:** Inserir `SCREENSHOT_SERVICE_URL` nos arquivos `.env` e `.env.example`.
2. **Utilitário de Conexão:** Excluir o arquivo criado na raiz (`lib/screenshot.ts`) que fere o design do app, e reescrever a função `captureScreenshot` dentro do utilitário oficial do backend: `server/screenshotService.ts`. O novo modelo vai contemplar o parâmetro `type: "desktop" | "mobile"`, uso de Buffer/ArrayBuffer, e manuseio polido de erros.
3. **Endpoint REST API:** Modificar `server/_core/index.ts` (o root router do Express) para injetar um endpoint teste e validador: `POST /api/extract`. Este endpoint chamará a classe de screenshot para Desktop e Mobile (idealmente em paralelo), checará os `byteLength` (calculando KB) e responderá no padrão JSON de Express.
