# PostSpark — plano de implementação do motor de seleção e execução

Data: 11/11/2026. Estado: implementação local integrada; ativação e aceite final pendentes. Evidências e limites em [docs/motor-integracao.md](docs/motor-integracao.md). Os itens abaixo continuam sendo critérios de aceite: não presumir conclusão no destino a partir dos testes locais.

## 1. Objetivo e responsabilidade

Entregar três propostas mais adequadas e distintas a partir do briefing, com execução iniciada por pedido explícito, recuperação de falhas e encerramento do acompanhamento após entrega e liquidação de Sparks. No CanvasLab, manter edição local, salvamento fiel e operações necessárias de sessão, configurações e saldo.

Este é o plano individual do projeto PostSpark: seleção, composição, executor, captura de identidade visual, interface, persistência e integração da aplicação com o ambiente disponibilizado. Substitui, para este projeto, as instruções do plano integrado da raiz. O [plano original de seleção](plano_novo_motor.md) permanece como diagnóstico de origem; as correções e a sequência deste documento prevalecem para implementação.

A instalação e administração da VPS estão sendo conduzidas em outro chat, conforme informado pelo usuário. Não instalar stack, alterar proxy/DNS, definir backups ou conduzir cópia de produção por este plano. O desenvolvimento local não depende da conclusão daquela instalação. As dependências necessárias à integração estão na seção 6, sem presumir o que o outro chat já concluiu.

## 2. Ponto de partida

Conferir o código e as alterações locais antes de implementar. A revisão anterior identificou:

- Leituras compactas de progresso/histórico, lease leve e encerramento de acompanhamento já preparados localmente. Reaproveitar a migração `drizzle/0064_generation_progress_reads.sql`, conferindo se já foi aplicada no destino.
- `server/ai/workflows/generationWorker.ts` ainda busca geração e captura periodicamente e grava heartbeat. É o mecanismo operacional a substituir.
- `generationStore.ts` e runtime já têm admissão, idempotência, leases e registros de operações; evoluir essas estruturas.
- `designShortlist.ts`, `boundedFamilyShortlist.ts` e `heuristicPlanBuilder.ts` participam da escolha. O teste precisa alcançar as três propostas finais.
- `server/ai/componentTextMeasurer.ts` já mede texto com fontes reais e layout compartilhado. Não criar medidor concorrente sem necessidade demonstrada.
- As contagens do diagnóstico dos 82 designs precisam ser reproduzidas contra uma versão identificada do acervo.

O [registro de correções de egress](../implementacao-egress-2026-11-11.md) documenta testes anteriores, não uma nova validação de produção. A [suspensão registrada](../verificacao-egress-2026-11-11.md) é evidência histórica. Este plano não presume serviços atualmente reativados.

## 3. Execução proposta

Usar os registros existentes de pedidos como fonte durável de trabalho. Na mesma transação que confirma a admissão, emitir uma notificação PostgreSQL contendo somente referência opaca/tipo de trabalho. O aviso desperta o executor; não contém briefing, credenciais ou documento completo. Notificações são entregues após commit. [Semântica de NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html).

O worker mantém uma conexão dedicada de sessão para `LISTEN`, fora de um pool em modo transacional. Ao iniciar ou reconectar: primeiro confirmar a inscrição, depois consultar pendências e só então depender dos avisos. A tabela preserva pedidos quando não existe listener conectado. [Ordem de inicialização de LISTEN](https://www.postgresql.org/docs/current/sql-listen.html).

Notificações são sinais, não uma fila durável. Duplicatas devem ser inofensivas; avisos recebidos durante execução devem provocar nova drenagem ao liberar capacidade. Claim e lease existentes continuam impedindo execução concorrente indevida. Uma notificação não concede autorização para acessar outro proprietário.

Retries adiados, leases vencidos e liquidações pendentes usam prazos persistidos e um temporizador para o próximo vencimento conhecido. Mudanças nesses prazos também despertam o executor. Após reinício, reconstruir os temporizadores a partir do banco.

Adotar inicialmente uma varredura de segurança local a cada cinco minutos, indexada, paginada e limitada a metadados de trabalho pendente/vencido. É um parâmetro operacional proposto, não requisito do produto; medir custo e latência de recuperação no ensaio. Não voltar a varrer documentos nem consultar o Supabase gerenciado. Retirar essa varredura somente se os testes demonstrarem cobertura equivalente de recuperação.

Disponibilidade do processo vem de health/readiness locais que reflitam listener, renderer e estado das dependências. Substituir de forma coordenada a dependência da admissão em heartbeat gravado no banco. Um processo vivo, mas sem capacidade de executar, não deve ser anunciado como pronto.

A conexão de sessão e o endpoint de readiness são requisitos a combinar com o chat da VPS. Se o ambiente entregue não suportar essa configuração, registrar a incompatibilidade e ajustar o transporte mantendo durabilidade, recuperação e baixo tráfego; não voltar silenciosamente ao polling frequente.

Fluxo: ENTER → admissão e reserva → pedido durável e sinal → claim → seleção e composição → verificação → entrega persistida e liquidação → fim do acompanhamento → CanvasLab.

## 4. Contratos entre componentes

| Fronteira | Contrato de implementação |
| --- | --- |
| Interface → admissão | Proprietário autorizado, identidade idempotente e hash da entrada. Repetição do mesmo envio recupera o pedido; mesma chave com entrada diferente é conflito explícito. Reserva e registro precisam manter atomicidade conforme o modelo existente. |
| Banco → executor | Registro durável, estado, próxima execução/prazo e claim exclusivo. Avisos apenas despertam. Incluir também captura de identidade visual; remover só polling de geração é insuficiente. |
| Executor → provedor pago | Registrar intenção e resultado por operação; reaproveitar recibos. Usar idempotência do provedor quando disponível. Timeout com resultado desconhecido exige reconciliação; não prometer execução externa exatamente uma vez quando o provedor não oferece essa garantia. |
| Seleção → composição | Identidades estáveis de catálogo, família, oferta e proposta; requisitos com origem e força; evidência das rejeições e adaptações. Estender schemas existentes, sem duplicar fontes de verdade. |
| Executor → interface | Progresso pequeno durante pedido ativo; entrega recuperável. Proposta disponível e cobrança liquidada são condições distintas. Fechar a aba não perde o trabalho nem a liquidação. |
| Galeria → CanvasLab | Escolha por identidade da proposta, não índice visual. `CanvasPostModel` e `canvas_model` continuam autoritativos. Salvar e reabrir preserva aparência e conteúdo. |

Mudanças incompatíveis em perfis, nomes como `minWords`, configurações e resultados persistidos exigem leitura compatível ou migração explícita. Vincular novos pedidos à política e ao catálogo utilizados, aproveitando revisões/hashes já existentes. Pedidos antigos não podem ser retomados silenciosamente com outra semântica de seleção. Preferir concluir/reconciliar os antigos antes de ativar o novo executor.

## 5. Etapas de implementação

### P0 — Inventário e comparação inicial

- [ ] Registrar alterações locais, revisões, migrações e todos os caminhos que admitem trabalho, incluindo captura de identidade visual e eventos de cobrança.
- [ ] Mapear dependências de Auth, RPCs, Storage, renderer, fontes e URLs persistidas. Entregar ao responsável da VPS somente os requisitos técnicos da aplicação, sem credenciais em documentos.
- [ ] Identificar o estado dos pedidos/reservas pendentes para reconciliar antes de mudar o executor.
- [ ] Congelar catálogo e conjunto inicial de briefings representativos: comparação, mídia obrigatória/opcional, texto curto/longo, marcas, proporções e carrosséis. Expandir para 80–120 casos antes da avaliação final.
- [ ] Reproduzir diagnóstico dos perfis e registrar os resultados atuais com fixtures/replays. Chamadas pagas entram em ensaio identificado com estimativa de custo; bloqueio do ambiente não autoriza inventar resultado inicial.
- [ ] Definir desde o início métricas de adequação, diversidade útil, falhas de renderização, chamadas e bytes por geração. Antecipar a instrumentação mínima de P4 para apoiar a comparação.

Aceite: mapa de caminhos ativos e contratos, comparação inicial reproduzível ou lacunas explícitas, acervo identificado e trabalho local preservado.

### P1 — Executor por demanda e tratamento de falhas

Responsável: projeto PostSpark. Depende de P0; pode ser desenvolvido com PostgreSQL local enquanto o ambiente externo é preparado.

- [ ] Implementar admissão + sinal transacional e listener conforme a seção 3, cobrindo geração e captura de identidade visual.
- [ ] Retirar loops ociosos de claim, heartbeat persistido e reconciliação frequente. Ajustar os consumidores de disponibilidade e readiness junto com essa retirada.
- [ ] Preservar leases/checkpoints e limitar concorrência por recurso/provedor, com justiça entre filas. Capturas não podem impedir indefinidamente uma geração.
- [ ] Implementar recuperação por inicialização, reconexão, prazos e varredura residual medida. Evitar tarefas assíncronas sem dono após a resposta HTTP.
- [ ] Diferenciar erro transitório, limite temporário, credencial/configuração inválida, quota bloqueada e falha definitiva do pedido. Backoff com dispersão e estado de espera sobrevivem ao reinício; não repetir a cada dois segundos nem reiniciar para contornar a espera.
- [ ] Preservar estado de operações ambíguas e liquidação; aplicar regras atuais de cancelamento, reserva e devolução. Falha de cobrança não relança geração concluída.
- [ ] Começar com o acompanhamento compacto já existente, ativo somente durante o pedido/liquidação. Push/SSE pode ser incorporado se trouxer ganho medido; não é requisito para eliminar consultas ociosas. Evitar duas formas de acompanhamento simultâneas.
- [ ] Cachear catálogo/fontes por revisão com invalidação na publicação, preservando verificação de integridade e carregamento frio. Não rebaixar checkpoint necessário para economizar bytes.

Aceite: pedido admitido antes de queda é retomado; notificações duplicadas não duplicam efeitos; perda de conexão não esquece pedidos; timeout pago não provoca repetição cega; terminalidade encerra acompanhamento. Uma hora ociosa não mostra o antigo polling; controles locais residuais são identificados e quantificados.

### P2 — Perfis e requisitos de seleção confiáveis

Responsável: projeto PostSpark. Depende de P0 e pode avançar junto a P1.

- [ ] Reconciliar perfis com fontes identificadas. Distinguir capacidade do card, disponibilidade da oferta e descrição estética. Não copiar indiscriminadamente `availability.roles` do card para o repertório.
- [ ] Expor estrutura compacta necessária ao julgamento; preservar a semântica de intervalos entre designs e impedir combinação de máximos incompatíveis. Ausência de dado significa incerteza.
- [ ] Evoluir o parser existente para requisitos com origem (`declared`, `inferred`, `physical`) e força (`obrigatório`, `preferência`). Conservar o trecho do pedido que sustenta uma obrigação.
- [ ] Alinhar rubrica, instruções de criatividade e dados transportados. Capacidade física deve ser verificada por mecanismo apropriado, não inferida de adjetivos pelo juiz.
- [ ] Preservar o contrato de `criteria` por pergunta até comprovar alternativa aceita pelo endpoint. Medir corpo real, número de lotes e custo; não prometer um lote único de 82.
- [ ] Resolver a transição de `minWords` para contagem de fragmentos com compatibilidade dos artefatos persistidos. Auditar todos os consumidores.
- [ ] Definir suporte real de carrosséis: inspecionar o caminho vigente, oferecer composições com papéis válidos e testar fechamento completo. Não excluir essa modalidade silenciosamente nem anunciar papéis inexistentes.

Aceite: cada capacidade anunciada aponta para oferta realizável; preferências não viram proibições; obrigações não desaparecem nas instruções; transporte respeita o endpoint; carrossel possui caminho completo ou limitação apresentada explicitamente.

### P3 — Seleção, adaptação visual e verificação das três propostas

Responsável: projeto PostSpark. Depende de P2; integração de execução depende de P1.

- [ ] Definir política coerente do julgamento à entrega: viabilidade, adequação e diversidade útil. Revisar os três estágios de ordenação e a força das penalidades; diferença de escala entre scores e penalidades precisa ser calibrada.
- [ ] Separar rejeições comprovadas de penalidades por estimativa. Não eliminar um candidato por aproximação de caracteres se uma adaptação permitida pode torná-lo viável.
- [ ] Usar o medidor existente com fontes, texto, fragmentação e layout reais. Verificar novamente depois de adaptações que alterem geometria ou tipografia.
- [ ] Aplicar adaptações visuais somente nas propriedades permitidas, preservando identidade, contraste e invariantes do editor. Ajustes no gerador não autorizam alterar silenciosamente o comportamento dos presets do CanvasLab.
- [ ] Em inviabilidade, tentar adaptações permitidas e alternativas compatíveis. Pedir decisão antes de violar formato ou outra obrigação; nunca apresentar resultado incompatível como atendido. Registrar motivo e opção oferecida.
- [ ] Comparar resultados finais no conjunto de referência, com avaliação sem revelar a versão do motor. Medir adequação, diversidade entre propostas, overflow, legibilidade, rejeições indevidas e correções necessárias.
- [ ] Controlar ativação da política por configuração do pedido e permitir reversão para pedidos novos. Não reaproveitar resultados antigos sob uma política incompatível.

Aceite: três propostas verificadas quando o acervo permite; incompatibilidades remanescentes explícitas; nenhuma violação silenciosa de obrigação nos casos de referência. Melhoria de adequação demonstrada contra a comparação inicial, sem exigir distribuição uniforme de designs. Inspecionar renderização e exportação, não apenas scores.

### P4 — CanvasLab, salvamento e instrumentação econômica

Responsável: projeto PostSpark. Contratos definidos em P0/P2; integração após P3.

- [ ] Manter edição em estado local e consolidar alterações de interação. Preservar a política de salvamento/recuperação existente, confirmação de persistência e proteção contra sobrescrita de versão concorrente.
- [ ] Verificar navegação Galeria → CanvasLab, salvamento → reabertura e exportação. Não depender de fechar a aba para persistir dados importantes.
- [ ] Registrar exposição, escolha e exportação por pedido/proposta/evento. `brief_hash` é atributo de comparação, não identidade da jornada.
- [ ] Consolidar alterações do editor em pequenos lotes; excluir documentos completos, briefings sensíveis e eventos por pixel/tecla. Definir limite de payload, descarte de duplicatas e retenção. Telemetria não pode impedir salvar ou exportar.
- [ ] Se embaralhar propostas para avaliação, fazê-lo uma vez por exposição, registrar ordem e probabilidade da política e preservar IDs; não mudar a escolha em re-renderizações.

Aceite: edição ociosa não acompanha geração, salvar/reabrir é fiel, jornada reconstruível mesmo com briefings iguais e instrumentação tem custo separado e limitado. Eventos descartáveis de análise não são tratados como dados transacionais de cobrança.

### P5 — Integração, falhas e consumo

Depende de P1–P4. Testes locais avançam antes da disponibilidade do destino; a jornada no ambiente final depende da seção 6.

- [ ] Conferir scripts atuais, executar testes pertinentes, incluindo `test:egress`, e acrescentar testes dos novos modos de falha. Compilação não substitui verificação da jornada.
- [ ] Exercitar TheVoid → API → executor → três propostas → CanvasLab → salvar/reabrir/exportar; verificar isolamento entre contas, sessão e Sparks.
- [ ] Simular queda após admissão, perda do listener, sinal duplicado, timeout de provedor pago, queda antes de gravar resultado e falha durante liquidação. Incluir concorrência e fechamento de aba.
- [ ] Medir chamadas, bytes, duração, tentativas, custo de provedor, CPU/memória e carregamento frio de catálogo/fontes por geração.
- [ ] Separar banco → servidor, servidor → navegador, Storage e provedores; tráfego interno também consome recursos.
- [ ] Observar uma hora ociosa e uma janela controlada de 24 horas antes de liberação ampla, coordenadas com o responsável pelo ambiente. Não reiniciar VPS ou serviços compartilhados unilateralmente para testar.
- [ ] Definir envelopes de consumo a partir do ensaio e alertas por causa/operação. Limites de concorrência enfileiram; não criar teto arbitrário que descarte geração válida.

Aceite: melhoria demonstrada das propostas no conjunto de referência, nenhuma violação silenciosa de obrigação, recuperação comprovada e custo por geração conhecido. Consumo necessário alto volta ao usuário com dados antes de reduzir qualidade ou cobertura.

### P6 — Entrega da aplicação e preparação da ativação

- [ ] Entregar artefatos, comandos de inicialização, variáveis necessárias sem valores secretos, migrações ordenadas e endpoints de saúde ao responsável pelo ambiente.
- [ ] Conferir schema/RPCs disponíveis antes de ativar consumidores; coordenar alterações em banco compartilhado.
- [ ] Validar configuração de Auth/URLs/assets/webhooks no aplicativo, usando o ambiente fornecido pelo outro chat.
- [ ] Reconciliar pedidos antigos, reservas e operações ambíguas. Vincular pedidos novos à política/catalogação correta; não executar o mesmo trabalho em dois ambientes.
- [ ] Preparar ativação restrita e reversão de código compatível com novas gravações. Retornar a uma cópia antiga de dados exige coordenação e reconciliação, não só trocar URL.
- [ ] Entregar evidências da jornada e consumo, pendências e instruções de retomada. Coordenar corte/reativação; não assumir que a instalação da VPS autoriza iniciar workers antigos.

Aceite: aplicação pronta e verificada no destino disponibilizado, com uma única origem de execução/escrita, compatibilidade de persistência e reversão documentadas. Instalação e migração física de dados pertencem ao outro chat.

## 6. Integração necessária com o chat da VPS

Receber: endpoints de ensaio e destino; versões e extensões disponíveis; mecanismo seguro de entrega de credenciais; conexão PostgreSQL de sessão para o listener; acesso aos assets/fontes; condições de execução do renderer; portas/health checks e política de supervisão/restart. Confirmar a disponibilidade de identidades de usuários e dados necessários ao ensaio.

Fornecer: migrações e permissões necessárias, requisitos de processo/renderer, comando de inicialização, variáveis sem segredos, endpoints de saúde, forma de desligamento gracioso, recursos medidos e procedimento de reconciliação da aplicação.

Dependências externas não impedem P0–P4 locais. Integração real e ativação dependem do ambiente confirmado; não pressupor modelo de banco, Auth ou Storage diferente daquele efetivamente entregue sem revisar compatibilidade.

## 7. Matriz de aceite

| Cenário | Resultado exigido |
| --- | --- |
| TheVoid parado | Sem polling periódico de geração, disponibilidade ou saldo; sessão legítima contabilizada à parte. |
| Worker ocioso | Sem loop antigo de claim/heartbeat; controles residuais pequenos e medidos. |
| ENTER duplicado/resposta perdida | Mesmo pedido recuperado, sem reserva ou efeito duplicado. |
| Três propostas | Adequação, diversidade útil, renderização válida e escolha por identidade estável. |
| Pedido inviável | Limitação explícita e decisão antes de quebrar obrigação. |
| Reinício/perda de conexão | Retomada preserva checkpoints e trata resultado externo desconhecido. |
| Entrega e cobrança concluídas | Acompanhamento termina. |
| CanvasLab | Salvar/reabrir/exportar preserva `CanvasPostModel`, sem consultas de geração durante edição. |
| Quota/credencial inválida | Estado de espera, sem ciclo rápido de retries ou reinícios. |
| Duas contas | Dados e operações isolados, inclusive histórico e Storage. |

## 8. Ordem e limites

Sequência: **P0 → P1 e P2 → P3 → P4 → P5 → P6**. Instrumentação mínima de P4 começa em P0; P1 e P2 são independentes após alinhamento dos contratos. Um responsável pelo PostSpark acompanha seleção e execução até a jornada final, mesmo com subtarefas internas.

Aprendizado automático de ranking, exploração probabilística, troca de autenticação e broker adicional ficam fora da primeira entrega. Não exigir distribuição uniforme dos designs: medir adequação ao pedido. Não prometer viés zero, tráfego zero ou economia percentual antes da medição.

Acionar o usuário se houver necessidade de alterar cobertura/qualidade, especialmente carrosséis, ou consumo alto inerente ao funcionamento. A execução local deste plano foi autorizada pelo usuário. Instalação e reativação da infraestrutura continuam fora desta execução.
