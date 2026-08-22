import { createFileRoute } from "@tanstack/react-router";
import { ScreenMe } from "@/components/neko/app/AppShowcase";

export const Route = createFileRoute("/app/me/")({
  component: ScreenMe,
});