"use client";

import { useState, useCallback } from "react";
import { featureFlags } from "@/lib/featureFlags";
import { useSecretCode } from "@/hooks/useSecretCode";
import FavoriteNumberSecret from "@/components/FavoriteNumberSecret";
import FileBrowser from "@/components/FileBrowser";
import SystemMonitor from "@/components/SystemMonitor";

export default function TerminalStatusBar() {
  const [isSecretOpen, setIsSecretOpen] = useState(false);
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);
  const [isMonitorOpen, setIsMonitorOpen] = useState(false);

  const handleSecretTrigger = useCallback(() => {
    if (featureFlags.favoriteNumber) {
      setIsSecretOpen(true);
    }
  }, []);

  const handleFileBrowserToggle = useCallback(() => {
    if (featureFlags.fileBrowser) {
      setIsFileBrowserOpen((prev) => !prev);
    }
  }, []);

  const handleMonitorToggle = useCallback(() => {
    if (featureFlags.systemMonitor) {
      setIsMonitorOpen((prev) => !prev);
    }
  }, []);

  // Listen for "15" typed anywhere on the page
  useSecretCode("15", handleSecretTrigger);

  return (
    <div className="relative border-t border-white/10 bg-white/5 px-4 py-1.5 flex justify-between items-center text-[10px] font-mono text-gray-500 select-none">
      {/* Left side */}
      <div className="flex gap-4">
        {featureFlags.favoriteNumber ? (
          <button
            onClick={handleSecretTrigger}
            className="hover:text-accent-400 transition-colors cursor-pointer"
            aria-label="Open secret"
          >
            {isSecretOpen ? "INPUT" : "NORMAL"}
          </button>
        ) : (
          <span>NORMAL</span>
        )}
        <span>main</span>
        <span>utf-8</span>
      </div>

      {/* Right side */}
      <div className="flex gap-4">
        {featureFlags.systemMonitor ? (
          <button
            onClick={handleMonitorToggle}
            className="hover:text-accent-400 transition-colors cursor-pointer"
            aria-label="Open system monitor"
          >
            100%
          </button>
        ) : (
          <span>100%</span>
        )}
        {featureFlags.fileBrowser ? (
          <button
            onClick={handleFileBrowserToggle}
            className="hover:text-accent-400 transition-colors cursor-pointer"
            aria-label="Open file browser"
          >
            ln 1, col 1
          </button>
        ) : (
          <span>ln 1, col 1</span>
        )}
      </div>

      {/* Modals */}
      {featureFlags.favoriteNumber && (
        <FavoriteNumberSecret
          isOpen={isSecretOpen}
          onClose={() => setIsSecretOpen(false)}
        />
      )}
      {featureFlags.fileBrowser && (
        <FileBrowser
          isOpen={isFileBrowserOpen}
          onClose={() => setIsFileBrowserOpen(false)}
        />
      )}
      {featureFlags.systemMonitor && (
        <SystemMonitor
          isOpen={isMonitorOpen}
          onClose={() => setIsMonitorOpen(false)}
        />
      )}
    </div>
  );
}
