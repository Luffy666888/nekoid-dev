import hero from "@/assets/neko-hero.jpg";
import { Sparkles } from "./_shared";

export function ScreenShareCard() {
  return (
    <div className="absolute inset-0 flex flex-col pt-[52px] text-foreground"
      style={{ background: "linear-gradient(180deg, oklch(0.96 0.03 320) 0%, oklch(0.95 0.04 0) 100%)" }}>
      <Sparkles count={20} />

      <div className="relative z-10 flex items-center justify-between px-6">
        <span className="text-[18px] text-[oklch(0.5_0.05_300)]">×</span>
        <span className="text-[10px] tracking-[0.4em] text-[oklch(0.55_0.06_300)]">SOUL CARD</span>
        <span className="text-[11px] tracking-[0.25em] text-[oklch(0.6_0.1_320)]">分享</span>
      </div>

      {/* poster card */}
      <div className="relative z-10 mx-6 mt-6 overflow-hidden rounded-[36px] bg-white shadow-[0_30px_60px_-25px_oklch(0.78_0.11_305/0.45)]">
        {/* aura blobs */}
        <div className="pointer-events-none absolute -left-12 -top-12 h-48 w-48 rounded-full bg-[oklch(0.88_0.09_320/0.7)] blur-3xl animate-breathe" />
        <div className="pointer-events-none absolute -right-12 top-32 h-48 w-48 rounded-full bg-[oklch(0.88_0.08_0/0.6)] blur-3xl animate-breathe" />
        <div className="pointer-events-none absolute -bottom-12 left-1/3 h-44 w-44 rounded-full bg-[oklch(0.88_0.08_260/0.6)] blur-3xl animate-breathe" />

        <div className="relative p-6">
          <div className="flex items-center justify-between text-[10px] tracking-[0.4em] text-[oklch(0.55_0.08_320)]">
            <span className="font-medium">喵懂</span>
            <span>2026 · 05 · 27</span>
          </div>

          <div className="mt-5 flex justify-center">
            <div className="relative h-32 w-32">
              <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-[oklch(0.88_0.09_320)] to-[oklch(0.88_0.08_260)] blur-2xl opacity-80" />
              <div className="absolute inset-0 rounded-full bg-white p-1 shadow-[0_10px_24px_-10px_oklch(0.78_0.11_305/0.5)]">
                <img src={hero} alt="" className="h-full w-full rounded-full object-cover" loading="lazy" width={1024} height={1024} />
              </div>
            </div>
          </div>

          <div className="mt-5 text-center">
            <div className="text-[10px] tracking-[0.4em] text-[oklch(0.6_0.1_320)]">高冷观察者 · INTJ-A</div>
            <div className="mt-2 text-[28px] font-light tracking-[0.2em] text-foreground">糯 米 团</div>
            <div className="mt-1 text-[10px] tracking-[0.3em] text-[oklch(0.58_0.04_300)]">A QUIET LITTLE SOUL</div>
          </div>

          {/* tags */}
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {["安静", "傲娇", "撒娇高手", "夜行性"].map((t, i) => (
              <span key={t} className="rounded-full px-3 py-1 text-[10px]"
                style={{ background: i % 2 ? "oklch(0.96 0.04 320)" : "oklch(0.97 0.035 0)", color: "oklch(0.5 0.08 320)" }}>
                {t}
              </span>
            ))}
          </div>

          {/* index */}
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            {[
              ["87", "灵魂同步"],
              ["88", "情绪稳定"],
              ["78", "粘人指数"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-2xl py-3"
                style={{ background: "linear-gradient(160deg, oklch(0.97 0.025 320), oklch(0.96 0.03 0))" }}>
                <div className="text-[20px] font-light text-[oklch(0.4_0.1_320)]">{v}</div>
                <div className="mt-0.5 text-[9px] tracking-[0.2em] text-[oklch(0.55_0.05_300)]">{l}</div>
              </div>
            ))}
          </div>

          {/* quote */}
          <div className="mt-5 rounded-2xl bg-[oklch(0.97_0.025_320)] p-4 text-center text-[12px] font-light leading-relaxed text-foreground">
            “它今天比平时更安静一点，<br />在你离开后，停在门口 7 分钟。”
          </div>

          {/* footer */}
          <div className="mt-5 flex items-center justify-between border-t border-[oklch(0.92_0.025_320)] pt-4">
            <div>
              <div className="text-[10px] tracking-[0.3em] text-[oklch(0.55_0.06_300)]">发现它的灵魂</div>
              <div className="mt-0.5 text-[11px] tracking-[0.28em] text-[oklch(0.45_0.08_320)]">喵懂 · 读懂它的小世界</div>
            </div>
            <div className="grid h-12 w-12 grid-cols-4 grid-rows-4 gap-[2px] rounded-md bg-[oklch(0.45_0.08_320)] p-1.5">
              {Array.from({ length: 16 }).map((_, i) => (
                <span key={i} className={(i * 7 + 3) % 3 === 0 ? "bg-white" : "bg-transparent"} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* actions */}
      <div className="relative z-10 mt-auto px-6 pb-6">
        <div className="grid grid-cols-4 gap-2.5 text-center text-[11px] text-[oklch(0.5_0.05_300)]">
          {[["💾", "保存"], ["📕", "小红书"], ["💬", "微信"], ["···", "更多"]].map(([i, a]) => (
            <button key={a} className="rounded-2xl bg-white/80 py-3.5 backdrop-blur shadow-[0_6px_16px_-10px_oklch(0.78_0.11_305/0.4)]">
              <div className="text-[18px]">{i}</div>
              <div className="mt-0.5">{a}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
