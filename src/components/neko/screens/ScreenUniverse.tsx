import cyber from "@/assets/neko-cyber.jpg";
import magic from "@/assets/neko-magic.jpg";
import pink from "@/assets/neko-pink.jpg";
import noble from "@/assets/neko-noble.jpg";
import mafia from "@/assets/neko-mafia.jpg";
import { Sparkles } from "./_shared";

const categories = ["✨ 魔法学院", "💼 打工人", "👑 豪门猫猫", "🚀 星际旅行", "🖤 黑帮少爷"];

export function ScreenUniverse() {
  return (
    <div className="absolute inset-0 flex flex-col pt-[52px] text-foreground overflow-y-auto scrollbar-none"
      style={{ background: "var(--gradient-cream)" }}>
      <Sparkles count={16} />

      <div className="relative z-10 px-6">
        <div className="text-[10px] tracking-[0.4em] text-[oklch(0.6_0.08_320)]">PARALLEL UNIVERSE</div>
        <h2 className="mt-2 text-[22px] font-light leading-tight">
          它在另一个<br /><span className="text-soul italic font-normal">宇宙</span>里，是谁？
        </h2>
      </div>

      {/* category chips */}
      <div className="relative z-10 mt-4 flex gap-2 overflow-x-auto px-6 pb-2 scrollbar-none">
        {categories.map((c, i) => (
          <span key={c} className={
            "shrink-0 rounded-full px-3.5 py-1.5 text-[11px] " +
            (i === 0
              ? "text-white shadow-[0_6px_16px_-6px_oklch(0.78_0.11_305/0.5)]"
              : "bg-white/70 text-[oklch(0.5_0.05_300)]")
          } style={i === 0 ? { background: "var(--gradient-cta)" } : undefined}>
            {c}
          </span>
        ))}
      </div>

      {/* featured */}
      <div className="relative z-10 mx-5 mt-3 overflow-hidden rounded-[28px] bg-white shadow-[0_20px_40px_-20px_oklch(0.78_0.11_305/0.35)]">
        <div className="relative">
          <img src={magic} alt="" className="h-[240px] w-full object-cover" loading="lazy" width={1024} height={1024} />
          <div className="absolute right-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[9px] tracking-[0.3em] text-[oklch(0.55_0.08_320)] backdrop-blur">
            ✦ AI GENERATED
          </div>
          <div className="absolute left-3 top-3 rounded-full bg-[oklch(0.78_0.11_305)] px-2.5 py-1 text-[9px] tracking-[0.3em] text-white">
            EP · 07
          </div>
        </div>
        <div className="p-4">
          <div className="text-[10px] tracking-[0.35em] text-[oklch(0.6_0.1_320)]">魔法学院 · 学徒篇</div>
          <div className="mt-1.5 text-[16px] font-light leading-snug text-foreground">
            双月图书馆里，<br />她是最安静的小小学徒
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-[oklch(0.55_0.05_300)]">
            <span>♡ 12.4K · 💬 384 · 8 分钟</span>
            <span className="text-[oklch(0.6_0.1_320)]">继续阅读 →</span>
          </div>
        </div>
      </div>

      {/* mini gallery */}
      <div className="relative z-10 mt-4 grid grid-cols-2 gap-3 px-5">
        <UniverseCard img={pink} title="打工小猫" sub="今天也想请假" tag="EP 11" likes="8.2K" />
        <UniverseCard img={noble} title="豪门继承" sub="她讨厌大理石" tag="EP 03" likes="15K" />
        <UniverseCard img={cyber} title="星际旅人" sub="飘过紫色星云" tag="EP 02" likes="6.4K" />
        <UniverseCard img={mafia} title="黑帮少爷" sub="只吃软糖" tag="EP 05" likes="9.8K" />
      </div>

      <div className="relative z-10 mx-5 my-5 rounded-[24px] border border-dashed border-[oklch(0.8_0.06_320)] bg-white/50 py-4 text-center text-[12px] tracking-[0.2em] text-[oklch(0.55_0.08_320)]">
        ✦ 继续生成平行宇宙
      </div>
    </div>
  );
}

function UniverseCard({ img, title, sub, tag, likes }: { img: string; title: string; sub: string; tag: string; likes: string }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-white shadow-[0_10px_24px_-14px_oklch(0.78_0.11_305/0.3)]">
      <div className="relative">
        <img src={img} alt="" className="h-[140px] w-full object-cover" loading="lazy" width={768} height={1024} />
        <span className="absolute left-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[8px] tracking-[0.3em] text-[oklch(0.55_0.1_320)] backdrop-blur">{tag}</span>
      </div>
      <div className="p-3">
        <div className="text-[12px] font-medium text-foreground">{title}</div>
        <div className="mt-0.5 text-[10px] text-[oklch(0.58_0.04_300)]">{sub}</div>
        <div className="mt-1.5 text-[9px] tracking-wider text-[oklch(0.6_0.08_320)]">♡ {likes}</div>
      </div>
    </div>
  );
}