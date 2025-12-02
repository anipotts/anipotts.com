"use client";

import { useEffect, useState } from "react";
import StatusDot from "./StatusDot";

export default function SignalsBar() {
  const [marketStatus, setMarketStatus] = useState<"open" | "closed">("closed");

  useEffect(() => {
    const checkMarketStatus = () => {
      const now = new Date();
      // Get NY time parts
      const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      
      const day = nyTime.getDay(); // 0 = Sun, 6 = Sat
      const hour = nyTime.getHours();
      const minute = nyTime.getMinutes();
      
      // Market hours: Mon(1) - Fri(5), 9:30 - 16:00
      const isWeekday = day >= 1 && day <= 5;
      const isAfterOpen = hour > 9 || (hour === 9 && minute >= 30);
      const isBeforeClose = hour < 16;
      
      if (isWeekday && isAfterOpen && isBeforeClose) {
        setMarketStatus("open");
      } else {
        setMarketStatus("closed");
      }
    };

    checkMarketStatus();
    const interval = setInterval(checkMarketStatus, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full py-6 border-t border-white/5 mt-12 mb-4">
      <div className="flex flex-row flex-wrap gap-x-8 gap-y-2 text-xs uppercase tracking-wider text-gray-500 font-mono">
        <div className="flex items-center gap-2">
          <span className="text-gray-600">base:</span>
          <span className="text-gray-300">new york city</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-600">focus:</span>
          <span className="text-gray-300">context distillation & caching</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-600">market:</span>
          <span className={marketStatus === "open" ? "text-signal-green flex items-center gap-2" : "text-gray-300"}>
            {marketStatus === "open" && <StatusDot />}
            {marketStatus}
          </span>
        </div>
      </div>
    </div>
  );
}
