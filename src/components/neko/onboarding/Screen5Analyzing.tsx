import { Sparkles } from "../screens/_shared";
import { BackButton } from "./BackButton";
import { useEffect, useState } from "react";
import { getCurrentSessionCatAvatar } from "../catAvatarStore";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateCatPersona } from "@/lib/neko-ai.functions";
import { getCatProfile, setCatPersona } from "../catProfileStore";
import { getPhotoDraft } from "./onboardingDraftStore";

const STEPS = [
  "正在识别行为模式",
  "正在分析情绪表达",
  "正在建立立体人格模型",
  "正在推测 MBTI 倾向",
  "正在生成内心独白",
  "正在整合人格特征",
];

export function Screen5Analyzing({ onNext, onPrev }: { onNext?: () => void; onPrev?: () => void } = {}) {
  const DURATION = 8000;
  const [pct, setPct] = useState(0);
  const [progressDone, setProgressDone] = useState(false);
  const [status, setStatus] = useState<"running" | "success" | "failed">("running");
  const [attempt, setAttempt] = useState(0);
  const profile = getCatProfile();
  const draft = getPhotoDraft();
  const avatarSrc = getCurrentSessionCatAvatar() ?? draft.avatar ?? null;
  const runGeneratePersona = useServerFn(generateCatPersona);
  useEffect(() => {
    let cancelled = false;
    setStatus("running");
    const generate = async () => {
      try {
        const currentProfile = getCatProfile();
        const currentDraft = getPhotoDraft();
        const persona = await runGeneratePersona({
          data: {
            profile: currentProfile,
            imageDataUrl: getCurrentSessionCatAvatar() ?? currentDraft.avatar ?? null,
          },
        });
        if (!cancelled) {
          setCatPersona(persona);
          setStatus("success");
        }
      } catch (error) {
        if (!cancelled) {
          console.error("NEKO persona generation failed", error);
          setStatus("failed");
          toast.error("AI 没有生成成功，结果页不会使用 demo 内容，请检查终端错误后重试～");
        }
      }
    };
    generate();
    return () => {
      cancelled = true;
    };
  }, [runGeneratePersona, attempt]);

  useEffect(() => {
    setPct(0);
    setProgressDone(false);
    const start = performance.now();
    let raf = 0;
    // easeInOutCubic — slow start, smooth middle, gentle settle at 100
    const ease = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      setPct(ease(t) * 100);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setProgressDone(true);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [attempt]);

  useEffect(() => {
    if (status === "success" && progressDone && onNext) {
      const timer = window.setTimeout(() => onNext(), 500);
      return () => window.clearTimeout(timer);
    }
  }, [onNext, progressDone, status]);

  const retry = () => {
    setAttempt((v) => v + 1);
  };

  const r = 92;
  const C = 2 * Math.PI * r;
  const activeIdx = Math.min(STEPS.length - 1, Math.floor((pct / 100) * STEPS.length));
  const displayPct = Math.round(pct);
  return (
    <div className="absolute inset-0 flex flex-col items-center pt-[64px] text-foreground"
      style={{ background: "linear-gradient(180deg, oklch(0.98 0.018 80) 0%, oklch(0.95 0.04 320) 55%, oklch(0.95 0.04 270) 100%)" }}>
      <Sparkles count={34} />
      <BackButton onPrev={onPrev} />
      <div className="relative z-10 text-[10px] tracking-[0.45em] text-[oklch(0.55_0.08_320)]">A I · A N A L Y Z I N G</div>
      <div className="relative z-10 mt-2 text-[22px] font-light text-foreground">{status === "failed" ? "识别失败" : "AI 分析中"}</div>
      <div className="relative z-10 mt-0.5 text-[12px] text-[oklch(0.58_0.05_300)]">
        {status === "failed" ? "没有使用 demo 结果，请重试真实识别" : "正在构建属于它的人格画像"}
      </div>

      <div className="relative z-10 mt-7 h-[212px] w-[212px]">
        <div className="absolute inset-3 rounded-full opacity-75 blur-3xl animate-breathe"
          style={{ background: "radial-gradient(circle, oklch(0.92 0.07 320 / 0.78), oklch(0.92 0.05 260 / 0.22) 62%, transparent 78%)" }} />
        <div className="absolute inset-5 rounded-full border border-white/70" />
        <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90">
          <defs>
            <linearGradient id="ring" x1="0" x2="1">
              <stop offset="0" stopColor="oklch(0.82 0.11 320)" />
              <stop offset="1" stopColor="oklch(0.84 0.09 0)" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r={r} fill="none" stroke="oklch(1 0 0 / 0.72)" strokeWidth="4" />
          <circle cx="100" cy="100" r={r} fill="none" stroke="url(#ring)" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${(C * pct) / 100} ${C}`} />
        </svg>
        <div className="absolute inset-[29px] overflow-hidden rounded-full bg-white p-1.5 shadow-[0_20px_42px_-24px_oklch(0.78_0.11_305/0.5)]">
          <div className="relative h-full w-full overflow-hidden rounded-full">
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="h-full w-full rounded-full object-cover" loading="lazy" width={1024} height={1024} />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full bg-[oklch(0.985_0.018_320)] text-[11px] tracking-[0.22em] text-[oklch(0.58_0.06_300)]">
                等待头像
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 rounded-full"
              style={{ background: "linear-gradient(180deg, oklch(1 0 0 / 0.04), oklch(0.86 0.08 320 / 0.12))" }} />
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/92 px-3 py-1 text-[11px] tracking-[0.25em] text-[oklch(0.5_0.1_320)] shadow-[0_8px_20px_-12px_oklch(0.78_0.11_305/0.42)]">
          {displayPct}%
        </div>
      </div>

      <div className="relative z-10 mt-9 w-full px-7 space-y-2">
        {STEPS.map((t, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <div
              key={i}
              className={`relative flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-2.5 text-[12px] backdrop-blur transition-all duration-500 ${
                active ? "bg-white/85 shadow-[0_8px_20px_-12px_oklch(0.78_0.11_305/0.45)] scale-[1.01]" : "bg-white/65"
              }`}
              style={{ opacity: done || active ? 1 : 0.55 }}
            >
              {active && (
                <span
                  className="pointer-events-none absolute inset-0 animate-shimmer"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, oklch(0.95 0.05 320 / 0.55) 50%, transparent 100%)",
                    backgroundSize: "200% 100%",
                  }}
                />
              )}
              <span
                className={
                  done
                    ? "h-2 w-2 rounded-full bg-[oklch(0.78_0.11_305)]"
                    : active
                    ? "h-2 w-2 rounded-full bg-[oklch(0.84_0.09_0)] animate-pulse-soft shadow-[0_0_10px_oklch(0.84_0.09_0/0.8)]"
                    : "h-2 w-2 rounded-full bg-[oklch(0.9_0.02_300)]"
                }
              />
              <span className={`relative ${done || active ? "text-foreground" : "text-[oklch(0.65_0.04_300)]"}`}>
                {t}{!active && "..."}
              </span>
              {done && (
                <span className="relative ml-auto text-[11px] text-[oklch(0.55_0.1_305)]">✓</span>
              )}
              {active && (
                <span className="relative ml-auto flex gap-1">
                  <span className="h-1 w-1 rounded-full bg-[oklch(0.6_0.1_320)] animate-pulse-soft" style={{ animationDelay: "0ms" }} />
                  <span className="h-1 w-1 rounded-full bg-[oklch(0.6_0.1_320)] animate-pulse-soft" style={{ animationDelay: "200ms" }} />
                  <span className="h-1 w-1 rounded-full bg-[oklch(0.6_0.1_320)] animate-pulse-soft" style={{ animationDelay: "400ms" }} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      {status === "failed" && (
        <div className="relative z-10 mt-5 flex w-full gap-3 px-7">
          <button
            type="button"
            onClick={onPrev}
            className="flex-1 rounded-full bg-white/80 px-5 py-3 text-[13px] font-medium text-[oklch(0.5_0.1_305)] backdrop-blur active:scale-[0.98]"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            返回修改
          </button>
          <button
            type="button"
            onClick={retry}
            className="flex-1 rounded-full px-5 py-3 text-[13px] font-medium text-white active:scale-[0.98]"
            style={{ background: "var(--gradient-cta)", boxShadow: "0 14px 28px -14px oklch(0.78 0.11 305 / 0.55)" }}
          >
            重新识别
          </button>
        </div>
      )}
      <p className="relative z-10 mt-auto mb-7 text-center text-[12px] leading-relaxed text-[oklch(0.55_0.06_300)]">
        每只猫，<br /><span className="text-foreground font-medium">都有独一无二的灵魂</span>
      </p>
    </div>
  );
}
