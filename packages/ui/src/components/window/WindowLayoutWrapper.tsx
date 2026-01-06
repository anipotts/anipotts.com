"use client";

import React, { useEffect } from "react";
import { useWindowState } from "../../context/WindowContext";
import clsx from "clsx";

export interface WindowLayoutWrapperProps {
  children: React.ReactNode;
}

export function WindowLayoutWrapper({ children }: WindowLayoutWrapperProps) {
  const { isFullscreen } = useWindowState();

  // Scroll locking when fullscreen
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isFullscreen]);

  return (
    <div
      className={clsx(
        "w-full flex justify-center items-start md:items-center transition-[padding]",
        isFullscreen
          ? "h-[100dvh] p-0 duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          : "min-h-screen p-2 md:p-8 lg:p-16 duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
      )}
    >
      {children}
    </div>
  );
}
