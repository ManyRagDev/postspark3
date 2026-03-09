import { motion, AnimatePresence } from "framer-motion";
import { LogIn } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

interface AuthGateProps {
  onLogin: () => void;
}

export default function AuthGate({ onLogin }: AuthGateProps) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return null;
  }

  return (
    <motion.div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
    >
      <AnimatePresence mode="wait">
        <motion.button
          key="login-btn"
          onClick={onLogin}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="flex items-center gap-2.5 px-6 py-3 rounded-full text-sm font-semibold transition-all group"
          style={{
            background: "oklch(0.12 0.03 280)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid oklch(0.7 0.22 40 / 30%)",
            color: "oklch(0.9 0.01 280)",
            boxShadow: "0 0 20px oklch(0.7 0.22 40 / 15%), 0 4px 24px oklch(0 0 0 / 40%)",
          }}
          whileHover={{ scale: 1.05, boxShadow: "0 0 30px oklch(0.7 0.22 40 / 25%), 0 4px 30px oklch(0 0 0 / 50%)" }}
          whileTap={{ scale: 0.95 }}
        >
          <LogIn size={16} className="text-[oklch(0.7_0.22_40)] group-hover:scale-110 transition-transform" />
          <span>Entrar para criar posts</span>
        </motion.button>
      </AnimatePresence>
    </motion.div>
  );
}
