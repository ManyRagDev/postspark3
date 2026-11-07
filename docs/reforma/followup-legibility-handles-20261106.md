# Legibilidade, perfil sugerido e opção 01 — 2026-11-06

Pedido investigado: `f9ed8300-0474-4fa6-b8b9-c893db02bdd2`, worktree `codex/acervo-82`, porta 3182. Criação em 06/11/2026 às 16:14:26 de São Paulo; término às 16:15:09. Estado parcial.

## Evidência da tentativa do usuário

- Opção 01 (slot 0): `acervo82-r9-14`, falha `artwork_unusable` na etapa copy. O campo `text-11-0` apresentou overflow, token overflow e bounds overflow. Não chegou à revisão.
- Opção 02 (slot 1): `acervo82-reference-05`, título “Uma pausa só sua”. Recebeu fotografia e revisão automática v4. O parecer bruto identificou contraste baixo no corpo, consequence `meaning_loss`, certainty `uncertain`; a normalização v4 transformou-o em aviso consultivo (`none`, `advisory`). A imagem chegou pronta ao usuário. Não houve bypass da revisão.
- Opção 03 (slot 2): recuperação para `acervo82-concept-27`, waves. Revisão concluída sem achados.

Custo da tentativa já feita pelo usuário: 9 chamadas, US$ 0,0705160685. Fotografia: US$ 0,067479; demais chamadas: US$ 0,0030370685. Os ensaios desta investigação reaproveitam os recibos, fontes, imagens e textos existentes.

## Causas identificadas

O texto preto do corpo ficou sobre painel escuro translúcido. A avaliação local tratava a presença da fotografia como superfície desconhecida; a política consultiva de contraste do revisor não substituía essa medição ausente. Liberdade estética não implica legibilidade dispensável.

Na opção 01, um alvo de aproximadamente 24 px de largura no rodapé foi interpretado como chamada de ação. Tanto a frase original quanto as alternativas do reparo eram incompatíveis com essa caixa. O problema é a semântica do campo oferecido ao redator, não uma regra estética do revisor.

O perfil sugerido deve usar `@seuperfil`, preservando perfis reais fornecidos nas fontes. Trata-se de um marcador explícito para edição posterior, não de dado factual inventado.

## Limite da investigação

No texto da opção 02 há também “tanta gente volta por aqui”, afirmação de recorrência não sustentada pelo pedido. O revisor não a apontou. A regra de suporte factual já existe no contrato; este falso negativo continua como limitação semântica, independente da legibilidade e da substituição determinística de perfis.

## Correções implementadas e ensaios locais

- `profileHandlePolicyVersion=1`: instrução comum e normalização determinística dos perfis sugeridos antes do encaixe e da revisão; perfis reais fornecidos preservados. Referências visuais não servem como prova do perfil. Modo literal visual_only preserva o texto original. Recibos do provedor continuam intactos.
- `localContrastPolicyVersion=1`: cálculo conservador dos limites de cor da superfície composta. Só altera o preenchimento quando comprova tanto a insuficiência da cor atual quanto a suficiência da substituta. No caso real, corrige as nove caixas pretas para branco. O máximo de contraste do preto era aproximadamente 1,647; o mínimo garantido do branco é 12,748. A renderização anterior coincide com o hash da imagem revisada; posição, dimensão, texto e foto permanecem iguais. Reabrir a composição preserva as cores corrigidas.
- `nativeGlyphProjection=1`: autoria futura reconhece setas isoladas como ornamentos. Para as definições já existentes, manifesto verificado por hashes restaura os símbolos de 12 fontes e remove apenas os campos editáveis indevidos. O catálogo persistido e as tentativas históricas permanecem intactos. A configuração fixa também o hash do manifesto.

O replay da opção 01 com os textos já recebidos passou de dois erros de overflow para zero após restaurar a seta, mantendo os três outros campos, legenda e hashtags. Esse replay não gerou a fotografia que faltava na tentativa fracassada e não equivale a uma nova proposta aprovada por IA. A verificação de persistência desse replay é do adaptador CanvasPostModel, não uma nova jornada completa de navegador.

Os marcadores só são habilitados em novas admissões automáticas. Pedidos históricos preservam sua configuração e os recibos originais. A imagem de contraste corrigido é uma renderização local demonstrativa da correção; o pedido histórico continua no estado original. Nenhuma chamada paga adicional foi necessária nesta investigação.

## Verificação final

49 testes de perfis/integração compacta; 44 de glifos/geometria/recuperação; 154 de contraste, contratos e fluxo, com 1 opt-in pulado. Há sobreposição entre lotes; os números não devem ser somados. TypeScript completo sem cache terminou com exit 0. Renderer local reconstruído e servidor 3182 reiniciado com fingerprint correspondente. Consulta autenticada confirmou propostas e estado histórico preservados (exceto timestamp volátil da resposta) e ledger sem novas chamadas pagas. Não foi feita uma nova geração completa paga.

Evidências: `artifacts/acervo82/full/sessions/followup-f9ed-20261106/`, incluindo antes/depois do contraste, snapshot, recibos, replay da seta e `verified-server.json`.
