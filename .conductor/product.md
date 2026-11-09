# Product Definition: PostSpark 3

## 1. Visão do Produto (The North Star)

O **PostSpark** é uma plataforma full stack *high-ticket* de alta performance para direção de arte, geração generativa, edição visual direta e exportação em fidelidade ultra-HD (4K) de posts e carrosséis para redes sociais.

Seu propósito central é permitir a criação massiva de conteúdo visual de alto impacto que preserve **fidelidade visual absoluta à identidade da marca (Brand DNA)** do cliente, com o nível de acabamento, refinamento tipográfico e direção estética de um designer sênior.

O fluxo ideal de sucesso é: **Gerar ➔ Baixar ➔ Próximo**. As sugestões da IA devem ser suficientemente bem resolvidas e esteticamente elegantes para que a edição manual seja apenas um refinamento opcional, e não uma correção obrigatória de uma geração falha.

---

## 2. Público-Alvo e Personas

- **Público Primário (Agências de Marketing & Design):** Times e gestores de social media e tráfego pago que administram múltiplas marcas, exigindo alto volume de entrega semanal sem comprometer a consistência da marca e os padrões de design.
- **Público Secundário (Empreendedores & Creators Solo):** Negócios e produtores digitais que precisam de materiais publicitários profissionais com rapidez, autonomia e sem curva de aprendizado complexa de ferramentas pesadas.

---

## 3. Jornada e Fluxos Principais

### 3.1 Entrada & Extração de Brand DNA
O usuário fornece insumos flexíveis na etapa de criação (`StudioCreateViewV2B`):
- **Texto:** Briefing direto, tópicos, teses ou roteiro.
- **URL do Site/Página:** Extração automática de identidade visual (paleta cromática, tipografias, logo e tom de voz).
- **Imagem de Referência:** Upload de imagens ou composições para ancorar estilo e arquétipo visual.

### 3.2 Geração Generativa & Orquestração Multimodal
- O pipeline único executa de maneira persistente e durável no PostgreSQL.
- Gera **três propostas independentes e completas**, compostas por:
  - Copy persuasiva estruturada (Headline, Subtexto, CTA, Badge, Chunks enriquecidos).
  - Seleção de arquétipos visuais e famílias do catálogo (14 famílias oficiais + Acervo 82).
  - Revisão visual automática com modelo multimodal (Chromium headless + inspeção de contraste e overlap) antes da liberação ao usuário.
- Feedback de espera transparente com curva assintótica e esteira de mensagens contextuais reais (sem temporizadores falsos que congelam a tela).

### 3.3 Galeria de Direções (`StudioGalleryView` / `StudioMobileFlashcards`)
- Exibição paralela das 3 propostas geradas.
- Alternância dinâmica de formato de prancheta (1:1 Quadrado, 4:5 Retrato/Feed, 9:16 Stories/Reels).
- Navegação entre lâminas de carrossel com thumbnails e controles fluidos.
- Escolha da proposta para abertura no editor ou download direto.

### 3.4 Edição Visual Direta no CanvasLab (`CanvasPostStage.tsx`)
- Prancheta vetorial 2D interativa acelerada via Konva.
- **Edição Direta On-Canvas:** Duplo clique/toque edita textos diretamente na prancheta com suporte a seleção de chunks ricos (cores, negrito, itálico) e textarea invisível como ponte de IME/teclado.
- **Guardião de Contraste WCAG 2.1:** Auditoria algorítmica contínua (`lib/contrast.ts`) que impede combinações ilegíveis entre plano de fundo e texto, inclusive nas metades de *Brutal Split* e no modo *Cinematic Depth*.
- **10 Estilos de Legibilidade Tipográfica:** Efeitos visuais para fotos e fundos complexos (`shadow`, `outline`, `box-card`, `box-pill`, `box-glass`, `box-accent`, `box-brutal`, `scrim`, `strip-line`).
- **Seletor Visual de Tipografia (`FontPickerDropdown`):** Renderização direta da fonte com espécime e categorias, eliminando limitações de `<select>` HTML nativo.
- **Caixas de Texto Extras:** Criação e manipulação livre de textos adicionais com alinhamento magnético (snap), rotação e redimensionamento via `Transformer`.
- **Camadas de Sobreposição (Overlay):** Modos de gradiente inferior, superior, sólido e vinheta radial com ajuste livre de opacidade e cor.

### 3.5 Exportação de Alta Fidelidade (4K) & Persistência
- Renderização offscreen em resolução nativa 4K Ultra-HD (`pixelRatio: 4`).
- Exportação em lote de carrosséis completos empacotados em arquivo `.zip` via JSZip.
- Salvamento automático e manual no Supabase com fidelidade total no formato autoritativo `CanvasPostModel`.

### 3.6 Billing & Sparks
- Saldo em tempo real de `Sparks` (moeda de consumo para gerações e operações de IA).
- Planos de assinatura (Pro e Agency) gerenciados de forma transparente via Stripe.

---

## 4. Módulos Core do Sistema

| Módulo | Localização | Responsabilidade |
| :--- | :--- | :--- |
| **Studio App V2B** | `client/src/pages/StudioApp/` | Fluxo principal (`/thevoid`, `/studio`): Criação ➔ Galeria ➔ Editor |
| **CanvasLab (Editor)** | `client/src/pages/CanvasLab/` | Prancheta Konva 2D, manipulação de nós, tipografia e overlays |
| **Pipeline de Geração** | `server/ai/workflows/` | Preparação, seleção de design, redação, renderização headless e revisão |
| **Design Ingestion & Acervo 82** | `client/src/pages/TemplateIngestion/` e `server/routers/templateIngestion.ts` | Extração de designs, curadoria do catálogo e ingestão de novos templates |
| **Auth & Cookie Bridge** | `client/src/_core/` e `server/_core/` | Autenticação Supabase, RBAC e cookies HTTP-only de sessão |
| **Billing & Topup** | `client/src/pages/Billing.tsx` e `server/routers.ts` | Planos Pro/Agency, recargas e webhooks do Stripe |
| **Admin & Governança** | `client/src/pages/Admin.tsx` e `Admin2.tsx` | Painel gerencial restrito com auditoria de usuários e métricas |

---

## 5. Invariantes de Produto e Regras de Negócio Inegociáveis

1. **A Fonte Única da Verdade do Editor é o `CanvasPostModel`:**
   - O fluxo legado (`Home.tsx` / `HoloDeck` / `WorkbenchV2`) é histórico e órfão de rota.
   - Todo post em edição é regido pelo `CanvasPostModel`.
2. **Contraste e Legibilidade Não São Opcionais:**
   - Nenhuma geração ou template padrão pode sair com texto invisível ou contraste abaixo das normas de acessibilidade (WCAG).
3. **Liberdade Criativa sem Quebra Mecânica:**
   - O usuário pode arrastar, sobrepor e redimensionar elementos à vontade. O sistema protege o usuário com Undo/Redo e snap inteligente.
4. **Respeito aos Sparks do Usuário:**
   - Erros de renderização local (Chromium, rede interna) nunca devem recomprar créditos ou duplicar cobrança de Sparks.

---

## 6. Métricas de Sucesso

- **Zero Zero-Post Frustration:** Mais de 85% das gerações resultam em download imediato ou com menos de 2 minutos de edição.
- **Taxa de Paridade de Visualização:** 100% de paridade entre o que é visto no CanvasLab e a imagem exportada em 4K.
- **Disponibilidade da Esteira:** Menos de 1% de falhas duráveis no pipeline de geração.
