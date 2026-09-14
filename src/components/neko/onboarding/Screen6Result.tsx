import hero from "@/assets/neko-hero.jpg";
import { useNavigate } from "@tanstack/react-router";
import { Bug, ChevronLeft, Share2, X } from "lucide-react";
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
import { nekoText, nekoTitleForLength } from "../typography";

const KEYWORDS = ["先观察再靠近", "喜欢待在附近", "边界感强", "会用眼神表达"];

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
  const [debugOpen, setDebugOpen] = useState(false);
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
  const personaType = normalizePersonaTitle(persona?.type ?? "安静观察型");
  const personaMbti = persona?.mbti ?? "ISFJ-A";
  const personaKeywords = buildPersonaKeywords(persona?.tags);
  const titleLines = useMemo(() => splitPersonaTitle(personaType), [personaType]);
  const titleClass = nekoTitleForLength(personaType);
  const heroImagePosition = useHeroImagePosition(avatarSrc);
  const goBack = onBack ?? onPrev;
  const heroDescription = shortenCopy(
    persona?.corePersonality ||
      persona?.monologue ||
      persona?.analysis ||
      "它用自己的节奏观察世界，也珍惜熟悉的陪伴。",
    50,
  );
  const resultInsights = [
    {
      index: "01",
      title: "你可能一直误会它的一件事",
      text: shortenCopy(
        persona?.misunderstanding ||
          persona?.analysis ||
          "它不是不感兴趣，只是更习惯先把情况看明白。坐着不动时，也可能早已把注意力放在眼前。",
        60,
      ),
    },
    {
      index: "02",
      title: "它表达喜欢的方式",
      text: shortenCopy(
        persona?.loveLanguageInsight ||
          persona?.loveLanguage ||
          "如果它平时也常待在你附近却不紧贴，它可能更习惯用关注你的动向、共享同一片空间来表达亲近。",
        60,
      ),
    },
    {
      index: "03",
      title: `在${catName}眼里，你的位置`,
      text: shortenCopy(
        persona?.ownerRelationship ||
          persona?.ownerRole ||
          "你可能不是它时时刻刻都要黏着的人，但很可能是它默认会在的人。不需要反复确认你的存在，本身就是一种稳定的信任。",
        60,
      ),
    },
  ];
  const canShowPersonaDebug = import.meta.env.DEV && Boolean(persona?.generation);

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

        <section className="relative isolate h-[clamp(650px,80dvh,700px)] min-h-[650px] w-full overflow-hidden rounded-b-[22px]">
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
                "linear-gradient(90deg, oklch(0.99 0.012 78 / 0.42) 0%, oklch(0.99 0.012 78 / 0.22) 28%, transparent 52%), linear-gradient(180deg, oklch(1 0 0 / 0.16) 0%, transparent 30%, transparent 56%, oklch(0.985 0.018 78 / 0.74) 100%)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[280px]"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, oklch(0.985 0.015 82 / 0.34) 38%, oklch(0.985 0.018 84 / 0.88) 100%)",
            }}
          />

          <div
            className={`absolute left-6 top-[calc(env(safe-area-inset-top,0px)+92px)] z-20 ${nekoText.personaEditorial} text-[#5F5674]/78`}
          >
            <div className={nekoText.personaEditorial}>
              CAT
              <br />
              PROFILE
            </div>
            <div className="mt-4 h-px w-8 bg-[#786C91]/55" />
            <div className={`mt-4 max-w-[94px] ${nekoText.personaEditorialSmall}`}>
              A Kinder
              <br />
              World
              <br />
              With Cats
            </div>
          </div>

          <div className="absolute bottom-6 left-6 right-6 z-20 max-w-[360px]">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[#2E2741]">
              <span className="neko-text-module-title">{catName}</span>
              <span className="neko-text-badge">
                {personaMbti}
              </span>
            </div>
            <div className="mt-4 h-px w-8 bg-[#75668E]/60" />
            <h1
              className={`mt-3 ${titleClass} text-[#2E225D]`}
              style={{
                textShadow: "0 1px 16px rgb(255 255 255 / 0.72)",
              }}
            >
              {titleLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h1>
            <p className="mt-4 max-w-[330px] neko-text-body text-[#5A5370]">
              {heroDescription}
            </p>
            <div className="mt-5 flex max-w-[340px] flex-wrap gap-x-[11px] gap-y-[10px]">
              {personaKeywords.map((k) => (
                <span
                  key={k}
                  className="flex min-h-8 items-center justify-center rounded-full bg-white/78 px-3 text-center neko-text-badge text-[#7259B5] shadow-[0_12px_26px_-22px_rgba(93,64,139,0.65)] backdrop-blur-md"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="relative z-10 px-5 pt-7">
        <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="neko-text-module-title text-[#2D2540]">
            原来{catName}是这样的猫
          </span>
          <span className="neko-text-micro text-[#A69AB7]">
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
              <span className="mt-[2px] shrink-0 neko-text-body text-[#B197E0]">
                {it.index}
              </span>
              <div className="min-w-0">
                <h3 className="neko-text-card-title text-[#2F2942]">
                  {it.title}
                </h3>
                <p className="mt-2.5 neko-text-body text-[#6C647C]">{it.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="h-28" aria-hidden />

      <div
        className="sticky bottom-0 z-30 px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]"
        style={{
          background:
            "linear-gradient(180deg, rgb(250 245 251 / 0), rgb(250 245 251 / 0.88) 35%, rgb(249 242 250 / 0.98) 100%)",
          backdropFilter: "blur(18px)",
        }}
      >
        {canShowPersonaDebug && (
          <button
            type="button"
            onClick={() => setDebugOpen(true)}
            className="mb-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-[#211832]/88 px-4 neko-text-button text-white shadow-[0_14px_30px_-18px_rgba(33,24,50,0.7)] active:scale-[0.98]"
          >
            <Bug className="h-4 w-4" strokeWidth={2.2} />
            Debug Persona
          </button>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
          <button
            type="button"
            onClick={() => onRestart?.()}
            className="flex min-h-[52px] w-full min-w-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-full bg-white/82 px-3 neko-text-button text-[#7459B5] transition-transform duration-75 active:scale-[0.98]"
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
            className="flex min-h-[52px] w-full min-w-0 touch-manipulation items-center justify-center whitespace-nowrap rounded-full px-3 neko-text-button text-white transition-transform duration-75 active:scale-[0.98]"
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
      {debugOpen && persona?.generation && (
        <PersonaDebugPanel generation={persona.generation} onClose={() => setDebugOpen(false)} />
      )}
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
  const clean = normalizePersonaTitle(title);
  if (!clean) return ["猫咪", "观察家"];
  if (clean.length <= 6) return [clean];

  const possessiveIndex = clean.indexOf("的");
  if (possessiveIndex >= 2 && possessiveIndex <= clean.length - 4) {
    return [clean.slice(0, possessiveIndex + 1), clean.slice(possessiveIndex + 1)];
  }

  const min = 3;
  const max = Math.max(min, clean.length - 3);
  let splitAt = Math.round(clean.length / 2);
  splitAt = Math.min(Math.max(splitAt, min), max);
  return [clean.slice(0, splitAt), clean.slice(splitAt)];
}

function buildPersonaKeywords(tags: string[] | undefined) {
  const merged = [...(tags ?? []), ...KEYWORDS].map(normalizePersonaTag).filter(Boolean);
  return Array.from(new Set(merged)).slice(0, 4);
}

const titleReplacements: Record<string, string> = {
  亲近有边界: "边界感亲近派",
  好奇但谨慎: "好奇谨慎型",
  热情有分寸: "热情有分寸型",
  不黏但在旁: "不黏人陪伴型",
  先观察再靠近: "慢热观察型",
  会先看清楚: "先看再行动",
  先看再动: "先看再行动",
};

const labelReplacements: Array<[RegExp, string]> = [
  [/观察优先/g, "先观察再靠近"],
  [/保留距离/g, "不急着靠近"],
  [/心动不动/g, "想靠近又犹豫"],
  [/小小?探长|小小?侦探/g, "会先看清楚"],
  [/互动控场王/g, "喜欢互动"],
  [/眼神(?:发令机|施压|催促)/g, "会用眼神表达"],
  [/克制讨关注/g, "安静等你发现"],
  [/稳态陪伴/g, "喜欢待在附近"],
  [/精准互动/g, "表达得很清楚"],
];

const bannedCopyPattern =
  /营业|控场|发令|施压|稳态|高质|策略性|仪式感极强|端庄定点|克制讨关注|精准互动|节奏掌控|掌控节奏/u;
const jargonSuffixPattern = /[\p{Script=Han}A-Za-z0-9]{1,8}[控王机]$/u;

function normalizePersonaTitle(value: string) {
  let clean = value.trim().replace(/\s+/g, "");
  clean = titleReplacements[clean] ?? clean;
  const length = Array.from(clean).length;
  if (
    length < 4 ||
    length > 14 ||
    bannedCopyPattern.test(clean) ||
    jargonSuffixPattern.test(clean)
  ) {
    return "安静观察型";
  }
  return clean;
}

function normalizePersonaTag(value: string) {
  let clean = value.trim().replace(/\s+/g, "");
  for (const [pattern, replacement] of labelReplacements) {
    clean = clean.replace(pattern, replacement);
  }
  clean = clean.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "");
  const length = Array.from(clean).length;
  if (
    length < 2 ||
    length > 8 ||
    bannedCopyPattern.test(clean) ||
    jargonSuffixPattern.test(clean)
  ) {
    return "";
  }
  return clean;
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

function PersonaDebugPanel({
  generation,
  onClose,
}: {
  generation: NonNullable<ReturnType<typeof useCatPersona>>["generation"];
  onClose: () => void;
}) {
  if (!generation) return null;
  const sections = [
    ["Raw Inputs", generation.rawInputs],
    ["Questionnaire Answers", generation.questionnaireAnswers],
    ["Behavior Profile", generation.behaviorProfile],
    ["Grounded Traits", generation.groundedTraits],
    ["Unsupported Claims", generation.unsupportedClaims],
    ["Stage 2 Insights", generation.insights],
    ["Final Copy", generation.finalCopy],
    ["Eval Scores", generation.evalResult],
    ["Prompt Version", generation.promptVersion],
    [
      "Model / Latency / Token Usage",
      {
        model: generation.model,
        retryCount: generation.retryCount,
        stageLogs: generation.stageLogs,
      },
    ],
  ] as const;

  return (
    <div className="fixed inset-0 z-50 bg-[#120D1D]/48 p-4 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[460px] flex-col overflow-hidden rounded-[22px] bg-[#fbf8ff] shadow-[0_24px_70px_-34px_rgba(25,18,37,0.8)]">
        <div className="flex min-h-[58px] items-center justify-between border-b border-[#E7DDF4] px-4">
          <div>
            <div className="neko-text-micro text-[#7B63B5]">
              PERSONA DEBUG
            </div>
            <div className="mt-0.5 neko-text-tiny text-[#7A7188]">
              {generation.generationId} · {generation.inputHash}
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭 Debug"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#372B4F] shadow-[0_10px_22px_-18px_rgba(55,43,79,0.7)] active:scale-95"
          >
            <X className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-3">
            {sections.map(([title, value]) => (
              <section
                key={title}
                className="rounded-[14px] border border-[#E9DFF5] bg-white/78 p-3"
              >
                <h3 className="neko-text-micro text-[#342C48]">{title}</h3>
                <pre className="mt-2 max-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-[#201832] p-3 neko-text-tiny text-[#F6EFFA]">
                  {JSON.stringify(value ?? null, null, 2)}
                </pre>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
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
        <div className="mt-4 text-center neko-text-support text-foreground">
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
                className="flex h-12 w-12 items-center justify-center rounded-full neko-text-module-title text-white shadow-[0_10px_22px_-10px_oklch(0.4_0.1_305/0.45)]"
                style={{ background: it.bg }}
              >
                {it.emoji}
              </span>
              <span className="neko-text-button text-foreground/80">{it.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-[oklch(0.96_0.02_320)] py-3.5 neko-text-button text-[oklch(0.45_0.08_305)] active:scale-[0.99] transition-transform duration-75"
        >
          取消
        </button>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}
