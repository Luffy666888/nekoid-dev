import { createFileRoute } from "@tanstack/react-router";
import { ScreenSuccess } from "@/components/neko/app/AppShowcase";

export const Route = createFileRoute("/app/publish/success")({
  component: ScreenSuccess,
});