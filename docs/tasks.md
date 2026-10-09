# Tarefas — Geração Orquestrada do PostSpark (V5)

Estado em 2026-10-08, após a conferência independente e suas correções. Referências: `docs/blueprint-geracao-orquestrada.md`, `docs/revisao-blueprint-preservacao.md` e `docs/correcoes-geracao-orquestrada-2026-10-08.md`.

## Implementado e verificado localmente

- [x] Identidade determinística dos documentos e mapa de posts salvos por documento, sem vincular save de A a B.
- [x] Contratos canônicos discriminados: `ready` exige bundle completo com identidade coerente; preferências usam defaults compartilhados.
- [x] Materialização individual, falha explícita com zero resultados, entrega parcial e retry de montagem sem nova geração.
- [x] Preparação de contexto/briefing e seleção por IA de composições completas, com carrossel dentro da mesma família e até dez slides.
- [x] Fontkit e fontes verificadas antes da copy; preflight antes da mídia; somente defeitos técnicos demonstráveis vetam entrega.
- [x] LangGraph TypeScript com três propostas independentes; journal/checkpoints de domínio persistidos em Postgres.
- [x] Admissão idempotente por proprietário/payload, lease com fencing, limites de concorrência, deadline, cancelamento e retomada sem repetir operações pagas ambíguas.
- [x] Commit de entrega/grants/histórico na mesma transação, com revalidação de elegibilidade e preservação de propostas já entregues.
- [x] Adaptador de mídia privada por proprietário conectado ao worker para slots nativos deferred, com geometria/contexto/referências; sem fallback genérico no caminho strict. Obrigação pré-seleção e roteamento por propósito foram adicionados, mas os gates de contrato/Seedream/encerramento seguro continuam abertos (DOCUMENTO_MESTRE §13.80).
- [x] API autenticada e opt-in V5 no Studio DEV, polling compacto e abertura imediata de cada proposta pronta.
- [x] Retomada do payload/chave após resposta de admissão perdida; isolamento de respostas atrasadas e recuperação de montagem após refresh.
- [x] Histórico, preferências explícitas e diagnósticos leem bundles entregues por slot em gerações parciais.
- [x] Regressões locais de contratos, editor, save/reabertura, exportação, UI montada e SQL em PostgreSQL via PGlite; typecheck e builds separados dos artefatos versionados.
- [x] Documento-mestre e blueprint atualizados com o estado efetivamente implementado.

## Implantação do banco — 2026-10-08

- [x] Aplicadas 0034 e 0035 no Supabase `spbuwcwmxlycchuwhfir`, com histórico registrado e hashes do SQL conferidos.
- [x] Conferidas quatro tabelas com RLS, política por proprietário, índices, seis manifests de fontes e permissões das oito RPCs.
- [x] Conferidas as oito RPCs pela API real e negação ao papel anônimo, sem criar pedidos ou acionar IA. A 0035 corrige retries de perda de lease para HTTP 409; nove testes PostgreSQL passaram.

## Piloto local disponível pela flag do Studio — 2026-10-08

- [x] `.env` local em `GENERATION_V5_MODE=dev`; configuração distribuída continua off e coorte continua DEV.
- [x] `pnpm dev` inicia executor filho separado depois do bind, exclusivamente em desenvolvimento local; saída/reload do pai encerra novas claims sem deixar filhos órfãos.
- [x] Flag selecionável durante inicialização do executor, atualização automática de disponibilidade e mensagens distintas para ambiente/conta/processamento.
- [x] Flag marcada no navegador autenticado, heartbeat real e reload com substituição por um único worker conferidos; 30 testes focados e typecheck passaram.

## Nova implementação V5 — revalidação parcial em 2026-10-08 (§13.82)

- [ ] Concluir liquidação transacional e durável: caminho feliz conectado, mas erro de ajuste parcial ainda confirma valor cheio; snapshot `running/delivery_pending` já pode provocar estorno; falhas após `finish`, expiração e perda de lease precisam de reconciliação segura. Plano DEV segue sem cobrança.
- [ ] Concluir recuperação técnica fiel ao contexto: `surgicalCopy` preserva campos saudáveis/legenda/hashtags/prompts, porém o prompt corretivo omite original e fontes; reprodução aceitou ano factual trocado no campo afetado. Propagar também estado `recovering` pelo coordenador.
- [ ] Concluir limites/cancelamento/reconciliação de mídia: aborto cooperativo e espera de slots corrigidos; persistência/upload sem sinal ou prazo ainda pode exceder deadline e deixar asset sem entrega. Não confundir `allSettled` com cancelamento de todas as etapas.
- [ ] Concluir decisão de mídia/contrato: “sem fotos” agora impede o adapter e o contrato é instanciado; porém ausência de obrigação também suprime fotos nativas, permitindo proposta pronta com slot vazio. Distinguir proibida/opcional/obrigatória e alinhar proporção/capacidades do contrato com despacho real.
- [x] ID oficial do Seedream 5.0 Pro normalizado (`server/imageGenerateBackground.ts`): slug canônico `bytedance-seed/seedream-5-0-pro` com alias de compatibilidade `seedream-5.0-pro` em capabilities, roteamento e requisição OpenRouter.

## Gates operacionais para ativação pública (produção)

- [ ] Provisionar e validar a hospedagem produtiva do executor Node separado do request HTTP.
- [ ] Validar storage, credenciais dos provedores e execução completa com chamadas reais em produção. Confirmar heartbeat também no ambiente de implantação.
- [ ] Executar percurso autenticado em navegador desktop/mobile com geração real, salvar/reabrir e matriz de exportação 4K/ZIP.
- [ ] Comparar modelos e avaliar visualmente o corpus com chamadas reais e avaliação humana.
- [ ] Definir operação/retenção de reconciliações, telemetria de custo real e limiares de lançamento antes do piloto pago.

`GENERATION_V5_MODE=off` é o padrão. `dev` habilita apenas o piloto DEV quando o executor está disponível; não habilita planos pagos. Testes locais não comprovam preservação visual integral nem qualidade estética. O fluxo V4 e o billing vigente continuam atendendo os demais usuários.
