import { motion } from "framer-motion";
import { getLoginUrl } from "@/const";
import { LogIn } from "lucide-react";

export default function AuthGate() {
  return (
    <motion.div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
    >
      <motion.a
        href={getLoginUrl()}
        className="flex items-center gap-2.5 px-6 py-3 rounded-full text-sm font-semibold transition-all"
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
        <LogIn size={16} style={{ color: "oklch(0.7 0.22 40)" }} />
        <span>Entrar para criar posts</span>
      </motion.a>
    </motion.div>
  );
}
