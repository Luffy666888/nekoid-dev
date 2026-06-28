export function Sparkles({ count = 22 }: { count?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const size = ((i * 13) % 5) + 2;
        return (
          <span
            key={i}
            className="absolute rounded-full bg-white animate-pulse-soft"
            style={{
              left: `${(i * 47) % 100}%`,
              top: `${(i * 71) % 100}%`,
              width: size,
              height: size,
              opacity: 0.5 + ((i % 4) * 0.1),
              boxShadow: "0 0 6px oklch(0.85 0.08 320 / 0.8)",
              animationDelay: `${(i % 6) * 0.4}s`,
            }}
          />
        );
      })}
    </div>
  );
}

export function StarTwinkle({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 2 L13.5 9 L20 11 L13.5 13 L12 22 L10.5 13 L4 11 L10.5 9 Z"
        fill="currentColor" />
    </svg>
  );
}