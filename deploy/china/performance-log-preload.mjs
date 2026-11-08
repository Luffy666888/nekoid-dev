// Node-only observability adapter. Enabled by the China systemd drop-in, never
// imported into the application/Worker bundle. Existing console output is kept.
import { open } from "node:fs/promises";

const EVENTS = new Set([
  "http_start", "http_end", "span_end", "persona_start", "persona_end",
  "persona_stage_start", "persona_stage_end", "persona_local_repair",
  "ai_attempt_start", "ai_attempt_end", "ai_transport_end", "voice_style_examples",
]);
const OPERATIONS = new Set([
  "persona", "video_analysis", "voice", "cat_detection", "profile_save", "media_upload_url",
]);
const ENUMS = {
  stage: new Set(["body_read", "auth", "cloud_operation", "stage1", "stage2", "stage3", "video_observation", "voice_generation"]),
  outcome: new Set(["ok", "error"]),
  provider: new Set(["openai", "qwen", "deepseek", "bytecat"]),
  transport: new Set(["gemini", "chat"]),
  errorCategory: new Set(["timeout", "cancelled", "rate_limited", "upstream_5xx", "upstream_4xx", "network", "incomplete_output", "invalid_json", "validation", "configuration", "other"]),
  networkCode: new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT"]),
  reason: new Set(["unsupported_long_term_claim", "self_check", "previous_persona_anchor", "fatal_eval"]),
};
const NUMBERS = [
  "elapsedMs", "durationMs", "timeoutMs", "headersMs", "bodyMs", "requestBytes",
  "inputTokens", "outputTokens", "thoughtTokens", "attempt", "modelAttempts",
  "modelRetries", "localRepairs", "completedStages", "validationMs", "normalizeMs",
  "postprocessMs", "extraModelCalls", "answeredCount", "videoObservationCount",
];
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const SLUG = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/;
const MAX_INPUT_BYTES = 16 * 1024;
export const MAX_FILE_BYTES = 64 * 1024 * 1024;

// Rebuild from an allowlist: never spread arbitrary input, prompt, response,
// credentials, media URLs, names, user IDs or raw errors into the collected file.
export function performanceRecord(label, json, now = new Date()) {
  if (label !== "NEKO perf" || typeof json !== "string" || Buffer.byteLength(json) > MAX_INPUT_BYTES) return null;
  let input;
  try { input = JSON.parse(json); } catch { return null; }
  if (!input || !EVENTS.has(input.event) || !OPERATIONS.has(input.operation)
    || typeof input.requestId !== "string" || !UUID.test(input.requestId)
    || typeof input.flowId !== "string" || !UUID.test(input.flowId)) return null;
  const result = {
    timestamp: now.toISOString(), schemaVersion: 1, service: "nekoid", deployment: "china",
    event: input.event, operation: input.operation,
    requestId: input.requestId.toLowerCase(), flowId: input.flowId.toLowerCase(),
  };
  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (allowed.has(input[key])) result[key] = input[key];
  }
  for (const key of NUMBERS) {
    if (typeof input[key] === "number" && Number.isFinite(input[key]) && input[key] >= 0) result[key] = input[key];
  }
  if (Number.isInteger(input.httpStatus) && input.httpStatus >= 100 && input.httpStatus <= 599) result.httpStatus = input.httpStatus;
  for (const key of ["hasImage", "hasPrior", "willRetry"]) {
    if (typeof input[key] === "boolean") result[key] = input[key];
  }
  for (const key of ["model", "promptVersion", "version"]) {
    if (typeof input[key] === "string" && SLUG.test(input[key])) result[key] = input[key];
  }
  for (const key of ["reasons", "exampleIds"]) {
    if (Array.isArray(input[key])) result[key] = input[key].filter(value => typeof value === "string" && SLUG.test(value)).slice(0, 32);
  }
  return result;
}

async function appendBatch(file, batch) {
  // Open each batch, not once at startup: rename/create rotation takes effect
  // without restarting the application or copytruncate's data-loss window.
  const handle = await open(file, "a", 0o640);
  try {
    if ((await handle.stat()).size + Buffer.byteLength(batch) > MAX_FILE_BYTES) {
      throw Object.assign(new Error("performance file limit"), { code: "LOG_LIMIT" });
    }
    await handle.writeFile(batch, "utf8");
  } finally { await handle.close(); }
}

export function createPerformanceSink(file, {
  append = appendBatch, warn = message => process.stderr.write(`${message}\n`),
  maxQueuedBytes = 512 * 1024, now = Date.now,
} = {}) {
  let queue = [], queuedBytes = 0, draining = null, failedUntil = 0;
  let dropped = 0, nextWarning = 0;
  const reportDrop = count => {
    dropped += count;
    if (now() >= nextWarning) {
      nextWarning = now() + 60_000;
      try { warn(`NEKO perf file sink dropped events; count=${dropped}`); } catch { /* best effort */ }
    }
  };
  async function drain() {
    while (queue.length) {
      const lines = [];
      let bytes = 0;
      while (queue.length && bytes < 64 * 1024) {
        const line = queue.shift();
        const length = Buffer.byteLength(line);
        queuedBytes -= length;
        bytes += length;
        lines.push(line);
      }
      try { await append(file, lines.join("")); }
      catch {
        reportDrop(lines.length + queue.length);
        queue = [];
        queuedBytes = 0;
        failedUntil = now() + 30_000;
      }
    }
  }
  return {
    enqueue(record) {
      try {
        const line = `${JSON.stringify(record)}\n`;
        const length = Buffer.byteLength(line);
        if (length > MAX_INPUT_BYTES || now() < failedUntil || queuedBytes + length > maxQueuedBytes) {
          reportDrop(1);
          return false;
        }
        queue.push(line);
        queuedBytes += length;
        if (!draining) draining = Promise.resolve().then(drain).finally(() => { draining = null; });
        return true;
      } catch { reportDrop(1); return false; }
    },
    async flush() { while (draining) await draining; },
    get dropped() { return dropped; },
  };
}

export function installPerformanceLogging(file, targetConsole = console) {
  const sink = createPerformanceSink(file);
  const originalInfo = targetConsole.info;
  const wrappedInfo = function (...args) {
    // The file sink is independent of the original journal output's health.
    try {
      const record = performanceRecord(args[0], args[1]);
      if (record) sink.enqueue(record);
    } catch { /* never fail a request because logging failed */ }
    return Reflect.apply(originalInfo, this, args);
  };
  targetConsole.info = wrappedInfo;
  return { sink, restore() { if (targetConsole.info === wrappedInfo) targetConsole.info = originalInfo; } };
}

if (process.env.NEKO_PERF_LOG_FILE) {
  installPerformanceLogging(process.env.NEKO_PERF_LOG_FILE);
}
