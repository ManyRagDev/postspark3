import { motion, AnimatePresence } from "framer-motion";
import { LogIn, LogOut, User } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

interface AuthGateProps {
  onLogin: () => void;
}

export default function AuthGate({ onLogin }: AuthGateProps) {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <motion.div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
    >
      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
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
        ) : (
          <motion.div
            key="user-profile"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-3 px-5 py-2.5 rounded-full text-sm font-medium border"
            style={{
              background: "oklch(0.12 0.03 280 / 80%)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderColor: "oklch(0.7 0.22 40 / 20%)",
              color: "oklch(0.9 0.01 280)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            <div className="flex items-center gap-2 pr-3 border-r border-white/10">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#6d28d9] to-[#db2777] flex items-center justify-center border border-white/20">
                <User size={14} className="text-white" />
              </div>
              <span className="max-w-[120px] truncate">{user?.name || user?.email}</span>
            </div>

            <button
              onClick={() => logout()}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors group"
              title="Sair"
            >
              <LogOut size={16} className="text-white/40 group-hover:text-red-400 transition-colors" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
