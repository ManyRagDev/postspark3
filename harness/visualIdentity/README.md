# Conferência da identidade visual

`verify.ts` usa uma resposta de composição controlada. Medição das fontes empacotadas, composições, CanvasPostStage/Chromium, edição e roundtrip em JSONB/PGlite são reais. Compara pixels antes/depois da edição e após reabrir. Não comprova qualidade semântica de um provedor real, autenticação nem persistência hospedada.

```bash
REVIEW_RENDERER_BUNDLE=/tmp/postspark-identity-renderer.js pnpm build:review-renderer
REVIEW_RENDERER_BUNDLE=/tmp/postspark-identity-renderer.js node --import tsx harness/visualIdentity/verify.ts
```

É necessário ter Chromium disponível ao Playwright ou definir `REVIEW_CHROMIUM_EXECUTABLE_PATH`. `PLAYWRIGHT_BROWSERS_PATH` pode apontar para uma instalação de teste. Resultados, PNGs e documento reaberto ficam em `/tmp/postspark-identity-verification`; `IDENTITY_VERIFY_OUTPUT` altera o destino.

`verifyUI.ts` monta os controles reais do Studio em desktop/mobile usando catálogo, usuário e API de identidade controlados. Confere organização literal dos slides, cadastro mínimo, aviso de fonte, ausência de erros de página e largura sem transbordamento. Não altera dados externos.

```bash
node --import tsx harness/visualIdentity/verifyUI.ts
```

Os testes de contrato, autorização e SQL ficam em `server/visualIdentity*.test.ts`, `server/routers/brandProjects.identity.test.ts`, `server/ai/workflows/identity*.test.ts` e nos testes existentes de Studio/runtime/billing. As migrations 0072–0073 precisam ser aplicadas no ambiente de destino para disponibilizar o recurso; o harness não as aplica em bancos hospedados.
