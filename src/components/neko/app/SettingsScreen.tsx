import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, CircleUserRound, FileText, Info, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { signOutNekoCloud, useNekoCloudAuth } from "@/lib/neko-cloud";
import { ScreenShell, StatusBar } from "./AppShowcase";

const rows = [
  { Icon: LockKeyhole, title: "隐私政策", subtitle: "了解数据与隐私保护方式" },
  { Icon: FileText, title: "用户服务协议", subtitle: "查看使用喵一下的相关条款" },
  { Icon: Info, title: "关于喵一下", subtitle: "读懂它的小世界" },
];

export function SettingsScreen() {
  const navigate = useNavigate();
  const auth = useNekoCloudAuth();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const handleSignOut = async () => {
    await signOutNekoCloud();
    toast.success("已退出登录");
    navigate({ to: "/app/me" });
  };

  return (
    <ScreenShell>
      <StatusBar />
      <div className="absolute inset-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(52px,calc(env(safe-area-inset-top)+20px))]">
        <div className="miao-page flex items-center justify-between">
          <button
            type="button"
            aria-label="返回"
            onClick={() => navigate({ to: "/app/me" })}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-[var(--miao-brand)]"
          >
            <ChevronLeft size={20} strokeWidth={2.25} />
          </button>
          <h1 className="neko-text-page-title text-foreground">设置</h1>
          <div className="h-11 w-11" />
        </div>

        <section className="mx-6 mt-8">
          <h2 className="mb-3 neko-text-module-title text-foreground">账号</h2>
          <button
            type="button"
            onClick={() => navigate({ to: "/app/account" })}
            className="miao-card-compact flex min-h-[72px] w-full items-center gap-3 px-4 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-[var(--miao-surface-muted)] text-[var(--miao-brand)]">
              <CircleUserRound size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block neko-text-card-title text-foreground">当前账号</span>
              <span className="mt-1 block truncate neko-text-support text-[var(--miao-text-secondary)]">
                {auth.user?.email ?? "未登录"}
              </span>
            </span>
            <span className="neko-text-support text-[var(--miao-text-secondary)]">›</span>
          </button>
        </section>

        <section className="mx-6 mt-8">
          <h2 className="mb-3 neko-text-module-title text-foreground">隐私与协议</h2>
          <div className="miao-card-compact overflow-hidden">
            {rows.map((row, index) => (
              <div
                key={row.title}
                className={`flex min-h-[72px] items-center gap-3 px-4 py-3 ${index ? "border-t border-[var(--miao-border)]" : ""}`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-[var(--miao-surface-muted)] text-[var(--miao-brand)]">
                  <row.Icon size={20} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="neko-text-card-title text-foreground">{row.title}</div>
                  <div className="mt-1 neko-text-support text-[var(--miao-text-secondary)]">
                    {row.subtitle}
                  </div>
                </div>
                <span className="neko-text-support text-[var(--miao-text-secondary)]">›</span>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-8 text-center neko-text-support text-[var(--miao-text-secondary)]">
          喵一下 · 读懂它的小世界
          <br />
          版本 1.0
        </div>
        {auth.user && (
          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="miao-danger-button mx-6 mt-8 w-[calc(100%-48px)]"
          >
            退出登录
          </button>
        )}
      </div>

      {confirmSignOut && (
        <div className="absolute inset-0 z-50 flex items-end bg-black/20 px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-out-title"
            className="miao-card w-full p-5 text-center"
          >
            <h2 id="sign-out-title" className="neko-text-module-title text-foreground">
              确定退出登录吗？
            </h2>
            <p className="mt-2 neko-text-body text-[var(--miao-text-secondary)]">
              退出后仍可重新登录并查看已同步的数据。
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="miao-secondary-button"
                onClick={() => setConfirmSignOut(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="miao-danger-button"
                onClick={() => void handleSignOut()}
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      )}
    </ScreenShell>
  );
}
