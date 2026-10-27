# C-02 — Snapshot sem coerção e com ausência explícita

Estado: **PRONTA**
Papel: executor-blindado.
Base verificada: `main`, HEAD `40c0832`, com primeira entrega e resultado C-01 preservados.
Depende de: C-01 verificada e exclusividade dos caminhos confirmada.
Execução: sequencial; precede C-03.

## Objetivo e aceite

Resolver D2 no ramo snapshot, conforme [CONTRATOS §3](../CONTRATOS.md), sem alterar armazenamento/coleta nem a projeção legada.

- AC-1: rejeitar antes dos modelos `fallbackUsed:"false"`, warnings com null/números/objetos, origem/fingerprint/data com tipo errado, síntese objeto, listas não arrays/itens inválidos, anchors malformadas, kind desconhecido e texto de evidência vazio/branco. Erro sanitizado identifica o campo; não há coercão ou omissão para prosseguir.
- AC-2: metadados históricos ausentes e warnings ausentes são desconhecidos; warnings `[]` significa nenhum; fallback false e true distinguíveis. URL de evidência ausente/vazia não recebe automaticamente URL geral. Estruturas opcionais ausentes não viram sucesso de síntese; campos não consumidos/extensões não são novo veto.
- AC-3: textos aceitos, IDs/kind/origem válidos, warnings e negação/unidade/condição ao final chegam completos às mensagens de seletor, copy e revisor após adapter. Limite combinado 24.000 preservado e excesso é `SourceContextLimitError`, sem retirar aviso ou evidência.
- AC-4: seções derivadas/orientação/evidências e prioridade do usuário mantidas; não criar obrigação de `prohibitedClaims`. Contexto/parecer prepared completed reaproveitado literalmente, inclusive após mutação do snapshot externo. Texto/URL sem snapshot e falha por proprietário preservados.

## Leitura e contrato

- Adendo/roadmap, auditoria D2, `DOCUMENTO_MESTRE.md` §§13.126–128 e resultado C-01.
- `generationRuntime.ts`: validação/projeção/carregamento; `server/siteIntelligence.ts`, `server/siteContent.ts` e `shared/postspark.ts`: produtores/contratos, somente leitura.
- `siteSnapshotContext.test.ts`, `generationContext.test.ts`, `generationRuntime.test.ts`; transporte de revisão e fixtures existentes.

## Escrita autorizada

- `server/ai/workflows/generationRuntime.ts` — somente guard/schema local e projeção do snapshot; preservar proteção de retomada de C-01.
- `server/ai/workflows/generationContext.test.ts` — matriz de validação/ausência/limite/acesso.
- `server/ai/workflows/siteSnapshotContext.test.ts` — transporte real controlado até revisão e prioridade usuário/site.
- `server/ai/workflows/generationRuntime.test.ts` — reuso V7/perfil 5 do contexto/prepared/parecer; não mudar journal geral.
- `DOCUMENTO_MESTRE.md` — acrescentar comportamento observado e limites após exclusividade documental.

Resultado exclusivo a criar: `docs/reforma/correcao-contexto-ia/replanejamento-auditoria/resultados/02-validacao-snapshot.md`.

Protegidos: tudo fora da lista, especialmente siteIntelligence/siteContent produtivos, schemas compartilhados, geração paga, preparação/seleção corrigidas em C-01, store/SQL/RLS/billing, renderer/CanvasLab, manifest/lockfile e registros anteriores. Nenhuma nova dependência ou módulo global de validação.

## Dependências e integração

Um escritor altera guard/projeção e seus testes. C-03 reutiliza esse projetor real na entrega PGlite/editor; não montar uma string idealizada em substituição. Erro novo em módulo protegido volta à ordem dona com evidência.

## Verificações

Na raiz da cópia descartável atualizada:

```bash
pnpm exec vitest run server/ai/workflows/generationContext.test.ts server/ai/workflows/siteSnapshotContext.test.ts server/ai/workflows/generationRuntime.test.ts server/siteIntelligence.test.ts server/siteContent.test.ts
pnpm exec tsc --noEmit --incremental false
```

Todos os arquivos/runners existem; casos novos serão acrescentados. Capturar mensagens depois do adapter e asserts de zero chamadas em erro; retorno fixo de fixture não comprova interpretação semântica. Registrar contagens/exit/cwd e rede bloqueada como no roadmap.

## Operações externas

Nenhuma. Sem snapshot real, rescrape, síntese, consulta/escrita remota ou alteração dos dados históricos.
