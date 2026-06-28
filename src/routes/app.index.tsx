import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ScreenHome } from "@/components/neko/app/AppShowcase";
import { useEffect, useState } from "react";
import { getCatPersona } from "@/components/neko/catProfileStore";

export const Route = createFileRoute("/app/")({
  component: AppIndex,
});

function AppIndex() {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  useEffect(() => {
    setHasProfile(!!getCatPersona());
  }, []);

  if (hasProfile === null) return null;
  if (!hasProfile) return <Navigate to="/" />;
  return <ScreenHome />;
}
