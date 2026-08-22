import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ScreenHome } from "@/components/neko/app/AppShowcase";
import { useEffect, useState } from "react";
import { getCatPersona } from "@/components/neko/catProfileStore";
import { loadNekoFromCloud, useNekoCloudAuth } from "@/lib/neko-cloud";

export const Route = createFileRoute("/app/")({
  component: AppIndex,
});

function AppIndex() {
  const auth = useNekoCloudAuth();
  const [state, setState] = useState<"checking" | "ready" | "missing">("checking");

  useEffect(() => {
    let live = true;

    const boot = async () => {
      if (getCatPersona()) {
        setState("ready");
        return;
      }

      if (auth.status === "loading") return;

      if (auth.status === "signed-in") {
        try {
          const result = await loadNekoFromCloud();
          if (!live) return;
          setState(result.restored ? "ready" : "missing");
          return;
        } catch (error) {
          console.warn("NEKO app auto restore failed", error);
        }
      }

      if (live) setState("missing");
    };

    void boot();
    return () => {
      live = false;
    };
  }, [auth.status]);

  if (state === "checking") return null;
  if (state === "missing") return <Navigate to="/" />;
  return <ScreenHome />;
}
