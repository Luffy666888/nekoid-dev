// Deliberately separate from prompt debugging: never pass inputs, outputs, URLs,
// tokens, user identifiers or raw error messages to these production diagnostics.
type Metric = string | number | boolean | null | string[];
export type PerformanceOperation =
  "persona" | "video_analysis" | "voice" | "cat_detection" | "profile_save" | "media_upload_url";

export function monotonicNow() {
  return globalThis.performance?.now() ?? Date.now();
}

export function elapsedMs(since: number) {
  return Math.max(0, Math.round(monotonicNow() - since));
}

function validTraceID(value?: string | null) {
  return value && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

export function performanceErrorCategory(error: unknown): string {
  // Inspect locally; only emit one of these fixed categories, never the message.
  const value = error as { name?: string; message?: string; cause?: { code?: string } } | null;
  const message = typeof value?.message === "string" ? value.message : "";
  if (
    /timeout|timedout/i.test(message) ||
    /TIMEOUT|ETIMEDOUT/.test(performanceNetworkCode(error) ?? "")
  )
    return "timeout";
  if (value?.name === "AbortError") return "cancelled";
  if (/error 429\b/.test(message)) return "rate_limited";
  if (/error 5\d\d\b/.test(message)) return "upstream_5xx";
  if (/error 4\d\d\b/.test(message)) return "upstream_4xx";
  if (/fetch failed|network|econn|enotfound/i.test(message) || value?.cause?.code) return "network";
  if (/incomplete|truncated|no answer text/i.test(message)) return "incomplete_output";
  if (value?.name === "SyntaxError" || /not JSON/i.test(message)) return "invalid_json";
  if (/missing required fields/i.test(message)) return "validation";
  if (/Missing .*KEY/.test(message)) return "configuration";
  return "other";
}

export function performanceNetworkCode(error: unknown): string | null {
  const value = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = value?.cause?.code ?? value?.code;
  return typeof code === "string" &&
    /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|UND_ERR_SOCKET|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT)$/.test(
      code,
    )
    ? code
    : null;
}

export class PerformanceTrace {
  readonly requestId: string;
  readonly flowId: string;
  readonly startedAt = monotonicNow();
  modelAttempts = 0;

  constructor(
    readonly operation: PerformanceOperation,
    requestId?: string | null,
    flowId?: string | null,
  ) {
    this.requestId = validTraceID(requestId) ?? globalThis.crypto.randomUUID();
    this.flowId = validTraceID(flowId) ?? this.requestId;
  }

  log(event: string, metrics: Record<string, Metric> = {}) {
    // Observability must never turn a successful request into a failure.
    try {
      console.info(
        "NEKO perf",
        JSON.stringify({
          ...metrics,
          event,
          operation: this.operation,
          requestId: this.requestId,
          flowId: this.flowId,
          elapsedMs: elapsedMs(this.startedAt),
        }),
      );
    } catch {
      /* ignore logging failures */
    }
  }

  async measure<T>(stage: string, operation: () => Promise<T>): Promise<T> {
    const started = monotonicNow();
    try {
      const result = await operation();
      this.log("span_end", { stage, durationMs: elapsedMs(started), outcome: "ok" });
      return result;
    } catch (error) {
      this.log("span_end", {
        stage,
        durationMs: elapsedMs(started),
        outcome: "error",
        errorCategory: performanceErrorCategory(error),
      });
      throw error;
    }
  }
}
