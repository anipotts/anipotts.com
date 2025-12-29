"use client";

import { useEffect, useRef, useState } from "react";
import { usePostHog } from "posthog-js/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useActivityTracker,
  type ActivityMetrics,
} from "@/hooks/useActivityTracker";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function AsciiBar({
  value,
  maxValue = 100,
  width = 16,
}: {
  value: number;
  maxValue?: number;
  width?: number;
}) {
  const percent = Math.min(value / maxValue, 1);
  const filled = Math.round(percent * width);
  const empty = width - filled;

  return (
    <span className="font-mono">
      <span className="text-accent-400">{"█".repeat(filled)}</span>
      <span className="text-gray-700">{"░".repeat(empty)}</span>
    </span>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function SystemMonitor({ isOpen, onClose }: Props) {
  const posthog = usePostHog();
  const modalRef = useRef<HTMLDivElement>(null);
  const openTimeRef = useRef<number>(0);
  const { metrics } = useActivityTracker();

  // Animate metrics for visual effect
  const [displayMetrics, setDisplayMetrics] = useState({
    cpu: 0,
    mem: 0,
    net: 0,
    disk: 0,
  });

  // Calculate derived metrics
  const totalPages = 4; // index, work, thoughts, connect
  const maxTime = 300; // 5 minutes

  useEffect(() => {
    if (isOpen) {
      openTimeRef.current = Date.now();
      posthog.capture("system_monitor_opened");
    } else if (openTimeRef.current > 0) {
      posthog.capture("system_monitor_closed", {
        time_open_ms: Date.now() - openTimeRef.current,
      });
      openTimeRef.current = 0;
    }
  }, [isOpen, posthog]);

  // Smooth animation of metrics
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      const cpu = metrics.scrollSpeed;
      const mem = Math.min(
        (metrics.pagesVisited.length / totalPages) * 100,
        100
      );
      const net = Math.min((metrics.timeOnSite / maxTime) * 100, 100);
      const disk = Math.min(metrics.projectsExpanded * 20, 100); // 5 projects = 100%

      setDisplayMetrics((prev) => ({
        cpu: prev.cpu + (cpu - prev.cpu) * 0.3,
        mem: prev.mem + (mem - prev.mem) * 0.3,
        net: prev.net + (net - prev.net) * 0.3,
        disk: prev.disk + (disk - prev.disk) * 0.3,
      }));
    }, 100);

    return () => clearInterval(interval);
  }, [isOpen, metrics]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEsc);
    window.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleEsc);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Sort pages by time spent
  const sortedPages = [...metrics.pagesVisited].sort(
    (a, b) => b.totalTime - a.totalTime
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={modalRef}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute bottom-full right-0 mb-2 mx-4 md:mx-0 md:right-4 md:left-auto md:w-80 z-50 bg-black border border-white/10 rounded-md shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/5">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-mono">
              system monitor
            </span>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
              aria-label="Close"
            >
              [×]
            </button>
          </div>

          {/* Metrics */}
          <div className="p-3 font-mono text-[10px] space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 w-8">CPU</span>
              <AsciiBar value={displayMetrics.cpu} />
              <span className="text-gray-500 w-8 text-right">
                {Math.round(displayMetrics.cpu)}%
              </span>
              <span className="text-gray-600 text-[9px]">scroll</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 w-8">MEM</span>
              <AsciiBar value={displayMetrics.mem} />
              <span className="text-gray-500 w-8 text-right">
                {Math.round(displayMetrics.mem)}%
              </span>
              <span className="text-gray-600 text-[9px]">pages</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 w-8">NET</span>
              <AsciiBar value={displayMetrics.net} />
              <span className="text-gray-500 w-8 text-right">
                {Math.round(displayMetrics.net)}%
              </span>
              <span className="text-gray-600 text-[9px]">time</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 w-8">DISK</span>
              <AsciiBar value={displayMetrics.disk} />
              <span className="text-gray-500 w-8 text-right">
                {Math.round(displayMetrics.disk)}%
              </span>
              <span className="text-gray-600 text-[9px]">projects</span>
            </div>
          </div>

          {/* Process List */}
          {sortedPages.length > 0 && (
            <>
              <div className="border-t border-white/5 px-3 py-1.5">
                <div className="font-mono text-[9px] text-gray-600 flex">
                  <span className="w-8">PID</span>
                  <span className="flex-1">COMMAND</span>
                  <span className="w-12 text-right">TIME</span>
                </div>
              </div>
              <div className="px-3 pb-3 font-mono text-[10px] space-y-0.5 max-h-24 overflow-y-auto">
                {sortedPages.slice(0, 5).map((page, i) => (
                  <div
                    key={page.path}
                    className={`flex ${page.path === metrics.currentPage ? "text-accent-400" : "text-gray-400"}`}
                  >
                    <span className="w-8 text-gray-600">
                      {String(i + 1).padStart(3, "0")}
                    </span>
                    <span className="flex-1 truncate">view_{page.name}</span>
                    <span className="w-12 text-right text-gray-500">
                      {formatTime(Math.floor(page.totalTime / 1000))}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="border-t border-white/5 px-3 py-1.5 text-[9px] text-gray-600 font-mono flex justify-between">
            <span>uptime: {formatTime(metrics.timeOnSite)}</span>
            <span>{metrics.pagesVisited.length} processes</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
