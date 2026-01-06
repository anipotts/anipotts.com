"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export type WindowState = "open" | "collapsed" | "minimized" | "fullscreen";

interface WindowContextType {
  windowState: WindowState;
  setWindowState: (state: WindowState) => void;
  isOpen: boolean;
  isCollapsed: boolean;
  isMinimized: boolean;
  isFullscreen: boolean;
}

const WindowContext = createContext<WindowContextType | undefined>(undefined);

export function WindowProvider({ children }: { children: React.ReactNode }) {
  const [windowState, setWindowState] = useState<WindowState>("open");

  const isOpen = windowState === "open";
  const isCollapsed = windowState === "collapsed";
  const isMinimized = windowState === "minimized";
  const isFullscreen = windowState === "fullscreen";

  return (
    <WindowContext.Provider
      value={{
        windowState,
        setWindowState,
        isOpen,
        isCollapsed,
        isMinimized,
        isFullscreen,
      }}
    >
      {children}
    </WindowContext.Provider>
  );
}

export function useWindowState() {
  const context = useContext(WindowContext);
  if (context === undefined) {
    throw new Error("useWindowState must be used within a WindowProvider");
  }
  return context;
}
