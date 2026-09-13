import type { SupabaseClient } from "@supabase/supabase-js";

import { NEKO_MEDIA_BUCKET } from "@/lib/supabase/client";

type EnvLike = Record<string, string | undefined>;

type MediaStorageProvider = "supabase" | "tos";

type StoredMedia = {
  body: BodyInit;
  contentLength?: number;
  contentType?: string;
};

type TosConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint: URL;
  pathStyle: boolean;
  region: string;
  securityToken?: string;
};

type SignedMediaUpload = {
  expiresInSeconds: number;
  headers: Record<string, string>;
  method: "PUT";
  uploadURL: string;
};

export class MediaStorageError extends Error {
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

function truthyEnv(value: string | undefined) {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? "");
}

export function resolveMediaStorageProvider(env: unknown): MediaStorageProvider {
  const configured = getEnvValue(env, "MEDIA_STORAGE_PROVIDER")?.trim().toLowerCase();
  if (
    configured === "tos" ||
    configured === "volcengine" ||
    configured === "volcengine_tos" ||
    configured === "volcengine-tos"
  ) {
    return "tos";
  }
  if (configured === "supabase") return "supabase";
  if (configured) {
    throw new MediaStorageError(
      500,
      "media_storage_provider_invalid",
      "Invalid MEDIA_STORAGE_PROVIDER",
    );
  }

  return getEnvValue(env, "TOS_BUCKET") ? "tos" : "supabase";
}

function requireTosConfig(env: unknown): TosConfig {
  const accessKeyId = getEnvValue(env, "TOS_ACCESS_KEY_ID")?.trim();
  const accessKeySecret = getEnvValue(env, "TOS_SECRET_ACCESS_KEY")?.trim();
  const bucket = getEnvValue(env, "TOS_BUCKET")?.trim();
  const region = getEnvValue(env, "TOS_REGION")?.trim();
  const endpointValue = getEnvValue(env, "TOS_ENDPOINT")?.trim();
  const securityToken = getEnvValue(env, "TOS_SECURITY_TOKEN")?.trim();

  if (!accessKeyId || !accessKeySecret || !bucket || !region || !endpointValue) {
    throw new MediaStorageError(
      500,
      "media_storage_not_configured",
      "TOS media storage is not configured",
    );
  }

  const endpoint = new URL(
    endpointValue.includes("://") ? endpointValue : `https://${endpointValue}`,
  );
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");

  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    endpoint,
    pathStyle: truthyEnv(getEnvValue(env, "TOS_PATH_STYLE")),
    region,
    securityToken: securityToken || undefined,
  };
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeQueryComponent(value: string) {
  return encodePathSegment(value);
}

function canonicalQueryString(params: Record<string, string | undefined>) {
  return Object.entries(params)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeQueryComponent(key)}=${encodeQueryComponent(value)}`)
    .join("&");
}

function encodeObjectPath(objectKey: string) {
  return `/${objectKey.split("/").map(encodePathSegment).join("/")}`;
}

function buildTosUrl(config: TosConfig, objectKey: string) {
  const encodedObjectPath = encodeObjectPath(objectKey);
  const endpointPath = config.endpoint.pathname === "/" ? "" : config.endpoint.pathname;
  const protocol = config.endpoint.protocol || "https:";
  const endpointHost = config.endpoint.host;

  if (config.pathStyle) {
    const pathname = `${endpointPath}/${encodePathSegment(config.bucket)}${encodedObjectPath}`;
    return {
      canonicalPath: pathname,
      host: endpointHost,
      url: new URL(`${protocol}//${endpointHost}${pathname}`),
    };
  }

  const host = `${config.bucket}.${endpointHost}`;
  const pathname = `${endpointPath}${encodedObjectPath}`;
  return {
    canonicalPath: pathname,
    host,
    url: new URL(`${protocol}//${host}${pathname}`),
  };
}

function tosDate(now = new Date()) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function sha256Hex(value: string) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", utf8(value));
  return bytesToHex(new Uint8Array(digest));
}

async function hmacSha256(key: Uint8Array | string, value: string) {
  const keyBytes = typeof key === "string" ? utf8(key) : key;
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    toArrayBuffer(utf8(value)),
  );
  return new Uint8Array(signature);
}

async function hmacSha256Hex(key: Uint8Array, value: string) {
  return bytesToHex(await hmacSha256(key, value));
}

async function createTosSigningKey(config: TosConfig, date: string) {
  return hmacSha256(
    await hmacSha256(
      await hmacSha256(await hmacSha256(config.accessKeySecret, date), config.region),
      "tos",
    ),
    "request",
  );
}

async function createTosAuthorization(
  config: TosConfig,
  method: string,
  canonicalPath: string,
  host: string,
  extraSignedHeaders: Record<string, string>,
) {
  if (!globalThis.crypto?.subtle) {
    throw new MediaStorageError(
      500,
      "media_storage_crypto_unavailable",
      "Web Crypto is not available for TOS signing",
    );
  }

  const datetime = tosDate();
  const date = datetime.slice(0, 8);
  const algorithm = "TOS4-HMAC-SHA256";
  const payloadHash = "UNSIGNED-PAYLOAD";
  const scope = `${date}/${config.region}/tos/request`;
  const headersToSign: Record<string, string> = {
    host,
    "x-tos-content-sha256": payloadHash,
    "x-tos-date": datetime,
    ...extraSignedHeaders,
  };
  const signedHeaderNames = Object.keys(headersToSign)
    .map((key) => key.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderNames
    .map((key) => `${key}:${headersToSign[key].replace(/\s+/g, " ").trim()}`)
    .join("\n");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    method,
    canonicalPath,
    "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [algorithm, datetime, scope, await sha256Hex(canonicalRequest)].join("\n");
  const signingKey = await createTosSigningKey(config, date);
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  return {
    authorization: `${algorithm} Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    datetime,
    payloadHash,
  };
}

function envNumber(env: unknown, name: string, fallback: number, min: number, max: number) {
  const value = Number(getEnvValue(env, name));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}

function mediaDownloadTTLSeconds(env: unknown) {
  return envNumber(env, "MEDIA_SIGNED_URL_TTL_SECONDS", 60 * 60, 60, 7 * 24 * 60 * 60);
}

function mediaUploadTTLSeconds(env: unknown) {
  return envNumber(env, "MEDIA_UPLOAD_URL_TTL_SECONDS", 10 * 60, 60, 60 * 60);
}

async function createTosPresignedUrl(
  env: unknown,
  method: "GET" | "PUT",
  objectKey: string,
  expiresInSeconds: number,
) {
  if (!globalThis.crypto?.subtle) {
    throw new MediaStorageError(
      500,
      "media_storage_crypto_unavailable",
      "Web Crypto is not available for TOS signing",
    );
  }

  const config = requireTosConfig(env);
  const { canonicalPath, host, url } = buildTosUrl(config, objectKey);
  const datetime = tosDate();
  const date = datetime.slice(0, 8);
  const algorithm = "TOS4-HMAC-SHA256";
  const payloadHash = "UNSIGNED-PAYLOAD";
  const scope = `${date}/${config.region}/tos/request`;
  const signedHeaders = "host";
  const queryParams: Record<string, string | undefined> = {
    "X-Tos-Algorithm": algorithm,
    "X-Tos-Content-Sha256": payloadHash,
    "X-Tos-Credential": `${config.accessKeyId}/${scope}`,
    "X-Tos-Date": datetime,
    "X-Tos-Expires": String(expiresInSeconds),
    "X-Tos-SignedHeaders": signedHeaders,
    "X-Tos-Security-Token": config.securityToken,
  };
  const canonicalQuery = canonicalQueryString(queryParams);
  const canonicalRequest = [
    method,
    canonicalPath,
    canonicalQuery,
    `host:${host}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [algorithm, datetime, scope, await sha256Hex(canonicalRequest)].join("\n");
  const signingKey = await createTosSigningKey(config, date);
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  url.search = canonicalQueryString({
    ...queryParams,
    "X-Tos-Signature": signature,
  });

  return url.toString();
}

function tosErrorStatus(response: Response) {
  if (response.status === 404) return 404;
  if (response.status === 403) return 403;
  if (response.status >= 400 && response.status < 500) return 400;
  return 500;
}

async function tosErrorMessage(response: Response) {
  const text = await response.text().catch(() => "");
  return text.slice(0, 500) || `TOS request failed with HTTP ${response.status}`;
}

async function fetchTosObject(
  env: unknown,
  method: "GET" | "PUT" | "DELETE",
  objectKey: string,
  init: { body?: BodyInit; cacheControl?: string; contentType?: string } = {},
) {
  const config = requireTosConfig(env);
  const { canonicalPath, host, url } = buildTosUrl(config, objectKey);
  const extraSignedHeaders: Record<string, string> = {};
  if (config.securityToken) {
    extraSignedHeaders["x-tos-security-token"] = config.securityToken;
  }
  const { authorization, datetime, payloadHash } = await createTosAuthorization(
    config,
    method,
    canonicalPath,
    host,
    extraSignedHeaders,
  );
  const headers = new Headers({
    authorization,
    "x-tos-content-sha256": payloadHash,
    "x-tos-date": datetime,
  });

  if (config.securityToken) headers.set("x-tos-security-token", config.securityToken);
  if (init.cacheControl) headers.set("cache-control", init.cacheControl);
  if (init.contentType) headers.set("content-type", init.contentType);

  const response = await fetch(url, {
    body: init.body,
    headers,
    method,
  });

  if (!response.ok) {
    throw new MediaStorageError(
      tosErrorStatus(response),
      method === "GET" ? "media_download_failed" : "media_storage_request_failed",
      await tosErrorMessage(response),
    );
  }

  return response;
}

async function uploadToSupabase(
  client: SupabaseClient,
  objectKey: string,
  blob: Blob,
  contentType: string,
) {
  const { error } = await client.storage.from(NEKO_MEDIA_BUCKET).upload(objectKey, blob, {
    cacheControl: "3600",
    contentType,
    upsert: true,
  });

  if (error) {
    throw new MediaStorageError(500, "storage_upload_failed", error.message);
  }
}

async function downloadFromSupabase(
  client: SupabaseClient,
  objectKey: string,
): Promise<StoredMedia> {
  const { data, error } = await client.storage.from(NEKO_MEDIA_BUCKET).download(objectKey);
  if (error || !data) {
    const message = error?.message ?? "Storage object not found";
    const status = /not found|does not exist/i.test(message) ? 404 : 500;
    throw new MediaStorageError(status, "media_download_failed", message);
  }

  return {
    body: data,
    contentLength: typeof data.size === "number" ? data.size : undefined,
    contentType: data.type,
  };
}

export async function uploadStoredMedia(
  client: SupabaseClient,
  env: unknown,
  objectKey: string,
  blob: Blob,
  contentType: string,
) {
  if (resolveMediaStorageProvider(env) === "tos") {
    await fetchTosObject(env, "PUT", objectKey, {
      body: blob,
      cacheControl: "public, max-age=31536000, immutable",
      contentType,
    });
    return;
  }

  await uploadToSupabase(client, objectKey, blob, contentType);
}

export async function createSignedMediaDownloadUrl(env: unknown, objectKey: string) {
  return createTosPresignedUrl(env, "GET", objectKey, mediaDownloadTTLSeconds(env));
}

export async function createSignedMediaUploadUrl(
  env: unknown,
  objectKey: string,
  contentType: string,
): Promise<SignedMediaUpload> {
  if (resolveMediaStorageProvider(env) !== "tos") {
    throw new MediaStorageError(
      500,
      "media_storage_not_configured",
      "TOS media storage is not configured",
    );
  }

  const expiresInSeconds = mediaUploadTTLSeconds(env);
  return {
    expiresInSeconds,
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": contentType,
    },
    method: "PUT",
    uploadURL: await createTosPresignedUrl(env, "PUT", objectKey, expiresInSeconds),
  };
}

export async function downloadStoredMedia(
  client: SupabaseClient,
  env: unknown,
  objectKey: string,
): Promise<StoredMedia> {
  if (resolveMediaStorageProvider(env) === "tos") {
    try {
      const response = await fetchTosObject(env, "GET", objectKey);
      const contentLengthValue = response.headers.get("content-length");
      const contentLength = contentLengthValue ? Number(contentLengthValue) : undefined;
      return {
        body: response.body ?? (await response.arrayBuffer()),
        contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
        contentType: response.headers.get("content-type") ?? undefined,
      };
    } catch (error) {
      if (
        error instanceof MediaStorageError &&
        error.status === 404 &&
        truthyEnv(getEnvValue(env, "MEDIA_STORAGE_SUPABASE_READ_FALLBACK"))
      ) {
        return downloadFromSupabase(client, objectKey);
      }

      throw error;
    }
  }

  return downloadFromSupabase(client, objectKey);
}

export async function removeStoredMedia(
  client: SupabaseClient,
  env: unknown,
  objectKeys: string[],
) {
  if (!objectKeys.length) return;

  if (resolveMediaStorageProvider(env) === "tos") {
    const results = await Promise.allSettled(
      objectKeys.map((objectKey) => fetchTosObject(env, "DELETE", objectKey)),
    );
    const failed = results.find(
      (result) =>
        result.status === "rejected" &&
        !(result.reason instanceof MediaStorageError && result.reason.status === 404),
    );
    if (failed?.status === "rejected") throw failed.reason;
    return;
  }

  await client.storage.from(NEKO_MEDIA_BUCKET).remove(objectKeys);
}
