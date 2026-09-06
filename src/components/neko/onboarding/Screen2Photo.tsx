import { Sparkles } from "../screens/_shared";
import { BackButton } from "./BackButton";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { detectCatFace } from "@/lib/catface.functions";
import { setCatAvatar } from "../catAvatarStore";
import { setCatName } from "../catNameStore";
import { setCatProfile } from "../catProfileStore";
import { getPhotoDraft, setPhotoDraft } from "./onboardingDraftStore";
import { ImagePlus } from "lucide-react";
import { getNekoUploadLimitError, NEKO_MAX_UPLOAD_LABEL } from "@/lib/neko-upload-limits";

const getStableAvatar = (value: string | null | undefined) =>
  value?.startsWith("data:image/") ? value : null;

function compressAvatarImage(dataUrl: string, maxSide = 900, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
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
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function Screen2Photo({ onNext, onPrev }: { onNext?: () => void; onPrev?: () => void } = {}) {
  const draft = getPhotoDraft();
  const draftAvatar = getStableAvatar(draft.avatar);
  const [gender, setGenderState] = useState<"m" | "f" | null>(draft.gender);
  const [age, setAgeState] = useState<0 | 1 | 2 | 3 | null>(draft.age);
  const [avatar, setAvatarState] = useState<string | null>(draftAvatar);
  const [pendingDataUrl, setPendingDataUrlState] = useState<string | null>(draftAvatar);
  const [verified, setVerifiedState] = useState(draftAvatar ? draft.verified : false);
  const [checking, setChecking] = useState(false);
  const [name, setNameState] = useState(draft.name);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const runDetect = useServerFn(detectCatFace);

  const setName = (value: string) => {
    const next = value.slice(0, 12);
    setNameState(next);
    setPhotoDraft({ name: next });
  };
  const setGender = (value: "m" | "f") => {
    setGenderState(value);
    setPhotoDraft({ gender: value });
  };
  const setAge = (value: 0 | 1 | 2 | 3) => {
    setAgeState(value);
    setPhotoDraft({ age: value });
  };
  const setAvatar = (value: string | null) => {
    setAvatarState(value);
  };
  const setPendingDataUrl = (value: string | null) => {
    setPendingDataUrlState(value);
    setPhotoDraft({ avatar: value, verified: false });
  };
  const setVerified = (value: boolean) => {
    setVerifiedState(value);
    setPhotoDraft({ verified: value });
  };

  const pickPhoto = () => {
    // 浏览器/手机会自动弹出相册权限请求；已授权则直接打开相册
    fileRef.current?.click();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const limitError = getNekoUploadLimitError(f, "image");
    if (limitError) {
      toast(limitError, { icon: "📷" });
      return;
    }
    const url = URL.createObjectURL(f);
    setAvatar(url);
    setPendingDataUrlState(null);
    setVerified(false);
    // 读取为 base64 dataURL 以供服务端 AI 校验
    const reader = new FileReader();
    reader.onload = async () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      const avatarDataUrl = result ? await compressAvatarImage(result) : null;
      setPendingDataUrl(avatarDataUrl);
      setAvatarState(avatarDataUrl);
      if (avatarDataUrl) {
        setCatAvatar(avatarDataUrl);
        setPhotoDraft({ avatar: avatarDataUrl, verified: false });
      }
      URL.revokeObjectURL(url);
    };
    reader.onerror = () => {
      setAvatarState(null);
      setPendingDataUrl(null);
      setVerified(false);
      URL.revokeObjectURL(url);
      toast("照片好像没有读出来，换一张再试试喵～", { icon: "📷" });
    };
    reader.readAsDataURL(f);
    toast.success("照片已更新");
  };

  const onContinue = async () => {
    if (!pendingDataUrl) {
      toast("猫咪头像还没上传哦，先让喵懂见见它的小脸吧～", { icon: "📷" });
      return;
    }
    if (!name.trim()) {
      toast("还不知道猫咪叫什么呢，把它的名字告诉喵懂吧～", { icon: "🐾" });
      nameRef.current?.focus();
      return;
    }
    if (!gender) {
      toast("猫咪性别也要选一下喵，档案差一枚小爪印～", { icon: "🐱" });
      return;
    }
    if (age === null) {
      toast("猫咪年龄阶段还没选，喵懂想更懂它一点～", { icon: "🎂" });
      return;
    }
    if (!verified) {
      setChecking(true);
      const loadingId = toast.loading("正在识别猫咪正脸…");
      try {
        const result = await runDetect({ data: { imageDataUrl: pendingDataUrl } });
        toast.dismiss(loadingId);
        if (!result.isCat) {
          toast("这张照片里小猫脸有点害羞，再换一张清楚正脸吧～", { icon: "🐱" });
          return;
        }
        setVerified(true);
        setCatAvatar(pendingDataUrl);
      } catch (err) {
        toast.dismiss(loadingId);
        setVerified(true);
        setCatAvatar(pendingDataUrl);
        toast("喵懂刚刚眨了下眼，先帮你记下这张可爱脸～", { icon: "✨" });
      } finally {
        setChecking(false);
      }
    }
    setCatAvatar(pendingDataUrl);
    setPhotoDraft({ avatar: pendingDataUrl, verified: true });
    const ageLabels = ["幼猫", "青年猫", "成熟猫", "资深猫"] as const;
    setCatName(name.trim());
    setCatProfile({
      name: name.trim(),
      gender: gender === "m" ? "小公猫" : "小母猫",
      ageStage: ageLabels[age],
      avatar: pendingDataUrl ?? undefined,
      updatedAt: Date.now(),
    });
    onNext?.();
  };

  return (
    <div className="absolute inset-0 flex flex-col pt-[58px] overflow-hidden"
      style={{ background: "var(--gradient-cream)" }}>
      <Sparkles count={18} />
      <BackButton onPrev={onPrev} />
      <div className="relative z-10 flex-1 overflow-y-auto scrollbar-none pb-[190px]">
        <StepBar step={1} />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
        <div className="relative z-10 px-7 mt-2">
          <h1 className="text-[22px] font-light leading-tight text-foreground">上传猫咪正脸照片</h1>
          <p className="mt-1.5 text-[12px] text-[oklch(0.58_0.04_300)]">头像会用于生成人格档案 · 图片不超过 {NEKO_MAX_UPLOAD_LABEL}</p>
        </div>
        <div className="relative z-10 mt-6 flex justify-center">
          <button type="button" onClick={pickPhoto} className="relative h-[170px] w-[170px] outline-none">
            <div className="absolute inset-0 rounded-full opacity-80 blur-2xl animate-breathe"
              style={{ background: "radial-gradient(circle, oklch(0.9 0.08 320 / 0.9), transparent 70%)" }} />
            <div className="absolute inset-0 rounded-full border-[1.5px] border-dashed border-[oklch(0.82_0.08_320/0.6)]" />
            <div className="absolute inset-3 overflow-hidden rounded-full bg-white p-1 shadow-[0_18px_40px_-18px_oklch(0.78_0.11_305/0.5)]">
              {avatar ? (
                <img
                  src={avatar}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                  loading="lazy"
                  width={1024}
                  height={1024}
                  onError={() => {
                    setAvatarState(null);
                    setPendingDataUrl(null);
                    setVerified(false);
                  }}
                />
              ) : (
                <div
                  className="flex h-full w-full flex-col items-center justify-center rounded-full text-[oklch(0.56_0.07_300)]"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 38%, oklch(1 0 0 / 0.96) 0%, oklch(0.985 0.018 320) 58%, oklch(0.955 0.04 290) 100%)",
                  }}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/80 shadow-[0_10px_24px_-16px_oklch(0.7_0.12_305/0.5)]">
                    <ImagePlus className="h-5 w-5" strokeWidth={1.8} />
                  </span>
                  <span className="mt-2 text-[11px] tracking-[0.22em]">上传正脸</span>
                  <span className="mt-1 text-[9px] tracking-[0.18em] text-[oklch(0.68_0.04_300)]">JPG / PNG</span>
                </div>
              )}
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full text-white text-[16px] shadow-[0_8px_20px_-6px_oklch(0.78_0.11_305/0.6)]"
              style={{ background: "linear-gradient(135deg, oklch(0.70 0.14 305), oklch(0.76 0.11 0))" }}>＋</span>
          </button>
        </div>
        <p className="relative z-10 mt-3 text-center text-[10px] tracking-[0.3em] text-[oklch(0.6_0.06_300)]">点击上传 · JPG / PNG</p>
        <div className="relative z-10 mx-5 mt-6 rounded-[24px] glass p-5">
          <Label>猫咪名称</Label>
          <div
            onClick={() => nameRef.current?.focus()}
            className="mt-2 flex w-full items-center justify-between rounded-2xl bg-white/70 px-4 py-3 text-left text-[14px] text-foreground"
          >
            <input
              ref={nameRef}
              type="text"
              inputMode="text"
              enterKeyHint="done"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="它叫什么名字呀～"
              maxLength={12}
              className="flex-1 bg-transparent font-medium outline-none placeholder:text-[oklch(0.7_0.04_300)]"
            />
            <span className="ml-2 shrink-0 text-[11px] text-[oklch(0.6_0.05_300)]">{[...name].length} / 12</span>
          </div>
        </div>
        <div className="relative z-10 mx-5 mt-3 rounded-[24px] glass p-5">
          <Label>性别</Label>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Pill text="小公猫" active={gender === "m"} onClick={() => setGender("m")} />
            <Pill text="小母猫" active={gender === "f"} onClick={() => setGender("f")} />
          </div>
        </div>
        <div className="relative z-10 mx-5 mt-3 rounded-[24px] glass p-5">
          <Label>年龄阶段</Label>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Pill text="幼猫" sub="0 – 1 岁" active={age === 0} onClick={() => setAge(0)} />
            <Pill text="青年猫" sub="1 – 4 岁" active={age === 1} onClick={() => setAge(1)} />
            <Pill text="成熟猫" sub="4 – 8 岁" active={age === 2} onClick={() => setAge(2)} />
            <Pill text="资深猫" sub="8 岁+" active={age === 3} onClick={() => setAge(3)} />
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-20 px-5 pt-5 pb-[max(10px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={checking}
          onPointerDown={(e) => { e.preventDefault(); if (!checking) onContinue(); }}
          className="flex w-full touch-manipulation select-none items-center justify-center rounded-full px-6 py-4 text-[14px] font-medium text-white shadow-[0_16px_32px_-14px_oklch(0.78_0.11_305/0.55)] active:scale-[0.98] transition-transform duration-75 disabled:opacity-70"
          style={{ background: "var(--gradient-cta)" }}
        >
          {checking ? "识别中…" : "继续"}
        </button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] tracking-[0.4em] text-[oklch(0.55_0.06_300)]">{children}</div>;
}
function Pill({ text, sub, active, onClick }: { text: string; sub?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={
      "flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[13px] border transition active:scale-[0.98] duration-150 " +
      (active
        ? "text-white border-transparent shadow-[0_8px_20px_-10px_oklch(0.78_0.11_305/0.5)]"
        : "bg-white/70 text-foreground border-[oklch(0.9_0.02_310/0.6)]")
    } style={active ? { background: "var(--gradient-selected)" } : undefined}>
      <span className="font-medium leading-none">{text}</span>
      {sub && <span className={"ml-1 text-[10px] leading-none " + (active ? "text-white/85" : "text-[oklch(0.6_0.05_300)]")}>{sub}</span>}
    </button>
  );
}

function StepBar({ step }: { step: number }) {
  return (
    <div className="relative z-10 mb-4 flex items-center justify-end px-7">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={"h-1 rounded-full " + (i <= step ? "w-6 bg-[oklch(0.82_0.1_320)]" : "w-3 bg-[oklch(0.9_0.02_310)]")} />
        ))}
      </div>
    </div>
  );
}
