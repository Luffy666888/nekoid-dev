import heroCat from "@/assets/neko-hero.jpg";
import { Sparkles } from "./_shared";

const steps = [
  { label: "正在识别依赖行为", done: true },
  { label: "正在分析情绪波动", done: true },
  { label: "正在构建人格画像", active: true },
  { label: "正在写入记忆轨迹" },
  { label: "正在唤醒数字灵魂" },
];

export function ScreenGenerating() {
  return (
    <div className="absolute inset-0 flex flex-col items-center pt-[58px] text-foreground"
      style={{ background: "linear-gradient(180deg, oklch(0.97 0.025 320) 0%, oklch(0.95 0.04 0) 55%, oklch(0.96 0.03 260) 100%)" }}>
      <Sparkles count={32} />

      <div className="relative z-10 mt-3 text-[10px] tracking-[0.45em] text-[oklch(0.55_0.08_320)]">
        AWAKENING · 03 / 05
      </div>

      {/* concentric soft halos */}
      <div className="relative z-10 mt-8 h-[260px] w-[260px]">
        <div className="absolute inset-0 rounded-full border border-[oklch(0.85_0.06_320/0.5)] animate-orbit" />
        <div className="absolute inset-5 rounded-full border border-[oklch(0.85_0.06_0/0.55)] [animation:orbit_24s_linear_infinite_reverse]" />
        <div className="absolute inset-10 rounded-full border border-[oklch(0.85_0.06_260/0.5)] animate-orbit" style={{ animationDuration: "30s" }} />
        <div className="absolute inset-[28px] rounded-full opacity-80 blur-2xl animate-breathe"
          style={{ background: "radial-gradient(circle, oklch(0.88 0.09 320 / 0.9), oklch(0.88 0.08 260 / 0.4) 60%, transparent 80%)" }}
        />
        <div className="absolute inset-[44px] overflow-hidden rounded-full bg-white p-1.5 shadow-[0_20px_50px_-20px_oklch(0.78_0.11_305/0.5)]">
          <img src={heroCat} alt="" className="h-full w-full rounded-full object-cover" loading="lazy" width={1024} height={1024} />
        </div>
        {/* orbiting dots */}
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i}
            className="absolute left-1/2 top-1/2 -ml-1 -mt-1 h-2 w-2 rounded-full bg-white shadow-[0_0_10px_oklch(0.85_0.1_320)]"
            style={{ transform: `rotate(${i * 120}deg) translateX(130px)`, animation: `orbit ${10 + i * 4}s linear infinite` }}
          />
        ))}
      </div>

      <div className="relative z-10 mt-8 text-center">
        <div className="text-[10px] tracking-[0.4em] text-[oklch(0.55_0.07_320)]">SOUL · 糯米团</div>
        <div className="mt-2 text-[20px] font-light text-foreground">正在唤醒一个灵魂</div>
      </div>

      {/* steps */}
      <div className="relative z-10 mt-6 w-full px-7">
        <div className="space-y-2.5">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl bg-white/55 px-4 py-2.5 backdrop-blur text-[12px]">
              <span className={
                s.done ? "h-2 w-2 rounded-full bg-[oklch(0.78_0.11_305)]" :
                s.active ? "h-2 w-2 rounded-full bg-[oklch(0.84_0.09_0)] animate-pulse-soft" :
                "h-2 w-2 rounded-full bg-[oklch(0.9_0.02_300)]"
              } />
              <span className={s.done || s.active ? "text-foreground" : "text-[oklch(0.65_0.04_300)]"}>{s.label}</span>
              {s.active && <span className="ml-auto text-[10px] tracking-[0.3em] text-[oklch(0.6_0.1_320)]">62%</span>}
              {s.done && <span className="ml-auto text-[10px] tracking-[0.3em] text-[oklch(0.55_0.06_300)]">✓</span>}
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-[11px] leading-relaxed text-[oklch(0.55_0.05_300)]">
          请保持安静 ·<br />一个数字灵魂正在被温柔地唤醒
        </p>
      </div>
    </div>
  );
}