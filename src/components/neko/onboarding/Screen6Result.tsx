import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Share2 } from "lucide-react";
import { Sparkles } from "../screens/_shared";
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { getCatAvatar, getCurrentSessionCatAvatar, useCatAvatar } from "../catAvatarStore";
import { useCatName } from "../catNameStore";
import { persistCatResult, useCatPersona, useCatProfile } from "../catProfileStore";
import { getPhotoDraft } from "./onboardingDraftStore";
import { voicesStore } from "../app/voicesStore";

const TRAITS = [
  { icon: "🐾", label: "粘人度", v: 68 },
  { icon: "🏠", label: "独立性", v: 90 },
  { icon: "🔍", label: "好奇心", v: 82 },
];
const CHIPS = ["高冷外表", "内心温柔", "观察大师", "独立自主", "慢热型选手", "安全第一"];
const OBSERVATIONS = [
  { label: "主动观察陌生事物", v: "12 次" },
  { label: "主动靠近主人", v: "8 次" },
  { label: "独处行为", v: "23 次" },
  { label: "守门行为", v: "5 次" },
];

export function Screen6Result({ onRestart, onBack }: { onNext?: () => void; onPrev?: () => void; onRestart?: () => void; onBack?: () => void } = {}) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const profile = useCatProfile();
  const liveAvatar = useCatAvatar();
  const avatarSrc = getCurrentSessionCatAvatar() ?? profile.avatar ?? getPhotoDraft().avatar ?? liveAvatar ?? getCatAvatar();
  const catName = useCatName();
  const persona = useCatPersona();
  const personaType = persona?.type ?? "高冷观察者";
  const personaMbti = persona?.mbti ?? "INTJ-A";
  const personaTags = persona?.tags?.length ? persona.tags : CHIPS;
  const personaTraits = persona?.traits?.length
    ? persona.traits.slice(0, 3).map((t, i) => ({ icon: ["🐾", "🏠", "🔍"][i] ?? "✦", label: t.label, v: t.value }))
    : TRAITS;
  const personaObservations = persona?.observations?.length
    ? persona.observations.slice(0, 4).map((o) => {
        const raw = o as { label?: string; value?: string; v?: string };
        return {
          label: raw.label || "观察依据",
          v: raw.value || raw.v || "",
        };
      })
    : OBSERVATIONS;

  const openShare = () => setShareOpen(true);
  const closeShare = () => setShareOpen(false);

  const shareToWeChat = () => {
    closeShare();
    toast("正在调起微信，请选择要分享的好友…");
  };
  const shareToMoments = () => {
    closeShare();
    toast("正在打开朋友圈发布页…");
  };
  const saveImage = async () => {
    if (busy || !cardRef.current) return;
    setBusy(true);
    const tid = toast.loading("正在生成长图…");
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#FAF5FB",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `NEKO-ID-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("已保存到相册", { id: tid });
    } catch {
      toast.error("保存失败，请重试", { id: tid });
    } finally {
      setBusy(false);
      closeShare();
    }
  };

  const handleSave = () => {
    persistCatResult();
    voicesStore.clear();
    navigate({ to: "/app" });
  };
  return (
    <div ref={cardRef} className="absolute inset-0 flex flex-col pt-[50px] overflow-y-auto scrollbar-none"
      style={{ background: "linear-gradient(180deg, oklch(0.98 0.018 80) 0%, oklch(0.96 0.03 320) 55%, oklch(0.96 0.035 270) 100%)" }}>
      <Sparkles count={22} />

      {/* top bar */}
      <div className="relative z-10 flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              aria-label="返回"
              onClick={onBack}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[oklch(0.5_0.1_320)] backdrop-blur transition-all duration-150 active:scale-[0.95] active:bg-white/95"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <ChevronLeft size={16} strokeWidth={2.25} />
            </button>
          )}
          <span className="text-[10px] tracking-[0.5em] text-[oklch(0.55_0.08_320)]">N E K O · I D</span>
        </div>
        <button
          type="button"
          aria-label="分享"
          onClick={openShare}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform duration-75 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #B69AEF 0%, #E6B8CF 100%)",
            boxShadow: "0 10px 22px -8px oklch(0.78 0.11 305 / 0.55)",
          }}
        >
          <Share2 className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </button>
      </div>

      {/* === SECTION 1 · HERO (horizontal, 150px) === */}
      <div className="relative z-10 mx-5 mt-4 shrink-0 overflow-hidden rounded-[26px] p-4"
        style={{
          background: "linear-gradient(135deg, oklch(1 0 0 / 0.92) 0%, oklch(0.97 0.035 320 / 0.82) 55%, oklch(0.96 0.04 270 / 0.75) 100%)",
          border: "1px solid oklch(1 0 0 / 0.7)",
          backdropFilter: "blur(22px)",
          boxShadow: "0 24px 48px -28px oklch(0.78 0.11 305 / 0.35)",
        }}>
        {/* match badge top-right */}
        <div className="absolute right-3 top-3 z-10 rounded-full bg-white/80 px-2.5 py-[3px] text-[9.5px] tracking-wider text-[oklch(0.45_0.1_305)] shadow-[0_4px_10px_-6px_oklch(0.78_0.11_305/0.4)]"
          style={{ border: "1px solid oklch(0.9 0.04 320 / 0.6)" }}>
          <span className="text-[oklch(0.55_0.06_300)]">人格匹配度</span> <span className="font-semibold">{persona?.matchScore ?? 92}%</span>
        </div>

        {/* aura */}
        <div className="pointer-events-none absolute -left-8 top-1/2 h-[180px] w-[180px] -translate-y-1/2 rounded-full opacity-55 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.9 0.1 320 / 0.85), transparent 70%)" }} />

        <div className="relative flex items-center gap-4">
          {/* avatar */}
          <div className="relative h-[112px] w-[112px] shrink-0">
            <div className="absolute inset-0 rounded-full border border-[oklch(0.86_0.06_320/0.45)] animate-orbit" />
            <div className="absolute inset-2 rounded-full border border-[oklch(0.86_0.06_260/0.4)] [animation:orbit_24s_linear_infinite_reverse]" />
            <div className="absolute inset-[6px] overflow-hidden rounded-full bg-white p-1 shadow-[0_14px_30px_-14px_oklch(0.78_0.11_305/0.55)]">
              {avatarSrc ? (
                <img src={avatarSrc} alt={catName} className="h-full w-full rounded-full object-cover" loading="lazy" width={1024} height={1024} />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[oklch(0.985_0.018_320)] text-[10px] tracking-[0.18em] text-[oklch(0.58_0.06_300)]">
                  本次头像
                </div>
              )}
            </div>
          </div>

          {/* info */}
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-light leading-none tracking-wide text-[oklch(0.5_0.05_300)]">{catName}</div>
            <div className="mt-1.5 text-[22px] font-medium leading-tight"
              style={{
                background: "linear-gradient(90deg, #A88BEA 0%, #C896E0 50%, #EFAFC8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
              {personaType}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[9px] tracking-[0.3em] text-[oklch(0.55_0.06_300)]">MBTI</span>
              <span className="text-[11.5px] font-medium tracking-wider text-[oklch(0.45_0.1_305)]">{personaMbti}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {personaTags.slice(0, 4).map((t) => (
                <span key={t}
                  className="rounded-full border border-[oklch(0.9_0.04_320/0.6)] bg-white/80 px-2 py-[2px] text-[9.5px] tracking-wider text-[oklch(0.5_0.08_320)]">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* === SECTION 2 · INNER MONOLOGUE === */}
      <Section title="AI 内心独白" hint="INNER · VOICE" tone>
        <div className="relative">
          <span className="absolute -left-1 -top-2 text-[34px] font-serif leading-none text-[oklch(0.78_0.11_305/0.35)]">“</span>
          <p className="px-4 pt-1 text-center text-[14px] font-light italic leading-[1.7] text-foreground">
            {persona?.monologue ?? "如果你早点回来，我也不是不可以陪你玩一会。"}
          </p>
          <span className="absolute -right-1 -bottom-3 text-[34px] font-serif leading-none text-[oklch(0.78_0.11_305/0.35)]">”</span>
        </div>
        <div className="mt-3 text-right text-[10px] tracking-[0.25em] text-[oklch(0.55_0.05_300)]">—— {catName} · by NEKO</div>
      </Section>

      {/* === SECTION 3 · PERSONALITY ANALYSIS === */}
      <Section title="AI 人格解析" hint="PERSONALITY · ANALYSIS">
        <p className="text-[12.5px] leading-[1.8] text-foreground/85">
          {persona?.analysis ?? "它习惯先观察，再靠近。对陌生人保持礼貌距离，却会在熟悉的人面前偷偷放松。它不擅长直接表达喜欢，更愿意通过停留、陪伴和注视，表达自己的情感。"}
        </p>
      </Section>

      {/* === SECTION 4 · HOW YOUR CAT SEES YOU === */}
      <Section title="它眼中的你" hint="YOUR · ROLE">
        <p className="text-[12.5px] leading-[1.8] text-foreground/85">
          {persona?.ownerRole ?? "你是它最信任的人。虽然经常回来得有点晚，但它总会在门口等你。那份从未说出口的牵挂，藏在每一次回望里。"}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["温柔", "安全感", "可信", "陪伴者"].map((t) => (
            <span key={t}
              className="rounded-full px-2.5 py-[3px] text-[10px] tracking-wider text-white shadow-[0_4px_12px_-6px_oklch(0.78_0.11_305/0.45)]"
              style={{ background: "var(--gradient-selected)" }}>
              {t}
            </span>
          ))}
        </div>
      </Section>

      {/* === SECTION 5 · 个性画像 (3 rings) === */}
      <Section title="个性画像" hint="PERSONALITY · PORTRAIT">
        <div className="grid grid-cols-3 gap-2 pt-1">
          {personaTraits.map((t) => <Ring key={t.label} {...t} />)}
        </div>
      </Section>

      {/* === SECTION 6 · PERSONALITY TAGS (6 only) === */}
      <Section
        title="人格标签"
        hint="TAGS · 06"
        action={<button className="text-[10px] tracking-wider text-[oklch(0.5_0.1_305)]">查看全部 ›</button>}
      >
        <div className="flex flex-wrap gap-1.5">
          {personaTags.slice(0, 6).map((c, i) => (
            <span key={c} className={
              "rounded-full px-3 py-1.5 text-[11px] tracking-wide " +
              (i % 2 === 0
                ? "border border-[oklch(0.9_0.04_320/0.6)] bg-white/85 text-[oklch(0.45_0.08_320)]"
                : "text-white shadow-[0_6px_14px_-8px_oklch(0.78_0.11_305/0.4)]")
            } style={i % 2 === 1 ? { background: "var(--gradient-selected)" } : undefined}>
              {c}
            </span>
          ))}
        </div>
      </Section>

      {/* === SECTION 7 · AI OBSERVATION BASIS === */}
      <Section title="AI 观察依据" hint="WHY · AI · THINKS · SO">
        <div className="text-[10.5px] tracking-wider text-[oklch(0.55_0.06_300)]">最近 30 天观察</div>
        <div className="mt-2.5 space-y-2">
          {personaObservations.map((o) => (
            <div key={`${o.label}-${o.v}`} className="rounded-[14px] bg-white/55 px-3 py-2.5"
              style={{ border: "1px solid oklch(0.92 0.035 320 / 0.7)" }}>
              <div className="text-[10px] tracking-[0.22em] text-[oklch(0.56_0.06_300)]">{o.label}</div>
              <div className="mt-1 text-[12px] font-medium leading-[1.65] text-[oklch(0.42_0.08_305)]">{o.v}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-[14px] bg-white/55 px-3 py-2.5"
          style={{ border: "1px solid oklch(1 0 0 / 0.7)" }}>
          <span className="text-[10px] tracking-[0.3em] text-[oklch(0.55_0.08_320)]">AI 发现</span>
          <p className="mt-1 text-[12px] leading-[1.7] text-foreground/85">
            它更倾向于观察后行动，因此形成明显的<span className="font-medium text-[oklch(0.45_0.1_305)]">观察型</span>人格特征。
          </p>
        </div>
      </Section>

      {/* === BOTTOM ACTIONS === */}
      <div className="sticky bottom-0 z-20 mt-4 shrink-0 grid grid-cols-2 gap-3 px-5 pt-5 pb-[max(10px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => onRestart?.()}
          className="touch-manipulation rounded-full bg-white px-4 py-3.5 text-[13px] font-medium text-[oklch(0.5_0.1_305)] transition-transform duration-75 active:scale-[0.98]"
          style={{
            border: "1.5px solid #C7B3F2",
            boxShadow: "0 8px 20px -14px oklch(0.78 0.11 305 / 0.4)",
          }}>
          重新识别
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex touch-manipulation items-center justify-center rounded-full px-4 py-3.5 text-[13px] font-medium text-white transition-transform duration-75 active:scale-[0.98]"
          style={{
            background: "linear-gradient(90deg, #B69AEF 0%, #E6B8CF 100%)",
            boxShadow: "0 14px 28px -14px oklch(0.78 0.11 305 / 0.55)",
          }}>
          保存结果
        </button>
      </div>

      {shareOpen && (
        <ShareSheet
          onClose={closeShare}
          onWeChat={shareToWeChat}
          onMoments={shareToMoments}
          onSaveImage={saveImage}
          busy={busy}
        />
      )}
    </div>
  );
}

function ShareSheet({
  onClose,
  onWeChat,
  onMoments,
  onSaveImage,
  busy,
}: {
  onClose: () => void;
  onWeChat: () => void;
  onMoments: () => void;
  onSaveImage: () => void;
  busy: boolean;
}) {
  const items = [
    { key: "wechat", label: "微信好友", emoji: "💬", bg: "linear-gradient(135deg, #6BD46B, #2BB85C)", onClick: onWeChat },
    { key: "moments", label: "朋友圈", emoji: "🌈", bg: "linear-gradient(135deg, #FFB36B, #FF6BB5)", onClick: onMoments },
    { key: "save", label: "保存图片", emoji: "⬇️", bg: "linear-gradient(135deg, #B69AEF, #E6B8CF)", onClick: onSaveImage },
  ];
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px] animate-in fade-in duration-150" />
      <div
        className="relative mx-auto w-full max-w-[480px] rounded-t-[28px] bg-white/95 px-5 pb-7 pt-5 shadow-[0_-20px_50px_-20px_oklch(0.4_0.1_305/0.35)] backdrop-blur-xl"
        style={{ animation: "slideUp 220ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-[oklch(0.9_0.03_320)]" />
        <div className="mt-4 text-center text-[13px] font-medium text-foreground">分享我的猫人格</div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              disabled={busy && it.key === "save"}
              onClick={it.onClick}
              className="flex flex-col items-center gap-2 rounded-2xl py-3 transition-transform duration-75 active:scale-95 disabled:opacity-60"
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-[22px] text-white shadow-[0_10px_22px_-10px_oklch(0.4_0.1_305/0.45)]"
                style={{ background: it.bg }}
              >
                {it.emoji}
              </span>
              <span className="text-[11.5px] text-foreground/80">{it.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-[oklch(0.96_0.02_320)] py-3 text-[13px] font-medium text-[oklch(0.45_0.08_305)] active:scale-[0.99] transition-transform duration-75"
        >
          取消
        </button>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
  tone,
  action,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  tone?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="relative z-10 mx-5 mt-3 shrink-0 rounded-[22px] p-4"
      style={tone
        ? {
            background: "linear-gradient(160deg, oklch(0.98 0.03 320) 0%, oklch(0.97 0.04 270) 100%)",
            border: "1px solid oklch(1 0 0 / 0.6)",
            boxShadow: "0 14px 30px -22px oklch(0.78 0.11 305 / 0.35)",
          }
        : {
            background: "linear-gradient(180deg, oklch(1 0 0 / 0.88), oklch(0.98 0.015 320 / 0.7))",
            border: "1px solid oklch(1 0 0 / 0.7)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 14px 30px -22px oklch(0.78 0.11 305 / 0.3)",
          }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-medium text-foreground">{title}</span>
          <span className="max-w-full break-words text-[8px] tracking-[0.24em] leading-[1.4] text-[oklch(0.6_0.08_320)]">{hint}</span>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Ring({ icon, label, v }: { icon: string; label: string; v: number }) {
  const SIZE = 72;
  const STROKE = 8;
  const r = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * r;
  const id = `ring-${label}`;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 -rotate-90">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#B69AEF" />
              <stop offset="100%" stopColor="#E6B8CF" />
            </linearGradient>
          </defs>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="#EEE6F8" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${(C * v) / 100} ${C}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[15px] font-semibold tracking-tight text-[oklch(0.4_0.1_305)]">{v}%</span>
          <span className="text-[11px] leading-none">{icon}</span>
        </div>
      </div>
      <div className="mt-2 text-[11px] tracking-wide text-foreground/80">{label}</div>
    </div>
  );
}
