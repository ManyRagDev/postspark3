# SPEC-002 — resolvedor visual e cor únicos

**Status:** 🟡 parcial — reaberta pela conferência global de 2026-08-12. O perfil `e5` reprova com falhas de encaixe/sobreposição e 36 casos abaixo de 4,5:1; proteção de fundo `unproven`, safe area e testes negativos continuam abertos. Correções CR-001 e CR-003 em [`CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md`](./CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md).
**Dependência:** SPEC-001 tecnicamente estável
**Dor:** família, normalizador, fallback, renderer e avaliadores ainda podem aplicar precedências diferentes de layout e cor

## Resultado

Uma intenção criativa, uma proporção, uma seed, uma identidade visual e uma copy produzem um único `PostVisualSnapshot` determinístico. As 12 famílias continuam expressivas, mas nenhum renderer, juiz ou tela reconstrói layout, background, paleta ou contraste depois do fechamento do snapshot.

## Estado real herdado

1. `composeVisualDiversityPlan` e `composeVariation` já participam da geração no servidor.
2. `composeVariation` deriva o canvas da proporção, mas muta `creativeDirection` na entrada e contém casts `as any` na composição.
3. `shared/variationSnapshot.ts` escolhe e mescla layout, sincroniza tokens e chama `applyVisualFitFallback`.
4. `shared/visualFit.ts` estima geometria e pode substituir o layout por flow, limpar `sectionLayouts` e descartar elementos.
5. Há cálculos de contraste em `shared/creative/color.ts`, `server/ai/postEvaluation.ts`, `server/postJudge.ts` e `client/src/lib/designRules.ts`.
6. `client/src/lib/designRules.ts` não tem consumidor encontrado no código ativo; `visualFitValidator.ts` é uma borda de compatibilidade para `shared/visualFit.ts`.
7. O Next possui candidatos úteis em `measure.ts`, `resolve.ts` e `palette.ts`, mas não é autoridade.

## Decisões

- `shared/creative/` define intenção, famílias, seed e paleta candidata.
- O normalizador canônico resolve e congela o documento visual.
- Campos existentes do snapshot — `designTokens`, `layoutSettings`, `imageSettings`, `bgValue`, `bgOverlay`, `textElements`, `imageElements` e a resolução tipográfica — são a representação canônica. Não criar uma árvore duplicada com os mesmos dados.
- `shared/creative/color.ts` será a única implementação de luminância, contraste e operações básicas de cor.
- Texto primário deve atingir contraste mínimo 4,5:1 sobre o fundo efetivo. Elemento estritamente decorativo pode usar 3:1, desde que não carregue informação necessária.
- Famílias podem fornecer preferências e limites; o resolvedor pode ajustar uma preferência para satisfazer constraints, registrando a decisão no snapshot.
- O mesmo input e seed devem produzir o mesmo documento. Entropia externa não entra no resolvedor.

## Implementação

1. Mapear todos os produtores e consumidores dos campos visuais do snapshot, incluindo projeção de slides e troca de proporção.
2. Tornar `composeVariation` pura: não mutar o objeto recebido e remover casts que escondem contrato incompleto.
3. Formalizar as saídas de cada família em `FamilyOutput`; nenhum campo usado pelo renderer pode existir “fora do tipo”.
4. Consolidar paleta e contraste em `shared/creative/color.ts`; adaptar avaliadores e remover implementações locais.
5. Calcular contraste contra o fundo efetivo, considerando cor, imagem e overlay. Quando não houver como provar contraste para imagem arbitrária, usar política explícita de overlay/fundo de texto em vez de assumir.
6. Absorver do resolvedor do Next somente constraints ausentes no núcleo já promovido na SPEC-001: safe area, empilhamento, distribuição e carrossel.
7. Substituir o fallback destrutivo por resolução explícita. Falha que não cabe deve retornar issue estruturada antes do fechamento, não apagar elementos silenciosamente.
8. Garantir resolução por proporção sem reutilizar coordenadas de outro canvas. `layoutSettingsByAspectRatio` deve conter documentos efetivamente resolvidos ou ser eliminado em favor de uma projeção canônica equivalente.
9. Fazer HoloDeck, Workbench, exportação, salvos e histórico renderizarem diretamente os campos congelados.
10. Remover código de validação/contraste órfão após busca de imports estáticos, dinâmicos e usos de build.

Se esta entrega alterar a semântica persistida do snapshot além dos campos v4 definidos na SPEC-001, deve incrementar `snapshotVersion`, implementar leitura de todas as versões anteriores e atualizar testes no mesmo diff.

## Critérios de aceitação

- [x] Existe uma única definição produtiva de `contrastRatio` (`shared/creative/color.ts`). `server/ai/postEvaluation.ts` e `server/postJudge.ts` delegam para ela (wrappers finos que preservam o contrato antigo de erro tolerante). `client/src/lib/designRules.ts` (órfão, contraste duplicado) foi removido.
- [x] `composeVariation` não muta a entrada (provado por teste com `Object.freeze` — mutação silenciosa agora lança `TypeError`) e não usa `as any` para montar o contrato visual (0 ocorrências; `TextElement.styles.textTransform` e `FamilyOutput.decorations` entraram no tipo em vez de escapar por cast).
- [x] Mesmo input + seed + proporção gera snapshots estruturalmente idênticos (teste `compose.test.ts`, `toEqual` entre duas execuções).
- [x] As 12 famílias produzem `layoutSettings` válido nas 3 proporções para post estático (harness: 2664 casos, 0 pulados, 0% fora do canvas). Carrossel: cobertura estrutural herdada da SPEC-001 (`projectSnapshotForSlide`), sem teste dedicado nesta spec.
- [ ] **Parcial.** Contraste é calculado contra o fundo efetivo (`effectiveBackgroundColor` — cor sólida, ou overlay quando opaco o bastante). Quando o fundo é imagem sem overlay opaco, o critério "4,5:1 ou proteção explícita" vira `basis: "unproven"` com teto de score 70 — é a política explícita pedida pela spec, mas **não é proteção visual real** (nenhum scrim/sombra é adicionado automaticamente); é sinalização, não correção.
- [x] Nenhum elemento é descartado silenciosamente: `applyVisualFitFallback` agora grava `visualFitIssues` (o diagnóstico) e `removedTextElementIds` (o que foi de fato removido) no snapshot.
- [x] Trocar proporção resolve a nova geometria sem contaminar a anterior — auditado: `layoutSettingsByAspectRatio` é escrito por um único produtor (`editorStore.setAspectRatio`), chave e valor vêm do mesmo slice de estado, correto por construção. Sem alteração estrutural (tipo continua sem invariante em tempo de compilação — ver "desconfio" no pedido de conferência).
- [ ] **Parcial.** Slides mantêm resolução tipográfica independente (herdado da SPEC-001). Paleta/layout por slide não ganharam teste novo nesta entrega.
- [x] Renderers não recalculam contraste (`grep contrastRatio` em `client/src` → 0 ocorrências) nem tipografia (SPEC-001). Layout/background continuam vindo do snapshot congelado.
- [x] Salvar/reabrir/exportar preserva o mesmo snapshot — mesmo mecanismo já verificado na SPEC-001 (`createPostVisualSnapshot` é o único produtor; `PostCardV2`/`PostRenderer` são os únicos consumidores de render).
- [ ] **Parcial.** Testes cobrem: determinismo (✅ `compose.test.ts`), seeds distintas (✅), contraste limítrofe (✅ `color.test.ts`, "unproven"/"overlay-dominant"), fallback não-destrutivo (✅ `visualFit.test.ts`). **Faltam**: fundo inválido (hex malformado chegando em `deterministicEvaluation`) e uma fixture deliberadamente sabotada que precisa reprovar o harness/validação — não escrevi nenhuma das duas.
- [x] `npm run check` limpo; `npm test` 386/386 (era 375 ao fim da SPEC-001; +11 novos). Harness (`--aspect 1:1,5:6,9:16`): 2664 casos, 0 pulados, aprovado.

## Fora de escopo

- alterar o conteúdo textual gerado;
- reduzir chamadas de LLM;
- redesenhar por gosto as famílias;
- aplicar migration remota;
- remover o diretório Next.

## Conferência exigida

Conferência total. Além das verificações automáticas, a qualidade estética exige julgamento do dono; o agente pode provar integridade geométrica e contraste, mas não declarar sozinho que as famílias “ficaram boas”.
