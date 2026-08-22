import { createFileRoute } from "@tanstack/react-router";
import { ScreenPublish3 } from "@/components/neko/app/AppShowcase";

export const Route = createFileRoute("/app/publish/preview")({
  component: ScreenPublish3,
});