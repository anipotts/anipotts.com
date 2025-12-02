export default function StatusDot({ className = "" }: { className?: string }) {
  return (
    <span className={`relative flex h-2 w-2 ${className}`}>
      <span className="animate-signal-pulse absolute inline-flex h-full w-full rounded-full bg-signal-green opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-signal-green"></span>
    </span>
  );
}
