# PostSpark 3

O PostSpark cria posts para redes sociais a partir de texto, URL ou imagem. O Studio fica em `/thevoid` e `/studio`. A edição é feita no CanvasLab.

## Arquitetura

- React e Vite no frontend, Express e tRPC no backend. O [Compose da VPS](./ops/hostinger/compose.yml) declara a web e o executor externo.
- Supabase Auth e persistência via cliente Supabase no schema `postspark` da VPS.
- Konva no CanvasLab e Stripe para pagamentos.

## Como rodar o ambiente local

1. Use Node.js 22 e a versão do pnpm indicada em [`package.json`](./package.json). Rode `pnpm install`.
2. Use [`.env.example`](./.env.example) como modelo e configure o alvo conforme o [contrato da VPS](./docs/contrato-integracao-supabase-vps.md).
3. Rode `pnpm dev` para iniciar o ambiente de desenvolvimento. Com o túnel configurado, esse comando pode usar o worker da VPS.
4. Use `pnpm check` para tipagem e `pnpm test` para a suíte Vitest.

## Documentação e histórico

- [Instruções do repositório](./AGENTS.md)
- [Documento Mestre](./DOCUMENTO_MESTRE.md)
- [Mapa do motor de geração](./docs/motor-integracao.md)
- [Operação local e diagnóstico](./docs/local-demand-operations.md)
- [Design system do Studio e CanvasLab](./docs/DESIGN_SYSTEM.md)

O acervo de código e documentos aposentados fica em um backup fora do workspace. Use a documentação versionada e as entradas atuais do código para orientar o trabalho no PostSpark.
