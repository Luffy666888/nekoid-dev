import hero from "@/assets/neko-hero.jpg";
import cyber from "@/assets/neko-cyber.jpg";
import magic from "@/assets/neko-magic.jpg";
import pink from "@/assets/neko-pink.jpg";
import noble from "@/assets/neko-noble.jpg";
import mafia from "@/assets/neko-mafia.jpg";
import { Sparkles } from "./_shared";

const tabs = ["✨ 推荐", "热门人格", "剧情", "Follow"];

export function ScreenPlaza() {
  return (
    <div className="absolute inset-0 flex flex-col pt-[52px] text-foreground overflow-y-auto scrollbar-none"
      style={{ background: "var(--gradient-cream)" }}>
      <Sparkles count={12} />

      <div className="relative z-10 flex items-center justify-between px-6">
        <div>
          <div className="text-[10px] tracking-[0.4em] text-[oklch(0.6_0.08_320)]">SOUL PLAZA</div>
          <div className="mt-1 text-[22px] font-light">人格宇宙 <span className="text-[14px]">·</span> <span className="text-[14px] text-[oklch(0.55_0.05_300)]">广场</span></div>
        </div>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-white/85 text-[13px] shadow-[0_4px_12px_-4px_oklch(0.78_0.11_305/0.3)]">⌕</div>
      </div>

      <div className="relative z-10 mt-4 flex gap-5 px-6 text-[13px]">
        {tabs.map((t, i) => (
          <span key={t} className={
            "relative pb-2 " + (i === 0 ? "font-medium text-foreground" : "text-[oklch(0.6_0.04_300)]")
          }>
            {t}
            {i === 0 && (
              <span className="absolute -bottom-px left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full"
                style={{ background: "var(--gradient-selected)" }} />
            )}
          </span>
        ))}
      </div>

      {/* trending row */}
      <div className="relative z-10 mt-4 px-6 flex items-center justify-between">
        <span className="text-[10px] tracking-[0.4em] text-[oklch(0.55_0.08_320)]">✦ 今日热门灵魂</span>
        <span className="text-[10px] tracking-[0.2em] text-[oklch(0.58_0.04_300)]">查看全部</span>
      </div>
      <div className="relative z-10 mt-3 flex gap-3 overflow-x-auto px-6 pb-1 scrollbar-none">
        {[hero, magic, noble, pink, cyber, mafia].map((img, i) => (
          <div key={i} className="relative shrink-0">
            <div className="h-16 w-16 overflow-hidden rounded-full bg-white p-[2px] shadow-[0_6px_16px_-8px_oklch(0.78_0.11_305/0.4)]"
              style={{ background: "linear-gradient(135deg, oklch(0.88 0.09 320), oklch(0.88 0.08 0))" }}>
              <div className="h-full w-full overflow-hidden rounded-full bg-white p-[2px]">
                <img src={img} alt="" className="h-full w-full rounded-full object-cover" loading="lazy" width={768} height={1024} />
              </div>
            </div>
            <div className="mt-1.5 text-center text-[9px] text-[oklch(0.55_0.05_300)]">@soul0{i + 1}</div>
          </div>
        ))}
      </div>

      {/* feed */}
      <div className="relative z-10 mt-3 columns-2 gap-3 px-5 pb-20 [column-fill:_balance]">
        <FeedCard img={hero} title="糯米团" sub="高冷观察者 · INTJ" quote="“它今晚比平时还安静。”" likes="12.4K" tall mbti="INTJ" />
        <FeedCard img={magic} title="星砂" sub="温柔梦想家 · INFP" quote="“星光下我想到了你。”" likes="22.7K" mbti="INFP" />
        <FeedCard img={noble} title="奶酪小姐" sub="傲娇贵族 · ESFJ" quote="“今天又被人类伺候了。”" likes="8.1K" tall mbti="ESFJ" />
        <FeedCard img={pink} title="阿福" sub="阳光打工人 · ESTP" quote="“摸鱼是猫的天职。”" likes="5.3K" mbti="ESTP" />
        <FeedCard img={mafia} title="少爷" sub="软糖少爷 · ENTP" quote="“别动我的糖。”" likes="9.8K" tall mbti="ENTP" />
        <FeedCard img={cyber} title="飞船船长" sub="星际旅人 · ENFP" quote="“紫色星云味道像奶。”" likes="3.9K" mbti="ENFP" />
      </div>

      {/* bottom tab */}
      <div className="absolute inset-x-3 bottom-3 z-20 flex items-center justify-around rounded-full bg-white/90 px-4 py-3 shadow-[0_-6px_30px_-10px_oklch(0.78_0.11_305/0.35)] backdrop-blur">
        {[
          { l: "今日" },
          { l: "档案" },
          { l: "宇宙" },
          { l: "广场", a: true },
        ].map((t) => (
          <span key={t.l} className={"text-[11px] tracking-[0.2em] " + (t.a ? "rounded-full px-4 py-1.5 text-white" : "text-[oklch(0.6_0.04_300)]")} style={t.a ? { background: "var(--gradient-selected)" } : undefined}>{t.l}</span>
        ))}
      </div>
    </div>
  );
}

function FeedCard({ img, title, sub, quote, likes, tall, mbti }: { img: string; title: string; sub: string; quote: string; likes: string; tall?: boolean; mbti: string }) {
  return (
    <div className="mb-3 break-inside-avoid overflow-hidden rounded-[22px] bg-white shadow-[0_10px_24px_-14px_oklch(0.78_0.11_305/0.3)]">
      <div className={"relative w-full " + (tall ? "h-[200px]" : "h-[140px]")}>
        <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" width={768} height={1024} />
        <span className="absolute left-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[8px] tracking-[0.3em] text-[oklch(0.55_0.1_320)] backdrop-blur">
          ✦ {mbti}
        </span>
      </div>
      <div className="p-3">
        <div className="text-[12px] font-medium text-foreground">{title}</div>
        <div className="mt-0.5 text-[9px] tracking-[0.25em] text-[oklch(0.6_0.1_320)]">{sub}</div>
        <div className="mt-1.5 text-[11px] leading-snug text-[oklch(0.45_0.05_300)]">{quote}</div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-[oklch(0.6_0.04_300)]">
          <span>♡ {likes}</span>
          <span className="text-[oklch(0.65_0.1_320)]">+ 关注</span>
        </div>
      </div>
    </div>
  );
}