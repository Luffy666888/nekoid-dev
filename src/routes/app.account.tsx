import { createFileRoute } from "@tanstack/react-router";

import { AccountScreen } from "@/components/neko/auth/AuthScreens";

export const Route = createFileRoute("/app/account")({
  component: AccountScreen,
});
