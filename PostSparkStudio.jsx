import { useState, useEffect } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';

const PostSparkStudio = () => {
  const [state, setState] = useState('empty'); // 'empty', 'generating', 'editing'
  const [prompt, setPrompt] = useState('');
  const [postType, setPostType] = useState('post'); // 'post' or 'carousel'
  const [showChips, setShowChips] = useState(false);
  const [particles, setParticles] = useState([]);

  const user = { name: "Alex" };

  // Handle inactivity timer for inspiration chips
  useEffect(() => {
    if (!prompt.trim()) {
      const timer = setTimeout(() => {
        setShowChips(true);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [prompt]);

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    if (prompt.trim()) {
      generatePost();
    }
  };

  // Generate post function
  const generatePost = () => {
    setState('generating');
    
    // Create particles for animation
    const newParticles = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      x: Math.random() * 100 - 50,
      y: 0,
    }));
    setParticles(newParticles);

    // Simulate generation delay
    setTimeout(() => {
      setState('editing');
    }, 1200);
  };

  // Spark particles animation
  const SparkParticle = ({ x, y }) => (
    <motion.div
      className="absolute w-1 h-1 rounded-full bg-[#FF8A3D]"
      initial={{ x, y: 0, opacity: 1 }}
      animate={{ x, y: -80, opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    />
  );

  // Icons as SVG components
  const UndoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );

  const RedoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </svg>
  );

  const TypographyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4h16v3" />
      <path d="M5 20h14" />
      <path d="M9 4v16" />
      <path d="M15 4v16" />
    </svg>
  );

  const DropletIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );

  const SparkIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );

  return (
    <>
      <Head>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600&display=swap" rel="stylesheet" />
      </Head>
      <div className="min-h-screen w-full flex items-center justify-center p-4" style={{ 
        backgroundColor: state === 'generating' ? '#0A0A0A' : '#0F0F0F',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        transition: 'background-color 0.3s ease'
      }}>
        <div className="w-full max-w-6xl mx-auto">
          {/* Empty State */}
          <AnimatePresence mode="wait">
            {state === 'empty' && (
              <motion.div
                key="empty"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                className="flex flex-col items-center justify-center min-h-[80vh]"
              >
                <motion.h1 
                  className="text-[40px] font-light text-[#E2E2E2] max-w-[600px] text-center mb-6"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  Olá, {user.name}. O que vamos criar hoje?
                </motion.h1>
                
                <form onSubmit={handleSubmit} className="w-full max-w-md">
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Descreva sua ideia em uma frase..."
                    className="w-full px-0 py-3 text-[#E2E2E2] placeholder-[#555] bg-transparent border-none border-b border-[#2A2A2A] focus:border-[#FF8A3D] outline-none transition-all duration-300 text-base"
                    style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  />
                </form>
                
                <div className="mt-4 flex space-x-2">
                  <button
                    onClick={() => setPostType('post')}
                    className={`px-4 py-2 rounded-full text-sm ${
                      postType === 'post' 
                        ? 'bg-[#FF8A3D] text-white' 
                        : 'bg-[#1E1E1E] text-[#8E8E93]'
                    }`}
                  >
                    Post
                  </button>
                  <button
                    onClick={() => setPostType('carousel')}
                    className={`px-4 py-2 rounded-full text-sm ${
                      postType === 'carousel' 
                        ? 'bg-[#FF8A3D] text-white' 
                        : 'bg-[#1E1E1E] text-[#8E8E93]'
                    }`}
                  >
                    Carrossel
                  </button>
                </div>
                
                <AnimatePresence>
                  {showChips && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-6 flex flex-wrap justify-center gap-2"
                    >
                      {['#motivação', '#lançamento', '#dica rápida', '#insight'].map((chip, index) => (
                        <button
                          key={index}
                          className="px-3 py-1.5 bg-[#1E1E1E] text-[#8E8E93] rounded-full text-sm hover:bg-[#252525] transition-colors"
                          onClick={() => setPrompt(chip)}
                        >
                          {chip}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Generating State */}
          <AnimatePresence mode="wait">
            {state === 'generating' && (
              <motion.div
                key="generating"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="relative flex flex-col items-center justify-center min-h-[80vh]"
              >
                <div className="relative w-16 h-16 flex items-center justify-center">
                  {particles.map(particle => (
                    <SparkParticle key={particle.id} x={particle.x} y={particle.y} />
                  ))}
                </div>
                <p className="mt-8 text-[#8E8E93] italic" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Transformando sua ideia...
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Editing State */}
          <AnimatePresence mode="wait">
            {state === 'editing' && (
              <motion.div
                key="editing"
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="flex flex-col items-center w-full"
              >
                {/* Post Canvas */}
                <div 
                  className="rounded-2xl overflow-hidden shadow-lg"
                  style={{
                    width: 'min(80vw, 600px)',
                    height: 'min(80vw, 600px)',
                    maxWidth: '600px',
                    maxHeight: '600px',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                  }}
                >
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center">
                    <h2 className="text-2xl font-semibold text-white mb-4" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      Título gerado pela IA
                    </h2>
                    <p className="text-lg text-white/90 mb-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      Corpo do texto com insights valiosos para seu público-alvo...
                    </p>
                    <button 
                      className="px-6 py-2 bg-white/20 backdrop-blur-sm rounded-full text-white border border-white/30 hover:bg-white/30 transition-colors"
                      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                    >
                      CTA aqui
                    </button>
                  </div>
                </div>

                {/* Editor Controls */}
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="mt-6 w-full max-w-2xl bg-[#141414] rounded-xl p-4"
                >
                  <div className="flex items-center justify-between overflow-x-auto pb-2">
                    <div className="flex space-x-3">
                      <button 
                        className="p-2 text-[#8E8E93] hover:text-[#E2E2E2] transition-colors"
                        aria-label="Undo"
                      >
                        <UndoIcon />
                      </button>
                      <button 
                        className="p-2 text-[#8E8E93] hover:text-[#E2E2E2] transition-colors"
                        aria-label="Redo"
                      >
                        <RedoIcon />
                      </button>
                      <button 
                        className="p-2 text-[#8E8E93] hover:text-[#E2E2E2] transition-colors"
                        aria-label="Typography"
                      >
                        <TypographyIcon />
                      </button>
                      <button 
                        className="p-2 text-[#8E8E93] hover:text-[#E2E2E2] transition-colors relative group"
                        aria-label="Colors"
                      >
                        <DropletIcon />
                        {/* Color swatches on hover */}
                        <div className="absolute hidden group-hover:flex -top-10 left-0 space-x-1">
                          <div className="w-6 h-6 rounded-full bg-[#FF8A3D]"></div>
                          <div className="w-6 h-6 rounded-full bg-[#9D4EDD]"></div>
                          <div className="w-6 h-6 rounded-full bg-[#34D399]"></div>
                        </div>
                      </button>
                    </div>
                    
                    <button 
                      className="p-2 bg-[#FF8A3D] rounded-lg hover:bg-[#e67a2d] transition-colors"
                      aria-label="Regenerate"
                      onClick={generatePost}
                    >
                      <SparkIcon />
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
};

export default PostSparkStudio;