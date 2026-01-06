"use client";

import React from "react";
import { useWindowState } from "@/context/WindowContext";

export default function WindowControls() {
  const { windowState, setWindowState } = useWindowState();

  const handleRedClick = () => {
    if (windowState === "fullscreen") {
      setWindowState("open"); // Exit fullscreen first
      setTimeout(() => setWindowState("collapsed"), 200); // Then collapse
    } else {
      setWindowState("collapsed");
    }
  };

  const handleYellowClick = () => {
    if (windowState === "fullscreen") {
      setWindowState("open"); // Exit fullscreen first
      setTimeout(() => setWindowState("minimized"), 200); // Then minimize
    } else {
      setWindowState("minimized");
    }
  };

  const handleGreenClick = () => {
    if (windowState === "fullscreen") {
      setWindowState("open");
    } else {
      setWindowState("fullscreen");
    }
  };

  return (
    <div className="flex gap-1.5 group">
      {/* Red - Collapse */}
      <button
        onClick={handleRedClick}
        className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50 hover:bg-red-500 hover:border-red-600 transition-all flex items-center justify-center"
        aria-label="Collapse"
      >
        <span className="opacity-0 group-hover:opacity-100 text-[8px] font-bold text-black/60 leading-none">×</span>
      </button>

      {/* Yellow - Minimize */}
      <button
        onClick={handleYellowClick}
        className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50 hover:bg-yellow-500 hover:border-yellow-600 transition-all flex items-center justify-center"
        aria-label="Minimize"
      >
        <span className="opacity-0 group-hover:opacity-100 text-[8px] font-bold text-black/60 leading-none">−</span>
      </button>

      {/* Green - Fullscreen */}
      <button
        onClick={handleGreenClick}
        className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50 hover:bg-green-500 hover:border-green-600 transition-all flex items-center justify-center"
        aria-label="Fullscreen"
      >
        <span className="opacity-0 group-hover:opacity-100 text-[6px] font-bold text-black/60 leading-none">
            {windowState === "fullscreen" ? "↙" : "↗"}
        </span>
      </button>
    </div>
  );
}
