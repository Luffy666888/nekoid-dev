import { Webhook, WebhookVerificationError } from "standardwebhooks";

type EnvLike = Record<string, string | undefined>;

type SendSmsHookPayload = {
  user?: {
    phone?: string | null;
  };
  sms?: {
    otp?: string | null;
  };
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function getEnvValue(env: unknown, name: string) {
  const workerValue = (env as EnvLike | undefined)?.[name];
  if (workerValue) return workerValue;
  const globalWorkerValue = (globalThis as typeof globalThis & { __env__?: EnvLike }).__env__?.[name];
  if (globalWorkerValue) return globalWorkerValue;
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

function requireEnv(env: unknown, name: string) {
  const value = getEnvValue(env, name)?.trim();
  if (!value) throw new SendSmsHookError(500, "missing_config", `${name} is not configured`);
  return value;
}

function normalizeHookSecret(secret: string) {
  const trimmed = secret.trim();
  const first = trimmed.split("|")[0]?.trim() || trimmed;
  return first.replace(/^v1,/, "");
}

function verifySupabaseHook(payload: string, request: Request, env: unknown): SendSmsHookPayload {
  const secret = normalizeHookSecret(requireEnv(env, "SUPABASE_SEND_SMS_HOOK_SECRETS"));
  const webhook = new Webhook(secret);
  return webhook.verify(payload, Object.fromEntries(request.headers)) as SendSmsHookPayload;
}

function normalizeMainlandPhone(phone: string) {
  const compact = phone.replace(/[\s-]/g, "");
  const mainland = compact.match(/^\+86(1\d{10})$/)?.[1] ?? compact.match(/^86(1\d{10})$/)?.[1] ?? compact;
  if (!/^1\d{10}$/.test(mainland)) {
    throw new SendSmsHookError(400, "unsupported_phone", "Only mainland China phone numbers are supported");
  }
  return mainland;
}

function percentEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function hmacSha1Base64(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${secret}&`),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64(signature);
}

async function buildAliyunSignedBody(
  env: unknown,
  phoneNumber: string,
  otp: string,
) {
  const accessKeyId = requireEnv(env, "ALIYUN_SMS_ACCESS_KEY_ID");
  const accessKeySecret = requireEnv(env, "ALIYUN_SMS_ACCESS_KEY_SECRET");
  const signName = requireEnv(env, "ALIYUN_SMS_SIGN_NAME");
  const templateCode = requireEnv(env, "ALIYUN_SMS_TEMPLATE_CODE");
  const regionId = getEnvValue(env, "ALIYUN_SMS_REGION_ID")?.trim() || "cn-hangzhou";
  const countryCode = getEnvValue(env, "ALIYUN_SMS_COUNTRY_CODE")?.trim() || "86";
  const codeParamKey = getEnvValue(env, "ALIYUN_SMS_CODE_PARAM_KEY")?.trim() || "code";
  const minutesParamKey = getEnvValue(env, "ALIYUN_SMS_MIN_PARAM_KEY")?.trim() || "min";
  const validMinutes = getEnvValue(env, "ALIYUN_SMS_VALID_MINUTES")?.trim() || "5";

  const params: Record<string, string> = {
    AccessKeyId: accessKeyId,
    Action: "SendSmsVerifyCode",
    CountryCode: countryCode,
    Format: "JSON",
    PhoneNumber: phoneNumber,
    RegionId: regionId,
    SignName: signName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: randomNonce(),
    SignatureVersion: "1.0",
    TemplateCode: templateCode,
    TemplateParam: JSON.stringify({ [codeParamKey]: otp, [minutesParamKey]: validMinutes }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2017-05-25",
  };

  const canonicalizedQuery = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `POST&%2F&${percentEncode(canonicalizedQuery)}`;
  const signature = await hmacSha1Base64(accessKeySecret, stringToSign);
  const signedParams = { Signature: signature, ...params };

  return Object.keys(signedParams)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(signedParams[key])}`)
    .join("&");
}

async function sendAliyunSms(env: unknown, phoneNumber: string, otp: string) {
  const body = await buildAliyunSignedBody(env, phoneNumber, otp);
  const response = await fetch("https://dypnsapi.aliyuncs.com/", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const text = await response.text();
  let result: { Code?: string; Message?: string; RequestId?: string; Success?: boolean } = {};
  try {
    result = text ? (JSON.parse(text) as typeof result) : {};
  } catch {
    throw new SendSmsHookError(502, "aliyun_invalid_response", "SMS provider returned an invalid response");
  }

  if (!response.ok || (result.Code !== "OK" && result.Success !== true)) {
    console.error("Aliyun PNVS SMS send failed", {
      status: response.status,
      code: result.Code,
      requestId: result.RequestId,
      message: result.Message,
    });
    throw new SendSmsHookError(502, "aliyun_send_failed", "SMS provider failed to send the verification code");
  }
}

class SendSmsHookError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function handleSendSmsHookRequest(request: Request, env: unknown) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/auth/send-sms") return null;

  if (request.method === "GET") {
    return jsonResponse({ ok: true, service: "neko-id-send-sms-hook" });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { error: { http_code: 405, message: "Method not allowed" } },
      { status: 405 },
    );
  }

  try {
    const rawPayload = await request.text();
    const payload = verifySupabaseHook(rawPayload, request, env);
    const phone = payload.user?.phone;
    const otp = payload.sms?.otp;

    if (!phone || !otp || !/^\d{6}$/.test(otp)) {
      throw new SendSmsHookError(400, "invalid_payload", "Invalid phone OTP hook payload");
    }

    await sendAliyunSms(env, normalizeMainlandPhone(phone), otp);
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return jsonResponse(
        { error: { http_code: 401, message: "Invalid webhook signature" } },
        { status: 401 },
      );
    }

    if (error instanceof SendSmsHookError) {
      return jsonResponse(
        { error: { http_code: error.status, message: error.message } },
        { status: error.status },
      );
    }

    console.error("Send SMS hook failed", error);
    return jsonResponse(
      { error: { http_code: 500, message: "Failed to send verification code" } },
      { status: 500 },
    );
  }
}
