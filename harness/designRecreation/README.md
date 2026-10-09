# Ensaio local Admin2

Executa as receitas já exportadas de Brutalism, Creative People e Papel rasgado no **CanvasPostStage real**. Não decodifica imagens, não chama IA, não acessa a conta administrativa nem grava no arquivo IndexedDB do produto.

```bash
pnpm exec tsx harness/designRecreation/run.ts
```

Abrir `http://127.0.0.1:5178`. As entradas são os três JSONs `postspark-admin2-306b5602.json`, `postspark-admin2-41a9ed0a.json`, `postspark-admin2-d160ef79.json` de `~/Downloads` e seus JPEGs em `~/Downloads/sources postspark`, explicitamente listados em `run.ts`. Fontes incorporadas são verificadas com o mesmo leitor do Admin2.

Para cada caso: salvar a evidência inicial, reabrir JSON e salvar novamente. Comparar os hashes PNG nos arquivos `*-metrics.json`. No caso Creative People, o botão de adaptação troca TRUTH por CRIATIVIDADE e executa `createTextAdaptation` + `fitRecipeText`, conservando as fontes já incorporadas e dispensando novos downloads. Salvar a evidência adaptada.

Cada execução cria um diretório em `artifacts/design-recreation/<data UTC>/` com cópias das entradas, PNGs, receitas e métricas. Os originais não são alterados. O servidor aceita apenas os casos e ações definidos, vincula-se a `127.0.0.1` e valida Host/Origin; encerrá-lo após o ensaio. Não publicar este servidor.

## Alcance dos resultados

- Comparação visual de receitas conhecidas; **não é ensaio de nova extração multimodal**.
- Reabertura por JSON e remount do Stage; **não verifica IndexedDB, login ou tRPC**.
- Hash igual prova estabilidade nesta execução/navegador, não entre sistemas diferentes nem sem fontes.
- Sem avaliação estatística, sem pontuação arbitrária de fidelidade.

Tipagem do ensaio: `pnpm exec tsc -p harness/designRecreation/tsconfig.json --noEmit`.

## Nova análise de seleção autorizada

Com autorização para enviar as imagens pelo OpenRouter, o modo explícito abaixo lê até quatro casos de `artifacts/design-recreation/next-selection.json`, verifica os hashes e habilita **Decodificar selecionada**:

```bash
LLM_TRANSIENT_RETRIES=0 OPENROUTER_DESIGN_RECREATION_MODEL=deepseek/deepseek-v4.1-flash pnpm exec tsx --env-file=.env harness/designRecreation/run.ts --analyze-selected
```

Cada imagem passa por `prepareReference` no navegador, `decodeRecreation` no servidor e `finalizeRecipe` no navegador, como no Admin2. Uma tentativa por imagem nesta execução; sem fallback para outro modelo. A chave fica no servidor. Este modo faz chamadas externas faturáveis; o modo padrão permanece replay local.

São preservados `*-raw.json` (antes de fontes/encaixe), `*-input.json` (após preparação), `*-analysis.json` (modelo, provider, tokens e duração da decodificação, ou erro) e as evidências PNG/JSON geradas pelos controles existentes. Reabrir não repete a inferência. Para repetir uma análise em outra execução, considerar o consumo e a autorização; iniciar o comando novamente cria outro lote.
