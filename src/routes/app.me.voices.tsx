import { createFileRoute } from "@tanstack/react-router";
import { ScreenManageVoices } from "@/components/neko/app/AppShowcase";

export const Route = createFileRoute("/app/me/voices")({
  component: ScreenManageVoices,
});