import { createFileRoute } from "@tanstack/react-router";
import { ScreenPublish2 } from "@/components/neko/app/AppShowcase";

export const Route = createFileRoute("/app/publish/background")({
  component: ScreenPublish2,
});