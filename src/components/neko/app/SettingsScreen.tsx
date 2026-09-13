import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { ScreenShell, StatusBar } from "./AppShowcase";

const rows = [
  { icon: "◇", title: "隐私政策", subtitle: "了解数据与隐私保护方式" },
  { icon: "▤", title: "用户服务协议", subtitle: "查看使用喵一下的相关条款" },
  { icon: "◎", title: "权限说明", subtitle: "相机、相册与麦克风用途" },
  { icon: "♡", title: "关于喵一下", subtitle: "读懂它的小世界" },
];

export function SettingsScreen() {
  const navigate = useNavigate();
  return (
    <ScreenShell>
      <StatusBar />
      <div className="absolute inset-0 overflow-y-auto px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[52px]">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="返回"
            onClick={() => navigate({ to: "/app/me" })}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[oklch(0.5_0.1_320)] backdrop-blur"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <ChevronLeft size={16} strokeWidth={2.25} />
          </button>
          <div className="text-[13px] font-medium text-foreground">设置</div>
          <div className="h-9 w-9" />
        </div>

        <div className="mt-6 overflow-hidden rounded-[22px] bg-white/78 backdrop-blur" style={{ border: "1px solid oklch(1 0 0 / 0.75)" }}>
          {rows.map((row, index) => (
            <div key={row.title} className={`flex min-h-[68px] items-center gap-3 px-4 py-3 ${index ? "border-t border-[oklch(0.9_0.02_300)]" : ""}`}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[15px] text-[oklch(0.5_0.1_320)]" style={{ background: "linear-gradient(135deg, oklch(0.96 0.04 320), oklch(0.95 0.04 280))" }}>{row.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-foreground">{row.title}</div>
                <div className="mt-0.5 text-[10.5px] text-[oklch(0.55_0.05_300)]">{row.subtitle}</div>
              </div>
              <span className="text-[14px] text-[oklch(0.65_0.04_300)]">›</span>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center text-[10.5px] leading-relaxed text-[oklch(0.58_0.05_300)]">
          喵一下 · 读懂它的小世界<br />版本 1.0
        </div>
      </div>
    </ScreenShell>
  );
}
