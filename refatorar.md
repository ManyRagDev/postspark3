# PLANO PARA REFATORAÇÃO DO AMBIENTE WORKBENCH

## Este plano tem por objetivo melhorar a visualização da página onde é possível editar e ter todos os controles dos posts gerados (tela workbench). 

## Você deve seguir os passoa abaixo, mas também deve considerar a adequação ao que é pedido referente ao projeto. Caso encontre dificuldades em compreender, pergunte. 

## SISTEMA DUAL LAYER: CAPTAIN vs ARCHITECT

### 1. State Management
interface ControlMode {
  mode: 'captain' | 'architect';
  perTabOverride: {
    // Permite que usuário tenha Texto em Captain mas Imagem em Architect
    text?: 'captain' | 'architect';
    design?: 'captain' | 'architect';
    image?: 'captain' | 'architect';
    composition?: 'captain' | 'architect';
  };
}

### 2. Visual Implementation

// Header do Painel Linear (sempre visível)
<PanelHeader>
  <TabTitle>Imagem</TabTitle>
  <ModeToggle 
    active={mode}
    onChange={setMode}
    captainColor="#d4af37" // Gold - representa "fácil/valor"
    architectColor="#6366f1" // Indigo - representa "técnico/poder"
  />
</PanelHeader>

// Conteúdo condicional
<AnimatePresence mode="wait">
  {mode === 'captain' ? (
    <CaptainView>
      {/* Apenas essenciais */}
      <QuickPresets />
      <EssentialSlider label="Intensidade" />
      <AIGenerateButton />
    </CaptainView>
  ) : (
    <ArchitectView>
      {/* Todos os 20+ controles */}
      <Accordion title="Calibração de Imagem">
        <PrecisionSlider label="Zoom" min={0.5} max={3.0} step={0.05} />
        <PrecisionSlider label="Brilho" min={0} max={200} step={5} />
        {/* ... todos os outros ... */}
      </Accordion>
      <Accordion title="Blend Modes">
        <BlendModeGrid options={6} />
      </Accordion>
    </ArchitectView>
  )}
</AnimatePresence>

### 3. Animação de Transição
Quando alterna Captain → Architect:
1. O painel expande de altura (70vh → 85vh) com spring physics
2. Os controles "extras" fade in com stagger (aparecem um a um, 50ms de delay entre eles)
3. O background do painel muda sutilmente (mais opaco no Architect para foco técnico)

### 4. Persistência
- Lembrar preferência do usuário por tab (se ele sempre edita Imagem no modo Architect, começar nesse modo para Image)
- Mas default geral é Captain (não assustar novos usuários)

### 5. Indicadores de "Smart Defaults" no Captain
Quando um controle está sendo gerenciado pela IA no modo Captain:
- Mostrar badge ✨ ao lado do label
- Hover/Click no badge expande para mostrar o valor atual e botão "Ajustar Manualmente" (que switcha para Architect naquele campo)
VANTAGENS DESTA ABORDAGEM PARA SEU PRODUTO HIGH-TICKET
Onboarding Suave: Novo usuário vê apenas o Captain (não foge assustado)
Stickiness: Quando ele descobre o modo Architect, sente que "desbloqueou o poder real" do app (fidelização)
Justificativa de Preço: O modo Architect é tão granular que justifica os R$ 2k+/mês — é literalmente um Photoshop simplificado para redes sociais
Performance: No mobile, renderizar só 12 controles (Captain) é muito mais leve que 40
Quer que eu gere um mockup mostrando a diferença visual entre o Painel no modo Captain (limpo, dourado, presets grandes) vs modo Architect (técnico, roxo, sliders densos)? Isso ajudaria o Claude a entender a transição entre estados.
então bora recapitular. 

Vamos pegar os conceitos que a gente discutiu desde o começo e bolar um plano de refatoração. Tenho o Kimi k2.5 aqui no meu visual studio code, então ninguem melhor do que você pra bolar um prompt pra ele fazer todas as alterações que precisamos, né? 

Então vamos lá? traga tudo
Edit
Copy
Share
Prompt para Refatorar Kimi K2.5 com Dark Studio Glassmorphism e Layout Trinity
Aqui está o Prompt Definitivo de Refatoração para o Kimi K2.5. Copie e cole isto no seu VS Code:
Markdown
Copy
Code
Preview
# PROMPT DE REFATORAÇÃO COMPLETO: SOCIAL STUDIO OS
## Para: Kimi K2.5 no VS Code | Projeto: Next.js + Tailwind + Framer Motion

Você é o Principal Design Engineer. Sua missão é refatorar um app de criação de posts de redes sociais, transformando-o de "ferramenta utilitária" em "sistema operacional de presença digital high-ticket" (produto premium R$ 2k-5k/mês).

---

## 1. IDENTIDADE VISUAL INEGOCIÁVEL (Dark Studio Mode)

### Paleta (CSS Variables obrigatórias no :root)
```css
--bg-void: #050505;
--bg-base: #0a0b0f;
--bg-elevated: #13141c;
--bg-floating: #1c1d26;
--glass-bg: rgba(19, 20, 28, 0.75);
--glass-border: rgba(255, 255, 255, 0.08);
--glass-highlight: rgba(255, 255, 255, 0.03);
--accent-gold: #d4af37;
--accent-cyan: #00f5ff;
--accent-architect: #6366f1;
--text-primary: #f8fafc;
--text-secondary: #94a3b8;
--text-tertiary: #64748b;
Glassmorphism Real (Requisito Técnico)
NUNCA use apenas bg-opacity. O glassmorphism exige:
css
Copy
.glass-panel {
  background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
}
Tipografia
Fonte: Inter ou Plus Jakarta Sans (Google Fonts)
Headings: tracking -0.02em, weight 600-700
Body: 14px, line-height 1.5, color: var(--text-secondary)
2. ARQUITETURA DE LAYOUT (Desktop: Trinity | Mobile: Arc Drawer)
Desktop (≥1024px): Layout Trinity
plain
Copy
[Sidebar 18%] | [Canvas 55%] | [Panel 27%]
Mobile (<1024px): Arc Drawer Interface
Canvas ocupa 100% (post centralizado)
Arc Trigger: Handle dourado (#d4af37) no centro inferior, 80px × 4px, border-radius 2px
Ao arrastar para cima (>30%): Revela Radial Menu (4 botões em arco: Txt, Des, Img, Comp)
Ao clicar no Radial: Abre Linear Panel (bottom sheet 70-85vh) com os controles da aba selecionada
3. SISTEMA DE NAVEGAÇÃO (4 Abas)
Estrutura das Abas no Panel:
ABA TEXTO (Copywriting)
Modo Captain (Default):
Seletor de Plataforma: Tabs horizontais (Instagram | LinkedIn | Twitter | Facebook)
Campo Título (input single-line, contador de caracteres)
Campo Corpo (textarea auto-grow, 3 linhas mínimo)
Botão "✨ Otimizar com IA" (dourado, pequeno, abaixo do textarea)
Modo Architect (Expandível):
Accordion "Metadados Avançados":
Hashtags (input com chips/tags dinâmicas, separadas por Enter)
CTA/Legenda customizada
Análise de sentimento (gauge mini 0-100)
ABA DESIGN (Cores)
Modo Captain:
Grid 4×2 de swatches de cores pré-definidas (clica aplica)
Toggle: "Tema Automático" (IA escolhe baseado na imagem)
Modo Architect:
Accordion "Sistema de Cores":
3 color pickers completos (Fundo, Texto, Destaque) com input hex
Sliders de opacidade para cada cor
Toggle para gradientes (ângulo e stops)
ABA IMAGEM (A mais complexa)
Sub-navegação horizontal (pill tabs):
[Nenhuma] [Galeria] [Upload] [Cor] [IA ✨]
Se "IA" selecionado (Modo Captain):
Textarea para prompt (3 linhas)
Botão grande "✨ Sintetizar Visual" (dourado, full-width)
Grid 2×2 de resultados (thumbnails clicáveis)
Modo Architect (Acordions expansíveis):
▼ Calibração Visual (Sliders precisos):
Zoom: 0.5× a 3.0× (step 0.05)
Brilho: 0% a 200% (step 5%)
Contraste: 0% a 200% (step 5%)
Saturação: 0% a 200% (step 5%)
Blur: 0px a 20px (step 0.5px)
▼ Sobreposição:
Color picker para overlay
Slider opacidade 0-100%
Grid 3×2 de Blend Modes (Normal, Multiply, Screen, Overlay, Darken, Lighten) - ícones visuais, não dropdown
ABA COMPOSIÇÃO (Layout)
Modo Captain:
Grid 2×2 visual de layouts (ícones grandes):
⊞ Centralizado
☰ Lateral
◧ Bipartido
◻ Minimal
Toggle alinhamento: [Left] [Center] [Right]
Modo Architect:
▼ Posicionamento Fino:
Toggle segmentado: [Título] [Corpo] (seleciona qual mover)
Grid 3×3 interativo (9 posições: top-left, center, bottom-right, etc)
Slider "Margem Interna": 0px a 80px (step 4px)
4. SISTEMA DUAL LAYER: CAPTAIN vs ARCHITECT
Implementação Obrigatória:
Cada aba deve ter um ModeToggle no header do Panel:
TypeScript
Copy
// Componente visual:
<Toggle 
  leftLabel="Captain" 
  rightLabel="Architect"
  leftColor="#d4af37"   // Dourado = simples/eficiente
  rightColor="#6366f1"  // Roxo = técnico/poderoso
/>
Comportamento:
Captain: Mostra apenas controles essenciais (~30% dos campos). Interface limpa, cards grandes, presets.
Architect: Expande para mostrar todos os controles (~100% dos campos). Accordion abertos por padrão, sliders precisos, inputs numéricos.
Transição: AnimatePresence com fade + height auto. Duração: 300ms, easing: [0.25, 0.1, 0.25, 1]
Smart Defaults (Captain):
No modo Captain, campos "escondidos" devem mostrar um badge ✨ indicando que a IA está gerenciando aquele aspecto. Ex: "✨ Cores otimizadas automaticamente". Clicar no badge expande para Architect naquele campo específico.
5. COMPONENTES ESPECÍFICOS (Código)
5.1 GlassCard (Base)
tsx
Copy
const GlassCard = ({ children, elevation = 'resting', interactive = false }) => (
  <motion.div
    className={`
      rounded-2xl backdrop-blur-xl
      bg-gradient-to-br from-white/10 to-white/5
      border border-white/[0.08]
      shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]
      ${elevation === 'elevated' ? 'shadow-2xl' : ''}
      ${interactive ? 'hover:-translate-y-1 hover:border-white/15 transition-all duration-300' : ''}
    `}
    style={{ backdropFilter: 'blur(20px) saturate(180%)' }}
  >
    {children}
  </motion.div>
);
5.2 Slider Premium (Modo Architect)
tsx
Copy
const PrecisionSlider = ({ label, value, min, max, step, unit = '' }) => (
  <div className="flex flex-col gap-2">
    <div className="flex justify-between text-xs">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-[var(--accent-gold)]">{value}{unit}</span>
    </div>
    <input
      type="range"
      min={min} max={max} step={step}
      className="w-full h-1 bg-[var(--bg-base)] rounded-full appearance-none cursor-pointer
        [&::-webkit-slider-thumb]:appearance-none
        [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
        [&::-webkit-slider-thumb]:rounded-full
        [&::-webkit-slider-thumb]:bg-[var(--text-primary)]
        [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--accent-gold)]
        [&::-webkit-slider-thumb]:shadow-lg"
    />
  </div>
);
5.3 Arc Trigger (Mobile)
tsx
Copy
const ArcTrigger = ({ onDrag }) => (
  <motion.div
    className="fixed bottom-5 left-1/2 -translate-x-1/2 
      w-20 h-1 bg-[var(--accent-gold)]/60 rounded-full
      cursor-grab active:cursor-grabbing z-50"
    drag="y"
    dragConstraints={{ top: 0, bottom: 0 }}
    onDragEnd={(_, info) => {
      if (info.offset.y < -100) onDrag(); // Arrastou mais de 100px para cima
    }}
    animate={{ scale: [1, 1.02, 1] }}
    transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
  />
);
6. UX WRITING (Português Premium)
Substituições obrigatórias em TODO o código:
❌ "Salvar" → ✅ "Consolidar" / "Commitar"
❌ "Copiar" → ✅ "Duplicar" / "Clonar"
❌ "Gerar" → ✅ "Sintetizar" / "Renderizar" / "Compor"
❌ "Excluir" → ✅ "Remover" / "Descartar"
❌ "Carregar" → ✅ "Importar" / "Processar"
❌ "Template" → ✅ "Matriz" / "Base Editorial"
❌ "Preview" → ✅ "Prévia ao Vivo" / "Render"
❌ "Upload" → ✅ "Importar Mídia"
Microcopy:
Empty states: "Seu acervo aguarda sua primeira obra-prima" (nunca "Nenhum item encontrado")
Loading: "Calibrando parâmetros visuais..." (nunca "Carregando...")
Sucesso: "Consolidado com sucesso" (nunca "Salvo!")
7. ANIMAÇÕES (Framer Motion)
Transições Obrigatórias:
Entrada de Cards: initial={{ opacity: 0, y: 20, scale: 0.95 }} → animate={{ opacity: 1, y: 0, scale: 1 }} com type: "spring", stiffness: 100, damping: 15
Hover em Cards: whileHover={{ y: -4, boxShadow: "0 25px 50px rgba(0,0,0,0.6)" }}
Arc Drawer: animate={{ height: isOpen ? "85vh" : "0" }} com transition={{ type: "spring", stiffness: 300, damping: 30 }}
Captain ↔ Architect: Layout animation com layout prop do Framer Motion para transições suaves de altura
8. CHECKLIST DE QUALIDADE (Revisar antes de entregar)
[ ] Fundo é #050505 ou #0a0b0f (nunca gray-900)?
[ ] Glassmorphism usa backdrop-filter: blur(20px) real?
[ ] Não existe bg-blue-600 ou bg-gray-800 do Tailwind padrão?
[ ] Botão primário é dourado (#d4af37) com texto escuro (#050505)?
[ ] Modo Architect tem indicador roxo (#6366f1)?
[ ] Sliders têm thumb dourado/borda brilhante?
[ ] Toggle Captain/Architect está presente em todas as 4 abas?
[ ] Mobile tem o Arc Trigger visível e pulsando sutilmente?
[ ] Todos os textos seguem o padrão "premium português" (nada de "Salvar/Copiar")?
[ ] Accordions no modo Architect expandem com animação suave?
9. ESTRUTURA DE ARQUIVOS SUGERIDA
plain
Copy
/app
  /components
    /ui
      GlassCard.tsx
      GlassButton.tsx
      PrecisionSlider.tsx
      ModeToggle.tsx
      ArcTrigger.tsx
      RadialMenu.tsx
    /layout
      TrinityLayout.tsx (Desktop)
      ArcDrawerLayout.tsx (Mobile)
    /tabs
      TextTab.tsx
      DesignTab.tsx
      ImageTab.tsx
      CompositionTab.tsx
  /hooks
    useControlMode.ts (Captain/Architect state)
    useArcDrawer.ts
  /styles
    globals.css (com as CSS variables)
10. ÚLTIMA INSTRUÇÃO
Este é um produto high-ticket. Se algum elemento parecer "bom o suficiente", faça-o 30% melhor. Adicione mais blur, mais brilho na borda, mais suavidade na transição. O usuário deve sentir que está usando algo que vale R$ 2.000/mês.
Execute cada componente como se fosse a peça central de um museu de design digital. Não economize em detalhes.
Resultado esperado: Uma interface que parece um híbrido entre Linear.app, Figma e um software de edição profissional da Adobe, com a inteligência do ChatGPT e o luxo de um produto Apple.