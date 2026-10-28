# Executor PostSpark na AWS

O frontend e a API continuam na Vercel; dados e arquivos continuam no Supabase.
O Lightsail hospeda o processo persistente de geração com Node, Chromium e o
renderer real do CanvasLab. Não há cópia do banco para a máquina.

## Infraestrutura

- Projeto acessado pelo perfil local `postspark`; região `us-east-2`.
- Instância `postspark-worker-prod`, Ubuntu 24.04, pacote `small_3_0`.
- 2 vCPU, 2 GiB de RAM, 60 GiB de SSD; preço consultado em 28/10/2026: US$ 12/mês.
- Sem snapshots automáticos, IP estático, load balancer ou outros add-ons pagos.
- Firewall permite somente SSH a partir do endereço do operador.
- Docker inicia no boot; o executor usa `restart: unless-stopped`, usuário sem
  privilégios no container, limite de memória, rotação de logs e encerramento
  gracioso de até 12 minutos para preservar o trabalho atual.
- Os checkpoints, leases, cobrança e recuperação continuam sob responsabilidade
  do fluxo existente no Supabase; reiniciar o container não apaga pedidos.

O plano FREE e a cobertura do Lightsail pelos créditos foram confirmados pela
API antes da criação. A validade inicial do plano é 28/04/2027 ou esgotamento dos
créditos, o que acontecer primeiro. Não houve upgrade para o plano pago. Confira
o saldo atual, em vez de presumir que o valor inicial continua disponível:

```sh
aws freetier get-account-plan-state --profile postspark --region us-east-2
```

## Atualizar o executor

Autentique o operador com `aws login --profile postspark --region us-east-2`.
Use a mesma revisão de backend e contratos compartilhados publicada na API.
O pacote inclui a fonte atual da árvore de trabalho, inclusive correções ainda
não commitadas; publique a fonte correspondente no GitHub para preservá-la.

```sh
# Constrói e testa em container sem rede; não troca o executor ativo.
python3 ops/aws/deploy-worker.py

# Constrói, testa e ativa a revisão verificada.
python3 ops/aws/deploy-worker.py --activate
```

O teste usa fontes locais e o CanvasPostStage real para renderizar três sequências
simultâneas de cinco slides. Não chama IA, não acessa o banco e não comprova sozinho
a geração completa ou a qualidade editorial dos posts. Um erro impede a ativação.
O código é enviado por SSH com conferência SHA-256. Nenhum arquivo de ambiente,
chave AWS/SSH ou token entra na imagem. A identidade operacional do worker mantém
o fingerprint já existente do código executável e do bundle do renderer.

Uma entrega que afete backend, contratos compartilhados ou o renderer tem dois
destinos: API/frontend na Vercel e executor pelo comando acima. O deploy da Vercel
não executa este comando. O reinício automático do container mantém o processo
ligado; atualizações de código seguem o procedimento de entrega explícito.

## Configuração privada

Prepare somente as variáveis necessárias ao executor, a partir de um ambiente
existente. O comando não copia Stripe, SMTP, JWT, conexão SQL direta ou credenciais
AWS. Os valores não são exibidos:

```sh
node ops/aws/prepare-worker-env.mjs .env /tmp/postspark-worker-private/worker.env
python3 ops/aws/lightsail.py upload /tmp/postspark-worker-private/worker.env /tmp/postspark-worker.env
python3 ops/aws/lightsail.py ssh 'sudo install -m 600 -o root -g root /tmp/postspark-worker.env /opt/postspark-worker/shared/worker.env && rm /tmp/postspark-worker.env'
```

As credenciais continuam no arquivo privado `/opt/postspark-worker/shared/worker.env`,
fora da fonte, da imagem e do Git. O operador é responsável pelo backup externo
das configurações privadas. O comando de deploy não transfere credenciais.

As chamadas de modelos continuam usando os provedores já configurados e têm
cobrança própria, independente dos créditos de hospedagem AWS.

A captura visual de páginas externas usa outro serviço, configurado em
`SCREENSHOT_SERVICE_URL`. Ative `SCREENSHOT_PUBLIC_NETWORK_ONLY=true` somente
depois de verificar o bloqueio de destinos privados também em redirects e
sub-recursos. A extração HTML/CSS existente permanece disponível nesse intervalo.
O procedimento para hospedar o capturador na mesma máquina está em
[README.capture.md](./README.capture.md). Código preparado não significa serviço
ativado; confirme os testes e a configuração remota descritos nesse procedimento.

## Operação e recuperação

```sh
python3 ops/aws/lightsail.py ssh 'sudo docker ps --filter label=com.docker.compose.project=postspark-worker'
python3 ops/aws/lightsail.py ssh 'sudo docker logs --tail 40 postspark-worker-generation-worker-1'
```

O helper solicita chaves SSH temporárias à AWS em cada operação. A chave pública
do servidor é fixada localmente; mudanças inesperadas são rejeitadas. Se o
endereço de saída do operador mudar, atualize a regra SSH no Lightsail para o
novo `/32`; não abra a porta para `0.0.0.0/0`.

As revisões ficam em `/opt/postspark-worker/releases/`. A seleção atual fica em
`current.env`, e a anterior é preservada em `previous.env`. Para retornar a uma
revisão anterior já verificada, execute `release-worker.sh activate` com o tag
daquela revisão. As imagens e revisões antigas não são apagadas automaticamente.

Para recriar a máquina, use a imagem e o pacote acima, aplicando
`bootstrap-worker.sh` como launch script. Ele é POSIX porque o Lightsail concatena
um prefixo próprio e executa o arquivo com `/bin/sh`. Reinstale a configuração
privada e execute o procedimento de deploy.
