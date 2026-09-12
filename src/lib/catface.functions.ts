import { createServerFn } from "@tanstack/react-start";

export type CatFaceResult = { isCat: boolean; reason?: string };
export type CatFaceInput = { imageDataUrl: string; mode?: "face" | "presence" };
type AIProvider = "openai" | "qwen" | "deepseek" | "bytecat";

let workerEnv: Record<string, string | undefined> | null = null;
let envFileCache: Record<string, string> | null | undefined;

export function setCatFaceWorkerEnv(env: unknown) {
  workerEnv = (env as Record<string, string | undefined> | undefined) ?? null;
}

async function readLocalEnvFile() {
  if (envFileCache !== undefined) return envFileCache;
  envFileCache = null;
  try {
    const [{ readFileSync }, { resolve }] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    envFileCache = Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const idx = line.indexOf("=");
          const key = line.slice(0, idx).trim();
          const value = line
            .slice(idx + 1)
            .trim()
            .replace(/^['"]|['"]$/g, "");
          return [key, value];
        }),
    );
  } catch {
    envFileCache = null;
  }
  return envFileCache;
}

async function getServerEnv(name: string) {
  const workerValue = workerEnv?.[name];
  if (workerValue) return workerValue;
  const processValue = typeof process !== "undefined" ? process.env[name] : undefined;
  return processValue || (await readLocalEnvFile())?.[name];
}

function normalizeProvider(value?: string | null): AIProvider | null {
  const explicit = value?.toLowerCase().trim();
  if (
    explicit === "qwen" ||
    explicit === "dashscope" ||
    explicit === "bailian" ||
    explicit === "aliyun"
  )
    return "qwen";
  if (explicit === "bytecat" || explicit === "bytecatcode") return "bytecat";
  if (explicit === "deepseek" || explicit === "openai") return explicit;
  return null;
}

async function getAIProvider(): Promise<AIProvider> {
  const explicit = normalizeProvider(await getServerEnv("AI_PROVIDER"));
  if (explicit) return explicit;
  if (await getServerEnv("OPENAI_API_KEY")) return "openai";
  if (await getServerEnv("DASHSCOPE_API_KEY")) return "qwen";
  if (await getServerEnv("DEEPSEEK_API_KEY")) return "deepseek";
  return (await getServerEnv("BYTECAT_API_KEY")) ? "bytecat" : "openai";
}

async function getAIProviderOrder(): Promise<AIProvider[]> {
  const primary = await getAIProvider();
  const fallback = normalizeProvider(await getServerEnv("AI_FALLBACK_PROVIDER"));
  return [primary, fallback].filter(
    (provider, index, list): provider is AIProvider =>
      Boolean(provider) && list.indexOf(provider) === index,
  );
}

async function shouldRequireRealAI() {
  const value = (await getServerEnv("AI_REQUIRE_REAL"))?.toLowerCase().trim();
  return value === "1" || value === "true" || value === "yes";
}

function providerLabel(provider: AIProvider) {
  if (provider === "qwen") return "Qwen-VL";
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "bytecat") return "ByteCat";
  return "OpenAI";
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

function getUserFacingCatFaceFailure(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  if (message.includes("image too large")) {
    return "图片太大了，请换一张小一点的照片再试。";
  }

  if (message.includes("invalid image")) {
    return "图片读取失败，请换一张清晰照片再试。";
  }

  if (
    isAbortError(error) ||
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econn") ||
    message.includes("etimedout")
  ) {
    return "猫咪图片识别暂时没有完成，请稍后再试或换一张照片。";
  }

  return "猫咪图片识别暂时失败，请稍后再试或换一张照片。";
}

const BYTECAT_DEFAULT_VISION_MODELS = [
  "gpt-5.6-terra",
  "gemini-3.7-flash",
  "gemini-3-flash-preview",
  "gpt-5.6-sol",
  "gpt-5.5",
] as const;

function parseModelList(value?: string | null) {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((model) => model.trim())
    .filter(Boolean);
}

function uniqueModels(models: Array<string | undefined | null>) {
  const seen = new Set<string>();
  return models.filter((model): model is string => {
    if (!model || seen.has(model)) return false;
    seen.add(model);
    return true;
  });
}

function isByteCatGeminiModel(model?: string | null) {
  return /^gemini-/i.test(model ?? "");
}

function normalizeOpenAICompatibleBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    return /\/v\d+(?:beta)?$/i.test(url.pathname) ? trimmed : `${trimmed}/v1`;
  } catch {
    return trimmed;
  }
}

function normalizeGeminiBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/v\d+(?:beta)?$/i, "") || "/";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/v\d+(?:beta)?$/i, "");
  }
}

async function getByteCatApiKey(model?: string | null) {
  if (isByteCatGeminiModel(model)) {
    return (
      (await getServerEnv("BYTECAT_GEMINI_API_KEY")) || (await getServerEnv("BYTECAT_API_KEY"))
    );
  }
  return getServerEnv("BYTECAT_API_KEY");
}

async function getByteCatBaseUrl(model?: string | null) {
  const baseUrl = isByteCatGeminiModel(model)
    ? (await getServerEnv("BYTECAT_GEMINI_BASE_URL")) || "https://bytecat.lamclod.cn"
    : (await getServerEnv("BYTECAT_BASE_URL")) || "https://www.bytecatcode.org/v1";
  return isByteCatGeminiModel(model)
    ? normalizeGeminiBaseUrl(baseUrl)
    : normalizeOpenAICompatibleBaseUrl(baseUrl);
}

async function getCatFaceTimeoutMs(provider: AIProvider, isPresence: boolean, model: string) {
  if (provider === "bytecat" && model === (await getProviderModel(provider))) {
    const primaryTimeoutMs = Number(await getServerEnv("BYTECAT_PRIMARY_TIMEOUT_MS"));
    if (Number.isFinite(primaryTimeoutMs) && primaryTimeoutMs > 0) {
      return Math.min(Math.max(1, Math.floor(primaryTimeoutMs)), isPresence ? 8_000 : 20_000);
    }
  }
  if (isPresence) {
    if (provider === "bytecat") return 8_000;
    if (provider === "qwen") return 7_000;
    return 5_500;
  }

  if (provider === "qwen") return 9_000;
  if (provider === "bytecat") return 20_000;
  return 5_500;
}

async function getProviderModels(provider: AIProvider) {
  if (provider === "bytecat") {
    return uniqueModels([
      await getServerEnv("BYTECAT_VISION_MODEL"),
      ...parseModelList(await getServerEnv("BYTECAT_VISION_FALLBACK_MODELS")),
      ...BYTECAT_DEFAULT_VISION_MODELS,
    ]);
  }
  return [await getProviderModel(provider)];
}

async function getProviderModel(provider: AIProvider) {
  if (provider === "qwen") return (await getServerEnv("QWEN_VL_MODEL")) || "qwen-vl-plus";
  if (provider === "deepseek") return (await getServerEnv("DEEPSEEK_MODEL")) || "deepseek-v4-flash";
  if (provider === "bytecat")
    return (
      (await getServerEnv("BYTECAT_VISION_MODEL")) ||
      (await getServerEnv("BYTECAT_MODEL")) ||
      "gpt-5.6-terra"
    );
  return (
    (await getServerEnv("OPENAI_VISION_MODEL")) ||
    (await getServerEnv("OPENAI_MODEL")) ||
    "gpt-4o-mini"
  );
}

function dataUrlToGeminiInlineData(url: string) {
  const match = url.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function buildGeminiCatFacePayload(data: CatFaceInput, isPresence: boolean) {
  const inlineData = dataUrlToGeminiInlineData(data.imageDataUrl);
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: isPresence
              ? '判断画面中是否出现猫。仅返回 JSON：{"isCat":true|false}。画面里有猫吗？'
              : '判断图片中是否包含清晰猫咪正脸。仅返回 JSON：{"isCat":true|false}。图中有清晰猫咪正脸吗？',
          },
          ...(inlineData ? [{ inlineData }] : []),
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      // Gemini's output limit also needs room for internal reasoning.
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      thinkingConfig: { includeThoughts: false },
    },
  };
}

function extractGeminiText(json: unknown) {
  const response = json as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }>;
  };
  const candidate = response?.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new Error(`Gemini response incomplete: ${candidate.finishReason}`);
  }
  const text = candidate?.content?.parts
    ?.filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned no answer text");
  return text;
}

function validateCatFaceInput(input: unknown): CatFaceInput {
  const data = input as { imageDataUrl?: string; mode?: "face" | "presence" };
  if (
    !data ||
    typeof data.imageDataUrl !== "string" ||
    !data.imageDataUrl.startsWith("data:image/")
  ) {
    throw new Error("invalid image");
  }
  if (data.imageDataUrl.length > 8_000_000) {
    throw new Error("image too large");
  }
  return { imageDataUrl: data.imageDataUrl, mode: data.mode ?? "face" };
}

export async function detectCatFaceServer(input: CatFaceInput): Promise<CatFaceResult> {
  const data = validateCatFaceInput(input);
  const isPresence = data.mode === "presence";
  const providers = await getAIProviderOrder();
  let lastError: unknown;

  for (const provider of providers) {
    if (provider === "deepseek") continue;
    const isQwen = provider === "qwen";
    const isBytecat = provider === "bytecat";
    const models = await getProviderModels(provider);

    for (const model of models) {
      const apiKey = isQwen
        ? await getServerEnv("DASHSCOPE_API_KEY")
        : isBytecat
          ? await getByteCatApiKey(model)
          : await getServerEnv("OPENAI_API_KEY");
      if (!apiKey) {
        lastError = new Error(
          isQwen
            ? "Missing DASHSCOPE_API_KEY"
            : isBytecat
              ? isByteCatGeminiModel(model)
                ? "Missing BYTECAT_GEMINI_API_KEY or BYTECAT_API_KEY"
                : "Missing BYTECAT_API_KEY"
              : "Missing OPENAI_API_KEY",
        );
        continue;
      }
      const baseUrl = isQwen
        ? (await getServerEnv("DASHSCOPE_BASE_URL")) ||
          "https://dashscope.aliyuncs.com/compatible-mode/v1"
        : isBytecat
          ? await getByteCatBaseUrl(model)
          : (await getServerEnv("OPENAI_BASE_URL")) || "https://api.openai.com/v1";
      const controller = new AbortController();
      const timeoutMs = await getCatFaceTimeoutMs(provider, isPresence, model);
      const startedAt = Date.now();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const isGeminiGenerateContent = isBytecat && isByteCatGeminiModel(model);
        const res = isGeminiGenerateContent
          ? await fetch(
              `${baseUrl.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(
                model,
              )}:generateContent`,
              {
                method: "POST",
                signal: controller.signal,
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": apiKey,
                },
                body: JSON.stringify(buildGeminiCatFacePayload(data, isPresence)),
              },
            )
          : await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
              method: "POST",
              signal: controller.signal,
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                temperature: 0,
                max_tokens: isBytecat ? 128 : 12,
                messages: [
                  {
                    role: "system",
                    content: isPresence
                      ? '判断画面中是否出现猫。仅返回 JSON：{"isCat":true|false}。'
                      : '判断图片中是否包含清晰猫咪正脸。仅返回 JSON：{"isCat":true|false}。',
                  },
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: isPresence ? "画面里有猫吗？" : "图中有清晰猫咪正脸吗？",
                      },
                      { type: "image_url", image_url: { url: data.imageDataUrl, detail: "low" } },
                    ],
                  },
                ],
                response_format: { type: "json_object" },
              }),
            });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          lastError = new Error(
            `${providerLabel(provider)} ${model} error ${res.status}: ${text.slice(0, 200)}`,
          );
          console.error(
            `NEKO ${providerLabel(provider)} ${model} vision error ${res.status}: ${text.slice(
              0,
              500,
            )}`,
          );
          continue;
        }

        const json = isGeminiGenerateContent
          ? await res.json()
          : ((await res.json()) as { choices?: Array<{ message?: { content?: string } }> });
        const content = isGeminiGenerateContent
          ? extractGeminiText(json)
          : ((json as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message
              ?.content ?? "{}");
        const source = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
        const parsed = JSON.parse(source) as { isCat?: boolean };
        if (typeof parsed?.isCat !== "boolean") {
          throw new Error(`${providerLabel(provider)} ${model} returned invalid cat detection`);
        }
        console.info(
          `NEKO ${providerLabel(provider)} detection success model=${model} duration=${Date.now() - startedAt}ms`,
        );
        return { isCat: parsed.isCat };
      } catch (error) {
        lastError = error;
        if (!isAbortError(error))
          console.error(`NEKO ${providerLabel(provider)} ${model} vision failed`, error);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  if (isPresence) {
    return { isCat: true, reason: "vision_unavailable" };
  }

  if (await shouldRequireRealAI()) {
    throw new Error(getUserFacingCatFaceFailure(lastError));
  }
  return { isCat: true, reason: "vision_unavailable" };
}

export const detectCatFace = createServerFn({ method: "POST" })
  .inputValidator(validateCatFaceInput)
  .handler(async ({ data }): Promise<CatFaceResult> => detectCatFaceServer(data));
