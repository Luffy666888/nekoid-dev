import { createFileRoute } from "@tanstack/react-router";

import { AuthLoginScreen } from "@/components/neko/auth/AuthScreens";

export const Route = createFileRoute("/auth/login")({
  component: AuthLoginScreen,
});
