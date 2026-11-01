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
    getEnvValue(env, "SUPABASE_PUBLISHABLE_KEY") ||
    getEnvValue(env, "VITE_SUPABASE_PUBLISHABLE_KEY");

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

type ReviewLoginConfig = {
  phone: string;
  code: string;
  password: string;
  userId: string;
};

// Server-only, opt-in, single-account configuration. Never accept any of these
// values from the request, user_metadata or a client-side feature flag.
function reviewLoginConfig(env: unknown, phone: string): ReviewLoginConfig | null {
  if (getEnvValue(env, "NEKO_REVIEW_LOGIN_ENABLED") !== "true") return null;
  const configuredPhone = getEnvValue(env, "NEKO_REVIEW_LOGIN_PHONE")?.trim();
  if (!configuredPhone || phone !== configuredPhone) return null;

  const code = getEnvValue(env, "NEKO_REVIEW_LOGIN_CODE")?.trim() ?? "";
  const password = getEnvValue(env, "NEKO_REVIEW_LOGIN_PASSWORD") ?? "";
  const userId = getEnvValue(env, "NEKO_REVIEW_LOGIN_USER_ID")?.trim() ?? "";
  const expiry = getEnvValue(env, "NEKO_REVIEW_LOGIN_EXPIRES_AT") ?? "";
  const expiresAt = Date.parse(expiry);
  if (
    !/^\+861\d{10}$/.test(configuredPhone) ||
    !/^\d{6}$/.test(code) ||
    password.length < 32 ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(userId) ||
    !Number.isFinite(expiresAt)
  ) {
    throw new IOSAuthError(
      503,
      "review_login_not_configured",
      "测试登录暂时不可用，请联系开发者。",
    );
  }
  // Once the review window ends, this phone goes back to normal SMS login.
  if (expiresAt <= Date.now()) return null;
  return { phone, code, password, userId };
}

// One bounded bucket for the only configured review account, not a map keyed
// by attacker-supplied IPs. This process-local guard is for the single-process
// China service; multi-replica deployments must use a shared limiter.
let reviewAttempts = {
  userId: "",
  sentAt: -Infinity,
  windowStartedAt: 0,
  failures: 0,
  inFlight: false,
};
const REVIEW_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function reviewAttemptState(config: ReviewLoginConfig) {
  if (reviewAttempts.userId !== config.userId) {
    reviewAttempts = {
      userId: config.userId,
      sentAt: -Infinity,
      windowStartedAt: Date.now(),
      failures: 0,
      inFlight: false,
    };
  }
  if (Date.now() - reviewAttempts.windowStartedAt >= REVIEW_ATTEMPT_WINDOW_MS) {
    reviewAttempts.windowStartedAt = Date.now();
    reviewAttempts.failures = 0;
  }
  return reviewAttempts;
}

function reviewRateLimitError() {
  return new IOSAuthError(429, "review_login_rate_limited", "登录尝试太频繁了，请稍后再试。");
}

function sameReviewCode(actual: string, expected: string) {
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) {
    difference |= (actual.charCodeAt(index) || 0) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

async function verifyReviewLogin(env: unknown, config: ReviewLoginConfig, value: unknown) {
  const state = reviewAttemptState(config);
  if (state.inFlight || state.failures >= 5) throw reviewRateLimitError();
  state.inFlight = true;
  state.failures += 1; // Count malformed codes too, before any asynchronous work.
  try {
    const code = requireOtpToken(value);
    if (!sameReviewCode(code, config.code)) {
      throw new IOSAuthError(400, "invalid_otp", "验证码不正确或已过期，请重新获取。");
    }
    const { url, publishableKey } = requireSupabaseConfig(env);
    const client = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    });
    // The fixed six-digit code is NOT the account's Supabase password. Exchange
    // a random server-only password for a real, ordinary authenticated session.
    const { data, error } = await client.auth.signInWithPassword({
      phone: config.phone,
      password: config.password,
    });
    if (
      error ||
      data.user?.id !== config.userId ||
      data.user.phone?.replace(/^\+/, "") !== config.phone.slice(1) ||
      data.user.role !== "authenticated" ||
      data.user.app_metadata?.neko_app_review !== true ||
      data.user.app_metadata?.neko_account_deletion_pending === true
    ) {
      // Do not log provider error messages: they may contain login credentials.
      console.error("NEKO review login failed", { status: error?.status ?? null });
      throw new IOSAuthError(503, "review_login_unavailable", "测试登录暂时不可用，请联系开发者。");
    }
    const session = mapSession(data);
    state.failures = 0;
    return session;
  } finally {
    state.inFlight = false;
  }
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
    return new IOSAuthError(
      429,
      error.code || "otp_rate_limited",
      "验证码发送太频繁了，稍等一会儿再试。",
    );
  }
  if (lower.includes("expired") || lower.includes("invalid")) {
    return new IOSAuthError(400, error.code || "invalid_otp", "验证码不正确或已过期，请重新获取。");
  }
  if (lower.includes("phone") && lower.includes("disabled")) {
    return new IOSAuthError(
      400,
      error.code || "phone_provider_disabled",
      "手机号登录暂时不可用，请稍后再试。",
    );
  }
  return new IOSAuthError(
    error.status || 400,
    error.code || "auth_failed",
    "登录暂时失败，请稍后再试。",
  );
}

function logSupabaseAuthError(
  operation: "phone-otp" | "phone-verify" | "refresh",
  error: { message?: string; code?: string; status?: number } | null,
) {
  if (!error) return;
  console.error("NEKO Supabase auth failed", {
    operation,
    status: error.status ?? null,
    code: error.code ?? null,
    message: error.message ?? null,
  });
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
    const review = reviewLoginConfig(env, phone);
    if (review) {
      const state = reviewAttemptState(review);
      if (state.failures >= 5 || Date.now() - state.sentAt < 60000) throw reviewRateLimitError();
      state.sentAt = Date.now();
      // Preserve the current iOS response contract without sending a real SMS.
      return { sent: true };
    }
    const { error } = await client.auth.signInWithOtp({
      phone,
      options: {
        shouldCreateUser: true,
      },
    });
    logSupabaseAuthError("phone-otp", error);
    const mappedError = mapSupabaseAuthError(error);
    if (mappedError) throw mappedError;
    return { sent: true };
  }

  if (pathname === "/api/ios/auth/phone-verify") {
    const phone = normalizeMainlandPhone(payload.phone);
    const review = reviewLoginConfig(env, phone);
    if (review) return verifyReviewLogin(env, review, payload.token);
    const token = requireOtpToken(payload.token);
    const { data, error } = await client.auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });
    logSupabaseAuthError("phone-verify", error);
    const mappedError = mapSupabaseAuthError(error);
    if (mappedError) throw mappedError;
    return mapSession(data);
  }

  if (pathname === "/api/ios/auth/refresh") {
    const refreshToken = requireRefreshToken(payload.refreshToken);
    const { data, error } = await client.auth.refreshSession({
      refresh_token: refreshToken,
    });
    logSupabaseAuthError("refresh", error);
    const mappedError = mapSupabaseAuthError(error);
    if (mappedError) throw mappedError;
    return mapSession(data);
  }

  throw new IOSAuthError(404, "not_found", "Unknown iOS auth endpoint");
}
