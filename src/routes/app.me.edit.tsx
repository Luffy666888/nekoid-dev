import { createFileRoute } from "@tanstack/react-router";
import { ScreenEditProfile } from "@/components/neko/app/AppShowcase";

export const Route = createFileRoute("/app/me/edit")({
  component: ScreenEditProfile,
});