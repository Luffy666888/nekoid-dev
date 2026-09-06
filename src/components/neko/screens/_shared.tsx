import type { ReactNode } from "react";

export function SafeAreaTopBar({
  left,
  center,
  right,
  className = "",
}: {
  left: ReactNode;
  center?: ReactNode;
  right: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`absolute inset-x-0 top-0 z-30 px-5 ${className}`}
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
    >
      <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center">
        <div className="flex justify-start">{left}</div>
        <div className="flex min-w-0 justify-center">{center}</div>
        <div className="flex justify-end">{right}</div>
      </div>
    </div>
  );
}

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
              opacity: 0.5 + (i % 4) * 0.1,
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
      <path d="M12 2 L13.5 9 L20 11 L13.5 13 L12 22 L10.5 13 L4 11 L10.5 9 Z" fill="currentColor" />
    </svg>
  );
}
