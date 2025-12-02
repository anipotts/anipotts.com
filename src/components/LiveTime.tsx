"use client";

import { useEffect, useState } from "react";

export default function LiveTime() {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }).toLowerCase());
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Prevent hydration mismatch by rendering empty string initially or a fixed placeholder if preferred
  if (!time) return <span className="opacity-0">0:00:00 am</span>;

  return <span>{time}</span>;
}
