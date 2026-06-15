# 07 - Build, deploy e Git

Escrever codigo e so uma parte do trabalho. Tambem e preciso transformar, publicar e versionar.

## Git

Git guarda o historico do projeto.

Com Git, a equipe consegue:

- ver o que mudou;
- criar branches;
- revisar alteracoes;
- voltar a uma versao anterior quando necessario;
- colaborar sem sobrescrever trabalho de outras pessoas.

## Branch

Branch e uma linha paralela de trabalho.

Ela permite desenvolver uma alteracao sem mexer diretamente na linha principal.

## Commit

Commit e um ponto salvo no historico.

Um bom commit responde:

- o que mudou;
- por que mudou;
- quais arquivos foram afetados.

## Build

Build prepara o projeto para rodar em producao.

No PostSpark, o script principal e:

```bash
pnpm build
```

Ele faz duas coisas:

1. `vite build`: gera o frontend estatico.
2. `esbuild server/_core/index.ts ... --outfile=api/index.js`: empacota o backend.

## Start

Depois do build, o script de start roda:

```bash
pnpm start
```

Esse comando executa:

```bash
node api/index.js
```

## Deploy

Deploy coloca a aplicacao no ar.

No PostSpark, `vercel.json` informa para a Vercel como servir:

- a funcao Node em `api/index.js`;
- os arquivos estaticos do frontend;
- os rewrites para `/api/(.*)` e para a SPA.

## SPA

SPA significa Single Page Application.

Nesse modelo, o servidor entrega uma pagina base e o React controla a navegacao no navegador.

Por isso o `vercel.json` redireciona rotas comuns para `/index.html`.

## Regra mental

Git guarda a historia. Build prepara o codigo. Deploy coloca o resultado no ar.
