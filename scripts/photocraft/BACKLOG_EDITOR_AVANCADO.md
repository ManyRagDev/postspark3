# Backlog do editor avançado

Decisão do usuário em 14/11/2026: implementar apenas o que foi testado e
aprovado. Todo recurso duvidoso, insuficiente ou não testado permanece aqui,
sem botões experimentais na interface. A marca do motor permanece interna.
Em 17/11/2026, o usuário autorizou um aviso informativo “Em breve” no menu
avançado para a edição direta na prancheta. O aviso não executa operações e
não retira as operações aprovadas do editor atual.

O primeiro pacote implementado é: brilho/contraste/saturação, crop, resize,
trim transparente, máscara poligonal com feather, blur localizado com feather,
PNG/WebP, original preservado e confirmação pelo funil do CanvasLab.

| Frente | Situação / condição para sair do backlog |
| --- | --- |
| Edição direta na prancheta — “Em breve” | Máscaras e recortes por gestos sobre o canvas, controles integrados ao painel, prévia fluida. O modal já foi substituído pelo painel unificado; novos gestos continuam pendentes. Implementar depois, preservando cancelamento, alvo/revisão, histórico e save/reopen |
| Remoção automática do fundo | Resultado inconsistente nas imagens de posts. Exigir amostras aprovadas, prévia, correção e falha explícita; não oferecer como IA semântica |
| Seleção assistida por caixa/ponto/pincel e seleção por cor | Capacidades descobertas, ainda sem validação de qualidade nos assets do produto |
| Cabelo, transparências, halos e descontaminação de cor | Avaliar corpus próprio e necessidade de outro motor antes de prometer qualidade |
| Exposição, níveis, curvas, vibrance e balanço de cor | Ainda não ensaiados para o pacote inicial; validar parâmetros, visual e custo |
| Nitidez e redução de ruído | Ainda não ensaiadas com imagens do produto |
| Remoção de objetos, preenchimento, clonagem e retoque | Sem aprovação visual/operacional. Preenchimento clássico não equivale a reconstrução generativa |
| Rotação de pixels, expansão de canvas e margens | Não certificadas no CLI para este fluxo; a transformação geométrica existente do CanvasLab permanece disponível |
| Sombras, contornos, brilhos e acabamento de recortes no motor | Avaliar diferença em relação aos controles já existentes do CanvasLab e persistência das receitas |
| Montagens, modos de mistura, harmonização e filtros de camada | Ainda não ensaiados; preservar a autoridade do CanvasPostModel |
| LUTs externos, retículas e texturas | Não liberados. Duotone, looks Quente/Cinema e granulação discreta foram implementados em 17/11/2026 |
| Biblioteca de recortes e receitas reutilizáveis | Produto/persistência a desenhar; não confundir recibo de edição com preset reutilizável |
| Aplicação a vários assets/slides | Concorrência de processos não certifica aplicação em lote, progresso ou falhas parciais |
| Perspectiva, mockups, texto deformado, HEIC e PSD | Dependem de avaliação própria e contrato de fidelidade |
| PDF e novos formatos de exportação | Não fazem parte do primeiro pacote; JPEG foi apenas conferido no smoke anterior, não é saída desta API |
| Reedição integral de `.pcraft` e máscaras já aplicadas | Roundtrip de pixels passou, mas não houve integração de documentos nativos, fontes/camadas ou armazenamento desse formato |
| Entradas maiores, EXIF/ICC avançado e retratos de câmera | Primeiro pacote limita 8 MiB/3840 por eixo; orientação divergente é recusada antes de aplicar. Avaliar normalização e formatos sem alterar a imagem silenciosamente |
| Limpeza de assets privados sem referência | Adoção de política de retenção para publicação cancelada/abandonada exige conferir referências antes de apagar objetos deduplicados |
| Referência ausente do post 132 | A imagem apontada não estava no Storage durante o ensaio. Recuperação é manutenção separada; a edição informa origem indisponível e preserva o post |

O deploy coordenado do pacote aprovado e sua homologação hospedada são etapas
de disponibilização, não ferramentas experimentais a anunciar. A frase de
evolução do produto não promete frequência, prazo ou recursos específicos.

O [mapa de candidatos de 17/11/2026](MAPA_RECURSOS_SOCIAL_2026-11-17.md)
confere os nove grupos sugeridos com o catálogo do CLI instalado. Registro de
comando não certifica qualidade visual, fidelidade de PSD ou aprovação para
publicação. Novas operações desse mapa continuam no backlog até validação.


## Reavaliação de 17/11/2026

Preto e branco, duotone, sombras/realces, dois looks curados e granulação discreta
saíram do backlog e estão no painel. Gradiente de texto é nativo/editável e não
usa o servidor. **Iris Blur / centro nítido permanece em estudo e desligado**:
o ensaio mais recente mostrou uma transição marcada. Não habilitar apenas por
retorno zero do CLI. Remoção automática e novos gestos de máscaras/recortes
continuam pendentes. Ver [plano de execução](PLANO_INTERMEDIARIO.md).
