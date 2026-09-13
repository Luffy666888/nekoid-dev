import heroCat from "@/assets/neko-hero.jpg";
import { Sparkles } from "./_shared";

const stats: { label: string; value: number; tone: string }[] = [
  { label: "粘人程度", value: 78, tone: "oklch(0.84 0.09 0)" },
  { label: "傲娇指数", value: 64, tone: "oklch(0.84 0.1 320)" },
  { label: "安全感", value: 82, tone: "oklch(0.86 0.07 260)" },
  { label: "占有欲", value: 70, tone: "oklch(0.85 0.08 0)" },
  { label: "情绪稳定度", value: 88, tone: "oklch(0.82 0.09 300)" },
];

export function ScreenProfile() {
  return (
    <div className="absolute inset-0 flex flex-col pt-[52px] text-foreground overflow-y-auto scrollbar-none"
      style={{ background: "var(--gradient-cream)" }}>
      <Sparkles count={14} />

      <div className="relative z-10 px-6 flex items-center justify-between">
        <span className="text-[18px] text-[oklch(0.55_0.04_300)]">‹</span>
        <span className="text-[10px] tracking-[0.4em] text-[oklch(0.55_0.04_300)]">喵一下人格档案</span>
        <span className="text-[14px]">⋯</span>
      </div>

      {/* avatar */}
      <div className="relative z-10 mx-auto mt-5 h-[152px] w-[152px]">
        <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-[oklch(0.88_0.09_320/0.7)] to-[oklch(0.88_0.07_260/0.6)] blur-2xl animate-breathe" />
        <div className="absolute inset-0 rounded-full bg-white p-1.5 shadow-[0_20px_50px_-20px_oklch(0.78_0.11_305/0.5)]">
          <img src={heroCat} alt="糯米团" className="h-full w-full rounded-full object-cover" loading="lazy" width={1024} height={1024} />
        </div>
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[9px] tracking-[0.3em] text-[oklch(0.55_0.1_320)] shadow-[0_4px_12px_-4px_oklch(0.78_0.11_305/0.4)]">
          ✦ SYNC 87.4%
        </span>
      </div>

      <div className="relative z-10 mt-8 text-center">
        <div className="text-[10px] tracking-[0.45em] text-[oklch(0.6_0.08_320)]">高冷观察者 · INTJ-A</div>
        <h2 className="mt-2 text-[26px] font-light tracking-[0.1em]">糯 米 团</h2>
        <div className="mt-1 text-[11px] text-[oklch(0.58_0.04_300)]">3 岁 · 金吉拉 · ♀</div>
      </div>

      {/* keywords */}
      <div className="relative z-10 mt-4 flex flex-wrap justify-center gap-1.5 px-6">
        {["安静", "观察者", "夜行性", "傲娇", "撒娇高手", "粘人小怪"].map((k, i) => (
          <span key={k} className="rounded-full px-3 py-1 text-[10px] tracking-wider"
            style={{
              background: i % 2 ? "oklch(0.96 0.04 320)" : "oklch(0.97 0.035 0)",
              color: "oklch(0.45 0.08 320)",
            }}>
            {k}
          </span>
        ))}
      </div>

      {/* stats */}
      <div className="relative z-10 mt-5 mx-5 rounded-[28px] p-5 glass">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] tracking-[0.35em] text-[oklch(0.55_0.06_300)]">人格指数</span>
          <span className="text-[10px] tracking-[0.3em] text-[oklch(0.6_0.1_320)]">本周更新</span>
        </div>
        <div className="space-y-3">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-foreground/90">{s.label}</span>
                <span className="tracking-widest text-[oklch(0.55_0.05_300)]">{s.value}</span>
              </div>
              <div className="mt-1.5 h-[5px] w-full rounded-full bg-[oklch(0.95_0.02_320)]">
                <div className="h-full rounded-full" style={{ width: `${s.value}%`, background: `linear-gradient(90deg, ${s.tone}, oklch(0.85 0.07 260))` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* monologue */}
      <div className="relative z-10 mx-5 mt-4 rounded-[28px] p-5"
        style={{ background: "linear-gradient(160deg, oklch(0.96 0.04 320), oklch(0.97 0.035 0))" }}>
        <div className="text-[10px] tracking-[0.35em] text-[oklch(0.55_0.08_320)]">AI 内心独白</div>
        <p className="mt-3 text-[14px] font-light leading-relaxed text-foreground">
          “我喜欢你打字的声音，<br />那意味着你还在房间里。”
        </p>
        <div className="mt-3 flex items-center justify-between text-[10px] tracking-[0.3em] text-[oklch(0.55_0.06_300)]">
          <span>— 糯米团 · 02:11</span>
          <span className="text-[oklch(0.6_0.1_320)]">12 段记忆 →</span>
        </div>
      </div>

      {/* entries */}
      <div className="relative z-10 mx-5 mt-4 mb-8 grid grid-cols-2 gap-3">
        <Entry title="它眼中的你" hint="它的世界" emoji="👀" />
        <Entry title="平行宇宙" hint="另一个它" emoji="🌙" />
        <Entry title="记忆碎片" hint="它的日记" emoji="✨" />
        <Entry title="如果是人" hint="人类形象" emoji="🎀" />
      </div>
    </div>
  );
}

function Entry({ title, hint, emoji }: { title: string; hint: string; emoji: string }) {
  return (
    <button className="relative overflow-hidden rounded-[22px] bg-white/85 p-4 text-left shadow-[0_8px_20px_-12px_oklch(0.78_0.11_305/0.3)]">
      <div className="flex items-center justify-between">
        <div className="text-[9px] tracking-[0.35em] text-[oklch(0.6_0.1_320)]">{hint}</div>
        <span className="text-[16px]">{emoji}</span>
      </div>
      <div className="mt-2 text-[14px] font-light text-foreground">{title}</div>
      <span className="absolute right-3 bottom-3 text-[oklch(0.7_0.06_300)]">→</span>
    </button>
  );
}
