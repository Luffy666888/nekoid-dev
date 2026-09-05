import { createClient } from "@supabase/supabase-js";

type EnvLike = Record<string, string | undefined>;

type IOSAuthBody = {
  phone?: unknown;
  token?: unknown;
  refreshToken?: unknown;
};

export class IOSAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function getEnvValue(env: unknown, name: string) {
  const workerValue = (env as EnvLike | undefined)?.[name];
  if (workerValue) return workerValue;
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

function requireSupabaseConfig(env: unknown) {
  const url = getEnvValue(env, "SUPABASE_URL") || getEnvValue(env, "VITE_SUPABASE_URL");
  const publishableKey =
    getEnvValue(env, "SUPABASE_PUBLISHABLE_KEY") || getEnvValue(env, "VITE_SUPABASE_PUBLISHABLE_KEY");

  if (!url || !publishableKey) {
    throw new IOSAuthError(500, "supabase_not_configured", "云端登录服务暂时不可用，请稍后再试。");
  }

  return { url, publishableKey };
}

function createAuthClient(env: unknown) {
  const { url, publishableKey } = requireSupabaseConfig(env);
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function normalizeMainlandPhone(value: unknown) {
  if (typeof value !== "string") {
    throw new IOSAuthError(400, "invalid_phone", "请输入有效的中国大陆手机号。");
  }

  const compact = value.trim().replace(/[\s-]/g, "");
  let phone = compact;

  if (compact.startsWith("+86")) {
    phone = compact.slice(3);
  } else if (compact.startsWith("86")) {
    phone = compact.slice(2);
  }

  if (!/^1\d{10}$/.test(phone)) {
    throw new IOSAuthError(400, "invalid_phone", "请输入有效的中国大陆手机号。");
  }

  return `+86${phone}`;
}

function requireOtpToken(value: unknown) {
  if (typeof value !== "string" || !/^\d{6}$/.test(value.trim())) {
    throw new IOSAuthError(400, "invalid_otp", "请输入 6 位验证码。");
  }
  return value.trim();
}

function requireRefreshToken(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new IOSAuthError(400, "invalid_refresh_token", "登录状态已过期，请重新登录。");
  }
  return value.trim();
}

function mapSupabaseAuthError(error: { message?: string; code?: string; status?: number } | null) {
  if (!error) return null;
  const message = error.message || "Supabase Auth request failed";
  const lower = message.toLowerCase();
  if (lower.includes("rate")) {
    return new IOSAuthError(429, error.code || "otp_rate_limited", "验证码发送太频繁了，稍等一会儿再试。");
  }
  if (lower.includes("expired") || lower.includes("invalid")) {
    return new IOSAuthError(400, error.code || "invalid_otp", "验证码不正确或已过期，请重新获取。");
  }
  if (lower.includes("phone") && lower.includes("disabled")) {
    return new IOSAuthError(400, error.code || "phone_provider_disabled", "手机号登录暂时不可用，请稍后再试。");
  }
  return new IOSAuthError(error.status || 400, error.code || "auth_failed", "登录暂时失败，请稍后再试。");
}

function mapSession(data: {
  session?: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
  } | null;
  user?: {
    id?: string;
    email?: string | null;
    phone?: string | null;
  } | null;
}) {
  const session = data.session;
  const user = data.user;
  if (!session?.access_token || !session.refresh_token || !user?.id) {
    throw new IOSAuthError(500, "invalid_auth_response", "登录状态解析失败，请重新获取验证码。");
  }

  const expiresAtSeconds =
    session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600);

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    user: {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    },
  };
}

export async function handleIOSAuthRequest(pathname: string, body: unknown, env: unknown) {
  if (!pathname.startsWith("/api/ios/auth/")) return null;

  const payload = (body && typeof body === "object" ? body : {}) as IOSAuthBody;
  const client = createAuthClient(env);

  if (pathname === "/api/ios/auth/phone-otp") {
    const phone = normalizeMainlandPhone(payload.phone);
    const { error } = await client.auth.signInWithOtp({
      phone,
      options: {
        shouldCreateUser: true,
      },
    });
    const mappedError = mapSupabaseAuthError(error);
    if (mappedError) throw mappedError;
    return { sent: true };
  }

  if (pathname === "/api/ios/auth/phone-verify") {
    const phone = normalizeMainlandPhone(payload.phone);
    const token = requireOtpToken(payload.token);
    const { data, error } = await client.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });
    const mappedError = mapSupabaseAuthError(error);
    if (mappedError) throw mappedError;
    return mapSession(data);
  }

  if (pathname === "/api/ios/auth/refresh") {
    const refreshToken = requireRefreshToken(payload.refreshToken);
    const { data, error } = await client.auth.refreshSession({
      refresh_token: refreshToken,
    });
    const mappedError = mapSupabaseAuthError(error);
    if (mappedError) throw mappedError;
    return mapSession(data);
  }

  throw new IOSAuthError(404, "not_found", "Unknown iOS auth endpoint");
}
