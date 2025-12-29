"use client";

import { useState, useEffect, useRef } from "react";
import { usePostHog } from "posthog-js/react";
import { motion, AnimatePresence } from "framer-motion";

type Stats = {
  yourNumber: number;
  totalResponses: number;
  topNumbers: { number: number; count: number; percent: number }[];
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function AsciiBar({ percent }: { percent: number }) {
  const maxWidth = 12;
  const filled = Math.round((percent / 100) * maxWidth);
  const empty = maxWidth - filled;
  return (
    <span className="font-mono">
      <span className="text-accent-400">{"█".repeat(filled)}</span>
      <span className="text-gray-700">{"░".repeat(empty)}</span>
    </span>
  );
}

export default function FavoriteNumberSecret({ isOpen, onClose }: Props) {
  const posthog = usePostHog();
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const openTimeRef = useRef<number>(0);

  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [number, setNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  // Check localStorage for previous submission
  useEffect(() => {
    const savedStats = localStorage.getItem("favoriteNumberStats");
    if (savedStats) {
      try {
        setStats(JSON.parse(savedStats));
        setHasSubmitted(true);
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && !hasSubmitted) {
      openTimeRef.current = Date.now();
      setTimeout(() => inputRef.current?.focus(), 100);
      posthog.capture("favorite_number_triggered", {
        trigger_method: "unknown",
        viewport_width: typeof window !== "undefined" ? window.innerWidth : 0,
      });
    }
  }, [isOpen, hasSubmitted, posthog]);

  // Handle ESC key and click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
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

  // Track dismissal
  useEffect(() => {
    if (!isOpen && openTimeRef.current > 0) {
      posthog.capture("favorite_number_dismissed", {
        had_submitted: hasSubmitted,
        time_open_ms: Date.now() - openTimeRef.current,
      });
      openTimeRef.current = 0;
    }
  }, [isOpen, hasSubmitted, posthog]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!number) return;

    const numVal = parseInt(number, 10);
    if (isNaN(numVal)) {
      setError("integers only.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/favorite-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: numVal }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit");
      }

      const data: Stats = await res.json();
      setStats(data);
      setHasSubmitted(true);
      localStorage.setItem("favoriteNumberStats", JSON.stringify(data));

      posthog.capture("favorite_number_submitted", {
        number: numVal,
        total_responses: data.totalResponses,
        is_mobile: typeof window !== "undefined" && window.innerWidth < 768,
      });
    } catch {
      setError("something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={modalRef}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute bottom-full left-0 right-0 mb-2 mx-4 md:mx-0 md:left-4 md:right-auto md:w-80 z-50 bg-black backdrop-blur-sm border border-white/10 rounded-md shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/5">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
              secret
            </span>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
              aria-label="Close"
            >
              [×]
            </button>
          </div>

          {/* Content */}
          <div className="p-4">
            <AnimatePresence mode="wait">
              {!hasSubmitted ? (
                <motion.div
                  key="input"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-3"
                >
                  <p className="text-sm text-gray-400 leading-relaxed">
                    <span className="text-accent-400">&gt;</span> what's your
                    favorite number?
                  </p>
                  <p className="text-xs text-gray-500 -mt-1">mine's 15.</p>

                  <form onSubmit={handleSubmit} className="flex gap-2 mt-1">
                    <div className="flex-1 flex items-center gap-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 focus-within:border-accent-400/50 transition-colors">
                      <span className="text-accent-400 text-sm">&gt;</span>
                      <input
                        ref={inputRef}
                        type="number"
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        className="flex-1 bg-transparent text-sm text-gray-200 outline-none placeholder:text-gray-600 w-full"
                        placeholder="_"
                        disabled={loading}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading || !number}
                      className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 text-gray-400 hover:text-accent-400 hover:border-accent-400/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? "..." : "enter"}
                    </button>
                  </form>
                  {error && (
                    <p className="text-red-400 text-xs mt-1">{error}</p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="stats"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-1">
                    <p className="text-sm text-gray-300">
                      nice. you picked{" "}
                      <span className="text-accent-400 font-medium">
                        {stats?.yourNumber}
                      </span>
                      .
                    </p>
                    <p className="text-xs text-gray-500">
                      1 of {stats?.totalResponses?.toLocaleString()} answers
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5 mt-2">
                    {stats?.topNumbers.slice(0, 5).map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs font-mono"
                      >
                        <span className="w-6 text-right text-gray-500">
                          {item.number}
                        </span>
                        <AsciiBar percent={item.percent} />
                        <span className="text-gray-500 w-8">
                          {Math.round(item.percent)}%
                        </span>
                      </div>
                    ))}
                    {/* Show "other" if remaining percentage is significant */}
                    {(() => {
                      const sum =
                        stats?.topNumbers
                          .slice(0, 5)
                          .reduce((acc, curr) => acc + curr.percent, 0) || 0;
                      const other = 100 - sum;
                      if (other > 2) {
                        return (
                          <div className="flex items-center gap-2 text-xs font-mono">
                            <span className="w-6 text-right text-gray-600">
                              ..
                            </span>
                            <AsciiBar percent={other} />
                            <span className="text-gray-600 w-8">
                              {Math.round(other)}%
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
