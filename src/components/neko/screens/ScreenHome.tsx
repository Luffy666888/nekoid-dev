import hero from "@/assets/neko-hero.jpg";
import { Sparkles } from "./_shared";

export function ScreenHome() {
  return (
    <div className="absolute inset-0 flex flex-col pt-[58px] overflow-y-auto scrollbar-none"
      style={{ background: "var(--gradient-cream)" }}>
      <Sparkles />

      {/* greeting */}
      <div className="relative z-10 px-6">
        <div className="text-[11px] tracking-[0.3em] text-[oklch(0.6_0.05_300)]">2026 · 05 · 27 · 周三</div>
        <h1 className="mt-2 text-[22px] font-light leading-tight text-foreground">
          晚上好，<span className="font-normal">糯米团</span> <span className="text-[18px]">🌙</span>
        </h1>
        <p className="mt-1 text-[12px] text-[oklch(0.58_0.04_300)]">它今天有一点点想你。</p>
      </div>

      {/* hero avatar card */}
      <div className="relative z-10 mx-5 mt-5 overflow-hidden rounded-[32px] glass-tint">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[oklch(0.88_0.08_320/0.6)] blur-3xl animate-breathe" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-40 w-40 rounded-full bg-[oklch(0.88_0.07_260/0.55)] blur-3xl animate-breathe" />
        <div className="relative flex items-center gap-4 p-5">
          <div className="relative h-[88px] w-[88px] shrink-0">
            <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-[oklch(0.88_0.08_320)] to-[oklch(0.88_0.07_260)] opacity-70 blur-xl animate-breathe" />
            <div className="absolute inset-0 rounded-full bg-white p-1 shadow-[0_8px_24px_-8px_oklch(0.78_0.11_305/0.4)]">
              <img src={hero} alt="糯米团" className="h-full w-full rounded-full object-cover" loading="lazy" width={1024} height={1024} />
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[10px] tracking-[0.35em] text-[oklch(0.65_0.1_320)]">SOUL · INTP-T</div>
            <div className="mt-1 text-[18px] font-medium text-foreground">糯米团</div>
            <div className="mt-0.5 text-[11px] text-[oklch(0.58_0.04_300)]">3 岁 · 金吉拉 · ♀</div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.11_305)] animate-pulse-soft" />
              <span className="text-[10px] tracking-[0.25em] text-[oklch(0.55_0.06_300)]">同步中 · 87.4%</span>
            </div>
          </div>
        </div>
      </div>

      {/* today mood */}
      <div className="relative z-10 mx-5 mt-4 rounded-[28px] p-5 glass">
        <div className="flex items-center justify-between">
          <span className="text-[10px] tracking-[0.4em] text-[oklch(0.58_0.04_300)]">今日情绪</span>
          <span className="text-[10px] tracking-[0.3em] text-[oklch(0.65_0.1_320)]">SOFT · DREAMY</span>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-[32px] font-light leading-none text-foreground">温柔</div>
            <div className="mt-1 text-[11px] text-[oklch(0.58_0.04_300)]">带一点点撒娇</div>
          </div>
          <div className="flex gap-1.5">
            {[0.4, 0.65, 0.85, 0.6, 0.5, 0.75, 0.9].map((h, i) => (
              <span key={i} className="w-1.5 rounded-full" style={{ height: 36 * h, background: `linear-gradient(180deg, oklch(0.88 0.08 320), oklch(0.86 0.08 260))` }} />
            ))}
          </div>
        </div>
      </div>

      {/* AI observation */}
      <div className="relative z-10 mx-5 mt-4 rounded-[28px] p-5"
        style={{ background: "linear-gradient(160deg, oklch(0.96 0.04 320) 0%, oklch(0.96 0.04 260) 100%)" }}>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.11_305)]" />
          <span className="text-[10px] tracking-[0.35em] text-[oklch(0.5_0.06_300)]">AI 观察日记</span>
        </div>
        <p className="mt-3 text-[14px] font-light leading-relaxed text-foreground">
          “你回家后，<br />她在门口停留了 <span className="font-medium text-[oklch(0.6_0.12_320)]">7 分钟</span>，<br />然后悄悄跟到了沙发边。”
        </p>
        <div className="mt-3 flex items-center justify-between text-[10px] tracking-[0.25em] text-[oklch(0.55_0.05_300)]">
          <span>— NEKO · 19:42</span>
          <span>查看完整观察 →</span>
        </div>
      </div>

      {/* inner OS + relation */}
      <div className="relative z-10 mx-5 mt-4 grid grid-cols-2 gap-3">
        <MiniCard hint="今日内心 OS" title="“想再睡一会儿。”" tag="🌙" />
        <MiniCard hint="关系变化" title="+ 2 度亲密" tag="💗" tone />
      </div>

      {/* chat CTA */}
      <div className="relative z-10 mx-5 mt-5 mb-5">
        <button className="flex w-full items-center justify-between rounded-full px-6 py-4 text-[13px] text-white shadow-[0_12px_30px_-12px_oklch(0.78_0.11_305/0.6)]"
          style={{ background: "var(--gradient-cta)" }}>
          <span className="tracking-wider">和它聊聊</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25">→</span>
        </button>
      </div>

      {/* tab bar */}
      <div className="relative z-10 mt-auto mx-5 mb-4 flex items-center justify-around rounded-full bg-white/80 px-3 py-3 shadow-[0_-4px_20px_-10px_oklch(0.78_0.11_305/0.25)] backdrop-blur">
        {[
          { l: "今日", a: true },
          { l: "档案" },
          { l: "宇宙" },
          { l: "广场" },
        ].map((t) => (
          <span key={t.l} className={"text-[11px] tracking-[0.2em] " + (t.a ? "rounded-full bg-[oklch(0.95_0.04_320)] px-4 py-1.5 text-[oklch(0.5_0.1_320)]" : "text-[oklch(0.6_0.04_300)]")}>{t.l}</span>
        ))}
      </div>
    </div>
  );
}

function MiniCard({ hint, title, tag, tone }: { hint: string; title: string; tag: string; tone?: boolean }) {
  return (
    <div className="rounded-[24px] p-4 glass"
      style={tone ? { background: "linear-gradient(160deg, oklch(0.97 0.03 0), oklch(0.96 0.04 320))" } : undefined}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] tracking-[0.35em] text-[oklch(0.58_0.04_300)]">{hint}</span>
        <span className="text-[14px]">{tag}</span>
      </div>
      <div className="mt-2 text-[13px] font-light text-foreground">{title}</div>
    </div>
  );
}