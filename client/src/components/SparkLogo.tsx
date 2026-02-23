import { motion } from "framer-motion";

export default function SparkLogo({ size = 48 }: { size?: number }) {
  return (
    <motion.div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      whileHover={{ scale: 1.1 }}
    >
      <motion.img
        src="/favicon.png"
        alt="PostSpark Logo"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        animate={{
          filter: [
            "drop-shadow(0 0 8px rgba(255, 100, 50, 0.4))",
            "drop-shadow(0 0 16px rgba(255, 100, 50, 0.6))",
            "drop-shadow(0 0 8px rgba(255, 100, 50, 0.4))",
          ],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}
