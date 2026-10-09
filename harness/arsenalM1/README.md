# Arsenal M1 — conferência do editor oficial

Abra a aplicação com uma sessão administrativa, acesse `/admin2` e clique em **Abrir piloto de janelas**. O documento abre no CanvasLab de `/thevoid`, sem gerar copy nem consumir Sparks. A foto começa vazia. A variante 5:6 está em revisão própria; a matriz aprovada 4:5 permanece intacta.

Para uma conferência isolada sem autenticação, banco ou chamadas pagas:

```bash
node harness/arsenalM1/serve.mjs
```

Abra `http://127.0.0.1:5179/harness/arsenalM1/index.html`. O harness monta **CanvasLabPage e CanvasPostStage reais**, com contexto tRPC substituído por respostas nulas. Salvar usa `canvasModelToSavePayload` e localStorage; não prova autorização nem persistência no Supabase. Dados de teste permanecem nesse navegador. Não use fotos pessoais para produzir evidência pública.

Roteiro: título curto/longo/acentos/quebras → quatro/seis/sete itens → upload PNG/JPEG/WebP e ponto focal → seleção/movimento/rotação de grupo → formato com prévia → undo/redo → salvar/reabrir → exportar. O sétimo item permanece no documento e gera aviso; foto ausente também exige ajuste. A auditoria mantém o aviso de contraste herdado do botão amarelo/vermelho.

**Simular fonte indisponível** faz os arquivos locais de fonte responderem HTTP 503 e recarrega o documento salvo. Confira o erro e o bloqueio de exportação, depois use **Recuperar fontes**. Esses endpoints pertencem exclusivamente ao servidor do harness. Eles não entram no backend do produto.

O harness observa a saída PNG do link de download do editor, sem outro renderer. **Registrar PNG local** grava exatamente esses bytes em `artifacts/arsenal-m1/browser-export.png`, limitado a PNG de até 8 MiB. O nome “Exportar 4K” é o controle existente: sua saída atual usa viewport 360×432 com pixelRatio 4, produzindo **1440×1728**, não 1080×1296 nem quatro mil pixels. A prancheta lógica da variante é 1080×1296.

Testes de contratos e medição nativa com os bytes reais das fontes:

```bash
pnpm exec vitest run client/src/pages/CanvasLab/lib/arsenalComposition.test.ts
pnpm check
```

`buildFixture.py` deriva a fixture e o manifesto de fontes do artefato aprovado identificado na procedência. Só execute para uma derivação deliberada: mudanças alteram hashes e exigem nova revisão. Não contém a fotografia da referência. O arquivo aprovado não é sobrescrito.

Os testes são autossuficientes: `testdata/fixed-v3.json` é uma fixture derivada sem foto/copy/font bytes da referência; `testdata/descriptor-corpus.json` conserva somente geometria/estilo necessários ao descritor e os resultados históricos de 43 entradas. Esse corpus não é um pacote de receitas importáveis. A procedência mantém hashes dos inputs históricos; nenhum teste depende da pasta local ignorada `artifacts/`.

Estado e limites: [relatório M1](../../docs/relatorio-arsenal-m1.md). A passagem a M2 depende do aceite do M1 no fluxo autenticado e da conferência visual do proprietário.
