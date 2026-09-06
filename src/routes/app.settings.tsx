import { createFileRoute } from "@tanstack/react-router";

import { SettingsScreen } from "@/components/neko/app/SettingsScreen";

export const Route = createFileRoute("/app/settings")({
  component: SettingsScreen,
});
