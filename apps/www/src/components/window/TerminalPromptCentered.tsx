"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWindowState } from "@/context/WindowContext";

export default function TerminalPromptCentered() {
  const { isCollapsed, setWindowState } = useWindowState();
  const [isHovered, setIsHovered] = useState(false);

  // Handle "open" command
  useEffect(() => {
    if (!isCollapsed) return;

    let buffer = "";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (buffer.toLowerCase().trim() === "open") {
          setWindowState("open");
        }
        buffer = "";
      } else if (e.key.length === 1) {
        buffer += e.key;
        // Reset buffer if it gets too long or doesn't match prefix
        if (!"open".startsWith(buffer.toLowerCase())) {
           // Optional: keep buffer but maybe it's strict? 
           // Let's just keep it simple: if they type "open" + Enter anywhere, it works.
           // Actually, let's just reset if it's not matching to avoid weird states
           if (!"open".includes(buffer.toLowerCase())) {
             buffer = ""; 
           }
        }
      } else if (e.key === "Backspace") {
        buffer = buffer.slice(0, -1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCollapsed, setWindowState]);

  return (
    <AnimatePresence>
      {isCollapsed && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-0 z-50 flex hover:pointer-cursor items-center justify-center "
        >
          <button
            onClick={() => setWindowState("open")}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="pointer-events-auto group whitespace-nowrap relative flex items-center gap-3 px-6 py-3 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl hover:bg-black/90 hover:border-white/20 transition-all w-[80%] md:w-[350px] justify-center"
            aria-label="Reopen interface"
          >
            <div className="flex items-center gap-2 text-sm font-mono text-gray-400 group-hover:text-gray-200 transition-colors">
              <span className="text-green-500">ani@potts:~$</span>
              <span> tap to open</span>
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                className="w-1 h-4 bg-gray-400 block"
              />
            </div>
            
            {/* Hover Glow Effect */}
            <div className="absolute inset-0 rounded-full bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity blur-md -z-10" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
