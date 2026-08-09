import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const NEKO_MEDIA_BUCKET = "neko-media";

type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

let browserClient: SupabaseClient | null = null;

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (browserClient) return browserClient;

  const config = getSupabasePublicConfig();
  if (!config) return null;

  browserClient = createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storageKey: "nekoid.auth",
    },
  });

  return browserClient;
}
