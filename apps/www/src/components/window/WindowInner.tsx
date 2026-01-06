"use client";

import React from "react";
import { useWindowState } from "@/context/WindowContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import clsx from "clsx";

export default function WindowInner({ children }: { children: React.ReactNode }) {
  const { isFullscreen } = useWindowState();

  return (
    <div className={clsx("px-6 md:px-12 lg:px-16 flex flex-col flex-grow overflow-y-auto overscroll-y-none min-h-0 bg-black/40 relative transition-all duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent", !isFullscreen && "min-h-[calc(100vh-8rem)]")}>
      
      <div className={clsx("w-full mx-auto transition-[max-width] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col flex-grow", isFullscreen ? "max-w-4xl" : "max-w-full")}>
        {/* Navbar as Command Row */}
        <div className={clsx("relative z-10 transition-all duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]", isFullscreen ? "translate-y-0" : "translate-y-0")}>
          <Navbar />
        </div>

        {/* Main Content Area */}
        <main className="flex-grow w-full relative z-10 transition-all duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
          {children}
        </main>

        {/* Footer as System Status */}
        <div className={clsx("relative z-10 mt-auto pt-12 transition-all duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]", isFullscreen ? "translate-y-0" : "translate-y-0")}>
          <Footer />
        </div>
      </div>

      {/* Subtle Grid Overlay inside terminal body */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-50" />
    </div>
  );
}
