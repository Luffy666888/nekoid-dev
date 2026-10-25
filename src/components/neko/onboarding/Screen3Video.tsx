import { useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeCatVideoClip } from "@/lib/neko-ai.functions";
import { BackButton } from "./BackButton";
import { getCatProfile } from "../catProfileStore";
import { getVideoDraft, setVideoDraft, type VideoDraftClip } from "./onboardingDraftStore";
import {
  getNekoUploadLimitError,
  NEKO_MAX_ONBOARDING_VIDEO_BYTES,
  NEKO_MAX_ONBOARDING_VIDEO_LABEL,
} from "@/lib/neko-upload-limits";

type Clip = VideoDraftClip;

function getOnboardingVideoLimitError(file: File) {
  return getNekoUploadLimitError(file, "video", {
    maxBytes: NEKO_MAX_ONBOARDING_VIDEO_BYTES,
    maxLabel: NEKO_MAX_ONBOARDING_VIDEO_LABEL,
  });
}

export function Screen3Video({
  onNext,
  onPrev,
}: { onNext?: () => void; onPrev?: () => void } = {}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const clipsRef = useRef<HTMLDivElement | null>(null);
  const [clips, setClipsState] = useState<Clip[]>(() => getVideoDraft());
  const [checking, setChecking] = useState(false);
  const runAnalyzeVideoClip = useServerFn(analyzeCatVideoClip);
  const setClips = (next: Clip[] | ((current: Clip[]) => Clip[])) => {
    setClipsState((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      setVideoDraft(resolved);
      return resolved;
    });
  };
  const patchClip = (id: string, patch: Partial<Clip>) => {
    setClips((current) => current.map((clip) => (clip.id === id ? { ...clip, ...patch } : clip)));
  };

  const openPicker = () => {
    fileRef.current?.click();
  };

  const analyzeSelectedVideo = async (file: File, clip: Clip) => {
    try {
      const meta = await extractVideoMeta(file);
      patchClip(clip.id, {
        thumb: meta.thumb,
        duration: meta.duration,
        frameCount: meta.frames.length,
      });
      const observation = await runAnalyzeVideoClip({
        data: {
          profile: getCatProfile(),
          clipId: clip.id,
          label: clip.label,
          duration: meta.duration,
          frames: meta.frames,
        },
      });
      if (!observation.containsCat) {
        patchClip(clip.id, {
          analysisStatus: "failed",
          analysisError: "没有识别到猫咪",
          observation,
        });
        return;
      }
      patchClip(clip.id, { analysisStatus: "ready", analysisError: undefined, observation });
    } catch (error) {
      console.error("NEKO video analysis failed", error);
      patchClip(clip.id, {
        analysisStatus: "failed",
        analysisError: "视频分析失败",
      });
      toast("有段视频暂时没有分析成功，可删除后重新上传", { icon: "🎞️" });
    }
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const remain = Math.max(0, 3 - clips.length);
    const candidates = files.slice(0, remain);
    const oversized = candidates.filter((file) => getOnboardingVideoLimitError(file));
    const picked = candidates.filter((file) => !getOnboardingVideoLimitError(file));
    if (files.length > remain) toast("最多只能上传 3 个视频哦~");
    if (files.length > 1) toast("为了更快返回页面，喵一下会一次处理 1 个视频，可继续添加喵～");
    if (oversized.length) {
      toast(
        oversized.length === 1
          ? getOnboardingVideoLimitError(oversized[0])!
          : `${oversized.length} 个视频超过 ${NEKO_MAX_ONBOARDING_VIDEO_LABEL}，已跳过`,
        { icon: "🎞️" },
      );
    }
    if (!picked.length) return;
    const baseId = Date.now();
    const next: Clip[] = picked.map((f, i) => ({
      id: `${baseId}_${i}`,
      gradient: "linear-gradient(135deg, oklch(0.88 0.09 320), oklch(0.86 0.08 0))",
      duration: "解析中",
      label: f.name.replace(/\.[^.]+$/, "").slice(0, 8) || "新视频",
      analysisStatus: "analyzing",
    }));
    setClips((c) => [...c, ...next]);
    window.setTimeout(
      () => clipsRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      80,
    );
    picked.forEach((file, i) => {
      window.setTimeout(() => {
        void analyzeSelectedVideo(file, next[i]);
      }, 0);
    });
  };

  const removeClip = (id: string) => setClips((c) => c.filter((x) => x.id !== id));

  const handleContinue = async () => {
    if (clips.length === 0) {
      toast("需要上传猫咪视频哦~");
      return;
    }
    const analyzingCount = clips.filter((clip) => clip.analysisStatus === "analyzing").length;
    if (analyzingCount > 0) {
      toast("视频还在 AI 观察中，稍等一秒再继续喵～", { icon: "🐾" });
      return;
    }
    setChecking(true);
    try {
      const readyClips = clips.filter(
        (clip) => clip.analysisStatus === "ready" && clip.observation?.containsCat,
      );
      if (!readyClips.length) {
        toast("视频还没有分析成功，请换一段猫咪日常再试～", { icon: "🎞️" });
        return;
      }
      if (readyClips.length < clips.length) {
        toast("有视频没分析成功，本次报告会先使用已分析的视频", { icon: "✨" });
      }
      onNext?.();
    } catch {
      toast("视频观察结果读取失败，请稍后再试～", { icon: "✨" });
    } finally {
      setChecking(false);
    }
  };

  const canAdd = clips.length < 3;

  return (
    <div
      className="absolute inset-0 flex flex-col pt-[58px] overflow-hidden"
      style={{ background: "var(--gradient-cream)" }}
    >
      <BackButton onPrev={onPrev} />
      <div className="relative z-10 flex-1 overflow-y-auto scrollbar-none pb-[160px]">
        <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onFiles} />
        <div className="relative z-10 mb-4 flex items-center justify-end px-7">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={
                  "h-1 rounded-full " +
                  (i <= 2 ? "w-6 bg-[oklch(0.82_0.1_320)]" : "w-3 bg-[oklch(0.9_0.02_310)]")
                }
              />
            ))}
          </div>
        </div>
        <div className="relative z-10 px-7">
          <h1 className="neko-text-main-title text-foreground">上传猫咪视频</h1>
          <p className="mt-2 neko-text-support text-[var(--miao-text-secondary)]">
            上传 1～3 个视频展示猫咪日常，单个不超过 {NEKO_MAX_ONBOARDING_VIDEO_LABEL}
          </p>
        </div>
        <div className="relative z-10 mx-5 mt-6">
          <button
            type="button"
            onClick={canAdd ? openPicker : () => toast("最多只能上传 3 个视频哦~")}
            className="miao-card relative block w-full overflow-hidden border-dashed p-7 text-center active:scale-[0.99] transition-all duration-200"
            style={{ minHeight: 200 }}
          >
            <div className="relative mx-auto mt-1 flex h-14 w-14 items-center justify-center rounded-[22px] bg-[var(--miao-brand)] text-white neko-text-module-title">
              ▶
            </div>
            <div className="relative mt-3 neko-text-support text-foreground">轻触上传视频</div>
            <div className="relative mt-1 neko-text-tiny text-[oklch(0.58_0.05_300)]">
              每次 1 个 · 可添加 3 次 · ≤ {NEKO_MAX_ONBOARDING_VIDEO_LABEL}
            </div>
          </button>
        </div>
        {clips.length > 0 && (
          <div ref={clipsRef} className="relative z-10 mt-4">
            <div className="mb-2 flex items-center justify-between px-6">
              <div className="neko-text-tiny text-[oklch(0.55_0.06_300)]">
                已上传 · {clips.length} / 3
              </div>
              {canAdd && (
                <div className="neko-text-tiny text-[oklch(0.6_0.05_300)]">
                  可继续添加 {3 - clips.length} 个
                </div>
              )}
            </div>
            <div className="flex gap-2.5 overflow-x-auto scrollbar-none px-5 pb-1 snap-x snap-mandatory [scroll-padding-left:1.25rem]">
              {clips.map((c) => (
                <div key={c.id} className="snap-start shrink-0 w-[42%]">
                  <UploadedClip
                    thumb={c.thumb}
                    gradient={c.gradient}
                    duration={c.duration}
                    label={c.label}
                    status={c.analysisStatus}
                    error={c.analysisError}
                    onRemove={() => removeClip(c.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="miao-card-compact relative z-10 mx-5 mt-5 select-none p-4">
          <div className="neko-text-card-title text-foreground">建议捕捉</div>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <Tip label="走动" />
            <Tip label="叫声" />
            <Tip label="玩耍" />
          </div>
          <div className="mt-2.5 rounded-xl bg-[oklch(0.97_0.025_320/0.8)] px-3 py-2 neko-text-support text-[oklch(0.5_0.06_300)]">
            越自然的日常画面，AI 越能感受到它的性格
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-20 px-5 pt-5 pb-[max(10px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={checking}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!checking) handleContinue();
          }}
          className="miao-primary-button flex w-full touch-manipulation select-none items-center justify-center disabled:opacity-70"
        >
          {checking ? "识别中…" : "继续"}
        </button>
      </div>
    </div>
  );
}

function Tip({ label }: { label: string }) {
  return (
    <div className="flex min-h-12 items-center justify-center rounded-[14px] border border-[var(--miao-border)] bg-white/52 px-3 py-2 text-center">
      <span className="neko-text-support font-medium text-[var(--miao-text-secondary)]">
        {label}
      </span>
    </div>
  );
}

function UploadedClip({
  thumb,
  gradient,
  duration,
  label,
  status,
  error,
  onRemove,
}: {
  thumb?: string;
  gradient: string;
  duration: string;
  label: string;
  status?: Clip["analysisStatus"];
  error?: string;
  onRemove?: () => void;
}) {
  const loading = status === "analyzing" || (!thumb && duration === "解析中");
  const failed = status === "failed";
  const ready = status === "ready";
  const badge = ready ? "已分析" : failed ? "失败" : loading ? "处理中" : duration;
  return (
    <div
      className="group relative overflow-hidden rounded-2xl shadow-[0_8px_20px_-12px_oklch(0.78_0.11_305/0.45)]"
      style={{ aspectRatio: "3 / 4" }}
    >
      {thumb ? (
        <img src={thumb} alt={label} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: gradient }}>
          <div
            className="absolute inset-0 opacity-45"
            style={{
              background:
                "linear-gradient(120deg, transparent 0%, oklch(1 0 0 / 0.55) 45%, transparent 70%)",
              backgroundSize: "220% 100%",
              animation: "shimmer 1.2s ease-in-out infinite",
            }}
          />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
      {loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/10 backdrop-blur-[1px]">
          <span className="h-7 w-7 rounded-full border-2 border-white/55 border-t-white animate-spin" />
          <span className="mt-2 rounded-full bg-white/85 px-2.5 py-1 neko-text-tiny text-[oklch(0.48_0.08_305)] shadow-[0_6px_14px_-8px_oklch(0_0_0/0.35)]">
            {thumb ? "AI观察中" : "抽帧中"}
          </span>
        </div>
      ) : failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 text-white backdrop-blur-[1px]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/85 neko-text-body text-[oklch(0.5_0.1_320)]">
            !
          </span>
          <span className="mt-2 max-w-[80%] rounded-full bg-white/90 px-2.5 py-1 text-center neko-text-tiny text-[oklch(0.48_0.08_305)] shadow-[0_6px_14px_-8px_oklch(0_0_0/0.35)]">
            {error ?? "分析失败"}
          </span>
        </div>
      ) : (
        <div className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 neko-text-tiny text-[oklch(0.5_0.1_320)] backdrop-blur">
          ▶
        </div>
      )}
      <span className="absolute right-1.5 top-1.5 rounded-full bg-black/35 px-1.5 py-0.5 neko-text-tiny text-white backdrop-blur">
        {badge}
      </span>
      <button
        aria-label="remove"
        onClick={onRemove}
        className="absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 neko-text-micro text-[oklch(0.4_0.05_300)] backdrop-blur shadow-[0_2px_8px_-2px_oklch(0_0_0/0.25)] active:scale-90 active:bg-white transition-all duration-150"
      >
        ×
      </button>
      <div className="absolute inset-x-1.5 bottom-1.5 truncate text-center neko-text-tiny text-white drop-shadow">
        {label}
      </div>
    </div>
  );
}

type ExtractedVideoFrame = {
  imageDataUrl: string;
  timestampLabel: string;
  position: "start" | "middle" | "end";
};

function formatVideoTime(seconds: number) {
  const d = Math.max(0, Math.round(seconds || 0));
  const mm = String(Math.floor(d / 60)).padStart(2, "0");
  const ss = String(d % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function extractVideoMeta(file: File): Promise<{
  thumb: string;
  duration: string;
  frames: ExtractedVideoFrame[];
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const timer = window.setTimeout(() => fail(new Error("video meta timeout")), 12_000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    function cleanup() {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    const capture = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = video.videoWidth || 360;
        const h = video.videoHeight || 480;
        const scale = Math.min(1, 512 / Math.max(w, h));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no ctx");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.72);
      } catch (e) {
        fail(e instanceof Error ? e : new Error("video thumbnail error"));
      }
    };
    const seek = (time: number) =>
      new Promise<void>((seekResolve, seekReject) => {
        if (Math.abs(video.currentTime - time) < 0.01) {
          if (video.readyState >= 2) {
            window.requestAnimationFrame(() => seekResolve());
            return;
          }
          const onLoaded = () => {
            video.removeEventListener("loadeddata", onLoaded);
            video.removeEventListener("error", onLoadedError);
            seekResolve();
          };
          const onLoadedError = () => {
            video.removeEventListener("loadeddata", onLoaded);
            video.removeEventListener("error", onLoadedError);
            seekReject(new Error("video seek error"));
          };
          video.addEventListener("loadeddata", onLoaded, { once: true });
          video.addEventListener("error", onLoadedError, { once: true });
          return;
        }
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", onError);
          seekResolve();
        };
        const onError = () => {
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", onError);
          seekReject(new Error("video seek error"));
        };
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });
        video.currentTime = time;
      });
    video.onloadedmetadata = async () => {
      try {
        const rawDuration =
          Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        const maxTime = Math.max(0, rawDuration - 0.12);
        const candidates = [
          {
            position: "start" as const,
            time: Math.min(maxTime, Math.max(0.1, rawDuration * 0.12)),
          },
          {
            position: "middle" as const,
            time: Math.min(maxTime, Math.max(0.1, rawDuration * 0.5)),
          },
          { position: "end" as const, time: Math.min(maxTime, Math.max(0.1, rawDuration * 0.88)) },
        ];
        const frames: ExtractedVideoFrame[] = [];
        for (const candidate of candidates) {
          await seek(candidate.time);
          const imageDataUrl = capture();
          if (!imageDataUrl) throw new Error("video frame empty");
          frames.push({
            imageDataUrl,
            timestampLabel: formatVideoTime(candidate.time),
            position: candidate.position,
          });
        }
        if (!frames.length) throw new Error("video frame empty");
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          thumb: frames[0].imageDataUrl,
          duration: formatVideoTime(rawDuration),
          frames,
        });
      } catch (e) {
        fail(e instanceof Error ? e : new Error("video frame error"));
      }
    };
    video.onerror = () => fail(new Error("video error"));
  });
}
