import hero from "@/assets/neko-hero.jpg";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Share2 } from "lucide-react";
import { SafeAreaTopBar } from "../screens/_shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { getCatAvatar, getCurrentSessionCatAvatar, useCatAvatar } from "../catAvatarStore";
import { useCatName } from "../catNameStore";
import { persistCatResult, useCatPersona, useCatProfile } from "../catProfileStore";
import { voicesStore } from "../app/voicesStore";
import { saveLocalNekoToCloud } from "@/lib/neko-cloud";
import { getPhotoDraft } from "./onboardingDraftStore";

const KEYWORDS = ["温柔观察者", "慢热", "安静陪伴"];
const EDITORIAL_FONT = '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", serif';

export function Screen6Result({
  onRestart,
  onBack,
  onPrev,
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
  const personaType = persona?.type ?? "安静观察型";
  const personaMbti = persona?.mbti ?? "ISFJ-A";
  const personaKeywords = buildPersonaKeywords(persona?.tags);
  const titleLines = useMemo(() => splitPersonaTitle(personaType), [personaType]);
  const heroImagePosition = useHeroImagePosition(avatarSrc);
  const goBack = onBack ?? onPrev;
  const heroDescription = shortenCopy(
    persona?.corePersonality || persona?.monologue || persona?.analysis || "它用自己的节奏观察世界，也珍惜熟悉的陪伴。",
    48,
  );
  const resultInsights = [
    {
      index: "01",
      title: "你可能一直误会它的一件事",
      text: shortenCopy(
        persona?.misunderstanding ||
          persona?.analysis ||
          "它不是不感兴趣，只是更习惯先把情况看明白。坐着不动时，也可能早已把注意力放在眼前。",
        76,
      ),
    },
    {
      index: "02",
      title: "它表达喜欢的方式",
      text: shortenCopy(
        persona?.loveLanguageInsight ||
          persona?.loveLanguage ||
          "如果它平时也常待在你附近却不紧贴，它可能更习惯用关注你的动向、共享同一片空间来表达亲近。",
        76,
      ),
    },
    {
      index: "03",
      title: `在${catName}眼里，你的位置`,
      text: shortenCopy(
        persona?.ownerRelationship ||
          persona?.ownerRole ||
          "你可能不是它时时刻刻都要黏着的人，但很可能是它默认会在的人。不需要反复确认你的存在，本身就是一种稳定的信任。",
        76,
      ),
    },
  ];

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
      className="absolute inset-0 overflow-y-auto scrollbar-none"
      style={{
        background:
          "linear-gradient(180deg, oklch(0.985 0.012 82) 0%, oklch(0.978 0.022 320) 54%, oklch(0.965 0.026 292) 100%)",
      }}
    >
      <div className="relative z-10">
        <SafeAreaTopBar
          left={
            goBack ? (
              <button
                type="button"
                aria-label="返回"
                onClick={goBack}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/38 text-[#201A28] shadow-[0_10px_24px_-18px_rgba(50,38,68,0.5)] backdrop-blur-md transition-transform active:scale-95"
              >
                <ChevronLeft className="h-[21px] w-[21px]" strokeWidth={2.4} />
              </button>
            ) : (
              <span className="block h-11 w-11" />
            )
          }
          center={<span aria-hidden className="block h-1 w-1" />}
          right={
            <button
              type="button"
              aria-label="分享"
              onClick={() => setShareOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/50 text-[#201A28] shadow-[0_10px_24px_-18px_rgba(50,38,68,0.5)] backdrop-blur-md transition-transform active:scale-95"
            >
              <Share2 className="h-[16px] w-[16px]" strokeWidth={2} />
            </button>
          }
        />

        <section className="relative isolate h-[clamp(550px,68dvh,640px)] min-h-[550px] w-full overflow-hidden rounded-b-[22px]">
          <img
            src={avatarSrc}
            alt={catName}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              objectPosition: heroImagePosition,
              filter: "saturate(0.97) contrast(0.98) brightness(1.03)",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, oklch(0.99 0.013 84 / 0.86) 0%, oklch(0.985 0.02 320 / 0.52) 28%, transparent 58%), linear-gradient(180deg, oklch(1 0 0 / 0.42) 0%, transparent 25%, transparent 52%, oklch(0.985 0.024 318 / 0.92) 100%)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute -left-24 -top-14 h-[260px] w-[280px] rounded-full bg-[#F8D7E7]/50 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -right-20 bottom-16 h-[260px] w-[220px] rounded-full bg-[#E7DBFF]/45 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[280px]"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, oklch(0.98 0.025 318 / 0.42) 30%, oklch(0.985 0.018 84 / 0.96) 100%)",
            }}
          />

          <div className="absolute left-6 top-[calc(env(safe-area-inset-top,0px)+92px)] z-20 text-[#5F5674]/78">
            <div className="text-[24px] font-medium leading-[1.02] tracking-[0.02em]">
              CAT
              <br />
              PROFILE
            </div>
            <div className="mt-4 h-px w-8 bg-[#786C91]/55" />
            <div className="mt-4 max-w-[94px] text-[13px] font-medium leading-[1.15] tracking-[0.02em]">
              A Kinder
              <br />
              World
              <br />
              With Cats
            </div>
          </div>

          <div className="absolute bottom-6 left-6 z-20 w-[min(74%,340px)]">
            <div className="text-[20px] font-medium leading-none text-[#2E2741]">
              {catName}
            </div>
            <div className="mt-2 text-[17px] font-semibold leading-none tracking-[0.03em] text-[#2E2741]">
              {personaMbti}
            </div>
            <div className="mt-4 h-px w-8 bg-[#75668E]/60" />
            <h1
              className="mt-3 text-[40px] font-bold leading-[1.06] text-[#2E225D] min-[420px]:text-[44px]"
              style={{
                fontFamily: EDITORIAL_FONT,
                textShadow: "0 1px 16px rgb(255 255 255 / 0.72)",
              }}
            >
              {titleLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h1>
            <p className="mt-4 max-w-[310px] text-[17px] font-medium leading-[26px] text-[#5A5370]">
              {heroDescription}
            </p>
            <div className="mt-5 grid max-w-[340px] grid-cols-3 gap-3">
              {personaKeywords.map((k) => (
                <span
                  key={k}
                  className="flex min-h-9 items-center justify-center rounded-full bg-white/72 px-3 text-center text-[14px] font-semibold leading-[18px] text-[#7259B5] shadow-[0_12px_26px_-22px_rgba(93,64,139,0.65)] backdrop-blur-md"
                >
                  {shortenLabel(k, 7)}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="relative z-10 px-5 pt-7">
        <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[22px] font-semibold leading-tight text-[#2D2540]">
            原来{catName}是这样的猫
          </span>
          <span className="text-[12px] font-medium tracking-[0.28em] text-[#A69AB7]">
            CAT · INSIGHT
          </span>
        </h2>
        <div className="mt-4 flex flex-col gap-3.5">
          {resultInsights.map((it) => (
            <article
              key={`${it.index}-${it.title}`}
              className="flex gap-4 rounded-[22px] bg-white/58 px-[22px] py-5 shadow-[0_16px_34px_-30px_rgba(91,65,130,0.45)] backdrop-blur-xl"
              style={{
                border: "1px solid rgb(255 255 255 / 0.78)",
              }}
            >
              <span className="mt-[2px] shrink-0 text-[16px] font-semibold leading-[24px] tracking-[0.12em] text-[#B197E0]">
                {it.index}
              </span>
              <div className="min-w-0">
                <h3 className="text-[19px] font-semibold leading-[25px] text-[#2F2942]">
                  {it.title}
                </h3>
                <p className="mt-2.5 text-[16px] leading-[26px] text-[#6C647C]">
                  {it.text}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="h-7" aria-hidden />

      <div
        className="sticky bottom-0 z-30 px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]"
        style={{
          background:
            "linear-gradient(180deg, rgb(250 245 251 / 0), rgb(250 245 251 / 0.88) 35%, rgb(249 242 250 / 0.98) 100%)",
          backdropFilter: "blur(18px)",
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onRestart?.()}
            className="touch-manipulation rounded-full bg-white/82 px-4 py-3.5 text-[17px] font-semibold text-[#7459B5] transition-transform duration-75 active:scale-[0.98]"
            style={{
              border: "1.5px solid #C5A6F0",
              boxShadow: "0 12px 24px -20px rgba(93, 64, 139, 0.48)",
            }}
          >
            重新识别
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex touch-manipulation items-center justify-center rounded-full px-4 py-3.5 text-[17px] font-semibold text-white transition-transform duration-75 active:scale-[0.98]"
            style={{
              background: "linear-gradient(90deg, #AA8BE8 0%, #E9ABC9 100%)",
              boxShadow: "0 16px 30px -16px rgba(148, 100, 203, 0.58)",
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

function useHeroImagePosition(src: string) {
  const [position, setPosition] = useState("60% 42%");

  useEffect(() => {
    let live = true;
    const image = new Image();
    image.onload = () => {
      if (!live) return;
      setPosition(resolveHeroImagePosition(image.naturalWidth, image.naturalHeight));
    };
    image.onerror = () => {
      if (live) setPosition("60% 42%");
    };
    image.src = src;
    return () => {
      live = false;
    };
  }, [src]);

  return position;
}

function resolveHeroImagePosition(width: number, height: number) {
  if (!width || !height) return "60% 42%";
  const ratio = width / height;
  if (ratio < 0.78) return "52% 38%";
  if (ratio > 1.25) return "64% 46%";
  return "60% 42%";
}

function splitPersonaTitle(title: string) {
  const clean = title.trim().replace(/\s+/g, "");
  if (!clean) return ["猫咪", "观察家"];
  if (clean.length <= 6) return [clean];

  const possessiveIndex = clean.indexOf("的");
  if (possessiveIndex >= 1 && possessiveIndex <= 4 && possessiveIndex < clean.length - 1) {
    return [clean.slice(0, possessiveIndex + 1), clean.slice(possessiveIndex + 1)];
  }

  const splitAt = Math.ceil(clean.length / 2);
  return [clean.slice(0, splitAt), clean.slice(splitAt)];
}

function buildPersonaKeywords(tags: string[] | undefined) {
  const merged = [...(tags ?? []), ...KEYWORDS]
    .map((tag) => tag.trim())
    .filter(Boolean);
  return Array.from(new Set(merged)).slice(0, 3);
}

function shortenCopy(value: string, maxLength: number) {
  const normalized = value
    .trim()
    .replace(/^[“"'「『]+|[”"'」』]+$/g, "")
    .replace(/\s+/g, " ");
  const chars = Array.from(normalized);
  if (chars.length <= maxLength) return normalized;

  const punctuation = new Set(["。", "！", "？", ".", "!", "?", "；", ";", "，", ","]);
  const min = Math.floor(maxLength * 0.62);
  let cutAt = -1;
  for (let i = Math.min(chars.length, maxLength) - 1; i >= min; i -= 1) {
    if (punctuation.has(chars[i])) {
      cutAt = i + 1;
      break;
    }
  }

  const sliced = chars
    .slice(0, cutAt > 0 ? cutAt : maxLength)
    .join("")
    .replace(/[，,；;：:]$/u, "。")
    .trim();
  return /[。！？.!?]$/u.test(sliced) ? sliced : `${sliced}。`;
}

function shortenLabel(value: string, maxLength: number) {
  const chars = Array.from(value.trim());
  if (chars.length <= maxLength) return value;
  return chars.slice(0, maxLength).join("");
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
