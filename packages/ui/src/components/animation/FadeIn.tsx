"use client";

import React from "react";
import { motion } from "framer-motion";

export interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  /** Animation direction: 'up' (default), 'down', 'left', 'right', or 'none' */
  direction?: "up" | "down" | "left" | "right" | "none";
  /** Animation distance in pixels */
  distance?: number;
}

export function FadeIn({
  children,
  delay = 0,
  className,
  direction = "up",
  distance = 20,
}: FadeInProps) {
  const getInitialPosition = () => {
    switch (direction) {
      case "up":
        return { x: 0, y: distance };
      case "down":
        return { x: 0, y: -distance };
      case "left":
        return { x: distance, y: 0 };
      case "right":
        return { x: -distance, y: 0 };
      case "none":
        return { x: 0, y: 0 };
    }
  };

  const initial = getInitialPosition();

  return (
    <motion.div
      initial={{ opacity: 0, ...initial }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
