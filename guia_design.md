# Guia Universal de Design para Posts em Redes Sociais
## Princípios aplicáveis a qualquer proporção (1:1, 5:6, 9:16, 16:9)

---

## 1. Hierarquia Visual (Lei do Contraste de Tamanho)

**Conceito**: O olho humano processa informações em ordem de tamanho. Elementos maiores = maior importância.

### Aplicação Universal:
- **Primário (Título/Hero)**: 8-12% da altura total do canvas
  - 1:1 (1080px): 86-130px
  - 9:16 (1920px): 154-230px
  - 5:6 (1350px): 108-162px

- **Secundário (Subtítulo)**: 40-50% do tamanho do primário
- **Terciário (Corpo/Detalhes)**: 25-30% do tamanho do primário
- **Quaternário (CTA/Legenda)**: 20-25% do tamanho do primário

### Fórmula Prática:
Tamanho Base = Altura do Canvas × 0.10
Título = Base × 1.2
Subtítulo = Base × 0.5
Corpo = Base × 0.3
plain
Copy

**Exemplo em 9:16 (Story)**:
- Headline: 120px
- Subhead: 60px  
- Descrição: 36px
- Link/Hashtag: 24px

---

## 2. A Regra dos Terços Dinâmica

**Conceito**: Divida o canvas em 9 partes iguais (3×3). Os pontos de interseção são os "pontos de poder" naturais do olhar.

### Adaptação por Proporção:

**1:1 (Quadrado)**:
- Ponto forte: Centro (interseção central)
- Uso: Centralize o elemento hero ou use simetria radial
- Margem segura: 10% de cada lado

**5:6 (Retrato)**:
- Pontos fortes: 1/3 superior (atenção imediata) e 2/3 inferior (CTA)
- Uso: Título no topo, informação no meio, ação no bottom
- *Golden zone*: Entre 33% e 66% da altura para o conteúdo principal

**9:16 (Story/Vertical)**:
- Pontos fortes: 20% do topo (abaixo da barra de notificações) e 25% do bottom (acima dos controles do app)
- Uso: Título no top-third, conteúdo no middle-third, interação no safe-area inferior
- **Safe Zone Crítica**: Mantenha elementos importantes entre 250px e 1500px em um canvas de 1920px de altura

---

## 3. Proximidade e Lei da Continuidade

**Conceito**: Elementos relacionados devem estar próximos; não-relacionados, distantes. O olho cria "grupos" automaticamente.

### Espaçamento Proporcional:

Defina uma **Unidade Base (UB)** = 2% da menor dimensão do canvas

- **1:1**: UB = 22px (aproximado)
- **5:6**: UB = 22px  
- **9:16**: UB = 20px (largura é o limitante)

### Sistema de Espaçamento:
- **Intra-grupo**: 1 UB (elementos dentro do mesmo assunto)
- **Inter-grupo**: 3 UB (entre blocos de informação diferentes)
- **Margem**: 4-6 UB (bordas do canvas)

### Exemplo Prático (Post de Blog 5:6):
[Título]
<espaço 1 UB>
[Subtítulo]
<espaço 3 UB>
[Parágrafo 1]
<espaço 1 UB>
[Parágrafo 2]
<espaço 3 UB>
[Botão/Link]
plain
Copy

---

## 4. Contraste e Acessibilidade (WCAG 2.1)

**Conceito**: Texto deve ser legível contra o fundo. Taxa mínima de contraste 4.5:1 para textos normais, 3:1 para grandes.

### Paletas Universais:

**Alta Conversão (Seguras)**:
- **Dark Mode**: Texto #FFFFFF sobre #121212 (contraste 16:1)
- **Light Mode**: Texto #1A1A1A sobre #FFFFFF (contraste 16:1)
- **Accent**: Texto branco sobre gradiente roxo/azul (mínimo 5:1)

**Gradientes Inteligentes**:
- Sempre use overlay escuro (rgba(0,0,0,0.3)) sobre fotos com texto
- Texto em gradiente: adicione drop-shadow ou stroke de 2px para garantir legibilidade em qualquer parte da imagem

### Teste Rápido:
Converta a imagem para escala de cinza. Se o texto sumir ou ficar ilegível, o contraste está insuficiente.

---

## 5. Alinhamento e Direcionalidade

**Conceito**: O alinhamento cria "linhas invisíveis" que guiam a leitura. Escolha baseada na cultura de leitura e no objetivo.

### Tipos por Objetivo:

**Centralizado**:
- Uso: Inspiração, emoção, celebração, perguntas
- Psicologia: Transmite equilíbrio, formalidade, importância
- Melhor em: 1:1 e 9:16 (formatos "pessoais")

**Esquerda (Ragged Right)**:
- Uso: Educação, listas, notícias, tutoriais
- Psicologia: Facilita leitura em padrão F, transmite seriedade
- Melhor em: 5:6 e 16:9 (formatos "informativos")

**Direita (Ragged Left)**:
- Uso: Estética, moda, designs vanguardistas
- Psicologia: Tensão visual, modernidade
- Uso moderado: Reserve para palavras-chave curtas

**Justificado**:
- Evite em redes sociais (cria "rios" de espaço em linhas curtas)

### Regra de Ouro:
Nunca misture mais de 2 alinhamentos no mesmo post. Escolha um dominante (80%) e um de contraste (20%, geralmente o CTA).

---

## 6. Tipografia com Escada de Ritmo

**Conceito**: Combinações de fontes devem ter contraste suficiente para diferenciação, mas coesão suficiente para unidade.

### Pares Universais (Fonte Primária + Secundária):

**Combinação 1: Autoridade**  
- Primária: Serifada (Playfair Display, Georgia, Merriweather)  
- Secundária: Sans-serif clean (Montserrat, Helvetica, Arial)  
- Uso: Citações, posts institucionais, educação

**Combinação 2: Modernidade**  
- Primária: Sans-serif geométrica (Montserrat, Futura, Avenir)  
- Secundária: Sans-serif humana (Open Sans, Roboto)  
- Uso: Startups, tecnologia, lifestyle

**Combinação 3: Impacto**  
- Primária: Display/Condensada (Impact, Bebas Neue, Oswald)  
- Secundária: Serifada ou Sans leve  
- Uso: Promoções, números, headlines

### Regras de Hierarquia Tipográfica:
- **Máximo 2 fontes por post** (3 apenas se uma for para números/código)
- **Peso**: Nunca use mais de 3 pesos (Light, Regular, Bold)
- **Escala**: Mantenha proporção mínima de 1.5x entre tamanhos de fontes diferentes

---

## 7. Padrões de Leitura (Z vs F)

**Conceito**: O olho move-se em padrões previsíveis baseados na disposição do conteúdo.

### Padrão Z (Zig-zag):
- **Formatos**: 1:1 e 16:9 (horizontais)
- **Fluxo**: Topo-esquerdo → Diagonal → Base-direito
- **Aplicação**:
  1. Logo/Marca (top-left)
  2. Headline (top-right ou center)
  3. Imagem/Info (meio)
  4. CTA (bottom-right)

### Padrão F (Vertical):
- **Formatos**: 5:6 e 9:16 (verticais)
- **Fluxo**: Linha horizontal no topo → descida pela esquerda → linhas horizontais curtas
- **Aplicação**:
  1. Título (top, largo)
  2. Bullet points alinhados à esquerda
  3. CTA alinhado à esquerda no final

### Exceção: Padrão de Diamante (1:1):
Em posts quadrados com elemento central, o olho circula em espiral para dentro. Posicione o conteúdo mais importante no centro ou nas "pontas cardinais" (N, S, L, O).

---

## 8. Balanceamento Visual e Lei do Peso

**Conceito**: Elementos visuais têm "peso" baseado em cor, tamanho e textura. O canvas deve equilibrar-se como uma balança.

### Técnicas de Balanceamento:

**Simétrico (Formal)**:
- Elementos iguais dos dois lados de um eixo central
- Uso: Marcas de luxo, institucional, tranquilidade
- Cuidado: Pode ser monótono; quebre com um elemento assimétrico pequeno

**Assimétrico (Dinâmico)**:
- Equilíbrio através de elementos diferentes com pesos iguais
- **Fórmula**: (Tamanho Grande × Baixa Saturação) vs (Tamanho Pequeno × Alta Saturação)
- Exemplo: Bloco de texto grande cinza claro (esquerda) vs Logo pequeno vermelho vivo (direita)

**Radial (Foco Central)**:
- Elementos dispostos em torno de um centro
- Uso perfeito para: 1:1 (citações, anúncios de produto único)

### Margens de Respiro (White Space):
- **Micro**: Espaçamento entre letras e linhas (line-height 1.2-1.5)
- **Macro**: Áreas vazias estratégicas que isolam o conteúdo
- **Regra 40/60**: Em posts eficazes, 40% é conteúdo, 60% é espaço vazio (margens + entrelinhas)

---

## 9. Consistência de Marca e Repetição

**Conceito**: Elementos repetidos criam padrão reconhecível. A consistência aumenta o recall da marca em 80%.

### Sistema de Componentes:

**Cores Fixas**:
- Defina 1 cor primária (60%), 1 secundária (30%), 1 de acento (10%)
- Use a mesma proporção em todos os posts, independente da proporção

**Grid Invisível**:
- Estabeleça uma margem padrão (ex: 60px em 1080px de largura)
- Mantenha essa margem proporcional em todas as proporções:
  - 1:1 (1080px): Margem 60px
  - 5:6 (1080px largura): Margem 60px  
  - 9:16 (1080px largura): Margem 60px (mesmo valor absoluto)

**Assinatura Visual**:
- Posição fixa do logo (ex: sempre 40px do topo, 40px da direita)
- Estilo consistente de CTA (ex: sempre caixa com 12px de border-radius)
- Tags/Hashtags sempre na mesma posição (ex: bottom-left, 40px de margem)

---

## 10. Psicologia das Cores e Contexto

**Conceito**: Cores evocam emoções e comportamentos. Escolha baseada na ação desejada, não apenas na estética.

### Mapa Emocional Universal:

**Ação/Compra (Vermelho/Laranja)**:
- Urgência, descontos, alertas
- Melhor para: CTAs em botões, números de promoção
- Evite: Fundos grandes (causa ansiedade)

**Confiança/Profissionalismo (Azul)**:
- Serviços, B2B, saúde, tecnologia
- Uso: Fundos gradientes, textos de credibilidade

**Criatividade/Inovação (Roxo)**:
- Arte, moda, espiritualidade, luxo
- Uso: Detalhes, acentos, fundos suaves

**Crescimento/Natural (Verde)**:
- Sustentabilidade, saúde, finanças (dinheiro)
- Uso: Mensagens positivas, confirmações

**Alegria/Energia (Amarelo)**:
- Atenção imediata, otimismo
- Cuidado: Use em pequenas doses (amarelo puro cansa os olhos)

### Aplicação por Proporção:
- **1:1**: Use cor de fundo sólida ou gradiente suave (maior área visual = cor deve ser confortável)
- **9:16**: Pode usar cores mais vibrantes no fundo (menor tempo de atenção, necessidade de impacto rápido)
- **5:6**: Equilíbrio entre os dois, ideal para storytelling com mudança de cor baseada na seção do post

---

## Checklist de Validação Universal

Antes de publicar em qualquer proporção, verifique:

- [ ] **Legibilidade**: Consigo ler o texto principal em 2 segundos de distância?
- [ ] **Hierarquia**: Em 1 segundo, qual é a informação mais importante? Deve ser óbvia.
- [ ] **Safe Zones**: Nenhum texto essencial está a menos de 10% das bordas?
- [ ] **Contraste**: O post funciona em modo claro e escuro (se aplicável)?
- [ ] **Escala**: Os tamanhos de fonte seguem a proporção 3:2:1 (Título:Sub:Texto)?
- [ ] **Respiração**: Existe espaço vazio suficiente ao redor dos elementos?
- [ ] **Alinhamento**: Todos os elementos seguem uma linha-invisível coerente?
- [ ] **Marca**: A identidade visual está presente mas não invasiva?

---

## Templates de Referência Rápida

### Estrutura "Foco Central" (Funciona em todas as proporções):
[Margem 10%]
[Título - 10% altura, centralizado]
plain
Copy
[Espaço 20%]

[Elemento Visual Principal - 40% altura]

[Espaço 20%]

[CTA - 8% altura, centralizado]
[Margem 10%]
plain
Copy

### Estrutura "Narrativa Vertical" (Ideal 5:6 e 9:16):
[Header - 15%: Logo + Título]
[Hero - 30%: Imagem/Gráfico principal]
[Content - 40%: Texto descritivo bullet points]
[Footer - 15%: CTA + Hashtags]
plain
Copy

### Estrutura "Impacto Horizontal" (Ideal 1:1):
[Esquerda 50%: Texto grande alinhado esquerda]
[Direita 50%: Elemento visual ou cor de destaque]
[Overlay bottom: CTA discreto]
plain
Copy

---

**Lembrete Final**: Estes princípios são guias, não prisões. Quebre as regras intencionalmente para criar contraste na timeline do usuário, mas nunca por desconhecimento. Mestre as regras primeiro, depois adapte-as à sua voz de marca.