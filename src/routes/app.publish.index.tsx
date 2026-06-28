import { createFileRoute } from "@tanstack/react-router";
import { ScreenPublish1 } from "@/components/neko/app/AppShowcase";

export const Route = createFileRoute("/app/publish/")({
  component: ScreenPublish1,
});