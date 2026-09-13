import { createFileRoute } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" },
      { title: "喵一下 — 听懂它的小心声" },
      { name: "description", content: "喵一下移动端 —— 听懂猫咪的小心声。" },
      { property: "og:title", content: "喵一下 — 听懂它的小心声" },
      { property: "og:description", content: "一个温柔的 AI 伙伴，陪你走进猫咪的小世界。" },
    ],
  }),
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="relative h-[100dvh] overflow-hidden" style={{ background: "var(--gradient-cream)" }}>
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-80" style={{ background: "var(--gradient-aura)" }} />
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, oklch(0.78 0.11 305 / .35) 1px, transparent 0)", backgroundSize: "32px 32px" }} />
      <div className="relative z-10 mx-auto h-[100dvh] w-full max-w-[480px] overflow-hidden" style={{ transform: "translateZ(0)" }}>
        <Outlet />
      </div>
    </div>
  );
}
