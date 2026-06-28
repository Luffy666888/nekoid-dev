import hero from "@/assets/neko-hero.jpg";
import { Sparkles } from "../screens/_shared";

export function Screen1Welcome({ onNext }: { onNext?: () => void; onPrev?: () => void } = {}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center pt-[64px] text-foreground"
      style={{ background: "linear-gradient(180deg, oklch(0.99 0.012 80) 0%, oklch(0.96 0.035 320) 55%, oklch(0.95 0.04 280) 100%)" }}>
      <Sparkles count={36} />
      <div className="relative z-10 mt-10 h-[230px] w-[230px] px-7">
        <div className="absolute inset-0 rounded-full opacity-90 blur-3xl animate-breathe"
          style={{ background: "radial-gradient(circle, oklch(0.9 0.08 320 / 0.95), oklch(0.9 0.07 260 / 0.5) 55%, transparent 75%)" }} />
        <div className="absolute inset-6 rounded-full border border-[oklch(0.88_0.06_320/0.55)] animate-orbit" />
        <div className="absolute inset-12 rounded-full border border-[oklch(0.88_0.06_260/0.5)] [animation:orbit_28s_linear_infinite_reverse]" />
        <div className="absolute inset-[34px] overflow-hidden rounded-full bg-white p-1.5 shadow-[0_24px_60px_-22px_oklch(0.78_0.11_305/0.55)]">
          <img src={hero} alt="" className="h-full w-full rounded-full object-cover" loading="lazy" width={1024} height={1024} />
        </div>
        {[0, 1, 2].map((i) => (
          <span key={i}
            className="absolute left-1/2 top-1/2 -ml-1 -mt-1 h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_10px_oklch(0.85_0.1_320)]"
            style={{ transform: `rotate(${i * 120}deg) translateX(118px)`, animation: `orbit ${14 + i * 3}s linear infinite` }} />
        ))}
      </div>
      <div className="relative z-10 mt-10 flex flex-col items-center px-7">
        <div className="text-[11px] tracking-[0.55em] text-[oklch(0.55_0.08_320)]">N E K O . I D</div>
        <div className="mt-3 text-[28px] font-light leading-tight text-foreground">
          读懂它的<span className="text-soul font-normal italic">小世界</span>
        </div>
        <p className="mt-3 max-w-[280px] text-center text-[12px] leading-relaxed text-[oklch(0.55_0.05_300)]">
          AI 将通过照片、视频和行为分析<br />生成专属于它的人格档案
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-20 w-full px-7 pt-5 pb-[max(10px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); onNext?.(); }}
          className="flex w-full touch-manipulation select-none items-center justify-center gap-2 rounded-full px-6 py-4 text-[14px] font-medium text-white shadow-[0_18px_36px_-14px_oklch(0.78_0.11_305/0.6)] active:scale-[0.98] transition-transform duration-75"
          style={{ background: "var(--gradient-cta)" }}
        >
          <span className="tracking-wider">开始创建猫咪人格档案</span>
          <span>✨</span>
        </button>
      </div>
    </div>
  );
}
