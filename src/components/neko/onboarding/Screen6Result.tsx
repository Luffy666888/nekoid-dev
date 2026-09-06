import hero from "@/assets/neko-hero.jpg";
import { useNavigate } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { Sparkles } from "../screens/_shared";
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { getCatAvatar, getCurrentSessionCatAvatar, useCatAvatar } from "../catAvatarStore";
import { useCatName } from "../catNameStore";
import { persistCatResult, useCatPersona, useCatProfile } from "../catProfileStore";
import { voicesStore } from "../app/voicesStore";
import { saveLocalNekoToCloud } from "@/lib/neko-cloud";
import { getPhotoDraft } from "./onboardingDraftStore";
import {
  generateLittleWorldPrompts,
  type LittleWorldImage,
  type LittleWorldScene,
} from "./littleWorldPrompts";

const KEYWORDS = ["温柔观察者", "慢热", "安静陪伴"];

const INSIGHTS = [
  { emoji: "👀", title: "先观察，再靠近", desc: "不会马上亲近，但会偷偷观察你。" },
  { emoji: "🏠", title: "很需要自己的安全区", desc: "熟悉的位置和气味会让它安心。" },
  { emoji: "❤️", title: "喜欢你，但不一定黏着你", desc: "待在附近，就是它表达亲近的方式。" },
];

function compactSentence(value: string | undefined, fallback: string, maxLength = 24) {
  const normalized = (value || fallback).replace(/[“”"]/g, "").replace(/\s+/g, "").trim();
  const firstSentence = normalized.split(/[。！？]/)[0] || fallback;
  return firstSentence.length > maxLength ? `${firstSentence.slice(0, maxLength)}…` : firstSentence;
}

function compactOwnerRole(value: string | undefined) {
  const normalized = (value || "").replace(/[“”"]/g, "").trim();
  const matched = normalized.match(/你是(?:它)?([^，。！？]{2,8})/);
  return matched?.[1] || (normalized.length <= 8 ? normalized : "生活主理人") || "生活主理人";
}

export function Screen6Result({
  onRestart,
  onBack,
}: {
  onNext?: () => void;
  onPrev?: () => void;
  onRestart?: () => void;
  onBack?: () => void;
} = {}) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const profile = useCatProfile();
  const uploaded = useCatAvatar();
  const avatarSrc =
    getCurrentSessionCatAvatar() ??
    profile.avatar ??
    getPhotoDraft().avatar ??
    uploaded ??
    getCatAvatar() ??
    hero;
  const catName = useCatName();
  const persona = useCatPersona();
  const personaType = persona?.type ?? "奶油小绅士";
  const personaMbti = persona?.mbti ?? "ISFJ-A";
  const personaKeywords = persona?.tags?.length ? persona.tags.slice(0, 3) : KEYWORDS;
  const personaInsights = persona?.observations?.length
    ? persona.observations.slice(0, 3).map((item, index) => ({
        emoji: ["👀", "🏠", "❤️"][index] ?? "✦",
        title: item.label,
        desc: item.value,
      }))
    : INSIGHTS;
  const generatedPrompts = generateLittleWorldPrompts({
    catName,
    mbti: personaMbti,
    tags: personaKeywords,
    description: persona?.analysis ?? persona?.monologue ?? "温柔地观察世界，也珍惜熟悉的陪伴。",
  });
  const generatedImages = (
    persona as (typeof persona & { littleWorldImages?: LittleWorldImage[] }) | null
  )?.littleWorldImages;
  const scenes = generatedPrompts.map((scene, index) => ({
    ...scene,
    src: generatedImages?.[index]?.url || avatarSrc,
    prompt: generatedImages?.[index]?.prompt || scene.prompt,
  }));
  const [activeScene, setActiveScene] = useState(0);
  const ownerBadge = compactOwnerRole(persona?.ownerRole);
  const ownerDescription = compactSentence(
    persona?.ownerRole || persona?.analysis,
    "你让它放心做自己，也给它稳稳的安全感",
  );
  const ownerMonologue = compactSentence(persona?.monologue, "只要你在，我就知道这里是家", 28);

  const closeShare = () => setShareOpen(false);

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
    try {
      localStorage.setItem(
        "neko:result",
        JSON.stringify({
          name: catName,
          type: personaType,
          mbti: personaMbti,
          savedAt: Date.now(),
        }),
      );
    } catch {
      // Continue saving the profile even when local storage is unavailable.
    }
    persistCatResult();
    voicesStore.clear();
    void saveLocalNekoToCloud({ includeVoices: false }).catch(() => undefined);
    navigate({ to: "/app" });
  };

  return (
    <div
      ref={cardRef}
      className="absolute inset-0 flex flex-col overflow-y-auto scrollbar-none"
      style={{
        background:
          "linear-gradient(180deg, oklch(0.975 0.022 320) 0%, oklch(0.965 0.03 300) 50%, oklch(0.96 0.035 285) 100%)",
      }}
    >
      <Sparkles count={14} />

      {/* ================= SCREEN 1 : 这是我的猫 ================= */}
      <div className="relative z-10 shrink-0">
        <div className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-5 pt-[50px]">
          {onBack ? (
            <button
              type="button"
              aria-label="返回"
              onClick={onBack}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 backdrop-blur-md transition-transform active:scale-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 6l-6 6 6 6"
                  stroke="oklch(0.45 0.12 305)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : (
            <span />
          )}
          <span className="text-[10px] tracking-[0.5em] font-medium text-[oklch(0.55_0.06_320)]">
            NEKO.ID
          </span>
          <button
            type="button"
            aria-label="分享"
            onClick={() => setShareOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 backdrop-blur-md text-[oklch(0.45_0.12_305)] transition-transform active:scale-95"
          >
            <Share2 className="h-[16px] w-[16px]" strokeWidth={2} />
          </button>
        </div>

        {/* HERO */}
        <div className="relative h-[520px] w-full overflow-hidden">
          <img
            src={avatarSrc}
            alt={catName}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-x-0 bottom-0 h-[300px]"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, oklch(0.97 0.025 320 / 0.6) 50%, oklch(0.965 0.03 300) 100%)",
            }}
          />

          <div className="absolute left-6 right-6 bottom-5 z-10">
            <div
              className="text-[15px] font-medium leading-none tracking-[0.02em] text-[oklch(0.5_0.045_300)]"
              style={{ textShadow: "0 2px 14px oklch(1 0 0 / 0.9)" }}
            >
              {catName}
            </div>
            <div className="mt-1.5 flex flex-col gap-1.5">
              <span
                className="text-[26px] font-semibold leading-tight"
                style={{
                  background: "linear-gradient(90deg, #A88BEA 0%, #C896E0 45%, #EFAFC8 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {personaType}
              </span>
              <span
                className="flex items-baseline gap-2"
                style={{ textShadow: "0 2px 10px oklch(1 0 0 / 0.9)" }}
              >
                <span className="text-[11px] font-normal tracking-[0.24em] text-[oklch(0.62_0.04_300)]">
                  MBTI
                </span>
                <span className="text-[15px] font-medium text-[oklch(0.45_0.11_300)]">
                  {personaMbti}
                </span>
              </span>
            </div>
            <p
              className="mt-3 text-[14px] font-normal leading-[1.7] text-[oklch(0.42_0.045_300)]"
              style={{ textShadow: "0 1px 6px oklch(1 0 0 / 0.95)" }}
            >
              “{persona?.monologue ?? "不黏人，但永远会待在离你不远的地方。"}”
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {personaKeywords.map((k) => (
                <span
                  key={k}
                  className="rounded-full bg-white/85 backdrop-blur px-3 py-[6px] text-[12px] font-normal text-[oklch(0.5_0.08_305)]"
                  style={{ boxShadow: "0 8px 20px -14px oklch(0.6 0.12 305 / 0.6)" }}
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ================= SCREEN 2 ================= */}

      {/* 小世界 */}
      <section className="relative z-10 mt-7 shrink-0">
        <h2 className="flex items-baseline gap-2 px-6 text-[16px] font-semibold text-[oklch(0.32_0.05_300)]">
          {catName}的小世界
          <span className="text-[10px] font-normal tracking-[0.22em] text-[oklch(0.72_0.035_300)]">
            LITTLE · WORLD
          </span>
        </h2>
        <div
          className="mt-2.5 flex snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-none px-[15%] pb-1"
          onScroll={(event) => {
            const element = event.currentTarget;
            const cards = Array.from(element.children) as HTMLElement[];
            const center = element.scrollLeft + element.clientWidth / 2;
            const nearest = cards.reduce(
              (best, card, index) => {
                const cardCenter = card.offsetLeft + card.offsetWidth / 2;
                const distance = Math.abs(cardCenter - center);
                return distance < best.distance ? { index, distance } : best;
              },
              { index: 0, distance: Number.POSITIVE_INFINITY },
            );
            setActiveScene(nearest.index);
          }}
        >
          {scenes.map((scene, index) => (
            <SceneCard key={scene.id} scene={scene} index={index} total={scenes.length} />
          ))}
        </div>
        <div className="mt-1.5 flex justify-center gap-1.5">
          {scenes.map((scene, index) => (
            <span
              key={scene.id}
              className="h-[5px] rounded-full"
              style={{
                width: index === activeScene ? 16 : 5,
                background:
                  index === activeScene
                    ? "linear-gradient(90deg,#B69AEF,#E6B8CF)"
                    : "oklch(0.86 0.04 310)",
              }}
            />
          ))}
        </div>
      </section>

      {/* 洞察 */}
      <section className="relative z-10 mx-5 mt-7 shrink-0">
        <h2 className="flex items-baseline gap-2 text-[16px] font-semibold text-[oklch(0.32_0.05_300)]">
          原来它是这样的猫
          <span className="text-[10px] font-normal tracking-[0.22em] text-[oklch(0.72_0.035_300)]">
            CAT · INSIGHT
          </span>
        </h2>
        <div className="mt-3.5 flex flex-col gap-2.5">
          {personaInsights.map((it) => (
            <div
              key={it.title}
              className="flex items-start gap-3 rounded-[20px] p-4"
              style={{
                background:
                  "linear-gradient(180deg, oklch(1 0 0 / 0.85), oklch(0.99 0.015 320 / 0.65))",
                border: "1px solid oklch(1 0 0 / 0.8)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 14px 30px -24px oklch(0.6 0.12 305 / 0.5)",
              }}
            >
              <span className="shrink-0 text-[18px] leading-none pt-[3px]">{it.emoji}</span>
              <div className="min-w-0">
                <div className="text-[14px] font-medium text-[oklch(0.33_0.045_300)]">
                  {it.title}
                </div>
                <div className="mt-1 text-[13px] leading-[1.6] text-[oklch(0.57_0.04_300)]">
                  {it.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 情绪高潮：你在它心里 */}
      <section
        className="relative z-10 mx-5 mt-7 shrink-0 overflow-hidden rounded-[26px]"
        style={{
          background:
            "linear-gradient(160deg, oklch(0.97 0.035 330 / 0.95), oklch(0.955 0.045 295 / 0.95))",
          border: "1px solid oklch(1 0 0 / 0.8)",
          boxShadow: "0 20px 44px -26px oklch(0.6 0.14 305 / 0.6)",
        }}
      >
        <div className="grid min-h-[168px] grid-cols-[3fr_2fr] items-stretch">
          {/* 左侧：文字 */}
          <div className="min-w-0 px-5 py-5">
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-[15px] leading-[1.5] pt-[3px]">❤️</span>
              <h2 className="min-w-0 flex-1 break-words text-[16px] font-semibold leading-[1.5] text-[oklch(0.32_0.05_300)]">
                在{catName}眼里，你是什么？
              </h2>
            </div>
            <div
              className="mt-3 inline-flex rounded-full px-3.5 py-1.5 text-[13px] font-medium text-white"
              style={{ background: "linear-gradient(90deg, #B69AEF, #E6B8CF)" }}
            >
              {ownerBadge}
            </div>
            <p className="mt-3 text-[14px] font-medium leading-[1.55] text-[oklch(0.4_0.045_300)]">
              {ownerDescription}
            </p>
            <p className="mt-2 border-l-2 border-[oklch(0.72_0.1_305)] pl-3 text-[12.5px] italic leading-[1.6] text-[oklch(0.52_0.055_300)]">
              “{ownerMonologue}”
            </p>
          </div>

          {/* 右侧：图片 */}
          <div className="relative min-w-0 overflow-hidden">
            <img
              src={avatarSrc}
              alt={`${catName}的头像`}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div
              className="absolute inset-y-0 left-0 w-[28px]"
              style={{
                background: "linear-gradient(90deg, oklch(0.97 0.035 330 / 0.95), transparent)",
              }}
            />
          </div>
        </div>
      </section>

      {/* 底部操作 */}
      <div
        className="sticky bottom-0 z-20 mt-7 shrink-0 px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]"
        style={{
          background:
            "linear-gradient(180deg, transparent, oklch(0.96 0.035 290 / 0.92) 35%, oklch(0.96 0.035 285 / 0.98) 100%)",
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onRestart?.()}
            className="touch-manipulation rounded-full bg-white px-4 py-3.5 text-[14px] font-medium text-[oklch(0.5_0.1_305)] transition-transform duration-75 active:scale-[0.98]"
            style={{
              border: "1.5px solid #C7B3F2",
              boxShadow: "0 8px 20px -14px oklch(0.78 0.11 305 / 0.4)",
            }}
          >
            重新识别
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex touch-manipulation items-center justify-center rounded-full px-4 py-3.5 text-[14px] font-medium text-white transition-transform duration-75 active:scale-[0.98]"
            style={{
              background: "linear-gradient(90deg, #B69AEF 0%, #E6B8CF 100%)",
              boxShadow: "0 14px 28px -14px oklch(0.78 0.11 305 / 0.55)",
            }}
          >
            保存结果
          </button>
        </div>
      </div>

      {shareOpen && <ShareSheet onClose={closeShare} onSaveImage={saveImage} busy={busy} />}
    </div>
  );
}

function SceneCard({
  scene,
  index,
  total,
}: {
  scene: LittleWorldScene & { src: string };
  index: number;
  total: number;
}) {
  return (
    <article
      className="relative h-[260px] w-[70vw] max-w-[274px] shrink-0 snap-center overflow-hidden rounded-[24px]"
      data-ai-prompt={scene.prompt}
      style={{
        border: "1px solid oklch(1 0 0 / 0.85)",
        boxShadow: "0 18px 36px -26px oklch(0.6 0.12 305 / 0.55)",
      }}
    >
      <div className="relative h-full w-full overflow-hidden bg-[oklch(0.93_0.035_305)]">
        <img
          src={scene.src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-xl"
        />
        <img
          src={scene.src}
          alt={scene.title}
          loading="lazy"
          className="absolute inset-y-0 left-1/2 h-full aspect-[3/4] -translate-x-1/2 object-contain object-center"
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[52%]"
          style={{
            background:
              "linear-gradient(180deg, transparent, oklch(0.2 0.05 300 / 0.55) 55%, oklch(0.18 0.05 300 / 0.72))",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-4 pb-4">
          <div className="min-w-0">
            <div
              className="text-[14px] font-medium tracking-[0.06em] text-white/95"
              style={{ textShadow: "0 1px 8px oklch(0.2 0.05 300 / 0.6)" }}
            >
              {scene.title}
            </div>
            <p
              className="mt-1 text-[12.5px] leading-[1.6] text-white/80"
              style={{ textShadow: "0 1px 8px oklch(0.2 0.05 300 / 0.6)" }}
            >
              {scene.line}
            </p>
          </div>
          <div className="shrink-0 pb-[2px] text-[10px] tracking-[0.16em] text-white/70">
            {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
          </div>
        </div>
      </div>
    </article>
  );
}

function ShareSheet({
  onClose,
  onSaveImage,
  busy,
}: {
  onClose: () => void;
  onSaveImage: () => void;
  busy: boolean;
}) {
  const items = [
    {
      key: "wechat",
      label: "微信好友",
      emoji: "💬",
      bg: "linear-gradient(135deg, #6BD46B, #2BB85C)",
      onClick: () => {
        onClose();
        toast("正在调起微信…");
      },
    },
    {
      key: "moments",
      label: "朋友圈",
      emoji: "🌈",
      bg: "linear-gradient(135deg, #FFB36B, #FF6BB5)",
      onClick: () => {
        onClose();
        toast("正在打开朋友圈发布页…");
      },
    },
    {
      key: "save",
      label: "保存图片",
      emoji: "⬇️",
      bg: "linear-gradient(135deg, #B69AEF, #E6B8CF)",
      onClick: onSaveImage,
    },
  ];
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] animate-in fade-in duration-150" />
      <div
        className="relative mx-auto w-full max-w-[480px] rounded-t-[28px] bg-white/95 px-5 pb-7 pt-5 shadow-[0_-20px_50px_-20px_oklch(0.4_0.1_305/0.35)] backdrop-blur-xl"
        style={{ animation: "slideUp 220ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-[oklch(0.9_0.03_320)]" />
        <div className="mt-4 text-center text-[15px] font-medium text-foreground">
          分享我的猫人格
        </div>
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
              <span className="text-[13px] text-foreground/80">{it.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-[oklch(0.96_0.02_320)] py-3.5 text-[15px] font-medium text-[oklch(0.45_0.08_305)] active:scale-[0.99] transition-transform duration-75"
        >
          取消
        </button>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}
