"use client";

export interface StatusDotProps {
  className?: string;
  color?: "green" | "red" | "yellow";
}

export function StatusDot({ className = "", color = "green" }: StatusDotProps) {
  const bgColorMap = {
    green: "bg-signal-green",
    red: "bg-signal-red",
    yellow: "bg-yellow-500",
  };
  const bgColor = bgColorMap[color];

  return (
    <span className={`relative flex h-2.5 w-2.5 ${className}`}>
      <span
        className={`animate-signal-pulse absolute inline-flex h-full w-full rounded-full ${bgColor} opacity-75`}
      />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${bgColor}`} />
    </span>
  );
}
