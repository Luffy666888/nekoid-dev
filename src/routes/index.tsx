import { createFileRoute } from "@tanstack/react-router";
import { OnboardingShowcase } from "@/components/neko/onboarding/OnboardingShowcase";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" },
      { title: "NEKO.ID — AI 宠物数字人格系统" },
      { name: "description", content: "NEKO.ID 用 AI 持续构建一只猫的情绪、人格与记忆。一个为你的宠物而生的数字灵魂系统。" },
      { property: "og:title", content: "NEKO.ID — AI 宠物数字人格系统" },
      { property: "og:description", content: "AI 正在慢慢理解一个生命。" },
    ],
  }),
  component: Index,
});

function Index() {
  return <OnboardingShowcase />;
}
