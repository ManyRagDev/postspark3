# PhotoCraft na VPS — preparação operacional

Conferido em **14/11/2026**, por SSH no host configurado como `postspark-vps`.
Esta etapa instala e mede o motor. A integração com o produto continua pendente.

## Instalação confirmada

| Item | Estado observado |
| --- | --- |
| Sistema | Ubuntu 22.04.5 LTS, Linux x86_64, glibc 2.35 |
| Recursos do host | 8 CPUs, 32.091 MiB de RAM, sem swap; aproximadamente 351 GiB livres antes da instalação |
| Release | PhotoCraft CLI 0.23.1, build `45066c482`, de 12/11/2026 |
| AppImage SHA-256 | `05747b3e527e1e0a0c1de39970361cf38c8fca7e8d3e3601ef2082fb0e6dd17f` |
| Registro real | 1.009 comandos; `commands.json` preservado junto à release |
| Binário do servidor | `/opt/postspark/photocraft/current/photocraft-cli` |
| Comando global | `/usr/local/bin/photocraft-cli`, symlink para o binário acima |
| Release física | `/opt/postspark/photocraft/releases/v0.23.1-x86_64/` |
| Disco ocupado | Aproximadamente 261 MiB, incluindo a aplicação extraída |
| Identidade dos testes | Usuário de sistema `photocraft`, grupo próprio, shell `nologin` |
| Estado e temporários | `/var/lib/postspark-photocraft/` e subdiretório `tmp/`, modo 0700 |
| Referência de ambiente | `/etc/postspark/photocraft.env`, sem segredos e sem injeção nos contêineres |

O instalador resolveu a release estável na API oficial e verificou o digest antes
da extração. A versão também foi conferida na [release oficial](https://github.com/storytold/photocraft/releases/tag/v0.23.1).
Não foi necessário instalar pacotes do sistema, usar FUSE, display ou GPU.

## Validação funcional e medição

O executável real passou nos testes de máscara poligonal/alpha, dois processos
concorrentes, ajuste de cor/blur, recorte/dimensões, PNG, WebP, JPEG e reabertura
de `.pcraft`. A seleção automática funcionou no caso sintético simples. Imagem
uniforme não selecionou assunto, interrompeu a receita e não exportou resultado.

O [benchmark registrado](VPS_BENCHMARK_2026-11-14.json) contém **28 execuções de
CLI em 26 grupos**: duas repetições de quatro receitas em três tamanhos, mais
dois pares concorrentes em 3840×3840. As receitas são cor + blur, recorte +
redimensionamento, máscara poligonal e seleção automática + máscara.

| Entrada | Intervalo observado por receita individual | Maior pico de RSS individual |
| --- | --- | --- |
| 1080×1350 (1,46 MP) | 0,27–0,85 s | 92,7 MiB |
| 2160×2700 (5,83 MP) | 0,48–4,17 s | 241,5 MiB |
| 3840×3840 (14,75 MP) | 0,80–8,30 s | 522,0 MiB |

Os dois processos de máscara poligonal em 3840×3840 terminaram em **6,32 s**,
com pico agregado amostrado de **536,2 MiB**. O par de seleção automática +
máscara terminou em **4,84 s**, com **527,7 MiB** amostrados. Cada processo teve
diretório próprio; os hashes dos resultados dos pares coincidiram.

Medição de RSS individual: GNU `time`; RSS agregado: soma das árvores de
processos em `/proc`, amostrada a cada 50 ms, podendo perder picos breves. As
medições ocorreram com os serviços existentes em execução, sob cgroup com
**200% de CPU (duas CPUs equivalentes)** e **4 GiB de memória**. São poucas
amostras sintéticas e compressíveis, sem percentis estatísticos, ensaio de
carga prolongada ou certificação de qualidade em fotografias reais. A
concorrência medida cobre máscaras; não foi medido um par de filtros pesados.

## Limites e isolamento dos comandos de validação

`validate-linux.sh` executa uma unidade systemd transitória, sem serviço
residente nem porta pública. Usa usuário dedicado, `NoNewPrivileges`, sistema
de arquivos somente leitura com exceção do diretório de estado, homes
protegidos, `/tmp` privado e apenas sockets UNIX. O usuário de teste não recebe
credenciais da aplicação nem acesso de escrita à instalação.

- Máximo de dois processos CLI nos cenários concorrentes; dois threads Rayon
  por processo. O runner aceita apenas `smoke` ou `benchmark` e impede duas
  validações administrativas simultâneas por `flock`.
- Cgroup agregado: 4 GiB RAM, sem swap, duas CPUs equivalentes e 128 tarefas.
- Prazo máximo de cada grupo do benchmark: 90 s, com encerramento do grupo de
  processos no timeout. Smoke: 60 s por chamada. Unidade inteira: até 900 s.
- Temporários privados por cenário, apagados ao terminar normalmente ou em
  exceções tratadas. Resíduos após kill forçado/queda ficam sujeitos ao
  `systemd-tmpfiles-clean.timer`, ativo, com política de idade de um dia em
  `/etc/tmpfiles.d/postspark-photocraft.conf`. A limpeza ocorre na próxima
  passagem do timer, não constitui um prazo exato de 24 horas.

O primeiro smoke não chegou a executar o CLI: `PrivateTmp` ocultou o diretório
então escolhido em `/var/tmp`. O temporário foi movido para o diretório privado
de estado, mantendo o isolamento, e os testes completos passaram. O diretório
antigo vazio foi removido. A conferência final encontrou **zero temporários**.

Esses limites são efetivos nas unidades de validação. Executar diretamente o
comando global não herda o cgroup. O futuro adaptador deve implementar controle
global de concorrência, tamanho/pixels, timeout e cancelamento. Como ponto de
partida conservador: até dois processos, 90 s por operação, limite de entrada
até 3840 por eixo/14.745.600 pixels e orçamento agregado de 4 GiB/duas CPUs,
reavaliando receitas e arquivos reais antes de abrir o piloto. Limite de bytes
de upload permanece a definir após avaliação de formatos e decodificação.

## Repetir os testes

Os scripts estão em `/opt/postspark/photocraft/tooling/`. Na VPS:

```bash
photocraft-cli --version
sudo bash /opt/postspark/photocraft/tooling/validate-linux.sh smoke
sudo bash /opt/postspark/photocraft/tooling/validate-linux.sh benchmark
```

Cada execução guarda seu log em `/opt/postspark/photocraft/validation/`;
benchmarks também guardam JSON, sem imagens. Os recibos iniciais estão em
`validation/20261114/{benchmark,host}.json`; o smoke final está em
`validation/20261114T175615-4162865-smoke/output.log`.
O [recibo resumido do host](VPS_VALIDACAO_2026-11-14.json) e o benchmark estão
copiados neste diretório do repositório. Não foi configurado agendamento de
testes ou retenção automática desses relatórios administrativos.

Para preparar a mesma identidade e os diretórios em um host novo, depois do
instalador, como root:

```bash
getent passwd photocraft >/dev/null || useradd --system --user-group \
  --home-dir /var/lib/postspark-photocraft --no-create-home \
  --shell /usr/sbin/nologin photocraft
install -d -o photocraft -g photocraft -m 0700 \
  /var/lib/postspark-photocraft /var/lib/postspark-photocraft/tmp
printf 'd /var/lib/postspark-photocraft/tmp 0700 photocraft photocraft 1d -\n' \
  > /etc/tmpfiles.d/postspark-photocraft.conf
systemd-tmpfiles --create /etc/tmpfiles.d/postspark-photocraft.conf
```

Confirmar o timer de limpeza ativo e copiar os três scripts de validação/
medição para `tooling/`; sua instalação é administrativa, pertencente a root.

## Atualização e retorno de versão

Não há atualização automática. Antes de atualizar, registrar o alvo atual de
`current`; escolher explicitamente uma tag e conferir seu changelog. O
instalador verifica a nova release antes de trocar o symlink atomicamente e
preserva os diretórios anteriores. Validar novamente com o usuário de serviço
antes de liberar o processamento da versão nova. Na integração futura, pausar
a admissão de edições durante esse procedimento e preservar tarefas em curso.

Para retornar à versão já instalada nesta entrega, como root:

```bash
cd /opt/postspark/photocraft
test -x releases/v0.23.1-x86_64/photocraft-cli
ln -s releases/v0.23.1-x86_64 .current-rollback
mv -Tf .current-rollback current
bash tooling/validate-linux.sh smoke
```

Usar um nome temporário livre; se `.current-rollback` já existir, conferir sua
origem antes de repetir. O comando global acompanha `current`. Esta foi a
primeira instalação: não havia release anterior para ensaiar um downgrade
real. O procedimento acima fica documentado para a próxima atualização.

## Fronteira com o PostSpark

A API e o executor PostSpark rodam em contêineres Docker. O binário está no
**host** e não foi montado nem incluído nas imagens dos contêineres. O caminho
`PHOTOCRAFT_BIN` está reservado na referência de ambiente, mas não foi injetado
nos serviços existentes. A etapa de integração precisa disponibilizar o CLI
ao processo Node com suas dependências Linux e isolamento apropriado; não
usar SSH por requisição nem tornar o CLI um endpoint público.

Nenhuma imagem de contêiner, serviço da aplicação, configuração Auth/billing,
banco, domínio, regra de firewall ou interface foi alterada nesta instalação.
Os contêineres existentes continuaram saudáveis. Não foram usados assets de
usuários nem chamadas pagas de IA. O aviso “Editor avançado — Em breve”
continua sem ferramenta ativa.

O próximo passo é a **fase 2: avaliação de qualidade e escolha das primeiras
operações**, incluindo fotos reais, falhas e necessidade de correção manual.
`select.subject` continua sendo segmentação clássica por saliência/GrabCut;
os resultados sintéticos não garantem recortes de pessoas, cabelos ou fundos
complexos. A instalação e a medição não concluem toda a Entrega B.
