import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, Wand2, X, ChevronLeft, ChevronRight } from 'lucide-react';

// --- DUMMY DATA ---
const dummyPosts = [
  {
    id: 1,
    category: 'Lançamento',
    title: 'A Gênese do Luxo',
    description: 'Campanha de alto valor para infoprodutos.',
    gradient: 'from-purple-900/80 via-black to-[#050505]',
    accent: '#00f5ff',
  },
  {
    id: 2,
    category: 'Autoridade',
    title: 'Métrica Implacável',
    description: 'Design focado em conversão e dados.',
    gradient: 'from-[#00f5ff]/20 via-[#0a0b0f] to-black',
    accent: '#00f5ff',
  },
  {
    id: 3,
    category: 'Premium',
    title: 'Aura High-Ticket',
    description: 'Estética refinada para mentorias exclusivas.',
    gradient: 'from-[#d4af37]/30 via-black to-[#050505]',
    accent: '#d4af37',
  },
  {
    id: 4,
    category: 'Engajamento',
    title: 'Imersão Profunda',
    description: 'Carrosséis que retêm a atenção até o fim.',
    gradient: 'from-blue-900/40 via-black to-[#0a0b0f]',
    accent: '#00f5ff',
  },
  {
    id: 5,
    category: 'Lifestyle',
    title: 'Poder Silencioso',
    description: 'Comunicação sutil, resultados estrondosos.',
    gradient: 'from-emerald-900/30 via-black to-[#050505]',
    accent: '#d4af37',
  },
  {
    id: 6,
    category: 'Vendas',
    title: 'Conversão Pura',
    description: 'O design invisível que faz o cliente comprar.',
    gradient: 'from-rose-900/30 via-black to-[#0a0b0f]',
    accent: '#00f5ff',
  },
  {
    id: 7,
    category: 'Exclusividade',
    title: 'Clube Fechado',
    description: 'Apenas para quem entende o valor real do tempo.',
    gradient: 'from-indigo-900/40 via-black to-[#050505]',
    accent: '#d4af37',
  },
  {
    id: 8,
    category: 'Impacto',
    title: 'Disrupção Visual',
    description: 'Quebrando padrões para capturar a atenção.',
    gradient: 'from-cyan-900/30 via-black to-[#0a0b0f]',
    accent: '#00f5ff',
  },
  {
    id: 9,
    category: 'Storytelling',
    title: 'A Jornada do Herói',
    description: 'Narrativas visuais que conectam e convertem.',
    gradient: 'from-amber-900/30 via-black to-[#050505]',
    accent: '#d4af37',
  },
  {
    id: 10,
    category: 'Escala',
    title: 'Domínio de Mercado',
    description: 'Design pensado para tráfego em grande volume.',
    gradient: 'from-fuchsia-900/30 via-black to-[#0a0b0f]',
    accent: '#00f5ff',
  }
];

export default function App() {
  const [currentIndex, setCurrentIndex] = useState(4);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [hoverRot, setHoverRot] = useState({ x: 0, y: 0 }); // Novo estado para Parallax 3D

  // Lógica do Carrossel 3D
  const getCardStyles = (index) => {
    const offset = index - currentIndex;
    const absOffset = Math.abs(offset);

    // Configurações base para o card central
    let scale = 1;
    let x = '0%';
    let z = 0;
    let rotateY = 0;
    let opacity = 1;
    let zIndex = 10;
    let brightness = 1;
    let pointerEvents = 'auto';

    if (offset !== 0) {
      if (absOffset > 2) {
        // Esconde cards fora do espectro de 5 visíveis
        opacity = 0;
        pointerEvents = 'none';
      } else {
        // Efeito de Cover Flow para 5 cards
        scale = 1 - absOffset * 0.15; // 0.85, 0.70
        z = -absOffset * 100; // -100, -200
        zIndex = 10 - absOffset; // 9, 8
        opacity = 1 - absOffset * 0.25; // 0.75, 0.50
        brightness = 1 - absOffset * 0.3; // 0.7, 0.4
        
        // Rotação Y e Posicionamento X baseado na direção
        if (offset < 0) {
          rotateY = 20 + absOffset * 10; // 30, 40
          x = `calc(-${45 + absOffset * 35}%)`; // -80%, -115%
        } else {
          rotateY = -(20 + absOffset * 10); // -30, -40
          x = `calc(${45 + absOffset * 35}%)`; // 80%, 115%
        }
      }
    }

    return {
      x,
      z,
      scale,
      rotateY,
      opacity,
      zIndex,
      pointerEvents,
      filter: `brightness(${brightness})`,
    };
  };

  const handleDragEnd = (event, info) => {
    const swipeThreshold = 50;
    const velocityThreshold = 400; // Gatilho de inércia para o efeito "jogar"
    
    const isLeftSwipe = info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold;
    const isRightSwipe = info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold;

    if (isLeftSwipe && currentIndex < dummyPosts.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleSynthesize = (e) => {
    e.preventDefault();
    if (inputValue.trim() !== '') {
      setIsModalOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#050505] to-[#0a0b0f] text-white font-sans overflow-hidden relative flex flex-col items-center justify-between selection:bg-[#00f5ff] selection:text-black">
      
      {/* Elementos Atmosféricos (Glows e Blur) */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-[#00f5ff]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-[#d4af37]/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-8 flex justify-between items-center z-20 relative">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-[#00f5ff]" />
          <span className="text-xl font-bold tracking-tight text-white/90">PostSpark</span>
        </div>
        <div className="text-sm font-medium tracking-widest text-[#d4af37] uppercase opacity-80 border border-[#d4af37]/20 px-4 py-1.5 rounded-full bg-[#d4af37]/5">
          Vitrine Viva
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full flex flex-col items-center justify-center relative z-10 w-full max-w-[100vw]">
        
        {/* Título de Impacto (Apenas para contexto visual acima do carrossel) */}
        <div className="text-center mb-8 px-4">
          <h1 className="text-3xl md:text-5xl font-light tracking-tight text-white/90 mb-2">
            O Sistema Operacional de <br className="hidden md:block"/>
            <span className="font-semibold bg-clip-text text-transparent bg-gradient-to-r from-white via-[#00f5ff] to-white">Design High-Ticket</span>
          </h1>
          <p className="text-sm md:text-base text-white/40 font-light">
            Deslize para explorar a capacidade do nosso motor visual.
          </p>
        </div>

        {/* CARROSSEL 3D COVER FLOW */}
        <div 
          className="relative w-full max-w-6xl mx-auto h-[400px] md:h-[500px] flex items-center justify-center mb-12"
          style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
        >
          {/* Seta de Navegação - Esquerda */}
          <button
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="absolute left-4 md:left-12 z-40 p-3 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-white/50 transition-all duration-300 hover:bg-white/10 hover:text-white hover:scale-110 active:scale-95 disabled:opacity-0 disabled:pointer-events-none shadow-[0_0_20px_rgba(0,0,0,0.5)]"
          >
            <ChevronLeft className="w-6 h-6 md:w-8 md:h-8" />
          </button>

          {dummyPosts.map((post, index) => {
            const styles = getCardStyles(index);
            const isCenter = index === currentIndex;

            return (
              <motion.div
                key={post.id}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.6}
                onDragEnd={handleDragEnd}
                onMouseMove={(e) => {
                  if (!isCenter) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  const centerX = rect.width / 2;
                  const centerY = rect.height / 2;
                  
                  // Limita a rotação máxima a 15 graus com base na posição do cursor
                  const rotX = ((y - centerY) / centerY) * -15; 
                  const rotY = ((x - centerX) / centerX) * 15;
                  
                  setHoverRot({ x: rotX, y: rotY });
                }}
                onMouseLeave={() => {
                  if (isCenter) setHoverRot({ x: 0, y: 0 }); // Retorna suavemente
                }}
                onTap={() => {
                  if (currentIndex !== index) setCurrentIndex(index);
                }}
                initial={false}
                animate={{
                  x: styles.x,
                  z: styles.z,
                  scale: styles.scale,
                  rotateX: isCenter ? hoverRot.x : 0, // Aplica Parallax X
                  rotateY: isCenter ? hoverRot.y : styles.rotateY, // Aplica Parallax Y
                  opacity: styles.opacity,
                  zIndex: styles.zIndex,
                  filter: styles.filter,
                }}
                transition={{
                  type: 'spring',
                  stiffness: 150,
                  damping: 22,
                  mass: 0.8,
                }}
                className={`absolute w-[280px] h-[380px] md:w-[320px] md:h-[440px] rounded-2xl cursor-grab active:cursor-grabbing overflow-hidden shadow-2xl ${
                  isCenter ? 'border border-[#00f5ff]/30 shadow-[0_0_40px_rgba(0,245,255,0.1)]' : 'border border-white/5'
                }`}
                style={{
                  transformStyle: 'preserve-3d',
                  pointerEvents: styles.pointerEvents,
                }}
              >
                {/* Background da Imagem Gerada (Gradiente Simulado) */}
                <div className={`absolute inset-0 bg-gradient-to-b ${post.gradient} z-0`} />
                
                {/* Glass Overlay Interno */}
                <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] z-10" />

                {/* Conteúdo do Card */}
                <div className="absolute inset-0 z-20 p-6 flex flex-col justify-end">
                  <div className="translate-z-12">
                    <span 
                      className="text-xs font-bold uppercase tracking-wider mb-2 block"
                      style={{ color: post.accent }}
                    >
                      {post.category}
                    </span>
                    <h3 className="text-2xl font-semibold mb-2 text-white/95 leading-tight">
                      {post.title}
                    </h3>
                    <p className="text-sm text-white/60 font-light line-clamp-2">
                      {post.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {/* Seta de Navegação - Direita */}
          <button
            onClick={() => setCurrentIndex((prev) => Math.min(dummyPosts.length - 1, prev + 1))}
            disabled={currentIndex === dummyPosts.length - 1}
            className="absolute right-4 md:right-12 z-40 p-3 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-white/50 transition-all duration-300 hover:bg-white/10 hover:text-white hover:scale-110 active:scale-95 disabled:opacity-0 disabled:pointer-events-none shadow-[0_0_20px_rgba(0,0,0,0.5)]"
          >
            <ChevronRight className="w-6 h-6 md:w-8 md:h-8" />
          </button>
        </div>

        {/* GANCHO DE CONVERSÃO (Bottom) */}
        <div className="w-full max-w-2xl px-6 pb-12 relative z-30">
          <form 
            onSubmit={handleSynthesize}
            className="flex flex-col sm:flex-row gap-4 p-2 bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all duration-300 focus-within:border-[#00f5ff]/30 focus-within:bg-white/[0.05]"
          >
            <div className="flex-1 flex items-center px-4 py-2">
              <Wand2 className="w-5 h-5 text-white/30 mr-3" />
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Qual ideia vamos renderizar hoje?"
                className="w-full bg-transparent border-none outline-none text-white/90 placeholder-white/30 text-lg font-light"
                required
              />
            </div>
            <button
              type="submit"
              className="group relative px-8 py-4 sm:py-0 bg-gradient-to-r from-[#d4af37] to-[#b39020] text-black font-semibold rounded-xl overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(212,175,55,0.3)] hover:shadow-[0_0_30px_rgba(212,175,55,0.5)]"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
              <span className="relative flex items-center gap-2">
                Sintetizar
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          </form>
        </div>
      </main>

      {/* MODAL DE CONVERSÃO (Heavy Glassmorphism) */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            {/* Backdrop Blur Pesado */}
            <motion.div 
              initial={{ backdropFilter: 'blur(0px)' }}
              animate={{ backdropFilter: 'blur(20px)' }}
              exit={{ backdropFilter: 'blur(0px)' }}
              className="absolute inset-0 bg-black/60"
              onClick={() => setIsModalOpen(false)}
            />

            {/* Modal Content */}
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="relative w-full max-w-md bg-[#0a0b0f]/80 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden"
            >
              {/* Luz de fundo do modal */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-[#00f5ff]/20 rounded-full blur-[60px]" />

              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="relative z-10 flex flex-col items-center text-center mt-4">
                <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(0,245,255,0.1)]">
                  <Sparkles className="w-8 h-8 text-[#00f5ff]" />
                </div>
                
                <h2 className="text-2xl font-medium text-white/95 mb-3">
                  A mágica está pronta.
                </h2>
                
                <p className="text-white/60 font-light leading-relaxed mb-8">
                  Sua ideia <span className="text-[#00f5ff]">"{inputValue}"</span> está pronta para o nosso motor visual. Identifique-se para renderizar em altíssima resolução.
                </p>

                {/* Botão Fake Google Login */}
                <button 
                  onClick={() => alert('Simulação de Redirecionamento de Auth')}
                  className="w-full relative px-6 py-4 bg-white text-black font-medium rounded-xl flex items-center justify-center gap-3 hover:bg-white/90 transition-colors shadow-lg"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    <path fill="none" d="M1 1h22v22H1z" />
                  </svg>
                  Continuar com Google
                </button>

                <p className="mt-6 text-xs text-white/30 font-light">
                  Sem cartão de crédito. Renderização gratuita inicial.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}