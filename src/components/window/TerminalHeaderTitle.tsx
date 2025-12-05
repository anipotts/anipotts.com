"use client";

import { useState, useEffect } from "react";

export default function TerminalHeaderTitle() {
  const text = "ani@potts:~/anipotts.com";
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.substring(0, index + 1));
      index++;
      if (index === text.length) {
        clearInterval(interval);
      }
    }, 30); // Fast typing speed
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="ml-3 text-[10px] md:text-xs text-gray-500 font-medium tracking-wide">
      {displayedText}
      <span className="animate-pulse">_</span>
    </span>
  );
}
