# Preparação do acervo definitivo de 82 entradas

A coleção em `designs/acervo82/manifest.json` define o novo universo de autoria do PostSpark: 24 referências, 29 representações R9 e 29 conceitos. O objetivo é substituir completamente o catálogo oferecido em novas gerações. As famílias antigas não restringem essa coleção. As definições anteriores permanecem apenas para recuperação e compatibilidade com documentos salvos.

## Ambiente preparado

- Branch `codex/acervo-82`, em worktree própria. O commit `379c695d676d5fdd7615f6eca3470604af71354c` preserva o código local necessário e as fontes, sem alterar a main, o índice ou os arquivos originais.
- Dependências da aplicação instaladas do cache local, em `node_modules` próprio.
- HTML original preservado em `designs/acervo82/sources/showcase-original.html`, acompanhado dos 37 assets usados e de `integrity.json`. A galeria e seus PNGs estão em `designs/showcase_consolidado`.
- Evidência anterior R9 copiada para `artifacts/acervo82/baseline/catalog-r9`, fora do Git. Não participa do novo rol. O checkpoint em `artifacts/acervo82/preparation/source-checkpoint.json` registra hashes e arquivos copiados.
- Perfil dedicado `.acervo82-local/.env`, ignorado pelo Git; nunca copiar a `.env` principal. O launcher remove credenciais herdadas, exige endpoints locais coincidentes no frontend/backend e mantém geração pausada durante a preparação.

## Comandos

```bash
pnpm acervo82:verify
pnpm acervo82:test
pnpm acervo82:init
pnpm acervo82:db:start
pnpm acervo82:db:env
pnpm acervo82:doctor
pnpm acervo82:dev
# Ao encerrar os serviços de banco locais:
pnpm acervo82:db:stop
```

`verify` recalcula hashes e a cobertura exata de 82 identidades. `inventory --write` só cria o manifesto inicialmente ou confirma conteúdo idêntico; não sobrescreve um rol congelado divergente. Nenhum desses comandos publica, chama modelos ou modifica o banco.

`doctor` aponta dependências e configuração ausentes. `dev` inicia a aplicação com o perfil isolado e recusa URLs remotas, configuração de frontend/backend divergente, credenciais de integrações externas e habilitação prematura da geração. O perfil não contém credenciais de produção. A configuração de Vite usa exclusivamente o diretório local nesse modo.

## Banco e uploads locais

A CLI Supabase 3.0.0 está fixada como dependência de desenvolvimento da worktree. Inicializar com `supabase init` cria apenas arquivos locais. A execução padrão usa Docker/Podman; a versão atual também documenta runtime nativo experimental para Linux. Consultar o `--help` da versão instalada antes de usá-lo. Nenhum projeto hospedado, conexão de produção ou recurso pago faz parte desta preparação.

O runtime nativo foi iniciado com sucesso nesta preparação. A API local usa a porta 55481; PostgreSQL, 55482; Studio, 55483; Mailpit, 55484. O servidor PostSpark usa 127.0.0.1:3182 e recusa trocar silenciosamente de porta nesse perfil. `acervo82:db:env` obtém apenas credenciais da instância local e grava o perfil privado sem imprimi-las. O cache e os dados nativos ficam em `../.supabase-local`, fora do diretório com espaços, sob o contêiner desta worktree. A primeira tentativa incompleta em `.acervo82-local/supabase-home` foi encerrada; não participa da instância atual.

O banco vazio não equivale a uma aplicação operacional. O bootstrap precisa reconciliar o schema real com as migrações: há histórico MySQL e migrações PostgreSQL incrementais em `drizzle/`. Não aplicar a pasta inteira indiscriminadamente nem tratar fixtures PGlite reduzidas como schema completo de Auth/Storage.

Antes de liberar geração: preparar schema, Auth com conta administrativa de teste, políticas/grants, buckets e assets; validar persistência `canvas_model`; importar somente composições pertencentes ao novo rol e fixar sua revisão no executor local. Billing externo, SMTP real, captura de site e provedores pagos permanecem sem configuração. A rodada paga de geração é uma etapa futura com orçamento explícito.

## Execução da autoria

O contrato operacional está em `designs/acervo82/workflow.json`. Cada entrada progride por preservação de fonte, autoria, verificação técnica, revisão visual e jornada completa. A aprovação se associa à versão/hash da composição. Problemas registram causa e próxima ação; não reduzem silenciosamente o conjunto.

1. Fixar aparência de referência por entrada. As representações HTML R9 diferem dos renders anteriores e devem ser trabalhadas como a direção visual do novo acervo, conforme o objetivo do proprietário.
2. Normalizar prancheta 1080 × 1350, fontes e animações. Recuperar estrutura de DOM/SVG quando disponível; reconstruir as 24 fontes raster conforme necessário.
3. Autorizar campos e limites de conteúdo efetivamente testados. Usar camadas nativas para textos e geometria suportada; tratar curvas, padrões, blend e blur explicitamente, com assets decorativos ou evolução versionada do contrato.
4. Conferir referência/render e textos alternativos. Medir legibilidade, distribuição dos campos, cardinalidade e identidade visual sem transformar temas de exemplo em proibições.
5. Conferir no ambiente local: seleção → galeria → editar → salvar → reabrir → exportar. Simulações não contam como comprovação dessa jornada.
6. Fechar as 82 entradas antes de preparar a substituição integral. O validador de recibo inicial verifica somente cobertura/formato; revisão, autenticidade de evidências e gates existentes ainda são obrigatórios.

## Recuperação e ativação

O pacote de ativação deve identificar commit da aplicação, manifesto/hashes do novo catálogo, revisão de banco/catálogo e todos os assets necessários. A evidência de recuperação deve identificar os mesmos elementos da versão anterior. Rollback de código isolado não restaura banco, arquivos ou serviços. A ativação futura usa o caminho de catálogo versionado existente, após homologação; não mistura entradas antigas para preencher lacunas do novo rol.

## Limite desta entrega

Esta preparação preserva as fontes, cria o inventário, isola configuração e fornece verificações offline. Não reconstrói automaticamente os 82 modelos, não aprova sua estética e não homologa login, salvamento ou exportação com serviços reais. O estado das dependências locais e da execução fica no relatório de preparação.

## Verificação desta preparação

Inventário íntegro: 82 entradas e 158 arquivos; quatro testes de preparação, TypeScript e 27 regressões de catálogo/save adapter aprovados. Build Vite com perfil local e bundle do renderer aprovados. A instância local PostgreSQL está acessível, mas o doctor identifica a ausência das tabelas da aplicação. O retorno HTTP da aplicação não certifica login, geração ou salvar/reabrir. Nenhuma chamada paga ou ativação do catálogo foi executada.
