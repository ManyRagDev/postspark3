# Piloto de composição no TheVoid

Este é um recorte experimental para comprovar o percurso de geração por componentes no produto. Não publica automaticamente receitas no catálogo e não substitui a recuperação pgvector existente.

## Usar

1. Inicie o servidor local normalmente (`pnpm dev`).
2. Entre como administrador em `/thevoid`.
3. Marque **Experimentar combinações do acervo**.
4. Use um briefing em texto para post único, sem imagem/URL ou identidade de marca vinculada.
5. Gere, compare as três opções, abra uma no CanvasLab, edite os campos e salve.
6. Reabra pela biblioteca e exporte. O histórico também recompila o bundle persistido, sem nova chamada LLM.

O checkbox é um opt-in local da tela, não uma configuração persistente da conta. Ao recuperar uma geração pelo histórico, a ação de gerar mais usa o fluxo padrão se o piloto não tiver sido habilitado nessa sessão. O histórico com input redigido por privacidade não recupera o briefing original para nova geração; informe o pedido novamente na tela de criação.

## Responsabilidades

- `extract.py`: extrai subconjunto das receitas históricas e fontes; registra caminhos/SHA-256; conserva os arquivos de origem. Execute `python3 harness/assemblyPilot/extract.py` somente para atualizar o kit deliberadamente.
- `shared/assemblyPilotKit.json`: assets vetoriais dos fundos, metadados/fontes dos doadores e procedência.
- `shared/assemblyPilot.ts`: índice de 27 combinações possíveis (3 fundos × 3 conjuntos × 3 fontes), recuperação local por cosseno de seis características e shortlist de cinco planos. Descritores são regras explícitas; não são embeddings aprendidos.
- `server/routers.ts`: autorização, integração com interpretação de briefing, billing e geração existente. O piloto não executa a busca do catálogo publicado.
- `server/ai/arsenalGenerationOrchestrator.ts`: recebe cartões pequenos, gera copy V3, seleciona plano e materializa candidatos por conteúdo. A seleção pode ser ajustada para diversificar módulos; o trace registra o ajuste. A LLM não recebe os JSONs completos.
- `arsenalGenerationCompiler.ts` / `arsenalComposition.ts`: carregam fontes verificadas, medem, resolvem relações, auditam e aplicam/fazem fallback. Os blocos usam o motor do CanvasLab.
- `arsenalRun.ts`: persiste saída funcional no run com filtro de proprietário/status. Só assets empacotados conhecidos entram no caminho experimental. Assets privados continuam exigindo o fluxo normal de autorização do catálogo.
- CanvasLab: `CanvasPostModel` e composição são os documentos autoritativos. A edição guiada agora usa um controle para cada fonte canônica, incluindo itens de lista, abertura e CTA, sem escrever a projeção agregada no corpo.

## Relações e limites

O compositor implementa textFit, fluxo vertical, superfícies que acompanham o texto e centralização do grupo. Papel e janela crescem com os blocos; tarjas são superfícies por bloco, ainda não uma tarja por linha. As proporções e regras foram adaptadas explicitamente dos ensaios; não se trata de inferência automática de toda relação visual da imagem. O fundo neutro `#EDECE6` é uma escolha autoral do piloto, não uma cor extraída de Minimal Air. A tipografia dessa família é um dos doadores reais.

O piloto limita-se a três conjuntos sem mídia, sem identidade automática de marca e sem carrossel. O ranking não foi calibrado com avaliações humanas; cosseno alto não comprova beleza. Não demonstra cobertura de todas as famílias/referências, nem diversidade suficiente entre muitos pedidos. O motor pode rejeitar conteúdo excessivo e cair no fallback existente; consulte o relatório de compilação, não apenas o sucesso HTTP.

## Evidência

Prova real em `artifacts/design-recreation/assembly-pilot-2026-10-02/`: run `aa3d60ef-5d3c-4886-a1e5-70d7be2a9293`, três composições `applied`, PNGs baixados pelo produto, post de teste 96 salvo/reaberto/editado. O relatório local distingue prova técnica de aprovação estética e expansão de catálogo.

Traces: `assembly.retrieve`, `assembly.plan`, `assembly.delivery`, `catalog.offer`, `catalog.attempt`, `catalog.compile.v2`. Eles incluem componentes, hashes, plano solicitado/aplicado, política, razões e resultado. O snapshot persistido permite recompilar sem depender da seleção atual.

## Conferência automatizada

```sh
pnpm exec tsc --noEmit --pretty false
pnpm exec vitest run client/src/pages/CanvasLab/lib/assemblyPilot.test.ts client/src/pages/CanvasLab/lib/guidedComposition.test.ts client/src/pages/CanvasLab/lib/arsenalComposition.test.ts server/designCatalog/arsenalRun.test.ts server/post.test.ts server/ai/generationOrchestrator.test.ts
```

Os testes locais registram fontes reais em `@napi-rs/canvas`; o carregamento de fontes por HTTP é substituído apenas nesses testes. O percurso real no navegador verifica também download, hash e carregamento dos assets.
