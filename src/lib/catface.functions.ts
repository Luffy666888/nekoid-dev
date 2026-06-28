import { createServerFn } from "@tanstack/react-start";

type Result = { isCat: boolean; reason?: string };
type AIProvider = "openai" | "qwen" | "deepseek";

let envFileCache: Record<string, string> | null | undefined;

async function readLocalEnvFile() {
  if (envFileCache !== undefined) return envFileCache;
  envFileCache = null;
  try {
    const [{ readFileSync }, { resolve }] = await Promise.all([import("node:fs"), import("node:path")]);
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    envFileCache = Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const idx = line.indexOf("=");
          const key = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
          return [key, value];
        }),
    );
  } catch {
    envFileCache = null;
  }
  return envFileCache;
}

async function getServerEnv(name: string) {
  return process.env[name] || (await readLocalEnvFile())?.[name];
}

function normalizeProvider(value?: string | null): AIProvider | null {
  const explicit = value?.toLowerCase().trim();
  if (explicit === "qwen" || explicit === "dashscope" || explicit === "bailian" || explicit === "aliyun") return "qwen";
  if (explicit === "deepseek" || explicit === "openai") return explicit;
  return null;
}

async function getAIProvider(): Promise<AIProvider> {
  const explicit = normalizeProvider(await getServerEnv("AI_PROVIDER"));
  if (explicit) return explicit;
  if (await getServerEnv("OPENAI_API_KEY")) return "openai";
  if (await getServerEnv("DASHSCOPE_API_KEY")) return "qwen";
  return (await getServerEnv("DEEPSEEK_API_KEY")) ? "deepseek" : "openai";
}

async function getAIProviderOrder(): Promise<AIProvider[]> {
  const primary = await getAIProvider();
  const fallback = normalizeProvider(await getServerEnv("AI_FALLBACK_PROVIDER"));
  return [primary, fallback].filter((provider, index, list): provider is AIProvider => Boolean(provider) && list.indexOf(provider) === index);
}

async function shouldRequireRealAI() {
  const value = (await getServerEnv("AI_REQUIRE_REAL"))?.toLowerCase().trim();
  return value === "1" || value === "true" || value === "yes";
}

function providerLabel(provider: AIProvider) {
  if (provider === "qwen") return "Qwen-VL";
  if (provider === "deepseek") return "DeepSeek";
  return "OpenAI";
}

async function getProviderModel(provider: AIProvider) {
  if (provider === "qwen") return (await getServerEnv("QWEN_VL_MODEL")) || "qwen-vl-plus";
  if (provider === "deepseek") return (await getServerEnv("DEEPSEEK_MODEL")) || "deepseek-v4-flash";
  return (await getServerEnv("OPENAI_VISION_MODEL")) || (await getServerEnv("OPENAI_MODEL")) || "gpt-4o-mini";
}

export const detectCatFace = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = input as { imageDataUrl?: string; mode?: "face" | "presence" };
    if (!data || typeof data.imageDataUrl !== "string" || !data.imageDataUrl.startsWith("data:image/")) {
      throw new Error("invalid image");
    }
    if (data.imageDataUrl.length > 8_000_000) {
      throw new Error("image too large");
    }
    return { imageDataUrl: data.imageDataUrl, mode: data.mode ?? "face" };
  })
  .handler(async ({ data }): Promise<Result> => {
    const isPresence = data.mode === "presence";
    const providers = await getAIProviderOrder();
    let lastError: unknown;

    for (const provider of providers) {
      if (provider === "deepseek") continue;
      const isQwen = provider === "qwen";
      const apiKey = isQwen ? await getServerEnv("DASHSCOPE_API_KEY") : await getServerEnv("OPENAI_API_KEY");
      if (!apiKey) {
        lastError = new Error(isQwen ? "Missing DASHSCOPE_API_KEY" : "Missing OPENAI_API_KEY");
        continue;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), isQwen ? 9000 : 5500);

      try {
        const baseUrl = isQwen
          ? (await getServerEnv("DASHSCOPE_BASE_URL")) || "https://dashscope.aliyuncs.com/compatible-mode/v1"
          : (await getServerEnv("OPENAI_BASE_URL")) || "https://api.openai.com/v1";
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: await getProviderModel(provider),
            temperature: 0,
            max_tokens: 12,
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
                  { type: "text", text: isPresence ? "画面里有猫吗？" : "图中有清晰猫咪正脸吗？" },
                  { type: "image_url", image_url: { url: data.imageDataUrl, detail: "low" } },
                ],
              },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          lastError = new Error(`${providerLabel(provider)} error ${res.status}: ${text.slice(0, 200)}`);
          console.error(`NEKO ${providerLabel(provider)} vision error ${res.status}: ${text.slice(0, 500)}`);
          continue;
        }

        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = json.choices?.[0]?.message?.content ?? "{}";
        try {
          const parsed = JSON.parse(content) as { isCat?: boolean };
          return { isCat: parsed.isCat === true };
        } catch {
          return { isCat: /true/i.test(content) };
        }
      } catch (error) {
        lastError = error;
        if (!(error instanceof Error && error.name === "AbortError")) console.error(`NEKO ${providerLabel(provider)} vision failed`, error);
      } finally {
        clearTimeout(timer);
      }
    }

    if (await shouldRequireRealAI()) {
      throw new Error(`猫咪图片识别失败：${lastError instanceof Error ? lastError.message : "AI 未返回结果"}`);
    }
    return { isCat: true, reason: "vision_unavailable" };
  });
