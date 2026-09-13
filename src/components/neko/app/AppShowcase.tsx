import { Sparkles } from "../screens/_shared";
import { forwardRef, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, Share2, Trash2 } from "lucide-react";
import { CAT_GRADIENTS, useVoices, voiceAnalysisText, voicesStore } from "./voicesStore";
import { useCatAvatar } from "../catAvatarStore";
import { useCatName } from "../catNameStore";
import { detectCatFace } from "@/lib/catface.functions";
import { clearPublishPhoto, getPublishPhoto, setPublishPhoto, usePublishPhoto } from "./publishPhotoStore";
import { generateCatVoice } from "@/lib/neko-ai.functions";
import { clearCatPersona, getCatPersona, getCatProfile, updateCatProfile, useCatPersona } from "../catProfileStore";
import { clearPublishDraft, getPublishScene, getPublishVoice, setPublishScene, setPublishVoice } from "./publishDraftStore";
import { deleteCloudVoice, saveLocalNekoToCloud, signOutNekoCloud, useNekoCloudAuth } from "@/lib/neko-cloud";
import { getNekoUploadLimitError, NEKO_MAX_UPLOAD_LABEL } from "@/lib/neko-upload-limits";
export { CAT_GRADIENTS };

// ---------- shared bits ----------
export function StatusBar() {
  return null;
}

const backButtonClass =
  "flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[oklch(0.5_0.1_320)] backdrop-blur transition-all duration-150 active:scale-[0.95] active:bg-white/95";

function BackIcon() {
  return <ChevronLeft size={16} strokeWidth={2.25} />;
}

function AppBackButton({
  to,
  onClick,
  label = "返回",
}: {
  to?: "/app" | "/app/publish" | "/app/publish/background" | "/app/me";
  onClick?: () => void;
  label?: string;
}) {
  if (to) {
    return (
      <Link to={to} aria-label={label} className={backButtonClass} style={{ boxShadow: "var(--shadow-soft)" }}>
        <BackIcon />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={backButtonClass} style={{ boxShadow: "var(--shadow-soft)" }}>
      <BackIcon />
    </button>
  );
}

export function CatAvatar({ size = 44, grad = CAT_GRADIENTS[0], usePhoto = false }: { size?: number; grad?: string; usePhoto?: boolean }) {
  const uploaded = useCatAvatar();
  if (usePhoto && uploaded) {
    return (
      <div
        className="relative shrink-0 overflow-hidden rounded-full bg-white"
        style={{ width: size, height: size, boxShadow: "inset 0 0 0 1.5px oklch(1 0 0 / 0.7), 0 6px 16px -8px oklch(0.70 0.14 305 / 0.45)" }}
      >
        <img src={uploaded} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className="relative shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size, background: grad, boxShadow: "inset 0 0 0 1.5px oklch(1 0 0 / 0.7), 0 6px 16px -8px oklch(0.70 0.14 305 / 0.45)" }}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full">
        <g>
          <path d="M11 16 L14 9 L18 15 Z" fill="white" opacity="0.95" />
          <path d="M33 16 L30 9 L26 15 Z" fill="white" opacity="0.95" />
          <ellipse cx="22" cy="25" rx="13" ry="11" fill="white" />
          <circle cx="17" cy="25" r="1.6" fill="oklch(0.4 0.04 300)" />
          <circle cx="27" cy="25" r="1.6" fill="oklch(0.4 0.04 300)" />
          <path d="M21 29 Q22 30.5 23 29" stroke="oklch(0.55 0.06 300)" strokeWidth="0.8" fill="none" strokeLinecap="round" />
          <circle cx="14.5" cy="27" r="1.2" fill="oklch(0.88 0.06 0 / 0.6)" />
          <circle cx="29.5" cy="27" r="1.2" fill="oklch(0.88 0.06 0 / 0.6)" />
        </g>
      </svg>
    </div>
  );
}

export function TabBar({ active }: { active: "home" | "publish" | "me" }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none">
      <div className="pointer-events-auto flex items-center justify-around border-t border-white/70 bg-white/88 px-6 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"
        style={{ boxShadow: "0 -10px 30px -20px oklch(0.55 0.1 305 / 0.35)" }}>
        <Link to="/app"><SimpleTabIcon symbol="⌂" label="首页" active={active === "home"} /></Link>
        <Link to="/app/publish"><SimpleTabIcon symbol="♡" label="心声" active={active === "publish"} /></Link>
        <Link to="/app/me"><SimpleTabIcon symbol="♙" label="我的" active={active === "me"} /></Link>
      </div>
    </div>
  );
}
function SimpleTabIcon({ symbol, label, active }: { symbol: string; label: string; active: boolean }) {
  return (
    <div className="flex min-w-[64px] flex-col items-center gap-0.5 py-1" style={{ color: active ? "#9B76CB" : "#7B7290" }}>
      <span className="text-[20px] leading-none">{symbol}</span>
      <span className="text-[10px] font-medium tracking-[0.16em]">{label}</span>
    </div>
  );
}
function TabIcon({ label, active, Icon }: { label: string; active: boolean; Icon: React.ComponentType<{ active: boolean }> }) {
  const color = active ? "#B69AEF" : "#7B7290";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        {active && (
          <div className="absolute inset-0 -m-1.5 rounded-full opacity-60 blur-md"
            style={{ background: "radial-gradient(circle, #B69AEF 0%, transparent 70%)" }} />
        )}
        <Icon active={active} />
      </div>
      <span className="text-[10px] font-medium tracking-[0.18em]" style={{ color }}>{label}</span>
    </div>
  );
}

function CatVoiceIcon({ active }: { active: boolean }) {
  const color = active ? "#B69AEF" : "#7B7290";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* pure rounded speech bubble — no cat ears */}
      <path d="M4 11 C4 7.4 7.6 5 12 5 C16.4 5 20 7.4 20 11 C20 14.6 16.4 17 12 17 C11.2 17 10.4 16.92 9.7 16.78 L6.3 19 C5.85 19.3 5.25 18.95 5.32 18.4 L5.72 15.55 C4.65 14.3 4 12.75 4 11 Z" />
      {/* tiny sparkle inside */}
      <path d="M12 10.2 L12 12.2 M11 11.2 L13 11.2" strokeWidth="1.6" />
    </svg>
  );
}

function CatHeadIcon({ active }: { active: boolean }) {
  const color = active ? "#B69AEF" : "#7B7290";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* cat head silhouette with two ears */}
      <path d="M5.5 9.5 L4.2 4.5 C4.1 4.1 4.5 3.8 4.85 4 L9 6.2" />
      <path d="M18.5 9.5 L19.8 4.5 C19.9 4.1 19.5 3.8 19.15 4 L15 6.2" />
      <path d="M4.8 12.5 C4.8 8.6 8.05 6 12 6 C15.95 6 19.2 8.6 19.2 12.5 C19.2 16.6 16 19.5 12 19.5 C8 19.5 4.8 16.6 4.8 12.5 Z" />
      {/* whisker hints */}
      <path d="M10.6 13.6 Q11.3 14.2 12 13.7 Q12.7 14.2 13.4 13.6" strokeWidth="1.5" />
    </svg>
  );
}

export function ScreenShell({ children, bg = "var(--gradient-cream)" }: { children: React.ReactNode; bg?: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: bg }}>
      <Sparkles count={14} />
      {children}
    </div>
  );
}

// ---------- shared overlays ----------
function LoadingOverlay({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center" style={{ background: "oklch(1 0 0 / 0.6)", backdropFilter: "blur(10px)" }}>
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-breathe rounded-full opacity-70 blur-xl" style={{ background: "radial-gradient(circle, oklch(0.88 0.1 320 / 0.95), transparent 70%)" }} />
        <svg className="relative h-16 w-16 animate-spin" viewBox="0 0 50 50" style={{ animationDuration: "1.6s" }}>
          <circle cx="25" cy="25" r="20" fill="none" stroke="oklch(0.93 0.03 320)" strokeWidth="3" />
          <circle cx="25" cy="25" r="20" fill="none" stroke="oklch(0.78 0.11 305)" strokeWidth="3" strokeLinecap="round" strokeDasharray="50 200" />
        </svg>
      </div>
      <div className="mt-5 text-[13px] font-medium text-foreground">{title}</div>
      {hint && <div className="mt-1 text-[11px] tracking-[0.2em] text-[oklch(0.55_0.06_300)]">{hint}</div>}
    </div>
  );
}

function ErrorOverlay({ title, hint, onRetry, onCancel }: { title: string; hint?: string; onRetry: () => void; onCancel: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center px-8" style={{ background: "oklch(1 0 0 / 0.6)", backdropFilter: "blur(10px)" }}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full text-[28px]" style={{ background: "linear-gradient(135deg, oklch(0.95 0.06 30), oklch(0.93 0.07 10))", boxShadow: "var(--shadow-soft)" }}>!</div>
      <div className="mt-5 text-center text-[14px] font-medium text-foreground">{title}</div>
      {hint && <div className="mt-1 text-center text-[11.5px] leading-relaxed text-[oklch(0.55_0.06_300)]">{hint}</div>}
      <div className="mt-5 flex w-full max-w-[240px] gap-2.5">
        <button onClick={onCancel} className="flex-1 rounded-full bg-white/85 py-3 text-[12.5px] text-foreground backdrop-blur active:bg-white/95 active:scale-[0.98] transition-all duration-150" style={{ boxShadow: "var(--shadow-soft)" }}>取消</button>
        <button onClick={onRetry} className="flex-1 rounded-full py-3 text-[12.5px] font-medium text-white active:scale-[0.97] active:brightness-[0.92] transition-all duration-150" style={{ background: "var(--gradient-cta)" }}>重试</button>
      </div>
    </div>
  );
}

function ConfirmSheet({ open, title, hint, confirmText = "确认", danger, onConfirm, onCancel }: { open: boolean; title: string; hint?: string; confirmText?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" />
      <div className="relative rounded-t-[28px] bg-white/95 px-6 pb-6 pt-5 backdrop-blur-xl" style={{ boxShadow: "0 -20px 40px -20px oklch(0.3 0.05 300 / 0.35)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[oklch(0.85_0.02_300)]" />
        <div className="text-center text-[15px] font-medium text-foreground">{title}</div>
        {hint && <div className="mt-1.5 text-center text-[12px] leading-relaxed text-[oklch(0.55_0.06_300)]">{hint}</div>}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button onClick={onCancel} className="rounded-full bg-[oklch(0.96_0.02_300)] py-3 text-[12.5px] text-[oklch(0.5_0.06_300)]">取消</button>
          <button onClick={onConfirm} className="rounded-full py-3 text-[12.5px] font-medium text-white active:scale-[0.97] active:brightness-[0.92] transition-all duration-150"
            style={{ background: danger ? "linear-gradient(135deg, oklch(0.7 0.16 25), oklch(0.66 0.18 15))" : "var(--gradient-cta)" }}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Screen 1: 首页 ----------
export function ScreenHome() {
  const voices = useVoices();
  const catName = useCatName();
  const persona = useCatPersona();
  const groups = groupByDay(voices);
  const [moreIdx, setMoreIdx] = useState<number | null>(null);
  const [confirmDelIdx, setConfirmDelIdx] = useState<number | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);
  const sharingVoice = moreIdx !== null ? voices[moreIdx] : null;
  const uploadedPhoto = usePublishPhoto();
  const handleComingSoon = (label: string) => {
    toast(`即将支持${label}分享`);
  };
  const handleSavePoster = async () => {
    if (!posterRef.current) return;
    setGenerating(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(posterRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#FBF8FF" });
      const link = document.createElement("a");
      link.download = `neko-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      setMoreIdx(null);
      toast.success("已保存到相册喵～");
    } catch {
      toast.error("生成失败，再试一次喵～");
    } finally {
      setGenerating(false);
    }
  };
  const handleDelete = () => {
    if (confirmDelIdx === null) return;
    const voice = voices[confirmDelIdx];
    voicesStore.removeAt(confirmDelIdx);
    void deleteCloudVoice(voice).catch(() => undefined);
    setConfirmDelIdx(null);
    toast.success("心声已删除");
  };
  return (
    <ScreenShell>
      <StatusBar />
      <div className="absolute inset-0 overflow-y-auto scrollbar-none pt-[52px] pb-[120px]">
        {/* ── SECTION 1 · Compact cat profile ─────────────── */}
        <div
          data-cat-context-header
          className="mx-5 rounded-[20px] border border-white/65 bg-[oklch(0.98_0.018_315_/_0.72)] px-3.5 py-2.5 backdrop-blur-md"
        >
          <div className="flex min-h-[56px] items-center gap-3">
            <div className="shrink-0" aria-label={`当前猫咪：${catName}`}>
              <CatAvatar size={56} usePhoto />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="text-[18px] font-semibold text-foreground">{catName}</div>
                <span className="rounded-full bg-white/65 px-2 py-0.5 text-[13px] tracking-[0.06em] text-[oklch(0.52_0.08_320)]">{persona?.mbti ?? "INTJ-A"}</span>
              </div>
              <div className="mt-1 text-[15px] text-[oklch(0.55_0.05_300)]">{persona?.type ?? "高冷观察者"}</div>
            </div>
            <Link to="/app/profile" className="flex min-h-11 shrink-0 items-center px-1 text-[14px] font-medium text-[oklch(0.5_0.1_320)] active:opacity-60">查看人格&nbsp;›</Link>
          </div>
        </div>

        {/* ── SECTION 2 · 猫咪心声 title only ─────────────── */}
        <div className="mt-5 flex items-center px-4">
          <div className="flex items-center gap-2 text-[23px] font-semibold text-foreground">
            <span className="text-[22px]">💭</span>
            <span>猫咪心声</span>
          </div>
        </div>

        {/* ── SECTION 3 · Feed ────────────────────────────── */}
        {voices.length === 0 ? (
          <EmptyFeed />
        ) : (
          <div className="mt-3 px-3">
            {groups.map((g) => (
              <div key={g.label} className="mb-2">
                <DayDivider label={g.label} />
                <div className="flex flex-col gap-5">
                  {g.items.map(({ v, idx }) => (
                    <TimelineRow key={idx} v={v} idx={idx} onMore={setMoreIdx} onPhotoClick={setPreviewPhoto} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <TabBar active="home" />

      {previewPhoto && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/92" onClick={() => setPreviewPhoto(null)}>
          <button type="button" aria-label="关闭原图" className="absolute left-4 top-[max(16px,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-[26px] text-white">×</button>
          <img src={previewPhoto} alt="猫咪完整原图" className="h-full w-full object-contain" />
        </div>
      )}

      {/* minimal manage sheet — 生成长图 + 删除 */}
      {moreIdx !== null && sharingVoice && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end" onClick={() => !generating && setMoreIdx(null)}>
          <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" />
          <div className="relative rounded-t-[32px] bg-[oklch(0.99_0.008_320)] px-6 pb-8 pt-3.5 backdrop-blur-xl"
            style={{ boxShadow: "0 -24px 60px -20px oklch(0.3 0.05 300 / 0.4)" }} onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-5 h-[2px] w-[72px] rounded-full" style={{ background: "#D8D2E2" }} />
            <div className="mt-2 flex items-start justify-center gap-12 pb-2">
              <button
                onClick={generating ? undefined : handleSavePoster}
                disabled={generating}
                className="flex flex-col items-center gap-2.5 active:scale-[0.95] transition-all duration-150 disabled:opacity-70"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: "linear-gradient(135deg, #B69AEF, #E6B8CF)", boxShadow: "0 10px 22px -10px oklch(0.5 0.1 305 / 0.5)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="14" height="14" rx="3" />
                    <path d="M3 13l3.5-3.5a2 2 0 0 1 2.8 0L17 17" />
                    <circle cx="13" cy="8" r="1.2" />
                    <path d="M19 14v6" />
                    <path d="M16 17l3 3 3-3" />
                  </svg>
                </span>
                <span className="text-[12.5px]" style={{ color: "#3E315E" }}>{generating ? "生成中…" : "保存长图"}</span>
              </button>
              <button
                onClick={() => { const i = moreIdx; setMoreIdx(null); setConfirmDelIdx(i); }}
                className="flex flex-col items-center gap-2.5 active:scale-[0.95] transition-all duration-150"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#FCE8ED" }}>
                  <Trash2 size={22} strokeWidth={2} color="#F08AA3" />
                </span>
                <span className="text-[12.5px]" style={{ color: "#7B7290" }}>删除</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offscreen poster template for long-image generation */}
      <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden>
        {sharingVoice && <PosterTemplate ref={posterRef} v={sharingVoice} photo={sharingVoice.media ?? uploadedPhoto ?? ""} />}
      </div>

      <ConfirmSheet open={confirmDelIdx !== null} title="确定删除这条心声吗？" hint={`删除后无法恢复，${catName}的这一刻就会消失喵～`} confirmText="删除" danger onConfirm={handleDelete} onCancel={() => setConfirmDelIdx(null)} />
    </ScreenShell>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-3">
      <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, oklch(0.85 0.04 305 / 0.6))" }} />
      <div className="rounded-full bg-white/80 px-3 py-1 text-[13px] tracking-[0.12em] text-[oklch(0.58_0.06_305)] backdrop-blur" style={{ boxShadow: "0 4px 12px -8px oklch(0.7 0.12 305 / 0.5)" }}>
        {label}
      </div>
      <div className="h-px flex-1" style={{ background: "linear-gradient(270deg, transparent, oklch(0.85 0.04 305 / 0.6))" }} />
    </div>
  );
}

function ShareTarget({ label, onClick, bg, children }: { label: string; onClick?: () => void; bg: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="flex flex-col items-center gap-1.5 rounded-2xl py-1.5 active:scale-[0.95] transition-all duration-150 disabled:opacity-60">
      <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: bg, boxShadow: "0 8px 18px -10px oklch(0.4 0.08 300 / 0.4)" }}>
        {children}
      </span>
      <span className="text-[11.5px] text-[oklch(0.4_0.05_300)]">{label}</span>
    </button>
  );
}

const PosterTemplate = forwardRef<HTMLDivElement, { v: import("./voicesStore").Voice; photo: string }>(function PosterTemplate({ v, photo }, ref) {
  const catName = useCatName();
  const persona = useCatPersona();
  const dateStr = (() => {
    const d = new Date(v.createdAt ?? Date.now());
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();
  return (
    <div ref={ref} style={{ width: 750, padding: 36, background: "linear-gradient(180deg, #FBF6FF 0%, #F8EFFA 55%, #FCEEF1 100%)", fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif", color: "#2a2233" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: 4, background: "linear-gradient(135deg, #B69AEF, #E6B8CF)", WebkitBackgroundClip: "text", color: "transparent" }}>喵一下</div>
          <div style={{ fontSize: 12, color: "#8a7fa0", marginTop: 4, letterSpacing: 2 }}>读懂它的小世界</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", background: "rgba(255,255,255,0.7)", borderRadius: 999 }}>
          <div style={{ width: 36, height: 36, borderRadius: 999, background: "linear-gradient(135deg, #F4DCE8, #E9D7F7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🐱</div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{catName}</div>
            <div style={{ fontSize: 10, color: "#8a7fa0" }}>{persona?.type ?? "高冷观察者"} · {persona?.mbti ?? "INTJ-A"}</div>
          </div>
        </div>
      </div>

      {/* photo card */}
      <div style={{ position: "relative", borderRadius: 28, overflow: "hidden", background: "#fff", boxShadow: "0 24px 50px -22px rgba(140, 100, 200, 0.35)" }}>
        {photo ? (
          <img src={photo} alt="" crossOrigin="anonymous" style={{ display: "block", width: "100%", maxHeight: 760, objectFit: "contain", background: "linear-gradient(135deg, #f7ecff, #fce9ef)" }} />
        ) : (
          <div style={{ height: 560, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #f7ecff, #fce9ef)", color: "#8a7fa0", fontSize: 18, letterSpacing: 6 }}>
            等待照片
          </div>
        )}
        {/* speech bubble */}
        <div style={{ position: "absolute", left: 24, right: 60, top: 24 }}>
          <div style={{ background: "rgba(255,255,255,0.96)", padding: "14px 18px", borderRadius: 22, borderBottomLeftRadius: 6, boxShadow: "0 14px 28px -14px rgba(80,40,120,0.35)" }}>
            <div style={{ fontSize: 9, letterSpacing: 5, color: "#8a7fa0", marginBottom: 4 }}>{catName}</div>
            <div style={{ fontSize: 15, lineHeight: 1.6, color: "#2a2233" }}>💭 {v.text}</div>
          </div>
        </div>
      </div>

      {/* meta row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, padding: "0 4px", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "nowrap", flexShrink: 0 }}>
          {(v.tags ?? []).slice(0, 3).map((t) => (
            <span key={t} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 999, background: "linear-gradient(135deg, #fbe9f1, #ece4fb)", color: "#7a5ab8", whiteSpace: "nowrap" }}>{t}</span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#8a7fa0", letterSpacing: 1 }}>{dateStr}</div>
      </div>

      {/* AI 心声解析 */}
      <div style={{ marginTop: 20, padding: "18px 20px", borderRadius: 22, background: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.85)", boxShadow: "0 14px 30px -18px rgba(140,100,200,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#B69AEF" }}>✦</span>
          <span style={{ fontSize: 10, letterSpacing: 5, color: "#7B7290" }}>AI 心 声 解 析</span>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.75, color: "#3E315E" }}>
          {voiceAnalysisText(v) ?? "它似乎在表达：这个瞬间里，它正在用自己的方式向你靠近。"}
        </div>
      </div>

      {/* footer */}
      <div style={{ marginTop: 30, paddingTop: 22, borderTop: "1px dashed rgba(180,160,220,0.5)", textAlign: "center" }}>
        <div style={{ fontSize: 10, letterSpacing: 6, color: "#a39ab5" }}>来自 · 喵一下</div>
        <div style={{ fontSize: 13, color: "#5a4d75", marginTop: 8, lineHeight: 1.7 }}>如果猫会说话，<br />它也许会这样告诉你。</div>
      </div>
    </div>
  );
});


function TimelineRow({ v, idx, onMore, onPhotoClick }: { v: import("./voicesStore").Voice; idx: number; onMore?: (idx: number) => void; onPhotoClick?: (src: string) => void }) {
  const hhmm = formatHHMM(v);
  return (
    <div className="relative flex gap-2">
      {/* time rail */}
      <div className="flex w-[38px] shrink-0 flex-col items-center pt-1">
        <span className="tabular-nums text-[13px] text-[oklch(0.62_0.04_305)]">{hhmm}</span>
        <span className="mt-1.5 h-1.5 w-1.5 rounded-full" style={{ background: "var(--gradient-cta)", boxShadow: "0 0 0 3px oklch(1 0 0 / 0.7)" }} />
        <span className="mt-1 w-px flex-1" style={{ background: "linear-gradient(180deg, oklch(0.88 0.025 305 / 0.45), transparent)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <VoiceCard v={v} idx={idx} onMore={onMore} onPhotoClick={onPhotoClick} />
      </div>
    </div>
  );
}

function VoiceCard({ v, idx, onMore, onPhotoClick }: { v: import("./voicesStore").Voice; idx: number; onMore?: (idx: number) => void; onPhotoClick?: (src: string) => void }) {
  const isVideo = v.mediaType === "video";
  const uploadedPhoto = usePublishPhoto();
  const photoSrc = v.media ?? (!isVideo ? uploadedPhoto : null);
  const catName = useCatName();
  return (
    <Link
      to="/app/voice/$id"
      params={{ id: String(idx) }}
      className="block overflow-hidden rounded-[24px] bg-white/85 backdrop-blur active:bg-white/95 active:scale-[0.995] transition-all duration-150"
      style={{ boxShadow: "0 16px 36px -18px oklch(0.55 0.1 305 / 0.45)", border: "1px solid oklch(1 0 0 / 0.7)" }}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden" style={{ background: "linear-gradient(135deg, oklch(0.97 0.03 320), oklch(0.95 0.04 285))" }}>
        {isVideo && v.media ? (
          <video src={v.media} className="block h-full w-full object-cover" style={{ objectPosition: `${v.focalPointX ?? 50}% ${v.focalPointY ?? 50}%` }} muted playsInline preload="metadata" />
        ) : photoSrc ? (
          <button type="button" className="block h-full w-full" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPhotoClick?.(photoSrc); }}>
            <img src={photoSrc} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${v.focalPointX ?? 50}% ${v.focalPointY ?? 50}%` }} />
          </button>
        ) : (
          <div className="relative flex h-full w-full items-center justify-center" style={{ background: v.grad }}>
            <CatAvatar size={108} grad={v.grad} usePhoto />
          </div>
        )}
        {/* soft top veil for bubble legibility */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[40%]" style={{ background: "linear-gradient(180deg, oklch(0 0 0 / 0.18) 0%, transparent 100%)" }} />

        {/* video badges */}
        {isVideo && (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/85 text-[18px] text-[oklch(0.45_0.12_305)] backdrop-blur" style={{ boxShadow: "0 10px 24px -10px oklch(0.3 0.05 300 / 0.5)" }}>▶</div>
            </div>
            {v.videoDuration && (
              <div className="absolute right-3 top-3 rounded-full bg-black/45 px-2 py-[2px] text-[10px] tabular-nums text-white backdrop-blur">{v.videoDuration}</div>
            )}
          </>
        )}

        {/* speech bubble overlay — matches publish preview / success card */}
        <div className="absolute left-3.5 right-10 top-3.5 z-10">
          <div className="relative inline-block max-w-full rounded-[20px] rounded-bl-[6px] bg-white/95 px-3.5 py-2.5 backdrop-blur-md"
            style={{ boxShadow: "0 14px 28px -14px oklch(0.3 0.05 300 / 0.45)" }}>
            <div className="mb-1 text-[14px] font-medium text-[oklch(0.55_0.06_300)]">{catName}</div>
            <p className="text-[17px] font-medium leading-[1.5] text-foreground">
              <span className="mr-1">💭</span>{v.text}
            </p>
          </div>
        </div>
      </div>

      {/* Below media — tags, meta, more */}
      <div className="flex items-center justify-between gap-2 px-3.5 pb-3 pt-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {(v.share?.tags ?? v.tags ?? []).slice(0, 3).map((t) => (
            <span key={t} className="shrink-0 rounded-full px-2 py-1 text-[13px] font-medium text-[oklch(0.45_0.1_305)]"
              style={{ background: "linear-gradient(135deg, oklch(0.96 0.04 320), oklch(0.95 0.05 270))" }}>{t}</span>
          ))}
          {v.location && (
            <span className="ml-1 truncate text-[14px] text-[oklch(0.55_0.06_300)]">· {v.location}</span>
          )}
        </div>
        <button
          aria-label="更多"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMore?.(idx); }}
          className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[20px] leading-none text-[oklch(0.55_0.05_300)] active:bg-[oklch(0.96_0.02_300)] active:scale-95 transition-all duration-150"
        >
          ⋯
        </button>
      </div>
    </Link>
  );
}

// ---------- timeline helpers ----------
function aspectToClass(a?: string) {
  switch (a) {
    case "9:16": return "aspect-[9/16]";
    case "4:5": return "aspect-[4/5]";
    case "1:1": return "aspect-square";
    case "3:4":
    default: return "aspect-[3/4]";
  }
}

function formatHHMM(v: import("./voicesStore").Voice) {
  if (v.createdAt) {
    const d = new Date(v.createdAt);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  // legacy time strings like "21:42" or "刚刚"
  return /^\d{1,2}:\d{2}$/.test(v.time) ? v.time : "刚刚";
}

function dayLabel(ts: number, now: Date) {
  const d = new Date(ts);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diff <= 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff < 7) return `${diff} 天前`;
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function groupByDay(voices: import("./voicesStore").Voice[]) {
  const now = new Date();
  const map = new Map<string, { v: import("./voicesStore").Voice; idx: number }[]>();
  voices.forEach((v, idx) => {
    const label = v.createdAt ? dayLabel(v.createdAt, now) : "今天";
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push({ v, idx });
  });
  return Array.from(map, ([label, items]) => ({ label, items }));
}

function compressImageForAI(dataUrl: string | null, maxSide = 768, quality = 0.72): Promise<string | null> {
  if (!dataUrl?.startsWith("data:image/")) return Promise.resolve(dataUrl);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        if (scale >= 0.98) {
          resolve(dataUrl);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function EmptyFeed() {
  return (
    <div className="relative mx-5 mt-5 overflow-hidden rounded-[24px] bg-white/80 backdrop-blur text-center"
      style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)", minHeight: 300 }}>
      {/* floating sparkles */}
      <span className="pointer-events-none absolute left-6 top-7 text-[10px] text-[oklch(0.78_0.11_305_/_0.55)] animate-breathe">✦</span>
      <span className="pointer-events-none absolute right-7 top-10 text-[8px] text-[oklch(0.78_0.11_260_/_0.55)] animate-breathe" style={{ animationDelay: "0.6s" }}>✦</span>
      <span className="pointer-events-none absolute left-10 bottom-16 text-[9px] text-[oklch(0.85_0.09_330_/_0.6)] animate-breathe" style={{ animationDelay: "1.1s" }}>✧</span>
      <span className="pointer-events-none absolute right-8 bottom-20 text-[10px] text-[oklch(0.85_0.08_300_/_0.55)] animate-breathe" style={{ animationDelay: "0.3s" }}>✧</span>

      <div className="flex flex-col items-center justify-center h-full px-6 py-8">
        {/* avatar + thought bubble */}
        <div className="relative">
          <div className="absolute inset-0 -m-6 rounded-full opacity-60 blur-2xl animate-breathe"
            style={{ background: "radial-gradient(circle, oklch(0.88 0.08 320 / 0.7), oklch(0.88 0.07 260 / 0.5), transparent 70%)" }} />
          <div className="relative mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full"
            style={{ background: "linear-gradient(135deg, oklch(0.95 0.05 320), oklch(0.93 0.06 270))", boxShadow: "0 8px 24px -8px oklch(0.78 0.11 305 / 0.4)" }}>
            <CatAvatar size={56} usePhoto />
          </div>
          {/* dotted thought trail */}
          <span className="absolute -right-3 -top-1 h-1.5 w-1.5 rounded-full bg-[oklch(0.88_0.08_320_/_0.7)]" />
          <span className="absolute -right-6 -top-4 h-2 w-2 rounded-full bg-[oklch(0.86_0.09_300_/_0.65)]" />
          {/* speech bubble */}
          <div className="absolute -right-2 -top-6 rounded-2xl rounded-bl-sm bg-white/95 px-2.5 py-1 text-[11px] text-[oklch(0.5_0.1_320)]"
            style={{ boxShadow: "0 6px 16px -8px oklch(0.78 0.11 305 / 0.45)", border: "1px solid oklch(0.92 0.04 320 / 0.6)" }}>
            喵～？
          </div>
        </div>

        <div className="mt-5 text-[15px] font-medium text-foreground">还没有心声哦</div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[oklch(0.55_0.06_300)]">
          记录一个瞬间，听听它怎么说
        </p>
        <Link to="/app/publish"
          className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-[13px] font-medium text-white active:scale-[0.96] active:brightness-[0.92] transition-all duration-150"
          style={{ background: "var(--gradient-cta)", boxShadow: "0 12px 24px -10px oklch(0.70 0.14 305 / 0.6)" }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {/* cat ears */}
            <path d="M7.5 7.8 L6.2 4.5 L9.6 6.3" />
            <path d="M16.5 7.8 L17.8 4.5 L14.4 6.3" />
            {/* headphone band arching over the head */}
            <path d="M4.8 12 C4.8 8.2 8 5.8 12 5.8 C16 5.8 19.2 8.2 19.2 12" />
            {/* ear cups on both sides */}
            <rect x="3.4" y="11.4" width="3" height="5" rx="1.4" />
            <rect x="17.6" y="11.4" width="3" height="5" rx="1.4" />
            {/* tiny sound waves */}
            <path d="M8.5 18.5 L8.5 19.5" />
            <path d="M15.5 18.5 L15.5 19.5" />
          </svg>
          <span>识别猫咪心声</span>
        </Link>
      </div>
    </div>
  );
}

// ---------- Screen 2: 心声详情 ----------
export function ScreenVoiceDetail({ id = 0 }: { id?: number }) {
  const voices = useVoices();
  const catName = useCatName();
  const v = voices[id] ?? voices[0] ?? { time: "—", grad: CAT_GRADIENTS[0], text: "这条心声已经不在啦～" };
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [reAnalyzing, setReAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);
  const uploadedPhoto = usePublishPhoto();
  const detailPhoto = v.media ?? uploadedPhoto ?? "";
  const runGenerateVoice = useServerFn(generateCatVoice);

  const startReanalyze = async () => {
    setAnalyzeError(false);
    setReAnalyzing(true);
    try {
      const next = await runGenerateVoice({
        data: {
          profile: getCatProfile(),
          persona: getCatPersona(),
          imageDataUrl: v.media ?? uploadedPhoto ?? null,
          scene: v.location ? `发生在${v.location}，请重新生成一个不同角度的猫咪心声` : "请重新生成一个不同角度的猫咪心声",
        },
      });
      voicesStore.replaceAt(id, { ...next, media: detailPhoto || next.media, createdAt: v.createdAt ?? Date.now() });
      setReAnalyzing(false);
      toast.success("AI 已重新识别这段心声 ✨");
    } catch {
      setReAnalyzing(false);
      setAnalyzeError(true);
    }
  };
  const handleSavePoster = async () => {
    if (!posterRef.current) return;
    setGenerating(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(posterRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#FBF8FF" });
      const link = document.createElement("a");
      link.download = `neko-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      setShareOpen(false);
      toast.success("已保存到相册喵～");
    } catch {
      toast.error("生成失败，再试一次喵～");
    } finally {
      setGenerating(false);
    }
  };
  const handleDelete = () => {
    setConfirmDel(false);
    void deleteCloudVoice(v).catch(() => undefined);
    voicesStore.removeAt(id);
    toast.success("心声已删除");
    navigate({ to: "/app" });
  };

  return (
    <ScreenShell>
      <StatusBar />
      {/* soft dreamy background */}
      <div className="absolute inset-0 -z-10" style={{ background: "linear-gradient(180deg, oklch(0.98 0.02 60) 0%, oklch(0.97 0.025 320) 55%, oklch(0.96 0.03 300) 100%)" }} />
      <div aria-hidden className="pointer-events-none absolute -top-16 -left-10 h-56 w-56 rounded-full blur-3xl" style={{ background: "oklch(0.88 0.08 320 / 0.45)" }} />
      <div aria-hidden className="pointer-events-none absolute top-40 -right-10 h-48 w-48 rounded-full blur-3xl" style={{ background: "oklch(0.88 0.1 60 / 0.35)" }} />

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 pt-[48px]">
        <AppBackButton onClick={() => navigate({ to: ".." })} />
        <div className="rounded-full bg-white/80 px-3.5 py-1.5 text-[11px] tracking-[0.3em] text-[oklch(0.45_0.06_300)] backdrop-blur">心声 · {v.time}</div>
        <div className="w-9" />
      </div>

      {/* scrollable content */}
      <div className="absolute inset-0 z-10 overflow-y-auto scrollbar-none pt-[92px] pb-[110px]">
        <div className="px-5">
          {/* Photo with voice bubble overlayed inside */}
          <div
            className="relative overflow-hidden rounded-[28px] bg-white"
            style={{
              aspectRatio: (v.aspect ?? "4:5").replace(":", " / "),
              boxShadow: "0 20px 50px -24px oklch(0.3 0.05 300 / 0.35), 0 2px 6px -2px oklch(0.3 0.05 300 / 0.08)",
              border: "1px solid oklch(1 0 0 / 0.85)",
            }}
          >
            {detailPhoto ? (
              <img src={detailPhoto} alt="此刻" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[oklch(0.97_0.025_320)] text-[12px] tracking-[0.2em] text-[oklch(0.56_0.06_300)]">
                等待照片
              </div>
            )}

            {/* Voice bubble — floating inside photo top area */}
            <div
              className="absolute left-4 right-10 top-4 rounded-[20px] bg-white px-5 py-3.5"
              style={{ boxShadow: "0 14px 32px -16px oklch(0.3 0.05 300 / 0.3), 0 2px 6px -2px oklch(0.3 0.05 300 / 0.08)", border: "1px solid oklch(1 0 0 / 0.9)" }}
            >
              <div className="text-[10px] tracking-[0.3em] text-[#7B7290]">{catName}</div>
              <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-[1.75] text-foreground/90">{v.text}</p>
              <span
                aria-hidden
                className="absolute h-3 w-3 rotate-45 bg-white"
                style={{ left: 36, bottom: -5, borderRight: "1px solid oklch(1 0 0 / 0.9)", borderBottom: "1px solid oklch(1 0 0 / 0.9)" }}
              />
            </div>
          </div>

          {/* AI card — below photo with breathing space */}
          <div
            className="mt-5 rounded-[20px] bg-white/95 px-5 py-4 backdrop-blur"
            style={{ boxShadow: "0 16px 36px -18px oklch(0.3 0.05 300 / 0.28), 0 2px 6px -2px oklch(0.3 0.05 300 / 0.08)", border: "1px solid oklch(1 0 0 / 0.9)" }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-soul text-[11px]">✨</span>
              <div className="text-[10px] tracking-[0.3em] text-[#7B7290]">AI 心 声 解 析</div>
            </div>
            <p className="mt-2 text-[12.5px] leading-[1.75] text-foreground/85">
              {voiceAnalysisText(v) ?? "它似乎在表达：这个瞬间里，它正在用自己的方式向你靠近。"}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {(v.tags ?? ["💭 小心思", "✨ 想被看见"]).map((t) => (
                <span key={t} className="rounded-full px-2 py-[3px] text-[10.5px]" style={{ background: "oklch(0.96 0.03 305)", color: "oklch(0.5 0.1 305)" }}>#{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* bottom action bar */}
      <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-[max(10px,env(safe-area-inset-bottom))] pt-5">
        <div className="flex gap-3">
          <button onClick={() => setShareOpen(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full px-5 py-3.5 text-[13px] font-medium text-white active:scale-[0.97] active:brightness-[0.92] transition-all duration-150"
            style={{ background: "linear-gradient(135deg, #B69AEF, #E6B8CF)", boxShadow: "0 14px 28px -14px oklch(0.70 0.14 305 / 0.55)" }}>
            <span className="text-[14px]">↗</span> 分享
          </button>
          <button onClick={() => setConfirmDel(true)}
            className="flex items-center justify-center gap-1.5 rounded-full px-5 py-3.5 text-[13px] font-medium text-white active:scale-[0.97] active:brightness-[0.92] transition-all duration-150"
            style={{ background: "linear-gradient(135deg, oklch(0.7 0.16 25), oklch(0.66 0.18 15))", boxShadow: "0 14px 28px -14px oklch(0.70 0.14 25 / 0.55)" }}>
            <Trash2 size={16} /> 删除
          </button>
        </div>
      </div>

      {/* minimal share sheet — 生成长图 */}
      {shareOpen && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end" onClick={() => !generating && setShareOpen(false)}>
          <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" />
          <div className="relative rounded-t-[32px] bg-[oklch(0.99_0.008_320)] px-6 pb-8 pt-3.5 backdrop-blur-xl"
            style={{ boxShadow: "0 -24px 60px -20px oklch(0.3 0.05 300 / 0.4)" }} onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-5 h-[5px] w-[72px] rounded-full" style={{ background: "#D8D2E2" }} />
            <div className="mt-2 flex items-start justify-center gap-12 pb-2">
              {/* 生成长图 */}
              <button
                onClick={generating ? undefined : handleSavePoster}
                disabled={generating}
                className="flex flex-col items-center gap-2.5 active:scale-[0.95] transition-all duration-150 disabled:opacity-70"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: "linear-gradient(135deg, #B69AEF, #E6B8CF)", boxShadow: "0 10px 22px -10px oklch(0.5 0.1 305 / 0.5)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="14" height="14" rx="3" />
                    <path d="M3 13l3.5-3.5a2 2 0 0 1 2.8 0L17 17" />
                    <circle cx="13" cy="8" r="1.2" />
                    <path d="M19 14v6" />
                    <path d="M16 17l3 3 3-3" />
                  </svg>
                </span>
                <span className="text-[12.5px]" style={{ color: "#3E315E" }}>{generating ? "生成中…" : "保存长图"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* offscreen poster for long-image export */}
      <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden>
        <PosterTemplate ref={posterRef} v={v} photo={detailPhoto} />
      </div>

      <ConfirmSheet open={confirmDel} title="确定删除这条心声吗？" hint={`删除后无法恢复，${catName}的这一刻就会消失喵～`} confirmText="删除" danger onConfirm={handleDelete} onCancel={() => setConfirmDel(false)} />
      {reAnalyzing && <LoadingOverlay title="AI 正在重新识别…" hint="RE · ANALYZING" />}
      {analyzeError && <ErrorOverlay title="识别失败了喵" hint="网络似乎打了个盹，再试一次？" onRetry={startReanalyze} onCancel={() => setAnalyzeError(false)} />}
    </ScreenShell>
  );
}

// ---------- Screen 3: 发布 Step 1 (MVP Photo Only) ----------
export function ScreenPublish1() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const cachedPhoto = usePublishPhoto();
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(() => getPublishPhoto());
  const [checking, setChecking] = useState(false);
  const photoUploaded = !!photoDataUrl;

  useEffect(() => {
    if (cachedPhoto && cachedPhoto !== photoDataUrl) setPhotoDataUrl(cachedPhoto);
  }, [cachedPhoto, photoDataUrl]);

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const limitError = getNekoUploadLimitError(file, "image");
    if (limitError) {
      toast(limitError, { icon: "📷" });
      return;
    }
    setUploadError(false);
    setUploading(true);
    try {
      const rawUrl = await readAsDataUrl(file);
      const stableUrl = (await compressImageForAI(rawUrl, 1280, 0.82)) ?? rawUrl;
      setPhotoDataUrl(stableUrl);
      setPublishPhoto(stableUrl);
      toast.success("照片上传成功");
    } catch {
      setUploadError(true);
    } finally {
      setUploading(false);
    }
  };

  const triggerFileInput = () => {
    if (uploading || checking) return;
    fileRef.current?.click();
  };

  const handleNext = async () => {
    if (!photoUploaded || !photoDataUrl || checking) return;
    setChecking(true);
    try {
      const result = await detectCatFace({ data: { imageDataUrl: photoDataUrl } });
      if (!result.isCat) {
        toast("请上传猫咪照片哦");
        return;
      }
      navigate({ to: "/app/publish/background" });
    } catch {
      toast.error("识别失败，请重试");
    } finally {
      setChecking(false);
    }
  };

  return (
    <ScreenShell>
      <StatusBar />
      <div className="absolute inset-0 flex flex-col overflow-y-auto scrollbar-none pt-[52px] pb-[110px]">
        {/* top bar */}
        <div className="flex items-center justify-between px-6">
          <AppBackButton to="/app" />
          <div className="text-[10px] tracking-[0.4em] text-[oklch(0.55_0.06_300)]">STEP 01 / 03</div>
          <div className="h-9 w-9" />
        </div>

        {/* title */}
        <div className="px-7 pt-6">
          <h1 className="text-[24px] font-light leading-tight text-foreground">记录一个瞬间</h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[oklch(0.58_0.04_300)]">上传一张照片，AI 帮你读懂它的小心思 · 不超过 {NEKO_MAX_UPLOAD_LABEL}</p>
        </div>

        {/* main upload card */}
        <div className="mx-5 mt-7">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg"
            capture={undefined}
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={triggerFileInput}
            disabled={uploading || checking}
            className="relative block w-full overflow-hidden rounded-[24px] p-5 text-center active:scale-[0.98] transition-all duration-150 disabled:opacity-60"
            style={{
              background: "linear-gradient(160deg, oklch(0.97 0.035 320), oklch(0.95 0.04 0))",
              boxShadow: "var(--shadow-soft)",
              border: "1px solid oklch(1 0 0 / 0.7)",
              minHeight: 220,
            }}
          >
            {photoDataUrl ? (
              <div className="relative">
                <div className="overflow-hidden rounded-[18px] bg-white" style={{ aspectRatio: "4 / 3" }}>
                  <img src={photoDataUrl} alt="预览" className="h-full w-full object-cover" />
                </div>
                <div className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-[oklch(0.5_0.1_320)]">
                  <span>✓ 已上传</span>
                  <span className="text-[oklch(0.58_0.04_300)]">· 点击可重新选择</span>
                </div>
              </div>
            ) : (
              <>
            {/* dreamy glow */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/40 blur-3xl" />
              <div className="absolute -bottom-6 -left-6 h-28 w-28 rounded-full bg-[oklch(0.88_0.08_320_/_0.35)] blur-3xl" />
            </div>
            <div className="relative flex flex-col items-center justify-center gap-4">
              {/* Chinchilla avatar */}
              <div className="relative">
                <div className="absolute inset-0 -m-3 rounded-full opacity-50 blur-xl animate-breathe" style={{ background: "radial-gradient(circle, oklch(0.88 0.08 320 / 0.6), transparent 70%)" }} />
                <CatAvatar size={80} usePhoto />
              </div>
              {/* photo icon + text */}
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-[18px]" style={{ boxShadow: "var(--shadow-soft)" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="4" width="16" height="12" rx="3" stroke="oklch(0.5 0.1 320)" strokeWidth="1.5" />
                    <circle cx="10" cy="10" r="3" stroke="oklch(0.5 0.1 320)" strokeWidth="1.5" />
                    <path d="M4 14L7 10L10 12L14 8L16 10" stroke="oklch(0.5 0.1 320)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="text-[14px] font-medium text-foreground">点击上传照片</div>
                <div className="text-[11px] text-[oklch(0.58_0.04_300)]">支持 JPG / PNG</div>
              </div>
            </div>
              </>
            )}
          </button>
        </div>

        {/* 推荐照片 */}
        <div className="mx-5 mt-4 rounded-[20px] bg-white/65 p-4 backdrop-blur" style={{ border: "1px solid oklch(1 0 0 / 0.7)" }}>
          <div className="text-[10px] tracking-[0.35em] text-[oklch(0.55_0.06_300)]">推荐照片</div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {[
              { icon: "😺", text: "猫咪正脸" },
              { icon: "🐾", text: "有趣行为" },
              { icon: "👀", text: "明显表情" },
              { icon: "💗", text: "与主人互动" },
            ].map((t) => (
              <div key={t.text} className="flex items-center gap-1.5 text-[11.5px] text-foreground">
                <span className="text-[13px]">{t.icon}</span>
                <span>{t.text}</span>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-[oklch(0.55_0.06_300)]">
            自然的瞬间，往往最能体现它当时的小心思
          </p>
        </div>

        {/* AI 会做什么？ */}
        <div className="mx-5 mt-4 rounded-[20px] bg-white/65 p-4 backdrop-blur" style={{ border: "1px solid oklch(1 0 0 / 0.7)" }}>
          <div className="text-[10px] tracking-[0.35em] text-[oklch(0.55_0.06_300)]">AI 会做什么？</div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-foreground/85">
            AI 将结合这张照片与猫咪人格档案，来生成一条专属于它的猫咪心声。
          </p>
        </div>

      </div>

      {/* floating bottom CTA */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-5 pb-[max(10px,env(safe-area-inset-bottom))] pt-5">
        <button
          onClick={handleNext}
          disabled={!photoUploaded || checking}
          className="pointer-events-auto flex w-full items-center justify-center rounded-full px-6 py-4 text-[14px] font-medium text-white active:scale-[0.97] active:brightness-[0.92] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          style={{
            background: "var(--gradient-cta)",
            boxShadow: photoUploaded ? "0 16px 32px -14px oklch(0.70 0.14 305 / 0.6)" : "none",
          }}
        >
          {checking ? "识别中…" : "下一步"}
        </button>
      </div>

      {uploading && <LoadingOverlay title="正在上传照片…" hint="UPLOADING" />}
      {uploadError && <ErrorOverlay title="上传失败了喵" hint="请检查网络后重试" onRetry={() => { setUploadError(false); triggerFileInput(); }} onCancel={() => setUploadError(false)} />}
    </ScreenShell>
  );
}

// ---------- Screen 4: 发布 Step 2 ----------
export function ScreenPublish2() {
  const navigate = useNavigate();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState(false);
  const [desc, setDescState] = useState(() => getPublishScene());
  const uploadedPhoto = usePublishPhoto();
  const runGenerateVoice = useServerFn(generateCatVoice);
  const setDesc = (value: string) => {
    const next = value.slice(0, 120);
    setDescState(next);
    setPublishScene(next);
  };
  const startAnalyze = async () => {
    if (analyzing) return;
    setAnalyzeErr(false);
    setAnalyzing(true);
    setPublishScene(desc.trim());
    try {
      const currentPhoto = uploadedPhoto ?? getPublishPhoto();
      const aiImageDataUrl = await compressImageForAI(currentPhoto);
      const voice = await runGenerateVoice({
        data: {
          profile: getCatProfile(),
          persona: getCatPersona(),
          imageDataUrl: aiImageDataUrl,
          scene: desc.trim(),
        },
      });
      setPublishVoice({ ...voice, media: currentPhoto ?? voice.media });
      setAnalyzing(false);
      navigate({ to: "/app/publish/preview" });
    } catch {
      setAnalyzing(false);
      setAnalyzeErr(true);
    }
  };
  return (
    <ScreenShell>
      <StatusBar />
      <div className="absolute inset-0 overflow-y-auto scrollbar-none pt-[52px] pb-[118px]">
        <div className="flex items-center justify-between px-6">
          <AppBackButton to="/app/publish" />
          <div className="text-[10px] tracking-[0.4em] text-[oklch(0.55_0.06_300)]">STEP 02 / 03</div>
          <button disabled={analyzing} onClick={startAnalyze} className="flex h-9 items-center justify-center rounded-full bg-white/70 px-3.5 text-[11px] tracking-[0.2em] text-[oklch(0.55_0.06_300)] backdrop-blur active:bg-white/90 active:scale-[0.98] transition-all duration-150 disabled:opacity-50" style={{ boxShadow: "var(--shadow-soft)" }}>跳过</button>
        </div>

        <div className="px-7 pt-6">
          <h1 className="text-[22px] font-light leading-tight text-foreground">发生了什么呢？</h1>
          <p className="mt-1.5 text-[12px] text-[oklch(0.58_0.04_300)]">补充背景信息，可以让 AI 更懂它哦 <span className="text-[oklch(0.65_0.04_300)]">（可选）</span></p>
        </div>

        <div className="mx-5 mt-5 rounded-[22px] bg-white/85 p-4 backdrop-blur" style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
          <div className="text-[10px] tracking-[0.35em] text-[oklch(0.55_0.06_300)]">文字描述</div>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="例如：我刚打开猫条，它就跑过来了"
            className="mt-2 block w-full min-h-[110px] resize-none rounded-2xl bg-[oklch(0.98_0.012_320)] p-3 text-[12.5px] leading-relaxed text-foreground placeholder:text-[oklch(0.7_0.03_300)] outline-none focus:ring-2 focus:ring-[oklch(0.85_0.08_320_/_0.5)] transition-all"
          />
          <div className="mt-1.5 text-right text-[9.5px] text-[oklch(0.6_0.04_300)]">{desc.length} / 120</div>
        </div>

      </div>
      <div className="absolute inset-x-0 bottom-0 z-20 px-5 pt-5 pb-[max(10px,env(safe-area-inset-bottom))]">
        <button disabled={analyzing} onClick={startAnalyze} className="flex w-full items-center justify-center rounded-full px-6 py-4 text-[14px] font-medium text-white active:scale-[0.97] active:brightness-[0.92] transition-all duration-150 disabled:opacity-70"
          style={{ background: "linear-gradient(135deg, oklch(0.70 0.14 305), oklch(0.76 0.11 0))", boxShadow: "0 16px 32px -14px oklch(0.70 0.14 305 / 0.6)" }}>
          {analyzing ? "识别中…" : "下一步"}
        </button>
      </div>
      {analyzing && <LoadingOverlay title="AI 正在识别它的小心思…" hint="ANALYZING" />}
      {analyzeErr && <ErrorOverlay title="识别失败了喵" hint="再试一次，让 AI 听听看？" onRetry={startAnalyze} onCancel={() => setAnalyzeErr(false)} />}
    </ScreenShell>
  );
}

// ---------- Screen 5: 发布 Step 3 预览 ----------
export function ScreenPublish3() {
  const navigate = useNavigate();
  const catName = useCatName();
  const [draftVoice, setDraftVoice] = useState(() => getPublishVoice());
  const [stablePhoto, setStablePhoto] = useState(() => getPublishVoice()?.media ?? getPublishPhoto());
  const publishLockRef = useRef(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const uploadedPhoto = usePublishPhoto();
  const photoSrc = draftVoice?.media ?? stablePhoto ?? uploadedPhoto ?? getPublishPhoto() ?? "";
  const runGenerateVoice = useServerFn(generateCatVoice);
  useEffect(() => {
    const latest = getPublishVoice();
    if (latest) setDraftVoice(latest);
    const latestPhoto = latest?.media ?? getPublishPhoto();
    if (latestPhoto) setStablePhoto(latestPhoto);
  }, []);
  const buildPublishFallback = (): import("./voicesStore").Voice => ({
    time: "刚刚",
    createdAt: Date.now(),
    location: "家里",
    grad: "linear-gradient(135deg, oklch(0.9 0.06 280), oklch(0.92 0.05 320))",
    tags: ["💭 小心思", "🐾 想靠近"],
    aspect: "3:4",
    text: "我在认真看你，也在等你靠近一点。",
    media: stablePhoto ?? uploadedPhoto ?? getPublishPhoto() ?? undefined,
    mediaType: "photo",
    analysis: `${catName}的停留和注视，像是在用自己的方式回应你。`,
  });
  const startPublish = () => {
    if (publishLockRef.current) return;
    publishLockRef.current = true;
    try {
      const latestVoice = draftVoice ?? getPublishVoice() ?? buildPublishFallback();
      const currentPhoto = latestVoice.media ?? stablePhoto ?? uploadedPhoto ?? getPublishPhoto() ?? undefined;
      const voiceToPublish = { ...latestVoice, media: currentPhoto, createdAt: latestVoice.createdAt ?? Date.now() };
      setPublishVoice(voiceToPublish);
      setDraftVoice(voiceToPublish);
      if (currentPhoto) setStablePhoto(currentPhoto);
      voicesStore.prepend(voiceToPublish);
      clearPublishDraft();
      clearPublishPhoto();
      void saveLocalNekoToCloud().catch(() => undefined);
      toast.success("心声已发布到首页 ✨");
      void navigate({ to: "/app", replace: true }).catch(() => {
        window.location.href = "/app";
      });
    } catch (error) {
      console.error("NEKO publish failed locally", error);
      toast("心声已保存，正在回到首页～");
      window.location.href = "/app";
    } finally {
      window.setTimeout(() => {
        publishLockRef.current = false;
      }, 800);
    }
  };
  const startReanalyze = async () => {
    if (reanalyzing) return;
    setReanalyzing(true);
    try {
      const currentPhoto = stablePhoto ?? uploadedPhoto ?? getPublishPhoto();
      const aiImageDataUrl = await compressImageForAI(currentPhoto);
      const next = await runGenerateVoice({
        data: {
          profile: getCatProfile(),
          persona: getCatPersona(),
          imageDataUrl: aiImageDataUrl,
          scene: getPublishScene(),
        },
      });
      const normalized = { ...next, media: currentPhoto ?? next.media };
      setPublishVoice(normalized);
      setDraftVoice(normalized);
      if (normalized.media) setStablePhoto(normalized.media);
      setReanalyzing(false);
      toast.success("已重新识别 ✨");
    } catch {
      setReanalyzing(false);
      toast("这次没读懂，我先保留当前心声喵～");
    }
  };
  return (
    <ScreenShell>
      <StatusBar />
      <div className="absolute inset-0 overflow-y-auto scrollbar-none pt-[52px] pb-8">
        <div className="flex items-center justify-between px-6">
          <AppBackButton to="/app/publish/background" />
          <div className="text-[10px] tracking-[0.4em] text-[oklch(0.55_0.06_300)]">STEP 03 / 03</div>
          <div className="h-9 w-9" />
        </div>

        <div className="px-7 pt-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[9.5px] tracking-[0.3em] text-[oklch(0.5_0.1_320)] backdrop-blur">
            <span className="text-soul">✦</span> AI 已 读 懂 它 的 心 声
          </div>
          <h1 className="mt-2.5 text-[20px] font-light leading-tight text-foreground">这是它想对你说的话</h1>
        </div>

        <div className="mx-5 mt-4 relative overflow-hidden rounded-[26px]" style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)", background: "linear-gradient(180deg, oklch(0.96 0.035 70) 0%, oklch(0.93 0.05 55) 55%, oklch(0.9 0.06 50) 100%)" }}>
          {/* Unified cat background spanning both the speech and AI analysis modules */}
          <div className="relative h-[560px]">
            {photoSrc ? (
              <img
                src={photoSrc}
                alt={catName}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: "center 18%" }}
                loading="lazy"
                width={1024}
                height={1024}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-[oklch(0.97_0.025_320)] text-[12px] tracking-[0.2em] text-[oklch(0.56_0.06_300)]">
                等待照片
              </div>
            )}
            {/* Speech bubble — close above cat head, tail touches forehead */}
            <div className="absolute left-1/2 top-3 z-10 w-[78%] max-w-[280px] -translate-x-1/2">
              <div className="relative rounded-[22px] rounded-bl-[6px] bg-white/95 px-4 py-3 backdrop-blur" style={{ boxShadow: "0 14px 32px -14px oklch(0.3 0.05 300 / 0.4)" }}>
                <div className="mb-1 text-[8px] tracking-[0.35em] text-[oklch(0.55_0.06_300)]">{catName}</div>
                <p className="whitespace-pre-line text-[12.5px] leading-[1.55] text-foreground">{draftVoice?.text ?? "识别结果还没有回来，请重新识别。"}</p>
                <svg className="absolute -bottom-[10px] left-1/2 -translate-x-1/2" width="16" height="12" viewBox="0 0 16 12">
                  <path d="M0 0 L16 0 L8 12 Z" fill="white" opacity="0.97" />
                </svg>
              </div>
            </div>
            {/* AI analysis card floats over bottom of cat background */}
            <div className="absolute inset-x-4 bottom-4 z-10 rounded-[22px] bg-white/85 p-4 backdrop-blur-md" style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
              <div className="text-[10px] tracking-[0.4em] text-[oklch(0.55_0.06_300)]">AI 心 声 解 析</div>
              <p className="mt-2 text-[12px] leading-[1.7] text-foreground/85">
                {voiceAnalysisText(draftVoice) ?? "暂未获得 AI 心声解析，请点击重新识别。"}
              </p>
            </div>
          </div>
        </div>

        <div className="mx-5 mt-5 grid grid-cols-[1fr_1.4fr] gap-2.5">
          <button onClick={startReanalyze} className="rounded-full bg-white/85 px-4 py-3.5 text-[12.5px] text-foreground backdrop-blur active:bg-white/95 active:scale-[0.98] transition-all duration-150" style={{ boxShadow: "var(--shadow-soft)" }}>重新识别</button>
          <button type="button" onClick={startPublish} className="flex items-center justify-center rounded-full px-5 py-3.5 text-[13px] font-medium text-white active:scale-[0.97] active:brightness-[0.92] transition-all duration-150"
            style={{ background: "linear-gradient(135deg, oklch(0.70 0.14 305), oklch(0.76 0.11 0))", boxShadow: "0 14px 28px -14px oklch(0.70 0.14 305 / 0.6)" }}>
            发布心声
          </button>
        </div>
      </div>
      {reanalyzing && <LoadingOverlay title="AI 正在重新识别…" hint="RE · ANALYZING" />}
    </ScreenShell>
  );
}

// ---------- Screen 6: 发布成功 ----------
export function ScreenSuccess() {
  const uploadedPhoto = usePublishPhoto();
  const catName = useCatName();
  const [publishedVoice] = useState(() => getPublishVoice());
  const [publishedPhoto] = useState(() => getPublishVoice()?.media ?? getPublishPhoto());
  const insertedRef = useRef(false);
  useEffect(() => {
    if (insertedRef.current) return;
    insertedRef.current = true;
    if (!publishedVoice) return;
    voicesStore.prepend({ ...publishedVoice, media: publishedVoice.media ?? publishedPhoto ?? uploadedPhoto ?? undefined });
    void saveLocalNekoToCloud().catch(() => undefined);
    clearPublishDraft();
    clearPublishPhoto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const draftVoice = publishedVoice;
  const photoSrc = publishedVoice?.media ?? publishedPhoto ?? uploadedPhoto ?? "";
  return (
    <ScreenShell bg="linear-gradient(180deg, oklch(0.985 0.014 60) 0%, oklch(0.97 0.028 320) 45%, oklch(0.95 0.038 285) 100%)">
      <StatusBar />
      {/* dreamy ambient blobs */}
      <div className="pointer-events-none absolute -left-16 top-24 h-56 w-56 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(circle, oklch(0.92 0.08 320 / 0.85), transparent 70%)" }} />
      <div className="pointer-events-none absolute -right-20 top-72 h-64 w-64 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, oklch(0.9 0.08 285 / 0.8), transparent 70%)" }} />

      <div className="absolute inset-0 overflow-y-auto scrollbar-none px-5 pt-[64px] pb-[160px]">
        {/* ── SECTION 1 · Success Title ───────────── */}
        <div className="flex flex-col items-center">
          <div className="px-4 text-center">
            <div className="text-[10px] tracking-[0.45em] text-[oklch(0.58_0.08_320)]">A VOICE IS BORN</div>
            <h1 className="mt-2.5 text-[22px] font-medium leading-snug text-foreground">
              它，第一次开口了
            </h1>
            <p className="mt-2 text-[12.5px] leading-[1.7] text-[oklch(0.5_0.06_300)]">
              {catName}的声音，<br />刚刚从猫咪世界传了过来
            </p>
          </div>
        </div>

        {/* ── SECTION 2 · Published Voice Preview ──────── */}
        <div className="mt-7">
          <div className="relative overflow-hidden rounded-[26px] bg-white/85 backdrop-blur"
            style={{ boxShadow: "0 24px 50px -22px oklch(0.55 0.1 305 / 0.45)", border: "1px solid oklch(1 0 0 / 0.75)" }}>
            {/* Media — preserve original aspect ratio */}
            <div className="relative w-full" style={{ background: "linear-gradient(135deg, oklch(0.97 0.03 320), oklch(0.95 0.04 285))" }}>
              {photoSrc ? (
                <img src={photoSrc} alt={catName} className="block h-auto w-full max-h-[420px] object-contain" />
              ) : (
                <div className="flex aspect-[4/5] w-full items-center justify-center text-[12px] tracking-[0.2em] text-[oklch(0.56_0.06_300)]">
                  等待照片
                </div>
              )}
              {/* soft top veil for bubble legibility */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[40%]" style={{ background: "linear-gradient(180deg, oklch(0 0 0 / 0.18) 0%, transparent 100%)" }} />

              {/* speech bubble overlay */}
              <div className="absolute left-3.5 right-10 top-3.5 z-10">
                <div className="relative inline-block max-w-full rounded-[20px] rounded-bl-[6px] bg-white/95 px-3.5 py-2.5 backdrop-blur-md"
                  style={{ boxShadow: "0 14px 28px -14px oklch(0.3 0.05 300 / 0.45)" }}>
                  <div className="mb-0.5 text-[8px] tracking-[0.35em] text-[oklch(0.55_0.06_300)]">{catName}</div>
              <p className="text-[12.5px] leading-[1.55] text-foreground">
                    <span className="mr-1">💭</span>{draftVoice?.text ?? "这条心声没有生成成功，请返回重新识别。"}
                  </p>
                </div>
              </div>

              {/* tiny sparkles around bubble */}
              <span className="pointer-events-none absolute right-4 top-2 animate-pulse-soft text-[12px] text-[oklch(0.85_0.1_320)]" style={{ textShadow: "0 0 10px oklch(1 0 0 / 0.8)" }}>✦</span>
              <span className="pointer-events-none absolute right-10 top-16 animate-pulse-soft text-[10px] text-[oklch(0.82_0.1_285)]" style={{ animationDelay: "0.5s" }}>✺</span>
            </div>

            {/* meta below media */}
            <div className="flex items-center justify-between gap-2 px-4 pb-3.5 pt-3">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {(draftVoice?.tags ?? ["💗 想念", "😼 傲娇"]).slice(0, 2).map((tag) => (
                  <span key={tag} className="shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-medium text-[oklch(0.45_0.1_305)]"
                    style={{ background: "linear-gradient(135deg, oklch(0.96 0.04 320), oklch(0.95 0.05 270))" }}>{tag}</span>
                ))}
              </div>
              <div className="shrink-0 text-[10px] tracking-[0.25em] text-[oklch(0.6_0.05_300)]">刚刚发布</div>
            </div>
          </div>
        </div>

        {/* ── SECTION 3 · AI Insight ──────────────────── */}
        <div className="mt-4 rounded-[22px] p-4 backdrop-blur"
          style={{ background: "linear-gradient(135deg, oklch(0.98 0.02 320 / 0.9), oklch(0.96 0.03 285 / 0.85))", border: "1px solid oklch(1 0 0 / 0.7)", boxShadow: "0 14px 30px -18px oklch(0.55 0.1 305 / 0.35)" }}>
          <div className="flex items-center gap-2">
            <span className="text-soul text-[12px]">✦</span>
            <div className="text-[10px] tracking-[0.4em] text-[oklch(0.55_0.06_300)]">AI 发 现</div>
          </div>
          <div className="mt-2.5 text-[12.5px] leading-[1.75] text-foreground/85">
            {voiceAnalysisText(draftVoice) ?? `暂未获得${catName}的 AI 心声解析。`}
          </div>
        </div>

        {/* ── SECTION 4 · Share Incentive ─────────────── */}
        <div className="mt-5 px-2 text-center">
          <p className="text-[11.5px] leading-[1.7] text-[oklch(0.55_0.06_300)]">
            把这个来自猫咪世界的故事<br />分享给你在乎的人
          </p>
        </div>
      </div>

      {/* ── Bottom Actions (floating) ──────────────── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
        <div className="pointer-events-auto px-5 pb-[max(10px,env(safe-area-inset-bottom))] pt-3">
          <Link to="/app" className="flex w-full items-center justify-center rounded-full px-6 py-3.5 text-[14px] font-medium text-white active:scale-[0.97] active:brightness-[0.92] transition-all duration-150"
            style={{ background: "linear-gradient(135deg, #B69AEF, #E6B8CF)", boxShadow: "0 16px 32px -14px oklch(0.72 0.14 320 / 0.65)" }}>
            返回首页
          </Link>
        </div>
      </div>
    </ScreenShell>
  );
}

function CloudSyncPanel() {
  const auth = useNekoCloudAuth();
  const [busy, setBusy] = useState<"signout" | null>(null);

  const run = async (kind: "signout", task: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try {
      await task();
    } catch (error) {
      console.error("NEKO cloud action failed", error);
      toast.error("操作失败，请稍后再试");
    } finally {
      setBusy(null);
    }
  };

  if (auth.status === "unconfigured") {
    return (
      <div className="mx-5 mt-4 rounded-[22px] bg-white/75 p-4 text-[11.5px] leading-relaxed text-[oklch(0.55_0.06_300)] backdrop-blur"
        style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
        账号登录暂不可用，请稍后再试。
      </div>
    );
  }

  if (auth.status === "loading") {
    return (
      <div className="mx-5 mt-4 rounded-[22px] bg-white/75 p-4 text-[12px] text-[oklch(0.55_0.06_300)] backdrop-blur"
        style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
        正在检查登录状态…
      </div>
    );
  }

  if (auth.status === "signed-out") {
    return (
      <div className="mx-5 mt-4 rounded-[22px] bg-white/80 p-4 backdrop-blur"
        style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
        <div className="flex items-center gap-2">
          <span className="text-soul text-[13px]">✦</span>
          <div className="text-[10px] tracking-[0.35em] text-[oklch(0.55_0.06_300)]">账 号 同 步</div>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-foreground/75">
          登录后，猫咪档案、人格和心声会自动绑定到你的账号。现在支持验证码登录。
        </p>
        <Link to="/auth/login" className="mt-3 flex w-full items-center justify-center rounded-full px-4 py-2.5 text-[12px] font-medium text-white"
          style={{ background: "var(--gradient-cta)" }}>
          邮箱验证码登录
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-5 mt-4 rounded-[22px] bg-white/80 p-4 backdrop-blur"
      style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-soul text-[13px]">✦</span>
            <div className="text-[10px] tracking-[0.35em] text-[oklch(0.55_0.06_300)]">账 号 同 步</div>
          </div>
          <div className="mt-1 truncate text-[12px] text-foreground/80">{auth.user.email}</div>
        </div>
        <button
          disabled={busy === "signout"}
          onClick={() => void run("signout", async () => {
            await signOutNekoCloud();
            toast.success("已退出登录");
          })}
          className="shrink-0 rounded-full bg-white/90 px-3 py-1.5 text-[11px] text-[oklch(0.55_0.06_300)] disabled:opacity-60"
        >
          退出
        </button>
      </div>
      <Link to="/app/account" className="mt-3 flex w-full items-center justify-center rounded-full bg-white/90 px-4 py-2.5 text-[12px] text-foreground">
        账号中心
      </Link>
    </div>
  );
}

// ---------- Screen 7: 我的 ----------
export function ScreenMe() {
  const catName = useCatName();
  const persona = useCatPersona();
  return (
    <ScreenShell>
      <StatusBar />
      <div className="absolute inset-0 overflow-y-auto scrollbar-none pt-[52px] pb-[110px]">
        <div className="px-6 text-[22px] font-light tracking-wide text-foreground">我的</div>

        <div className="mx-5 mt-4 overflow-hidden rounded-[26px] p-5"
          style={{ background: "linear-gradient(135deg, oklch(0.96 0.035 320), oklch(0.95 0.04 280))", boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-white/60 blur" />
              <div className="relative"><CatAvatar size={72} usePhoto /></div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[18px] font-medium text-foreground">{catName}</div>
              <div className="mt-1 text-[11px] font-medium tracking-[0.12em] text-[oklch(0.5_0.1_320)]">{persona?.mbti ?? "INTJ-A"}</div>
              <div className="mt-0.5 truncate text-[12px] text-foreground/80">{persona?.type ?? "高冷观察者"}</div>
            </div>
          </div>
          <div className="mt-3 line-clamp-2 text-[11.5px] leading-relaxed text-foreground/75">
            {persona?.analysis ?? "安静观察，也一直留意着你的一举一动。"}
          </div>
          <Link to="/app/profile" className="mt-3 flex justify-end text-[11.5px] font-medium text-[oklch(0.5_0.1_320)]">查看人格&nbsp; ›</Link>
        </div>

        <section className="mx-5 mt-6">
          <h2 className="mb-2 px-1 text-[11px] font-medium tracking-[0.2em] text-[oklch(0.55_0.06_300)]">我的猫咪</h2>
          <div className="overflow-hidden rounded-[22px] bg-white/78 backdrop-blur" style={{ border: "1px solid oklch(1 0 0 / 0.75)" }}>
            <SettingsRow to="/app/me/edit" icon="✎" title="猫咪档案" subtitle="基本信息与人格" />
            <SettingsRow to="/app/me/voices" icon="♡" title="猫咪心声" subtitle="查看和管理所有心声" border />
          </div>
        </section>

        <section className="mx-5 mt-6">
          <h2 className="mb-2 px-1 text-[11px] font-medium tracking-[0.2em] text-[oklch(0.55_0.06_300)]">账号与设置</h2>
          <div className="overflow-hidden rounded-[22px] bg-white/78 backdrop-blur" style={{ border: "1px solid oklch(1 0 0 / 0.75)" }}>
            <SettingsRow to="/app/account" icon="◎" title="账号与数据" subtitle="邮箱登录、昵称和账号管理" />
            <SettingsRow to="/app/settings" icon="⚙" title="设置" subtitle="隐私、协议与 App 设置" border />
          </div>
        </section>
      </div>
      <TabBar active="me" />
    </ScreenShell>
  );
}
function SettingsRow({ icon, title, subtitle, to, border = false }: { icon: string; title: string; subtitle: string; to: "/app/account" | "/app/me/edit" | "/app/me/voices" | "/app/settings"; border?: boolean }) {
  return (
    <Link to={to} className={`flex min-h-[68px] items-center gap-3 px-4 py-3 text-left transition-colors active:bg-white/75 ${border ? "border-t border-[oklch(0.9_0.02_300)]" : ""}`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[15px] text-[oklch(0.5_0.1_320)]"
        style={{ background: "linear-gradient(135deg, oklch(0.96 0.04 320), oklch(0.95 0.04 280))" }}>{icon}</div>
      <div className="flex-1">
        <div className="text-[13.5px] font-medium text-foreground">{title}</div>
        <div className="mt-0.5 text-[10.5px] text-[oklch(0.55_0.05_300)]">{subtitle}</div>
      </div>
      <span className="text-[14px] text-[oklch(0.65_0.04_300)]">›</span>
    </Link>
  );
}

// ---------- Screen 8: 猫咪档案 ----------
export function ScreenEditProfile() {
  const navigate = useNavigate();
  const profile = getCatProfile();
  const persona = useCatPersona();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(profile.name);
  const [gender, setGender] = useState(profile.gender);
  const [ageStage, setAgeStage] = useState(profile.ageStage);
  const [avatar, setAvatar] = useState(profile.avatar ?? null);
  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const limitError = getNekoUploadLimitError(file, "image");
    if (limitError) {
      toast(limitError, { icon: "📷" });
      return;
    }
    try {
      const url = await readAsDataUrl(file);
      setAvatar(url);
      toast.success("照片已更新");
    } catch {
      toast.error("照片读取失败");
    }
  };
  const saveProfile = () => {
    updateCatProfile({ name: name.trim(), gender, ageStage, avatar: avatar ?? undefined });
    void saveLocalNekoToCloud({ includeVoices: false }).catch(() => undefined);
    toast.success("已保存修改");
    navigate({ to: "/app/me" });
  };
  return (
    <ScreenShell>
      <StatusBar />
      <div className="absolute inset-0 overflow-y-auto scrollbar-none pt-[52px] pb-8">
        <div className="flex items-center justify-between px-6">
          <AppBackButton to="/app/me" />
          <div className="text-[13px] font-medium text-foreground">猫咪档案</div>
          <div className="h-9 w-9" />
        </div>

        <div className="mt-5 flex flex-col items-center">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          <div className="relative">
            {avatar ? (
              <div className="relative overflow-hidden rounded-full bg-white" style={{ width: 92, height: 92, boxShadow: "var(--shadow-soft)" }}>
                <img src={avatar} alt={name} className="h-full w-full object-cover" />
              </div>
            ) : (
              <CatAvatar size={92} usePhoto />
            )}
            <button onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[11px] text-[oklch(0.5_0.1_320)]" style={{ boxShadow: "var(--shadow-soft)" }}>✎</button>
          </div>
          <button onClick={() => fileRef.current?.click()} className="mt-3 text-[11.5px] tracking-[0.2em] text-[oklch(0.5_0.1_320)] active:text-[oklch(0.4_0.12_320)] active:scale-[0.98] transition-all duration-150">更换照片 · ≤ {NEKO_MAX_UPLOAD_LABEL}</button>
        </div>

        <div className="mx-5 mt-5 flex flex-col gap-2.5">
          <FieldRow label="猫咪昵称" value={name} onChange={setName} />
          <FieldChoice label="性别" options={["小公猫", "小母猫"]} value={gender} onChange={(v) => setGender(v as "小公猫" | "小母猫")} />
          <FieldChoice label="年龄阶段" options={["幼猫", "青年猫", "成熟猫", "资深猫"]} value={ageStage} onChange={(v) => setAgeStage(v as "幼猫" | "青年猫" | "成熟猫" | "资深猫")} compact />
          <div className="rounded-[20px] bg-white/75 p-4 backdrop-blur" style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
            <div className="flex items-center justify-between">
              <div className="text-[11px] tracking-[0.2em] text-[oklch(0.55_0.06_300)]">人格类型</div>
              <span className="rounded-full bg-[oklch(0.97_0.025_320)] px-2 py-0.5 text-[10px] tracking-[0.15em] text-[oklch(0.55_0.06_300)]">不可编辑</span>
            </div>
            <div className="mt-2 flex items-center gap-2.5">
              <div className="text-[15px] font-medium text-foreground">{persona?.type ?? "高冷观察者"}</div>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.15em] text-white" style={{ background: "linear-gradient(135deg, oklch(0.70 0.14 305), oklch(0.76 0.11 0))" }}>{persona?.mbti ?? "INTJ-A"}</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[oklch(0.55_0.05_300)]">基于上传的资料生成 · 重新测试可更新</p>
          </div>
        </div>

        <div className="mx-5 mt-6 grid grid-cols-2 gap-2.5">
          <button onClick={saveProfile} className="rounded-full bg-white/85 px-4 py-3.5 text-[12.5px] text-foreground backdrop-blur active:bg-white/95 active:scale-[0.98] transition-all duration-150" style={{ boxShadow: "var(--shadow-soft)" }}>保存修改</button>
          <button onClick={() => { updateCatProfile({ name: name.trim(), gender, ageStage, avatar: avatar ?? undefined }); clearCatPersona(); toast.success("已保存，正在重新测试…"); navigate({ to: "/", search: { restart: true } }); }} className="rounded-full px-4 py-3.5 text-[12.5px] font-medium text-white active:scale-[0.97] active:brightness-[0.92] transition-all duration-150"
            style={{ background: "linear-gradient(135deg, oklch(0.70 0.14 305), oklch(0.76 0.11 0))", boxShadow: "0 14px 28px -14px oklch(0.70 0.14 305 / 0.6)" }}>
            保存并重新测试
          </button>
        </div>
      </div>
    </ScreenShell>
  );
}
function FieldRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="rounded-[20px] bg-white/75 p-4 backdrop-blur" style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
      <div className="text-[11px] tracking-[0.2em] text-[oklch(0.55_0.06_300)]">{label}</div>
      <div className="mt-1.5 flex items-center justify-between">
        <input value={value} onChange={(e) => onChange(e.target.value.slice(0, 12))} className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none" />
        <span className="text-[12px] text-[oklch(0.55_0.06_300)]">✎</span>
      </div>
    </div>
  );
}
function FieldChoice({ label, options, value, onChange, compact }: { label: string; options: string[]; value: string; onChange: (value: string) => void; compact?: boolean }) {
  return (
    <div className="rounded-[20px] bg-white/75 p-4 backdrop-blur" style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
      <div className="text-[11px] tracking-[0.2em] text-[oklch(0.55_0.06_300)]">{label}</div>
      <div className={"mt-2.5 grid gap-1.5 " + (compact ? "grid-cols-4" : "grid-cols-2")}>
        {options.map((o, i) => (
          <button key={o} onClick={() => onChange(o)} className={"rounded-full py-2 text-[12px] " + (o === value
            ? "text-white"
            : "bg-[oklch(0.97_0.025_320)] text-[oklch(0.5_0.06_300)]")}
            style={o === value ? { background: "var(--gradient-cta)" } : undefined}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Screen 9: 管理猫咪心声 ----------
export function ScreenManageVoices() {
  const voices = useVoices();
  const catAvatar = useCatAvatar();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const allVoices = mounted ? voices : [];
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i); else next.add(i);
    setSelected(next);
  };
  const handleDelete = () => {
    const n = selected.size;
    const toDelete = allVoices.filter((_, idx) => selected.has(idx));
    voicesStore.removeMany(selected);
    void Promise.all(toDelete.map((voice) => deleteCloudVoice(voice).catch(() => undefined)));
    setConfirmDel(false);
    setEditMode(false);
    setSelected(new Set());
    toast.success(`已删除 ${n} 条心声`);
  };
  const exitEdit = () => { setEditMode(false); setSelected(new Set()); };
  const aspectRatio = (a?: string) => a === "9:16" ? "9 / 16" : a === "3:4" ? "3 / 4" : a === "1:1" ? "1 / 1" : "4 / 5";
  const colA = allVoices.filter((_, i) => i % 2 === 0).map((v, k) => ({ v, i: k * 2 }));
  const colB = allVoices.filter((_, i) => i % 2 === 1).map((v, k) => ({ v, i: k * 2 + 1 }));
  return (
    <ScreenShell>
      <StatusBar />
      <div className="absolute inset-0 flex flex-col pt-[52px]" style={{ paddingBottom: editMode ? 96 : 16 }}>
        <div className="flex items-center justify-between px-6">
          {editMode ? (
            <button onClick={exitEdit} className="rounded-full bg-white/80 px-3 py-1.5 text-[11.5px] text-[oklch(0.5_0.1_320)] backdrop-blur active:bg-white/95 active:scale-[0.98] transition-all duration-150" style={{ boxShadow: "var(--shadow-soft)" }}>取消</button>
          ) : (
            <AppBackButton onClick={() => router.history.back()} />
          )}
          <div className="text-[13px] font-medium text-foreground">{editMode ? `已选 ${selected.size} 条` : "猫咪心声"}</div>
          {allVoices.length > 0 && !editMode ? (
            <button onClick={() => setEditMode(true)} className="rounded-full bg-white/80 px-3 py-1.5 text-[11.5px] text-[oklch(0.5_0.1_320)] backdrop-blur active:bg-white/95 active:scale-[0.98] transition-all duration-150" style={{ boxShadow: "var(--shadow-soft)" }}>编辑</button>
          ) : (
            <div className="h-9 w-[52px]" />
          )}
        </div>

        {allVoices.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <div className="relative flex h-[120px] w-[120px] items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg, oklch(0.96 0.03 320), oklch(0.94 0.04 280))", boxShadow: "var(--shadow-soft)" }}>
              <CatAvatar size={72} grad={CAT_GRADIENTS[0]} usePhoto />
              <div className="absolute -right-1 -top-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] text-[oklch(0.55_0.08_300)] backdrop-blur" style={{ boxShadow: "var(--shadow-soft)" }}>zzz</div>
            </div>
            <div className="mt-6 text-[15px] font-medium text-foreground">还没有猫咪心声哦</div>
            <p className="mt-2 text-[12px] leading-[1.7] text-[oklch(0.55_0.06_300)]">记录一个瞬间，<br/>让 AI 听懂它的小心思 ✦</p>
            <Link to="/app/publish" className="mt-6 rounded-full px-6 py-3 text-[12.5px] font-medium text-white active:scale-[0.97] active:brightness-[0.92] transition-all duration-150"
              style={{ background: "linear-gradient(135deg, oklch(0.70 0.14 305), oklch(0.76 0.11 0))", boxShadow: "0 14px 28px -14px oklch(0.70 0.14 305 / 0.6)" }}>
              发布第一条心声
            </Link>
          </div>
        ) : (
        <div className="mt-4 flex-1 overflow-y-auto scrollbar-none px-4 pb-6">
          <div className="grid grid-cols-2 gap-3">
            {[colA, colB].map((col, ci) => (
              <div key={ci} className="flex flex-col gap-3">
                {col.map(({ v, i }) => {
                  const isSel = selected.has(i);
                  const card = (
                    <div className="relative overflow-hidden rounded-[24px] bg-white/85 backdrop-blur transition-all duration-150 active:scale-[0.985]"
                      style={{
                        boxShadow: isSel
                          ? "0 12px 28px -16px oklch(0.70 0.14 305 / 0.45)"
                          : "0 8px 22px -16px oklch(0.65 0.08 300 / 0.35)",
                        border: isSel ? "1.5px solid transparent" : "1px solid oklch(1 0 0 / 0.7)",
                        backgroundImage: isSel
                          ? "linear-gradient(white, white), linear-gradient(135deg, #B69AEF, #E6B8CF)"
                          : undefined,
                        backgroundOrigin: isSel ? "border-box" : undefined,
                        backgroundClip: isSel ? "padding-box, border-box" : undefined,
                      }}>
                       <div className="relative w-full overflow-hidden" style={{ aspectRatio: aspectRatio(v.aspect), background: v.grad }}>
                        {v.media ? (
                          <img src={v.media} alt="" className="h-full w-full object-cover" />
                        ) : catAvatar ? (
                          <img src={catAvatar} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center"><CatAvatar size={64} grad={v.grad} usePhoto /></div>
                        )}
                        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%]"
                          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.42), rgba(0,0,0,0.15) 55%, rgba(0,0,0,0))" }} />
                        <div className="absolute inset-x-0 bottom-0 p-3">
                          <p className="text-[12px] leading-[1.5] text-white" style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            textShadow: "0 1px 6px rgba(0,0,0,0.35)",
                          }}>
                            <span className="mr-1">💭</span>{v.text}
                          </p>
                        </div>
                        {editMode && (
                          <div className="absolute left-2.5 top-2.5">
                            <div className={"flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-white " + (isSel ? "" : "border border-white/70 bg-black/15 backdrop-blur text-transparent")}
                              style={isSel ? { background: "linear-gradient(135deg, #B69AEF, #E6B8CF)", boxShadow: "0 4px 10px -4px rgba(182,154,239,0.6)" } : undefined}>
                              ✓
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="px-3 py-2 text-[10.5px]" style={{ color: "#9A91AE" }}>{v.time}</div>
                    </div>
                  );
                  return editMode ? (
                    <button key={i} type="button" onClick={() => toggle(i)} className="text-left">{card}</button>
                  ) : (
                    <Link key={i} to="/app/voice/$id" params={{ id: String(i) }}>{card}</Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        )}

        {editMode && (
          <div className="absolute inset-x-0 bottom-0">
            <div className="mx-4 mb-5 rounded-[24px] bg-white/90 p-2 backdrop-blur-xl" style={{ boxShadow: "0 12px 30px -16px oklch(0.70 0.14 305 / 0.4)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
              <button
                onClick={() => selected.size > 0 ? setConfirmDel(true) : toast("先选择要删除的心声哦")}
                disabled={selected.size === 0}
                className="w-full rounded-full px-5 py-3 text-[13px] font-medium text-white transition-all duration-150 active:scale-[0.98] active:brightness-[0.92] disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, oklch(0.70 0.16 25), oklch(0.74 0.14 0))", boxShadow: "0 10px 22px -12px oklch(0.70 0.14 25 / 0.55)" }}>
                删除所选 ({selected.size})
              </button>
            </div>
          </div>
        )}
      </div>
      <ConfirmSheet open={confirmDel} title={`确定删除 ${selected.size} 条心声吗？`} hint="删除后无法恢复" confirmText="删除" danger onConfirm={handleDelete} onCancel={() => setConfirmDel(false)} />
    </ScreenShell>
  );
}

// ---------- showcase ----------
const SCREENS = [
  { id: "home", index: "01", title: "首页", subtitle: "Home Timeline", Component: ScreenHome },
  { id: "detail", index: "02", title: "心声详情", subtitle: "Voice Detail", Component: ScreenVoiceDetail },
  { id: "pub1", index: "03", title: "发布 · 上传", subtitle: "Publish · Step 1", Component: ScreenPublish1 },
  { id: "pub2", index: "04", title: "发布 · 背景", subtitle: "Publish · Step 2", Component: ScreenPublish2 },
  { id: "pub3", index: "05", title: "发布 · 预览", subtitle: "Publish · Step 3", Component: ScreenPublish3 },
  { id: "success", index: "06", title: "发布成功", subtitle: "Success", Component: ScreenSuccess },
  { id: "me", index: "07", title: "我的", subtitle: "Profile", Component: ScreenMe },
  { id: "edit", index: "08", title: "猫咪档案", subtitle: "Cat Profile", Component: ScreenEditProfile },
  { id: "manage", index: "09", title: "管理心声", subtitle: "Manage Voices", Component: ScreenManageVoices },
];

export function AppShowcase() {
  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ background: "var(--gradient-cream)" }}>
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-80" style={{ background: "var(--gradient-aura)" }} />
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, oklch(0.78 0.11 305 / .35) 1px, transparent 0)", backgroundSize: "32px 32px" }} />

      <header className="relative z-10 mx-auto flex max-w-[1600px] items-center justify-between px-8 pt-10 pb-6 md:px-14">
        <div className="flex items-center gap-3">
          <div className="relative h-9 w-9">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[oklch(0.88_0.09_320)] to-[oklch(0.88_0.08_260)] blur-[3px]" />
            <div className="absolute inset-[3px] rounded-full bg-white" />
            <div className="absolute inset-[8px] rounded-full bg-gradient-to-br from-[oklch(0.82_0.11_320)] to-[oklch(0.84_0.09_0)] animate-breathe" />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-medium tracking-[0.32em] text-foreground">喵一下</div>
            <div className="text-[10px] tracking-[0.4em] text-muted-foreground">PRODUCT DEMO · 9 SCREENS</div>
          </div>
        </div>
        <div className="hidden items-center gap-6 text-[11px] tracking-[0.3em] text-muted-foreground md:flex">
          <span>MVP · v 1.0</span>
          <span className="text-foreground/70">— 听懂它的小心声</span>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-[1600px] px-8 pb-12 md:px-14">
        <div className="max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[10px] tracking-[0.32em] text-[oklch(0.55_0.08_320)] backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-[oklch(0.78_0.11_305)]" />
            APP DEMO · iPhone 16 Pro
          </div>
          <h1 className="text-balance text-[40px] font-light leading-[1.08] tracking-tight text-foreground md:text-[60px]">
            一只猫的，
            <br />
            <span className="text-soul font-normal italic">小心声</span> 被听见了。
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            上传一张照片、一段视频，AI 帮你听懂它正在想什么 —— 一个温柔的 AI 伙伴，陪你走进猫咪的小世界。
          </p>
        </div>
      </section>

      <section className="relative z-10 pb-24">
        <div className="scrollbar-none flex snap-x snap-mandatory gap-16 overflow-x-auto px-8 pb-16 md:px-14">
          {SCREENS.map((s) => (
            <figure key={s.id} className="snap-center shrink-0">
              <div className="mb-5 flex items-end justify-between px-1">
                <div>
                  <div className="text-[10px] tracking-[0.4em] text-muted-foreground">{s.index} · {s.subtitle}</div>
                  <div className="mt-1 text-[15px] tracking-wide text-foreground">{s.title}</div>
                </div>
                <div className="h-px w-16 bg-gradient-to-r from-transparent to-border" />
              </div>
              <div className="phone-frame">
                <div className="phone-notch" />
                <div className="relative h-full w-full overflow-hidden">
                  <s.Component />
                </div>
              </div>
            </figure>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/40">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-8 py-8 text-[11px] tracking-[0.3em] text-muted-foreground md:px-14">
          <span>喵一下 · 读懂它的小世界</span>
          <span>PRODUCT DEMO · 9 / 9</span>
        </div>
      </footer>
    </div>
  );
}
