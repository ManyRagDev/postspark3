# Validação do catálogo

## Contratos locais

```bash
node --import tsx harness/designCatalog/contracts.ts
```

Executa 27 verificações: três presets × três formatos, compilação e reabertura pelos adaptadores, fallback por conteúdo/encaixe/mídia, constraints e ranking. Importa o compilador e `layoutRichText` reais, usando `@napi-rs/canvas` para medição e famílias genéricas sem downloads. Isso **não** equivale à renderização do CanvasPostStage num navegador nem valida fontes Google. Resultado em `artifacts/design-catalog/contracts.json`.

## Referências reais da pasta Downloads

```bash
node --import tsx harness/designCatalog/referenceProbe.ts
```

Usa sete receitas exportadas e confere seus hashes contra os JPEGs originais. Executa a sugestão de grupos, a conversão real do Admin2 e a compilação no formato declarado (o mais próximo da origem), com dois textos novos e fontes incorporadas. O transporte de fontes é simulado localmente, sem rede. Inclui 25 checks de agrupamento, preservação da origem, overrides, fundos/guia de mídia, compatibilidade dos hashes e resultados de compilação. Relatório e rascunhos em `artifacts/design-catalog/grouped-references/`; o ensaio antigo de linhas isoladas permanece em `references/`. Não publica nem salva blueprints no banco, não decodifica novamente e não equivale a uma sessão no navegador.

## API conectada (sem gravar fixtures)

```bash
node --env-file=.env --import tsx harness/designCatalog/apiProbe.ts
```

Requer configuração Supabase do backend e `VITE_SUPABASE_ANON_KEY`. Verifica leitura pelo backend, disponibilidade de `canvas_model`, resolução da RPC para um UUID inexistente (erro esperado sem alteração), recusa de acesso anônimo e middleware tRPC com contextos injetados. Não autentica um usuário real, não chama IA, não cria posts, usuários ou blueprints. Resultado em `artifacts/design-catalog/api.json`, sem credenciais.

## Ciclo de vida no PostgreSQL

Execute o conteúdo de `databaseProbe.sql` com o MCP `execute_sql` no projeto correspondente à migration 0018. O ensaio usa transação, roles reais (`service_role`, `anon`, `authenticated`), criação/deduplicação de rascunhos, aprovação idempotente, nova versão, substituição, arquivamento, imutabilidade, vínculos e eventos. Os hashes e UUIDs são aleatórios. A definição JSON é uma fixture de banco, não um blueprint validado pelo contrato do app.

As alterações ficam invisíveis às outras sessões e são desfeitas por `ROLLBACK`. O resultado final deve ser `passed; fixtures rolled back`; qualquer asserção com falha aborta a transação. Não remover o rollback nem converter isso em migration.

## Tipagem

```bash
pnpm exec tsc -p harness/designCatalog/tsconfig.json --noEmit
```

## Pendências que estes ensaios não cobrem

- Login/cookie bridge, uso do Admin2 e aprovação visual no navegador.
- Carregamento real das fontes e renderização pelo CanvasPostStage.
- Chamada real a `post.generate`, escolha LLM e traces `retrieve → select → compile` no mesmo run.
- Salvar, reabrir e editar um post pelo fluxo real do produto.

Nenhum blueprint deve ser aprovado para os usuários apenas por passar nestes ensaios.
