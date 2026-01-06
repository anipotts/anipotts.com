"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWindowState } from "@/context/WindowContext";

export default function MinimizedPill() {
  const { isMinimized, setWindowState } = useWindowState();

  return (
    <AnimatePresence>
      {isMinimized && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed bottom-6 right-6 md:left-6 md:right-auto z-50"
        >
          <button
            onClick={() => setWindowState("open")}
            className="group flex items-center gap-2 px-4 py-2 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg shadow-lg hover:bg-black/90 hover:border-white/20 transition-all"
          >
            <div className="w-2 h-2 rounded-full bg-yellow-500/50 group-hover:bg-yellow-500 transition-colors" />
            <span className="text-xs font-mono text-gray-400 group-hover:text-gray-200 transition-colors">
              [ ani potts — minimized ]
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
