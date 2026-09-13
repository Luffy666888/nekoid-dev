import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { OnboardingShowcase } from "@/components/neko/onboarding/OnboardingShowcase";
import { getCatPersona } from "@/components/neko/catProfileStore";
import { loadNekoFromCloud, useNekoCloudAuth } from "@/lib/neko-cloud";

type IndexSearch = {
  restart?: boolean;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): IndexSearch => {
    const restart = search.restart === true || search.restart === "1" || search.restart === 1 || search.restart === "true";
    return restart ? { restart: true } : {};
  },
  head: () => ({
    meta: [
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" },
      { title: "喵一下 — AI 宠物数字人格系统" },
      { name: "description", content: "喵一下用 AI 持续构建一只猫的情绪、人格与记忆。一个为你的宠物而生的数字灵魂系统。" },
      { property: "og:title", content: "喵一下 — AI 宠物数字人格系统" },
      { property: "og:description", content: "AI 正在慢慢理解一个生命。" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const auth = useNekoCloudAuth();
  const { restart } = Route.useSearch();
  const [mode, setMode] = useState<"checking" | "onboarding">("checking");

  useEffect(() => {
    let live = true;

    const boot = async () => {
      if (restart) {
        setMode("onboarding");
        return;
      }

      if (getCatPersona()) {
        await navigate({ to: "/app", replace: true });
        return;
      }

      if (auth.status === "loading") return;

      if (auth.status === "signed-in") {
        try {
          const result = await loadNekoFromCloud();
          if (!live) return;
          if (result.restored) {
            await navigate({ to: "/app", replace: true });
            return;
          }
        } catch (error) {
          console.warn("NEKO cloud auto restore failed", error);
        }
      }

      if (live) setMode("onboarding");
    };

    void boot();
    return () => {
      live = false;
    };
  }, [auth.status, navigate, restart]);

  if (mode === "checking") return <StartupLoading />;
  return <OnboardingShowcase />;
}

function StartupLoading() {
  return (
    <div className="relative h-[100dvh] overflow-hidden" style={{ background: "var(--gradient-cream)" }}>
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-80" style={{ background: "var(--gradient-aura)" }} />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, oklch(0.78 0.11 305 / .35) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative z-10 mx-auto flex h-[100dvh] w-full max-w-[480px] items-center justify-center px-7 text-center">
        <div className="rounded-[28px] bg-white/80 px-6 py-5 backdrop-blur" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="text-[12px] tracking-[0.32em] text-[oklch(0.58_0.08_320)]">喵一下</div>
          <div className="mt-2 text-[14px] text-foreground">正在寻找你的猫咪档案…</div>
        </div>
      </div>
    </div>
  );
}
