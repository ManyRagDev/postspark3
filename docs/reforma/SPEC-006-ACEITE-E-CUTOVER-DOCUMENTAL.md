# SPEC-006 — aceite de produto e corte documental

**Status:** 🟡 parcial — **cutover bloqueado** pela conferência global de 2026-08-12. `verify:e2e` cobre apenas texto/estático/ideation e o último lote terminou `failed`; faltam matriz completa, readback, export, isolamento, billing test mode, julgamento visual e nova preservação byte a byte do mestre vigente. Correções CR-008 e CR-009 em [`CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md`](./CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md).
**Dependência:** SPEC-001 a SPEC-005 encerradas; pendência remota impede aceite total
**Dor:** implementações isoladas podem parecer corretas sem provar o fluxo inteiro, e a documentação antiga só pode ser substituída com segurança depois de o novo runtime existir

## Resultado

A reforma é verificada de ponta a ponta e o repositório passa a ter um documento-mestre curto, factual e alinhado ao código implementado. O documento anterior é preservado integralmente como histórico verificável.

## Matriz de aceite

Executar ao menos estes fluxos:

| Entrada | Produto | Caminho obrigatório |
|---|---|---|
| texto | post estático | gerar → HoloDeck → Workbench → editar → salvar → reabrir → exportar |
| texto | carrossel | gerar → navegar slides → editar slides distintos → salvar → reabrir → exportar |
| URL | estático e carrossel | extrair contexto/brand ou fallback explícito → fluxo completo |
| imagem | estático e carrossel | upload/asset → fluxo completo |

Cobrir usuário autenticado, sessão expirada, saldo insuficiente, double-submit, falha de provider, schema inválido e falha de persistência. Não executar cobrança real.

## Evidência derivada

Criar um comando de verificação end-to-end que, para cada execução autorizada:

1. gere um `runId` inequívoco;
2. consulte a execução e o post salvos na fonte de verdade;
3. diferencie candidatos processados, rejeitados, reparados e aprovados;
4. baixe ou produza os exports correspondentes ao snapshot aprovado;
5. grave artefatos sob `artifacts/verification/<runId>/`;
6. calcule SHA-256 de snapshot e arquivos exportados;
7. produza relatório JSON/Markdown por código, com ambiente, timestamp, modelos, chamadas, billing e IDs mascarados quando necessário.

O relatório deve ser reproduzível por terceiro. Imagem solta, log copiado ou descrição manual não é prova de uma execução.

## Aceite técnico

1. Rodar typecheck, suíte completa, build e harness sem casos pulados.
2. Executar testes de contrato de snapshots antigos e atuais.
3. Confirmar que HoloDeck, Workbench, persistência e export usam o mesmo hash lógico de snapshot.
4. Confirmar que carrossel não vaza estado entre slides.
5. Medir geração com o corpus definido: chamadas, tokens, custo, p50 e p95.
6. Reexecutar `verify:runtime` contra o ambiente alvo autorizado.
7. Verificar auth bridge e políticas com dois usuários de teste, provando isolamento de posts/assets/runs.
8. Verificar billing em test mode: reserva, commit, refund, idempotência e saldo insuficiente.
9. Fazer inspeção visual das 12 famílias e proporções. O agente registra defeitos sistemáticos; o dono decide gosto e marca.
10. Abrir e concluir pedidos de conferência das specs que ainda estejam em `🔎`.

## Corte do documento-mestre

Somente depois do aceite técnico:

1. copiar o conteúdo integral do `DOCUMENTO_MESTRE.md` vigente para `docs/reforma/legado/DOCUMENTO_MESTRE-LEGADO-2026-08-10.md`;
2. calcular e registrar o SHA-256 do arquivo legado antes de reescrever a raiz;
3. criar um novo `DOCUMENTO_MESTRE.md` curto a partir da baseline confirmada e do runtime final;
4. manter no novo mestre: propósito, arquitetura, fluxo principal, autoridades, contratos, persistência/infra, integrações, comandos de verificação, riscos abertos e histórico das seis entregas;
5. mover explicações e decisões longas para docs específicos, sem copiar cronologias repetidas;
6. apontar explicitamente para o legado e explicar que ele não é normativo;
7. atualizar `AGENTS.md` se os caminhos, invariantes ou comandos obrigatórios mudaram;
8. transformar esta pasta em documentação vigente, removendo rótulo de baseline candidata somente depois da conferência.

O arquivo legado deve preservar inclusive inconsistências e alterações locais que existiam no momento do corte; ele é evidência histórica, não material para “limpeza”.

## Critérios de aceitação

- [ ] Todos os fluxos da matriz têm resultado derivado e identificável.
- [ ] Typecheck, testes, build, harness e auditoria operacional passam sem omissão silenciosa.
- [ ] Não há casos pulados no harness; limitações reais aparecem como falha ou pendência.
- [ ] Snapshots e exports podem ser correlacionados por hash/runId.
- [ ] Billing e isolamento entre usuários foram verificados em ambiente de teste.
- [ ] A comparação de latência/custo usa o mesmo corpus e não mistura execuções.
- [ ] O dono realizou ou explicitamente dispensou o julgamento visual/brand; agente não se autoaprova nesse degrau.
- [ ] Cada spec tem pedido de conferência e veredito registrado.
- [ ] Documento-mestre legado foi preservado byte a byte e possui SHA-256 registrado.
- [ ] Novo documento-mestre descreve apenas o estado final confirmado.
- [ ] Nenhuma pendência crítica está escondida sob ✅.

## Fora de escopo

- deploy ou release para produção;
- migração/destruição de dados;
- apagar o Next;
- criar novas features;
- mudar marca, pricing ou estratégia comercial.

## Veredito final

A reforma só recebe ✅ global após conferência total em sessão limpa ou por outra pessoa/modelo, somada ao julgamento do dono nos itens visuais. Caso uma fonte externa permaneça inacessível, o veredito máximo é `APROVADO COM RESSALVAS` e o plano conserva a pendência nominal.
