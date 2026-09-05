import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { toast } from "sonner";

import { CatAvatar, ScreenShell, StatusBar } from "@/components/neko/app/AppShowcase";
import { getCatPersona } from "@/components/neko/catProfileStore";
import {
  loadNekoAccountSummary,
  loadNekoFromCloud,
  requestNekoLoginCode,
  saveLocalNekoToCloud,
  signOutNekoCloud,
  updateNekoUserProfile,
  useNekoCloudAuth,
  verifyNekoLoginCode,
  type NekoAccountSummary,
} from "@/lib/neko-cloud";

function authErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "";

  if (code === "over_email_send_rate_limit" || message.includes("rate")) return "验证码发送太频繁了，稍等一会儿再试";
  if (code === "otp_expired" || message.includes("expired")) return "验证码已过期，请重新获取";
  if (message.includes("OTP_CODE_INVALID")) return "请输入 6 位邮箱验证码";
  if (message.includes("EMAIL_REQUIRED")) return "请输入邮箱";
  return "操作失败，请稍后重试";
}

function safeEmail(value: string) {
  return value.trim().toLowerCase();
}

const AUTH_LOGIN_BG = "linear-gradient(180deg, oklch(0.985 0.014 60) 0%, oklch(0.965 0.032 320) 55%, oklch(0.95 0.04 285) 100%)";

function AuthLoginFrame({ children, bg = "var(--gradient-cream)" }: PropsWithChildren<{ bg?: string }>) {
  return (
    <div className="relative h-[100dvh] overflow-hidden" style={{ background: bg }}>
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-80" style={{ background: "var(--gradient-aura)" }} />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, oklch(0.78 0.11 305 / .35) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative z-10 mx-auto h-[100dvh] w-full max-w-[480px] overflow-hidden" style={{ transform: "translateZ(0)" }}>
        {children}
      </div>
    </div>
  );
}

export function AuthLoginScreen() {
  const navigate = useNavigate();
  const auth = useNekoCloudAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const normalizedEmail = useMemo(() => safeEmail(email || sentEmail), [email, sentEmail]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const sendCode = async () => {
    if (busy || cooldown > 0) return;
    const nextEmail = safeEmail(email || sentEmail);
    setBusy("send");
    try {
      const result = await requestNekoLoginCode(nextEmail);
      setSentEmail(result.email);
      setEmail(result.email);
      setCode("");
      setCooldown(60);
      toast.success("验证码已发送，请查收邮箱");
    } catch (error) {
      toast.error(authErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const verifyCode = async () => {
    if (busy) return;
    setBusy("verify");
    try {
      const hadLocalPersona = Boolean(getCatPersona());
      await verifyNekoLoginCode(normalizedEmail, code);
      let restored = false;

      if (!hadLocalPersona) {
        try {
          const result = await loadNekoFromCloud();
          restored = result.restored;
        } catch (error) {
          console.warn("NEKO login auto restore failed", error);
        }
      }

      toast.success(restored ? "登录成功，已恢复云端猫咪档案" : "登录成功，欢迎回到 NEKO.ID");
      await navigate({ to: restored || hadLocalPersona ? "/app" : "/", replace: true });
    } catch (error) {
      toast.error(authErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  if (auth.status === "unconfigured") {
    return (
      <AuthLoginFrame>
        <ScreenShell>
          <StatusBar />
          <div className="absolute inset-0 flex items-center justify-center px-7">
            <div className="w-full rounded-[28px] bg-white/85 p-5 text-center backdrop-blur" style={{ boxShadow: "var(--shadow-soft)" }}>
              <div className="text-[18px] font-medium text-foreground">云端登录暂不可用</div>
              <p className="mt-2 text-[12px] leading-relaxed text-[oklch(0.55_0.06_300)]">
                登录服务正在配置中，请稍后再试。
              </p>
              <Link to="/app/me" className="mt-5 inline-flex rounded-full px-5 py-2.5 text-[12px] font-medium text-white" style={{ background: "var(--gradient-cta)" }}>
                返回我的
              </Link>
            </div>
          </div>
        </ScreenShell>
      </AuthLoginFrame>
    );
  }

  if (auth.status === "signed-in") {
    return (
      <AuthLoginFrame>
        <ScreenShell>
          <StatusBar />
          <div className="absolute inset-0 flex items-center justify-center px-7">
            <div className="w-full rounded-[28px] bg-white/85 p-5 text-center backdrop-blur" style={{ boxShadow: "var(--shadow-soft)" }}>
              <div className="mx-auto mb-4 w-fit"><CatAvatar size={68} usePhoto /></div>
              <div className="text-[18px] font-medium text-foreground">已经登录啦</div>
              <p className="mt-2 truncate text-[12px] text-[oklch(0.55_0.06_300)]">{auth.user.email}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Link to="/app/account" className="rounded-full bg-white px-4 py-2.5 text-[12px] text-foreground">账号中心</Link>
                <Link to="/app/me" className="rounded-full px-4 py-2.5 text-[12px] font-medium text-white" style={{ background: "var(--gradient-cta)" }}>返回我的</Link>
              </div>
            </div>
          </div>
        </ScreenShell>
      </AuthLoginFrame>
    );
  }

  return (
    <AuthLoginFrame bg={AUTH_LOGIN_BG}>
      <ScreenShell bg={AUTH_LOGIN_BG}>
        <StatusBar />
        <div className="absolute inset-0 overflow-y-auto scrollbar-none px-6 pt-[72px] pb-12">
          <Link to="/app/me" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[oklch(0.5_0.1_320)] backdrop-blur" style={{ boxShadow: "var(--shadow-soft)" }}>
            ‹
          </Link>

          <div className="mt-8">
            <div className="text-[10px] tracking-[0.45em] text-[oklch(0.58_0.08_320)]">NEKO ACCOUNT</div>
            <h1 className="mt-3 text-[28px] font-light leading-tight text-foreground">邮箱验证码登录</h1>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[oklch(0.55_0.06_300)]">
              输入邮箱，我们会给你发送 6 位验证码。
            </p>
          </div>

          <div className="mt-8 rounded-[28px] bg-white/85 p-4 backdrop-blur" style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.72)" }}>
            <label className="text-[10px] tracking-[0.32em] text-[oklch(0.55_0.06_300)]">邮箱</label>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="mt-2 block w-full rounded-2xl bg-[oklch(0.98_0.012_320)] px-4 py-3 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-[oklch(0.85_0.08_320_/_0.5)]"
            />
            <button
              disabled={busy !== null || cooldown > 0}
              onClick={sendCode}
              className="mt-3 w-full rounded-full px-5 py-3 text-[13px] font-medium text-white disabled:opacity-60"
              style={{ background: "var(--gradient-cta)" }}
            >
              {busy === "send" ? "发送中…" : cooldown > 0 ? `${cooldown}s 后可重发` : sentEmail ? "重新发送验证码" : "发送验证码"}
            </button>

            {sentEmail && (
              <div className="mt-5">
                <label className="text-[10px] tracking-[0.32em] text-[oklch(0.55_0.06_300)]">6 位验证码</label>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && code.length === 6) void verifyCode();
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="mt-2 block w-full rounded-2xl bg-[oklch(0.98_0.012_320)] px-4 py-3 text-center text-[22px] tracking-[0.28em] text-foreground outline-none focus:ring-2 focus:ring-[oklch(0.85_0.08_320_/_0.5)]"
                />
                <button
                  disabled={busy !== null || code.length !== 6}
                  onClick={verifyCode}
                  className="mt-3 w-full rounded-full px-5 py-3 text-[13px] font-medium text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, oklch(0.70 0.14 305), oklch(0.76 0.11 0))" }}
                >
                  {busy === "verify" ? "验证中…" : "完成登录"}
                </button>
                <p className="mt-3 text-center text-[11px] leading-relaxed text-[oklch(0.58_0.05_300)]">
                  验证码已发送至 {sentEmail}。如果看不到，先检查垃圾邮件。
                </p>
              </div>
            )}
          </div>

          <div className="mt-5 rounded-[22px] bg-white/60 p-4 text-[11.5px] leading-relaxed text-[oklch(0.55_0.06_300)] backdrop-blur">
            邮箱会作为账号唯一标识。登录后，你的猫咪档案、人格和心声会通过 RLS 只绑定到当前用户。
          </div>
        </div>
      </ScreenShell>
    </AuthLoginFrame>
  );
}

export function AccountScreen() {
  const navigate = useNavigate();
  const auth = useNekoCloudAuth();
  const [summary, setSummary] = useState<NekoAccountSummary | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState<"load" | "saveName" | "saveCloud" | "restoreCloud" | "signout" | null>("load");

  const reload = async () => {
    setBusy("load");
    try {
      const next = await loadNekoAccountSummary();
      setSummary(next);
      setDisplayName(next.profile.displayName ?? "");
    } catch (error) {
      console.error("NEKO account load failed", error);
      toast.error("账号信息加载失败");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (auth.status === "signed-in") void reload();
    if (auth.status === "signed-out" || auth.status === "unconfigured") setBusy(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status]);

  const run = async (kind: Exclude<typeof busy, "load" | null>, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try {
      await task();
    } catch (error) {
      console.error("NEKO account action failed", error);
      toast.error(authErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  if (auth.status === "loading" || busy === "load") {
    return (
      <ScreenShell>
        <StatusBar />
        <div className="absolute inset-0 flex items-center justify-center text-[13px] text-[oklch(0.55_0.06_300)]">正在读取账号信息…</div>
      </ScreenShell>
    );
  }

  if (auth.status !== "signed-in") {
    return (
      <ScreenShell>
        <StatusBar />
        <div className="absolute inset-0 flex items-center justify-center px-7">
          <div className="w-full rounded-[28px] bg-white/85 p-5 text-center backdrop-blur" style={{ boxShadow: "var(--shadow-soft)" }}>
            <div className="text-[18px] font-medium text-foreground">需要先登录</div>
            <p className="mt-2 text-[12px] leading-relaxed text-[oklch(0.55_0.06_300)]">登录后才能管理账号和云端数据。</p>
            <Link to="/auth/login" className="mt-5 inline-flex rounded-full px-5 py-2.5 text-[12px] font-medium text-white" style={{ background: "var(--gradient-cta)" }}>
              去邮箱登录
            </Link>
          </div>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <StatusBar />
      <div className="absolute inset-0 overflow-y-auto scrollbar-none px-5 pt-[52px] pb-10">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate({ to: "/app/me" })} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[oklch(0.5_0.1_320)] backdrop-blur" style={{ boxShadow: "var(--shadow-soft)" }}>
            ‹
          </button>
          <div className="text-[13px] font-medium text-foreground">账号中心</div>
          <div className="h-9 w-9" />
        </div>

        <div className="mt-5 overflow-hidden rounded-[26px] p-5" style={{ background: "linear-gradient(135deg, oklch(0.96 0.035 320), oklch(0.95 0.04 280))", boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
          <div className="flex items-center gap-4">
            <CatAvatar size={68} usePhoto />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-medium text-foreground">{summary?.profile.displayName || "NEKO 用户"}</div>
              <div className="mt-1 truncate text-[11px] text-[oklch(0.55_0.06_300)]">{auth.user.email}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <StatCard label="猫咪档案" value={summary?.catCount ?? 0} />
            <StatCard label="云端心声" value={summary?.voiceCount ?? 0} />
          </div>
        </div>

        <div className="mt-4 rounded-[22px] bg-white/80 p-4 backdrop-blur" style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
          <label className="text-[10px] tracking-[0.32em] text-[oklch(0.55_0.06_300)]">昵称</label>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value.slice(0, 40))}
            placeholder="NEKO 用户"
            className="mt-2 block w-full rounded-2xl bg-[oklch(0.98_0.012_320)] px-4 py-3 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-[oklch(0.85_0.08_320_/_0.5)]"
          />
          <button
            disabled={busy === "saveName"}
            onClick={() => void run("saveName", async () => {
              const profile = await updateNekoUserProfile(displayName);
              setSummary((current) => current ? { ...current, profile } : current);
              setDisplayName(profile.displayName ?? "");
              toast.success("昵称已更新");
            })}
            className="mt-3 w-full rounded-full px-5 py-3 text-[12.5px] font-medium text-white disabled:opacity-60"
            style={{ background: "var(--gradient-cta)" }}
          >
            {busy === "saveName" ? "保存中…" : "保存昵称"}
          </button>
        </div>

        <div className="mt-4 rounded-[22px] bg-white/80 p-4 backdrop-blur" style={{ boxShadow: "var(--shadow-soft)", border: "1px solid oklch(1 0 0 / 0.7)" }}>
          <div className="text-[10px] tracking-[0.32em] text-[oklch(0.55_0.06_300)]">云端数据</div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-foreground/75">把当前设备上的猫咪档案和心声保存到云端，或从云端恢复到本机。</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              disabled={busy === "saveCloud"}
              onClick={() => void run("saveCloud", async () => {
                const result = await saveLocalNekoToCloud();
                toast.success(`已保存到云端 · ${result.voicesCount} 条心声`);
                await reload();
              })}
              className="rounded-full px-3 py-2.5 text-[12px] font-medium text-white disabled:opacity-60"
              style={{ background: "var(--gradient-cta)" }}
            >
              保存云端
            </button>
            <button
              disabled={busy === "restoreCloud"}
              onClick={() => void run("restoreCloud", async () => {
                const result = await loadNekoFromCloud();
                toast.success(result.restored ? `已恢复 · ${result.voicesCount} 条心声` : "云端暂时还没有猫咪档案");
                await reload();
              })}
              className="rounded-full bg-white px-3 py-2.5 text-[12px] text-foreground disabled:opacity-60"
            >
              恢复本机
            </button>
          </div>
        </div>

        <button
          disabled={busy === "signout"}
          onClick={() => void run("signout", async () => {
            await signOutNekoCloud();
            toast.success("已退出登录");
            await navigate({ to: "/app/me", replace: true });
          })}
          className="mt-5 w-full rounded-full bg-white/85 px-5 py-3.5 text-[13px] text-[oklch(0.55_0.06_300)] disabled:opacity-60"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          退出登录
        </button>
      </div>
    </ScreenShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[18px] bg-white/70 px-3 py-3 text-center">
      <div className="text-[18px] font-medium text-foreground">{value}</div>
      <div className="mt-0.5 text-[10px] tracking-[0.2em] text-[oklch(0.55_0.06_300)]">{label}</div>
    </div>
  );
}
