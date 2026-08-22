import { createFileRoute } from "@tanstack/react-router";
import { ScreenVoiceDetail } from "@/components/neko/app/AppShowcase";

export const Route = createFileRoute("/app/voice/$id")({
  component: VoicePage,
});

function VoicePage() {
  const { id } = Route.useParams();
  const n = Number(id);
  return <ScreenVoiceDetail id={Number.isFinite(n) ? n : 0} />;
}