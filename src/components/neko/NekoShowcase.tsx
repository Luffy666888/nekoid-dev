import { ScreenHome } from "./screens/ScreenHome";
import { ScreenGenerating } from "./screens/ScreenGenerating";
import { ScreenProfile } from "./screens/ScreenProfile";
import { ScreenUniverse } from "./screens/ScreenUniverse";
import { ScreenShareCard } from "./screens/ScreenShareCard";
import { ScreenPlaza } from "./screens/ScreenPlaza";

const SCREENS = [
  { id: "home", index: "01", title: "人格同步状态", subtitle: "Home / Soul Sync", Component: ScreenHome },
  { id: "generating", index: "02", title: "AI 人格生成中", subtitle: "Awakening", Component: ScreenGenerating },
  { id: "profile", index: "03", title: "喵懂人格档案", subtitle: "人格档案", Component: ScreenProfile },
  { id: "universe", index: "04", title: "Parallel Universe", subtitle: "平行宇宙剧情", Component: ScreenUniverse },
  { id: "share", index: "05", title: "人格分享卡", subtitle: "Share Identity", Component: ScreenShareCard },
  { id: "plaza", index: "06", title: "人格宇宙广场", subtitle: "Soul Plaza", Component: ScreenPlaza },
];

export function NekoShowcase() {
  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ background: "var(--gradient-cream)" }}>
      {/* Ambient aura background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-80"
        style={{ background: "var(--gradient-aura)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, oklch(0.78 0.11 305 / .35) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Top brand bar */}
      <header className="relative z-10 mx-auto flex max-w-[1600px] items-center justify-between px-8 pt-10 pb-6 md:px-14">
        <div className="flex items-center gap-3">
          <div className="relative h-9 w-9">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[oklch(0.88_0.09_320)] to-[oklch(0.88_0.08_260)] blur-[3px]" />
            <div className="absolute inset-[3px] rounded-full bg-white" />
            <div className="absolute inset-[8px] rounded-full bg-gradient-to-br from-[oklch(0.82_0.11_320)] to-[oklch(0.84_0.09_0)] animate-breathe" />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-medium tracking-[0.32em] text-foreground">喵懂</div>
            <div className="text-[10px] tracking-[0.4em] text-muted-foreground">AI PET SOUL UNIVERSE</div>
          </div>
        </div>
        <div className="hidden items-center gap-6 text-[11px] tracking-[0.3em] text-muted-foreground md:flex">
          <span>v 1.0 · DREAMY BETA</span>
          <span className="text-foreground/70">— a quiet little soul</span>
        </div>
      </header>

      {/* Hero copy */}
      <section className="relative z-10 mx-auto max-w-[1600px] px-8 pb-20 md:px-14">
        <div className="max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[10px] tracking-[0.32em] text-[oklch(0.55_0.08_320)] backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-[oklch(0.78_0.11_305)]" />
            AI 正在温柔地理解你的猫
          </div>
          <h1 className="text-balance text-[44px] font-light leading-[1.08] tracking-tight text-foreground md:text-[68px]">
            为它而生的，
            <br />
            一个温柔的 <span className="text-soul font-normal italic">数字灵魂</span>。
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            喵懂是一个温柔的 AI 宠物人格宇宙 —— 它持续观察、感受、理解你的猫，
            把它的情绪、记忆与小心思，编织成一个独一无二、属于你们之间的小灵魂。
          </p>
        </div>
      </section>

      {/* Phones rail */}
      <section className="relative z-10 pb-24">
        <div className="scrollbar-none flex snap-x snap-mandatory gap-16 overflow-x-auto px-8 pb-16 md:px-14">
          {SCREENS.map((s) => (
            <figure key={s.id} className="snap-center shrink-0">
              <div className="mb-5 flex items-end justify-between px-1">
                <div>
                  <div className="text-[10px] tracking-[0.4em] text-muted-foreground">
                    {s.index} · {s.subtitle}
                  </div>
                  <div className="mt-1 text-[15px] tracking-wide text-foreground">{s.title}</div>
                </div>
                <div className="h-px w-16 bg-gradient-to-r from-transparent to-border" />
              </div>
              <PhoneFrame>
                <s.Component />
              </PhoneFrame>
            </figure>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/40">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-8 py-8 text-[11px] tracking-[0.3em] text-muted-foreground md:px-14">
          <span>喵懂 · 读懂它的小世界</span>
          <span>DESIGNED WITH LOVE · 在一个柔软的夜晚</span>
        </div>
      </footer>
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="phone-frame">
      <div className="phone-notch" />
      <div className="relative h-full w-full overflow-hidden">
        {/* status bar */}
        <div className="absolute left-0 right-0 top-0 z-40 flex items-center justify-between px-8 pt-[18px] text-[12px] font-medium tracking-wide text-foreground/80">
          <span>21:42</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[10px] w-[14px] rounded-[2px] border border-foreground/70" />
            <span className="inline-block h-[10px] w-[18px] rounded-[3px] border border-foreground/70 relative">
              <span className="absolute inset-[2px] right-[6px] rounded-[1px] bg-foreground/80" />
            </span>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
