import { ChevronLeft } from "lucide-react";

export function BackButton({ onPrev }: { onPrev?: () => void }) {
  if (!onPrev) return null;
  return (
    <button
      type="button"
      aria-label="返回上一步"
      onClick={onPrev}
      className="absolute left-5 top-[18px] z-30 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[oklch(0.5_0.1_320)] backdrop-blur transition-all duration-150 active:scale-[0.95] active:bg-white/95"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <ChevronLeft size={16} strokeWidth={2.25} />
    </button>
  );
}
