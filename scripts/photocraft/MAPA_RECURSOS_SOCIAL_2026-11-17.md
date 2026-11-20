# Candidatos do editor avançado para social media

Conferência de 17/11/2026. Escopo: enriquecer posts e carrosséis, preservando
o CanvasLab como editor autoritativo e o processamento de pixels na VPS.
Sem implementar novas ferramentas nesta descoberta.

Fonte executável: `photocraft-cli 0.23.1 (45066c482, 2026-11-12)`, consultado
na VPS com `--version` e `commands --json`: 1.009 comandos registrados.
O [recibo do catálogo](CATALOGO_SOCIAL_2026-11-17.json) guarda os 30 comandos
relevantes e a documentação de parâmetros devolvida pelo executável.
`enabled: false` nesse recibo significa ausência de documento/seleção na
consulta; não prova ausência da ferramenta. Registro não comprova execução
correta, qualidade visual ou integração no PostSpark.

## Decisão de UX

“Edição direta na prancheta — Em breve” é um aviso informativo no menu
avançado: desenho de máscaras/recortes sobre a imagem e controles integrados.
Essa evolução, inclusive substituir o modal e tornar a prévia fluida, fica no
backlog. As operações já aprovadas continuam disponíveis no editor atual.
Nenhum nome do fornecedor aparece no produto. Não anunciar os nove grupos
abaixo como funcionalidades disponíveis nem atribuir prazo a eles.

## Mapa de comandos e contribuição ao produto

| Recurso | Comandos reais na versão instalada | Contribuição e prioridade proposta |
| --- | --- | --- |
| Stickers | `select.subject`; `select.refineEdge`; `select.modify.expand`, `.smooth`, `.feather`; `layer.layerMask.revealSelection`; `layer.layerMask.apply`; `layer.layerStyle.stroke`; `layer.layerStyle.dropShadow`; `image.canvasSize` | Alto valor para thumbnails, pessoas e produtos destacados. Backlog dependente da qualidade do recorte; validar contorno e sombra também com PNG já transparente |
| Profundidade / texto atrás do assunto | `select.subject` → `select.refineEdge` com `output: "layerMask"` ou `layer.layerMask.revealSelection`; PNG com alpha por `run --out` | Alto valor visual. Fundo original + texto Konva + recorte alinhado, com texto ainda editável. Bloqueado pela segmentação, não por falta de camadas no canvas |
| Mockups e perspectiva | `edit.transform` com `quad`; `edit.perspectiveWarp` com `planes`; `edit.transform.warp` com `style: "cylinder"` ou malha; `file.placeEmbedded` para composição controlada | Valor para prints de app, livros e embalagens. Prioridade posterior; começar com poucos mockups curados e posições fixas, não editor 3D/universal |
| Desfoque de lente / fundo fosco | `filter.blur.gaussianBlur`; `filter.blur.lensBlur`; `filter.blurGallery.irisBlur`; `filter.blurGallery.tiltShift` | Boa próxima investigação para legibilidade de texto. Gaussian já aprovado no pacote atual; os demais não foram aprovados. Glassmorphism exige combinar área desfocada com painel translúcido e texto nítido no Konva |
| Duotone e paleta da marca | `image.adjustments.gradientMap` | Alta prioridade para validação: fotografia com paleta reconhecível e carrosséis consistentes, sem alterar as cores autorais do restante do post |
| Looks/LUT e textura editorial | `image.adjustments.colorLookup`; `filter.noise.addNoise` | Alta utilidade com presets limitados. LUT `.cube` e granulação com intensidade/seed controladas; aplicação em vários slides é outra jornada, ainda não certificada |
| Auto-tratamento | `image.autoTone`; `image.autoContrast`; opcional `image.autoColor` | Alta prioridade de ensaio, com antes/depois e aplicar explícito. Não corrigir silenciosamente logos, ilustrações ou imagens já tratadas; automação não garante resultado melhor |
| Estilos volumétricos | `layer.layerStyle.outerGlow`; `layer.layerStyle.innerGlow`; `layer.layerStyle.bevelEmboss`; `type.create` quando for necessário renderizar texto no motor | Prioridade posterior, em presets de acabamento. Preservar texto original, fonte, métricas e receita; rasterizar o efeito não torna o texto editável no Konva por si só |
| Templates e conversão | `info`, `convert`, `run` são subcomandos do CLI; `file.placeEmbedded` e `file.export.layersToFiles` são comandos do motor | Conversão controlada para PNG/WebP faz sentido. PSD como fonte de templates curados fica para avaliação separada. Não prometer conversor universal nem equivalência PSD ↔ CanvasPostModel |

Prioridades são propostas de validação, não aprovação de produto. Ordem
sugerida: duotone + granulação, auto-tratamento, looks/LUTs e fundos para texto;
depois stickers/profundidade com recorte aprovado; mockups, estilos de texto e
importação de templates por último. O Gaussian disponível não precisa esperar
pelos demais filtros.

## Parâmetros úteis para desenhar contratos futuros

- `gradientMap`: `stops: [[posição_0_a_1, "#rrggbb"], ...]`, de 2 a 64 stops,
  `reverse` e `dither`. A paleta vem da escolha do usuário/projeto; não inferir
  que qualquer combinação preserva rostos ou contraste.
- `colorLookup`: `lut` admite looks internos como `warm`, `cool`, `tealOrange`,
  `fadedFilm`; aceita LUT por `file` ou `data`, `lutFormat: "cube"`, interpolação
  trilinear/tetrahedral e `dither`. No SaaS, nunca aceitar caminho de arquivo
  arbitrário do cliente; começar por presets mantidos pelo servidor.
- `addNoise`: `amount`, `distribution: "uniform" | "gaussian"`,
  `monochromatic` e `seed`. Expor intervalo de intensidade bem menor que o teto
  do motor e seed estável para repetir a aparência.
- `autoTone` e `autoContrast`: `{}`. Não há uma intensidade comum documentada;
  uma opção de intensidade exigiria mistura com o original e validação própria.
- `irisBlur`: `centerX/centerY`, `radiusX/radiusY` normalizados, `blur`, `angle`
  e `feather`. `tiltShift`: `centerX/centerY`, `angle`, `focus`, `transition`
  e `blur`. Nenhum desses parâmetros substitui o desenho da UX.
- `lensBlur`: `radius`, `shape`, `depthMap`, `focalDistance`, entre outros.
  Sem mapa de profundidade validado, não prometer foco semântico automático.
- `edit.transform`: `quad` com quatro cantos em pixels, no sentido horário a
  partir do superior esquerdo. `edit.perspectiveWarp`: pares `src`/`dst` por
  plano. São operações 2D; realismo de iluminação/oclusão não é automático.
- `edit.transform.warp`: `style: "cylinder"`, `bend`, `hDistort`, `vDistort`,
  `values` ou `mesh`; o catálogo informa restrição horizontal para os valores
  de Cylinder. Não prometer qualquer superfície curva a partir disso.
- `stroke`: `size`, `position`, `color`, `opacity`. `dropShadow`: `distance`,
  `angle`, `size`, `spread`, `color`, `opacity`. Brilhos/chanfros têm outros
  parâmetros; expor presets próprios, não o painel inteiro do Photoshop.

Exemplo de **intenção candidata, não ensaio aprovado**:

```bash
photocraft-cli run input.png --no-gpu \
  --cmd image.adjustments.gradientMap \
  --params '{"stops":[[0,"#14213D"],[1,"#FCA311"]],"dither":true}' \
  --cmd filter.noise.addNoise \
  --params '{"amount":1,"distribution":"gaussian","monochromatic":true,"seed":42}' \
  --out preview.png
```

### Stickers: contorno não é expansão do recorte

Expandir a seleção antes de usar a máscara pode incluir pixels do fundo; isso
não produz uma borda branca limpa. O acabamento precisa partir de alpha/recorte
aprovado, aplicar contorno/sombra à silhueta e reservar margem transparente
para não cortar o efeito. `select.modify.expand` é uma operação disponível,
não uma etapa obrigatória dessa receita. Suavização excessiva também pode
descaracterizar cabelo e detalhes. Confirmar visualmente alpha, halo, contorno
contínuo e sombra antes de oferecer o preset.

### Profundidade: preservar alinhamento e editabilidade

Entregar o recorte em PNG com o mesmo tamanho e origem da foto. O CanvasLab
mantém fundo original, texto e recorte em ordem de camadas controlada. Não
usar trim/crop automático nessa saída nem achatar o post inteiro. Salvar os
vínculos, geometria, original e resultado e conferir reabertura, exportação e
desfazer. A lista de comandos não implementa esse contrato sozinha.

### Templates: separar renderização e documento editável

O CLI lê PSD e exporta camadas/rasters, mas o próprio projeto documenta lacunas
de fidelidade, fontes, smart objects e efeitos. Converter para PNG perde a
estrutura editável. Importar textos, relações e recursos do PSD para o modelo
do PostSpark exige um importador próprio. O caminho adequado para social media
é ensaiar templates internos curados, com fontes/recursos empacotados e
resultados comparados. Sem novos formatos na API pública nesta etapa.

## Correções dos alertas técnicos recebidos

1. **Nome inexistente:** `layer.addMaskFromSelection` não consta nos 1.009 IDs.
   Usar como candidato `layer.layerMask.revealSelection`, ou o fluxo de
   `select.refineEdge` já utilizado com `output: "layerMask"`. `Stroke`,
   `Drop Shadow` etc. são rótulos, não IDs de API.
2. **Seleção:** no catálogo, Object Finder é descrito em `select.object` com
   `point`. O histórico oficial de `select.subject` descreve saliência/GrabCut;
   a issue #4098 propõe segmentação por ML. Não foi comprovada a afirmação de
   “rede neural em alpha instalada”. Nossos ensaios visuais já reprovaram o
   recorte automático em assets reais. Remoção automática continua no backlog;
   não criar uma rota nova só porque um resumo a recomenda.
3. **Motor alternativo:** manter futura segmentação atrás de contrato de
   servidor independente do provedor é compatível com a arquitetura. O projeto
   IMG.LY distingue `@imgly/background-removal` (browser) de
   `@imgly/background-removal-node` (Node) e publica licença AGPL, com opção de
   contato comercial. Comparar runtime, pesos, licença e qualidade antes de
   adotar; nenhuma dependência foi instalada e nada foi movido para o frontend.
4. **150 camadas:** o scorecard oficial da tag v0.23.1 registra um crash wgpu
   no cenário P12, movimento por teclado em documento com 150 camadas. Isso
   não demonstra que todo arquivo que ultrapassa esse número falha. Concordamos
   que esse tipo de projeto fica fora do produto, mas dimensões, efeitos e
   concorrência também consomem memória mesmo com poucas camadas.
5. **Isolamento já existente:** o adaptador usa explicitamente `--no-gpu` e
   `PHOTOCRAFT_GPU=0`, processo/diretório por operação, limite de duas tarefas,
   90 s, 8 MiB e 3840 por eixo; contêiner com 4 GiB/duas CPUs. O processo sai
   normalmente após gerar o arquivo; em cancelamento, erro ou timeout, o grupo
   é encerrado e o temporário limpo. Matar um processo saudável antes de fechar
   a escrita não é uma melhoria. Não há suporte a documento livre com centenas
   de camadas na API atual. Ao adicionar templates, impor limite explícito de
   camadas/recursos/complexidade também na entrada.

## Critério para sair do backlog

Testar poucas imagens representativas: produto, pessoa, logo, ilustração e foto
com baixo contraste, conforme o recurso. Inspecionar visualmente antes/depois,
alpha, bordas, dimensões, consistência da paleta e legibilidade; medir tempo e
memória de uma e duas execuções. Depois conferir aplicar/cancelar, imagem
escolhida, original, histórico, salvar/reabrir e PNG no produto. Um comando
registrado, exit code zero ou mock de API não substitui essa conferência.

Fora do escopo por decisão do usuário: Clone Stamp/Healing Brush e outros
retoques manuais por ponteiro, formatos científicos e RAW. Não ampliar o
produto até virar um editor gráfico genérico.

## Fontes primárias consultadas

- CLI instalado na VPS: [catálogo capturado](CATALOGO_SOCIAL_2026-11-17.json).
- [CLI v0.23.1](https://github.com/storytold/photocraft/blob/v0.23.1/book/src/automation/cli.md)
  e [opção CPU/GPU](https://github.com/storytold/photocraft/blob/v0.23.1/apps/photocraft-cli/src/gpu.rs).
- [Seleção ML proposta / caminho clássico, #4098](https://github.com/storytold/photocraft/issues/4098)
  e [Object Finder, #4087](https://github.com/storytold/photocraft/issues/4087).
- [Scorecard v0.23.1, P12](https://github.com/storytold/photocraft/blob/v0.23.1/docs/scorecard.md)
  e [lacunas de fidelidade e desempenho](https://github.com/storytold/photocraft/blob/v0.23.1/docs/gaps.md).
- [IMG.LY: pacotes browser/Node e licença](https://github.com/imgly/background-removal-js).
