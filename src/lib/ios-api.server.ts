import { detectCatFaceServer, setCatFaceWorkerEnv } from "./catface.functions";
import {
  generateCatPersonaServer,
  generateCatVoiceServer,
  setNekoAIWorkerEnv,
} from "./neko-ai.functions";

type EnvLike = Record<string, string | undefined>;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

function errorResponse(status: number, code: string, message: string) {
  return jsonResponse({ ok: false, error: { code, message } }, { status });
}

function getEnvValue(env: unknown, name: string) {
  const workerValue = (env as EnvLike | undefined)?.[name];
  if (workerValue) return workerValue;
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

function requireBearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new APIError(401, "missing_auth", "Missing bearer token");
  return match[1].trim();
}

async function requireSupabaseUser(request: Request, env: unknown) {
  const token = requireBearerToken(request);
  const supabaseUrl =
    getEnvValue(env, "SUPABASE_URL") || getEnvValue(env, "VITE_SUPABASE_URL");
  const publishableKey =
    getEnvValue(env, "SUPABASE_PUBLISHABLE_KEY") ||
    getEnvValue(env, "VITE_SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !publishableKey) {
    throw new APIError(500, "supabase_not_configured", "Supabase is not configured");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new APIError(401, "invalid_auth", "Invalid or expired Supabase session");
  }

  const user = (await response.json()) as { id?: string; email?: string | null };
  if (!user.id) {
    throw new APIError(401, "invalid_auth", "Invalid Supabase session");
  }

  return user;
}

async function readJson(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new APIError(415, "unsupported_media_type", "Expected application/json");
  }

  try {
    return await request.json();
  } catch {
    throw new APIError(400, "invalid_json", "Invalid JSON body");
  }
}

class APIError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function handleIOSAPIRequest(request: Request, env: unknown) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/ios/")) return null;

  setCatFaceWorkerEnv(env);
  setNekoAIWorkerEnv(env);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (url.pathname === "/api/ios/health" && request.method === "GET") {
    return jsonResponse({ ok: true, service: "neko-id-ios-api" });
  }

  try {
    if (request.method !== "POST") {
      throw new APIError(405, "method_not_allowed", "Use POST");
    }

    await requireSupabaseUser(request, env);
    const body = await readJson(request);

    if (url.pathname === "/api/ios/detect-cat-face") {
      const result = await detectCatFaceServer(body as { imageDataUrl: string; mode?: "face" | "presence" });
      return jsonResponse({ ok: true, data: result });
    }

    if (url.pathname === "/api/ios/onboarding/persona") {
      const result = await generateCatPersonaServer(
        body as Parameters<typeof generateCatPersonaServer>[0],
      );
      return jsonResponse({ ok: true, data: result });
    }

    if (url.pathname === "/api/ios/voice") {
      const result = await generateCatVoiceServer(body as Parameters<typeof generateCatVoiceServer>[0]);
      return jsonResponse({ ok: true, data: result });
    }

    return errorResponse(404, "not_found", "Unknown iOS API endpoint");
  } catch (error) {
    if (error instanceof APIError) {
      return errorResponse(error.status, error.code, error.message);
    }

    console.error("NEKO iOS API failed", error);
    return errorResponse(
      500,
      "internal_error",
      error instanceof Error ? error.message : "Unknown server error",
    );
  }
}
