"use client";

import { useEffect, useState, useCallback } from "react";

export function useSecretCode(code: string, onTrigger: () => void) {
  const [buffer, setBuffer] = useState("");

  const handleTrigger = useCallback(() => {
    onTrigger();
  }, [onTrigger]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs or textareas
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Only listen for numeric keys
      if (e.key.length === 1 && /[0-9]/.test(e.key)) {
        setBuffer((prev) => {
          const next = prev + e.key;
          // Keep only last N characters where N is code length
          const trimmed = next.slice(-code.length);

          if (trimmed === code) {
            handleTrigger();
            return "";
          }
          return trimmed;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [code, handleTrigger]);

  // Clear buffer after 2 seconds of inactivity
  useEffect(() => {
    if (!buffer) return;
    const timeout = setTimeout(() => setBuffer(""), 2000);
    return () => clearTimeout(timeout);
  }, [buffer]);
}
