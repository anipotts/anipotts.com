export default function StatusDot({ className = "", color = "green" }: { className?: string, color?: "green" | "red" }) {
  const bgColor = color === "green" ? "bg-signal-green" : "bg-signal-red";
  
  return (
    <span className={`relative flex h-2.5 w-2.5 ${className}`}>
      <span className={`animate-signal-pulse absolute inline-flex h-full w-full rounded-full ${bgColor} opacity-75`}></span>
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${bgColor}`}></span>
    </span>
  );
}
