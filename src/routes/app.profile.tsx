import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Screen6Result } from "@/components/neko/onboarding/Screen6Result";

function ProfilePage() {
  const navigate = useNavigate();
  return (
    <Screen6Result
      onBack={() => window.history.length > 1 ? window.history.back() : navigate({ to: "/app" })}
      onRestart={() => navigate({ to: "/app" })}
    />
  );
}

export const Route = createFileRoute("/app/profile")({
  component: ProfilePage,
});