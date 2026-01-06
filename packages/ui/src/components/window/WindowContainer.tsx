"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWindowState } from "../../context/WindowContext";
import clsx from "clsx";

export interface WindowContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function WindowContainer({ children, className }: WindowContainerProps) {
  const { windowState, isFullscreen } = useWindowState();

  const variants = {
    open: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 300,
        damping: 30,
        mass: 1,
      },
    },
    collapsed: {
      opacity: 0,
      scale: 0.97,
      y: 8,
      transition: { duration: 0.18, ease: "easeOut" as const },
    },
    minimized: {
      opacity: 0,
      scale: 0.9,
      y: 20,
      transition: { duration: 0.15, ease: "easeOut" as const },
    },
    fullscreen: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: 0.24,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    },
  };

  return (
    <>
      {/* Background Dim Overlay (Collapsed State) */}
      <AnimatePresence>
        {windowState === "collapsed" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Main Window */}
      <motion.div
        variants={variants}
        initial="open"
        animate={windowState}
        className={clsx(
          "bg-[#0a0a0a] border border-white/10 shadow-2xl flex flex-col relative overflow-hidden ring-1 ring-white/5 transition-[border-radius,border-width,box-shadow,max-width] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          !isFullscreen && "w-full max-w-4xl rounded-lg",
          isFullscreen && "w-full h-full max-w-[100vw] rounded-none border-0 ring-0",
          className
        )}
        style={{
          transformOrigin: isFullscreen ? "center" : "top center",
        }}
      >
        {children}
      </motion.div>
    </>
  );
}
