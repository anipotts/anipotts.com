"use client";

import { motion } from "framer-motion";

interface CommandSectionProps {
  command: string;
  children: React.ReactNode;
  delay?: number;
}

export default function CommandSection({ command, children, delay = 0 }: CommandSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay }}
        className="flex items-center gap-2 text-sm font-mono text-gray-500 select-none"
      >
        <span className="text-accent-400">❯</span>
        <span className="text-gray-400">{command}</span>
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
          className="w-2 h-4 bg-gray-500 block"
        />
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: delay + 0.2 }}
        className="pl-4 md:pl-6 border-l border-white/5"
      >
        {children}
      </motion.div>
    </div>
  );
}
