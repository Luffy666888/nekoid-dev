import { createServerFn } from "@tanstack/react-start";
import type { CatPersona, CatProfile } from "@/components/neko/catProfileStore";
import type { Voice } from "@/components/neko/app/voicesStore";

export type PersonaInput = {
  profile: CatProfile;
  imageDataUrl?: string | null;
};

export type VoiceInput = {
  profile: CatProfile;
  persona: CatPersona | null;
  imageDataUrl?: string | null;
  scene?: string;
};

type AIProvider = "openai" | "qwen" | "deepseek" | "bytecat";

let workerEnv: Record<string, string | undefined> | null = null;
let envFileCache: Record<string, string> | null | undefined;

export function setNekoAIWorkerEnv(env: unknown) {
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

function extractJson<T>(content: string): T {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? content;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI response is not JSON");
  return JSON.parse(source.slice(start, end + 1)) as T;
}

const AGE_STAGES = ["幼猫", "青年猫", "成熟猫", "资深猫"] as const;

function asText(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function normalizeCatFacts(value: unknown, profile: CatProfile, fallback = "") {
  const text = asText(value, fallback);
  if (!text) return "";
  let next = text;
  const oppositeGender = profile.gender === "小公猫" ? "小母猫" : "小公猫";
  next = next.replaceAll(oppositeGender, profile.gender);
  next = next.replaceAll("小母猫", profile.gender === "小母猫" ? "小母猫" : "小公猫");
  next = next.replaceAll("小公猫", profile.gender === "小公猫" ? "小公猫" : "小母猫");
  AGE_STAGES.forEach((stage) => {
    if (stage !== profile.ageStage) next = next.replaceAll(stage, profile.ageStage);
  });
  // 猫咪文案统一用“它”，避免模型把用户选择的小公猫/小母猫写成人称代词。
  next = next.replaceAll("她", "它");
  next = next
    .replaceAll("他的", "它的")
    .replaceAll("他会", "它会")
    .replaceAll("他是", "它是")
    .replaceAll("他在", "它在")
    .replaceAll("他也", "它也")
    .replaceAll("他不", "它不")
    .replaceAll("他更", "它更")
    .replaceAll("他想", "它想")
    .replaceAll("他把", "它把")
    .replaceAll("他对", "它对")
    .replaceAll("他总", "它总");
  return next;
}

function boundedCopy(value: string, fallback: string, min: number, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const selected = Array.from(normalized).length >= min ? normalized : fallback;
  return Array.from(selected).slice(0, max).join("");
}

function normalizeShareTag(value: unknown, profile: CatProfile) {
  const normalized = normalizeCatFacts(value, profile)
    .replace(/^#+/, "")
    .replace(/[，。！？、,.!?:：；;\s]/g, "")
    .trim();
  return Array.from(normalized).slice(0, 8).join("");
}

function normalizePersonaForProfile(persona: CatPersona, profile: CatProfile): CatPersona {
  const parsedTags = Array.isArray(persona.tags) ? persona.tags : [];
  const parsedTraits = Array.isArray(persona.traits) ? persona.traits : [];
  const parsedObservations = Array.isArray(persona.observations) ? persona.observations : [];
  return {
    ...persona,
    name: profile.name || persona.name,
    type: normalizeCatFacts(persona.type, profile) || persona.type,
    mbti: normalizeCatFacts(persona.mbti, profile) || persona.mbti,
    monologue: normalizeCatFacts(persona.monologue, profile),
    analysis: normalizeCatFacts(persona.analysis, profile),
    ownerRole: normalizeCatFacts(persona.ownerRole, profile),
    dailyMood: normalizeCatFacts(persona.dailyMood, profile),
    tags: parsedTags.map((tag) => normalizeCatFacts(tag, profile)).filter(Boolean),
    traits: parsedTraits
      .map((trait) => {
        const raw = trait as { label?: unknown; value?: unknown } | string;
        if (typeof raw === "string") {
          return { label: normalizeCatFacts(raw, profile), value: 50 };
        }
        return {
          label: normalizeCatFacts(raw?.label, profile, "特质") || "特质",
          value: Math.max(0, Math.min(100, Number(raw?.value) || 50)),
        };
      })
      .filter((trait) => trait.label)
      .slice(0, 4),
    observations: parsedObservations
      .map((observation) => {
        const raw = observation as { label?: unknown; value?: unknown; v?: unknown } | string;
        if (typeof raw === "string") {
          return { label: "观察依据", value: normalizeCatFacts(raw, profile) };
        }
        return {
          label: normalizeCatFacts(raw?.label, profile, "观察依据") || "观察依据",
          value: normalizeCatFacts(raw?.value ?? raw?.v, profile),
        };
      })
      .filter((observation) => observation.value)
      .slice(0, 3),
  };
}

function buildStablePersona(profile: CatProfile): CatPersona {
  const ageTone: Record<
    CatProfile["ageStage"],
    { type: string; mbti: string; mood: string; tags: string[]; traits: CatPersona["traits"] }
  > = {
    幼猫: {
      type: "好奇小探险家",
      mbti: "ENFP-A",
      mood: "今天也想探索新角落",
      tags: ["好奇心旺", "撒娇高手", "活力满满", "需要陪玩", "软萌外表", "小小冒险"],
      traits: [
        { label: "粘人度", value: 82 },
        { label: "探索欲", value: 90 },
        { label: "安全感", value: 68 },
      ],
    },
    青年猫: {
      type: "优雅观察者",
      mbti: "INFP-A",
      mood: "安静又温暖，适合窝在你身边",
      tags: ["优雅独立", "温柔治愈", "好奇探索", "安静陪伴", "慢热亲近", "小小主见"],
      traits: [
        { label: "粘人度", value: 72 },
        { label: "独立性", value: 84 },
        { label: "好奇心", value: 88 },
      ],
    },
    成熟猫: {
      type: "从容陪伴者",
      mbti: "ISFJ-A",
      mood: "今天想安稳地陪你一会",
      tags: ["稳定温柔", "懂得陪伴", "慢热可靠", "观察细腻", "亲密有度", "安心感"],
      traits: [
        { label: "粘人度", value: 76 },
        { label: "稳定感", value: 90 },
        { label: "观察力", value: 82 },
      ],
    },
    资深猫: {
      type: "安静小智者",
      mbti: "INFJ-A",
      mood: "慢慢看着你，就是它的温柔",
      tags: ["沉稳安静", "经验丰富", "温柔守候", "安全感强", "慢节奏", "小智者"],
      traits: [
        { label: "粘人度", value: 70 },
        { label: "稳定感", value: 92 },
        { label: "洞察力", value: 86 },
      ],
    },
  };
  const tone = ageTone[profile.ageStage] ?? ageTone.青年猫;
  return normalizePersonaForProfile(
    {
      name: profile.name,
      type: tone.type,
      mbti: tone.mbti,
      matchScore: 88,
      monologue: `今天也想悄悄靠近你，陪你待一会。`,
      analysis: `${profile.name}是${profile.ageStage}里的${profile.gender}，性格里带着独立和温柔。它会先观察环境，再用停留、靠近和注视表达亲近。`,
      ownerRole: `在${profile.name}眼里，你是能给它安全感的人。它信任你，也会用自己的节奏靠近你、陪伴你。`,
      tags: tone.tags,
      traits: tone.traits,
      observations: [
        { label: "行为倾向", value: "先观察，再靠近" },
        { label: "情绪表达", value: "通过停留和注视传递亲近" },
        { label: "亲密关系", value: "需要安全感，也保留自己的小主见" },
        { label: "年龄阶段", value: `${profile.ageStage}特征更明显` },
      ],
      dailyMood: tone.mood,
      savedAt: Date.now(),
    },
    profile,
  );
}

function normalizeVoiceForProfile(
  input: {
    text?: unknown;
    subtext?: unknown;
    analysis?: unknown;
    share?: unknown;
    mood?: unknown;
    location?: unknown;
    tags?: unknown;
  },
  profile: CatProfile,
  imageDataUrl?: string | null,
): Voice {
  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => normalizeCatFacts(tag, profile)).filter(Boolean)
    : [];
  const mood = normalizeCatFacts(input.mood, profile, "想被关注");
  const rawAnalysis = input.analysis && typeof input.analysis === "object"
    ? input.analysis as Record<string, unknown>
    : {};
  const legacyAnalysis = typeof input.analysis === "string" ? input.analysis : undefined;
  const analysisSummary = boundedCopy(normalizeCatFacts(
    rawAnalysis.observation ?? rawAnalysis.summary ?? legacyAnalysis,
    profile,
    `${profile.name}保持停留并注视周围，姿态放松，同时持续关注当前互动。`,
  ), `${profile.name}保持停留并注视周围，姿态放松，同时持续关注当前互动。`, 45, 70);
  const subtext = boundedCopy(
    normalizeCatFacts(input.subtext, profile, "它没有急着行动，像是在等一个符合自己节奏的时机。"),
    "它没有急着行动，像是在等一个符合自己节奏的时机。",
    15,
    35,
  );
  const personalityInterpretation = boundedCopy(normalizeCatFacts(
    rawAnalysis.personalityInterpretation ?? input.subtext,
    profile,
    subtext,
  ), subtext, 15, 60);
  const rawShare = input.share && typeof input.share === "object"
    ? input.share as Record<string, unknown>
    : {};
  const shareTags = Array.isArray(rawShare.tags)
    ? rawShare.tags.map((tag) => normalizeShareTag(tag, profile)).filter((tag) => Array.from(tag).length >= 4).slice(0, 3)
    : [];
  return {
    time: "刚刚",
    createdAt: Date.now(),
    location: normalizeCatFacts(input.location, profile, "家里") || "家里",
    grad: "linear-gradient(135deg, oklch(0.9 0.06 280), oklch(0.92 0.05 320))",
    tags: (tags.length ? tags : [`💭 ${mood}`, "✨ 小心思"]).slice(0, 3),
    aspect: "3:4",
    text: boundedCopy(
      normalizeCatFacts(input.text, profile, `靠近一点嘛，今天也想被你看见。`),
      `靠近一点嘛，今天也想被你看见。`,
      12,
      30,
    ),
    media: imageDataUrl ?? undefined,
    mediaType: "photo",
    analysis: {
      observation: analysisSummary,
      personalityInterpretation,
    },
    share: {
      headline: boundedCopy(
        normalizeCatFacts(rawShare.headline, profile, asText(input.text)),
        `看似安静，其实一直有自己的小主意`,
        12,
        24,
      ),
      insight: boundedCopy(
        normalizeCatFacts(rawShare.insight ?? input.subtext, profile, subtext),
        subtext,
        18,
        35,
      ),
      tags: shareTags.length >= 2
        ? shareTags
        : [...tags, `${mood}时刻`, `${profile.ageStage}小观察`]
            .map((tag) => normalizeShareTag(tag, profile))
            .filter((tag, index, list) => Array.from(tag).length >= 4 && list.indexOf(tag) === index)
            .slice(0, 3),
    },
  } as Voice;
}

function buildStableVoice(
  profile: CatProfile,
  imageDataUrl?: string | null,
  scene?: string,
): Voice {
  const sceneText = scene?.trim();
  const ageMood: Record<CatProfile["ageStage"], string> = {
    幼猫: "想玩一会",
    青年猫: "想被关注",
    成熟猫: "想安静陪伴",
    资深猫: "想慢慢靠近",
  };
  const mood = ageMood[profile.ageStage] ?? "想被关注";
  const sceneLower = sceneText ?? "";
  let text = `别只拍照呀，也过来陪我一会。`;
  if (/猫条|零食|吃|罐头|冻干/.test(sceneLower)) {
    text = `我已经闻到啦，先给我一小口好不好。`;
  } else if (/逗猫棒|玩具|球|羽毛|玩/.test(sceneLower)) {
    text = `这个小东西动得太可疑了，我要认真盯住它。`;
  } else if (/睡|窝|床|沙发|趴/.test(sceneLower)) {
    text = `这里刚刚好，我想安静地陪你待一会。`;
  } else if (/看|盯|拍照|镜头|照片/.test(sceneLower)) {
    text = `我知道你在看我，所以我也认真看你一下。`;
  } else if (/抱|摸|靠近|蹭|陪/.test(sceneLower)) {
    text = `再靠近一点点，我今天允许你多陪我一会。`;
  } else if (sceneText) {
    text = `我在认真感受这一刻，也在悄悄等你靠近。`;
  }
  const analysisSummary = sceneText
    ? `结合你补充的场景，${profile.name}的停留和注视更像是在回应当下互动，而不是单纯发呆。`
    : `${profile.name}是${profile.ageStage}里的${profile.gender}，画面里的停留和注视适合解读为想被关注。`;
  return normalizeVoiceForProfile(
    {
      text,
      analysis: {
        observation: analysisSummary,
        personalityInterpretation: `它习惯先确认环境和你的反应，再决定是否靠近，体现了谨慎又有主见的性格。`,
      },
      share: {
        headline: text,
        insight: `它不是没有反应，只是在用自己的节奏确认这一刻是否值得靠近。`,
        tags: [`${mood}观察员`, "先观察再回应", "这一刻有主意"],
      },
      mood,
      location: "家里",
      tags: [`💭 ${mood}`, "🐾 想靠近", "✨ 小心思"],
    },
    profile,
    imageDataUrl,
  );
}

function providerLabel(provider: AIProvider) {
  if (provider === "qwen") return "Qwen-VL";
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "bytecat") return "ByteCat";
  return "OpenAI";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

function isTimeoutLikeError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    (error instanceof Error && error.name === "AbortError") ||
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econn") ||
    message.includes("etimedout")
  );
}

function getUserFacingAIMessage(kind: "persona" | "voice", error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  if (message.includes("image too large")) {
    return "图片太大了，请换一张小一点的照片再试。";
  }

  if (message.includes("invalid image") || message.includes("missing profile")) {
    return "猫咪资料读取失败，请返回检查后再试。";
  }

  if (isTimeoutLikeError(error)) {
    return kind === "voice"
      ? "AI 现在有点忙，猫咪心声暂时没有生成成功，请稍后再试。"
      : "AI 现在有点忙，人格档案暂时没有生成成功，请稍后再试。";
  }

  return kind === "voice"
    ? "AI 心声暂时没有生成成功，请稍后再试。"
    : "AI 人格档案暂时没有生成成功，请稍后再试。";
}

const BYTECAT_DEFAULT_TEXT_MODELS = [
  "gpt-5.6-luna",
  "gemini-3.7-flash",
  "gemini-3-flash-preview",
  "gpt-5.5",
  "gpt-5.6-sol",
] as const;

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

function parsePositiveInt(value?: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
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

async function getProviderModel(provider: AIProvider, mode: "text" | "vision" = "text") {
  if (provider === "deepseek") return (await getServerEnv("DEEPSEEK_MODEL")) || "deepseek-v4-flash";
  if (provider === "qwen") return (await getServerEnv("QWEN_VL_MODEL")) || "qwen-vl-plus";
  if (provider === "bytecat") {
    return mode === "vision"
      ? (await getServerEnv("BYTECAT_VISION_MODEL")) ||
          (await getServerEnv("BYTECAT_MODEL")) ||
          "gpt-5.6-terra"
      : (await getServerEnv("BYTECAT_MODEL")) || "gpt-5.6-luna";
  }
  return mode === "vision"
    ? (await getServerEnv("OPENAI_VISION_MODEL")) ||
        (await getServerEnv("OPENAI_MODEL")) ||
        "gpt-4o-mini"
    : (await getServerEnv("OPENAI_MODEL")) || "gpt-4o-mini";
}

async function getProviderModels(provider: AIProvider, mode: "text" | "vision" = "text") {
  if (provider !== "bytecat") {
    return [await getProviderModel(provider, mode)];
  }

  if (mode === "vision") {
    return uniqueModels([
      await getServerEnv("BYTECAT_VISION_MODEL"),
      ...parseModelList(await getServerEnv("BYTECAT_VISION_FALLBACK_MODELS")),
      ...BYTECAT_DEFAULT_VISION_MODELS,
    ]);
  }

  return uniqueModels([
    await getServerEnv("BYTECAT_MODEL"),
    ...parseModelList(await getServerEnv("BYTECAT_TEXT_FALLBACK_MODELS")),
    ...BYTECAT_DEFAULT_TEXT_MODELS,
  ]);
}

async function getChatTimeoutMs(
  provider: AIProvider,
  mode: "text" | "vision" | undefined,
  requestedTimeoutMs?: number,
  model?: string,
) {
  if (provider !== "bytecat") return requestedTimeoutMs ?? 18_000;

  const timeoutMs =
    parsePositiveInt(
      await getServerEnv(
        mode === "vision" ? "BYTECAT_VISION_TIMEOUT_MS" : "BYTECAT_TEXT_TIMEOUT_MS",
      ),
    ) ??
    requestedTimeoutMs ??
    (mode === "vision" ? 22_000 : 18_000);
  const primaryTimeoutMs = parsePositiveInt(await getServerEnv("BYTECAT_PRIMARY_TIMEOUT_MS"));
  return primaryTimeoutMs && model === (await getProviderModel(provider, mode))
    ? Math.min(primaryTimeoutMs, timeoutMs)
    : timeoutMs;
}

function getObjectRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function dataUrlToGeminiInlineData(url: string) {
  const match = url.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function chatContentToGeminiParts(content: unknown) {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [];

  return content
    .map((part) => {
      if (typeof part === "string") return { text: part };
      const partObject = getObjectRecord(part);
      if (!partObject) return null;

      if (partObject.type === "text" && typeof partObject.text === "string") {
        return { text: partObject.text };
      }

      if (partObject.type === "image_url") {
        const imageUrl =
          typeof partObject.image_url === "string"
            ? partObject.image_url
            : getObjectRecord(partObject.image_url)?.url;
        if (typeof imageUrl !== "string") return null;

        const inlineData = dataUrlToGeminiInlineData(imageUrl);
        if (inlineData) return { inlineData };

        return { fileData: { fileUri: imageUrl, mimeType: "image/jpeg" } };
      }

      return null;
    })
    .filter(
      (
        part,
      ): part is
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
        | { fileData: { fileUri: string; mimeType: string } } => Boolean(part),
    );
}

function chatMessagesToGeminiPayload(
  messages: unknown[],
  options: {
    maxTokens?: number;
    temperature?: number;
  },
) {
  const systemParts: Array<{ text: string }> = [];
  const contents: Array<{
    role: "user" | "model";
    parts: ReturnType<typeof chatContentToGeminiParts>;
  }> = [];

  messages.forEach((message) => {
    const messageObject = getObjectRecord(message);
    if (!messageObject) return;

    const role = typeof messageObject.role === "string" ? messageObject.role : "user";
    const parts = chatContentToGeminiParts(messageObject.content);
    if (!parts.length) return;

    if (role === "system") {
      systemParts.push(...parts.filter((part): part is { text: string } => "text" in part));
      return;
    }

    contents.push({
      role: role === "assistant" ? "model" : "user",
      parts,
    });
  });

  return {
    ...(systemParts.length ? { systemInstruction: { parts: systemParts } } : {}),
    contents: contents.length ? contents : [{ role: "user" as const, parts: [{ text: "" }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.82,
      ...(options.maxTokens ? { maxOutputTokens: options.maxTokens + 1024 } : {}),
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

async function callChatCompletion(
  provider: AIProvider,
  messages: unknown[],
  options: {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    modelMode?: "text" | "vision";
    model?: string;
  } = {},
) {
  const isDeepSeek = provider === "deepseek";
  const isQwen = provider === "qwen";
  const isBytecat = provider === "bytecat";
  const model = options.model ?? (await getProviderModel(provider, options.modelMode));
  const apiKey = isQwen
    ? await getServerEnv("DASHSCOPE_API_KEY")
    : isDeepSeek
      ? await getServerEnv("DEEPSEEK_API_KEY")
      : isBytecat
        ? await getByteCatApiKey(model)
        : await getServerEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error(
      isQwen
        ? "Missing DASHSCOPE_API_KEY"
        : isDeepSeek
          ? "Missing DEEPSEEK_API_KEY"
          : isBytecat
            ? isByteCatGeminiModel(model)
              ? "Missing BYTECAT_GEMINI_API_KEY or BYTECAT_API_KEY"
              : "Missing BYTECAT_API_KEY"
            : "Missing OPENAI_API_KEY",
    );
  }

  const baseUrl = isQwen
    ? (await getServerEnv("DASHSCOPE_BASE_URL")) ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1"
    : isDeepSeek
      ? (await getServerEnv("DEEPSEEK_BASE_URL")) || "https://api.deepseek.com"
      : isBytecat
        ? await getByteCatBaseUrl(model)
        : (await getServerEnv("OPENAI_BASE_URL")) || "https://api.openai.com/v1";
  const timeoutMs = await getChatTimeoutMs(provider, options.modelMode, options.timeoutMs, model);
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const isGeminiGenerateContent = isBytecat && isByteCatGeminiModel(model);
  let res: Response;
  try {
    if (isGeminiGenerateContent) {
      res = await fetch(
        `${baseUrl.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(chatMessagesToGeminiPayload(messages, options)),
        },
      );
    } else {
      res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: options.temperature ?? 0.82,
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
          response_format: { type: "json_object" },
          messages,
        }),
      });
    }

    if (!res.ok) {
      const text = await res.text();
      const label = providerLabel(provider);
      throw new Error(`${label} ${model} error ${res.status}: ${text.slice(0, 300)}`);
    }

    // Keep the deadline active until the entire response body has arrived.
    const json = await res.json();
    const content = isGeminiGenerateContent
      ? extractGeminiText(json)
      : json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error(`${providerLabel(provider)} ${model} returned no answer text`);
    }
    if (!isGeminiGenerateContent && json.choices?.[0]?.finish_reason === "length") {
      throw new Error(`${providerLabel(provider)} ${model} response truncated`);
    }
    console.info(
      `NEKO ${providerLabel(provider)} success model=${model} duration=${Date.now() - startedAt}ms`,
    );
    return content;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${providerLabel(provider)} ${model} timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildVisionContent(provider: AIProvider, prompt: string, imageDataUrl?: string | null) {
  if (provider === "deepseek") return prompt;
  return [
    { type: "text", text: prompt },
    ...(imageDataUrl
      ? [{ type: "image_url", image_url: { url: imageDataUrl, detail: "low" } }]
      : []),
  ];
}

async function callFirstAvailableJson<T>(
  buildMessages: (provider: AIProvider) => unknown[],
  options: {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    modelMode?: "text" | "vision";
    validate?: (parsed: T) => boolean;
  },
): Promise<{ parsed: T; provider: AIProvider; model: string }> {
  const providers = await getAIProviderOrder();
  let lastError: unknown;
  for (const provider of providers) {
    const models = await getProviderModels(provider, options.modelMode);
    for (const model of models) {
      try {
        const raw = await callChatCompletion(provider, buildMessages(provider), {
          ...options,
          model,
        });
        const parsed = extractJson<T>(raw);
        if (!parsed || (options.validate && !options.validate(parsed))) {
          throw new Error(`${providerLabel(provider)} ${model} JSON missing required fields`);
        }
        return { parsed, provider, model };
      } catch (error) {
        lastError = error;
        const hasNextModel = models.indexOf(model) < models.length - 1;
        const hasNextProvider = providers.indexOf(provider) < providers.length - 1;
        console.error(
          `NEKO ${providerLabel(provider)} model=${model} failed, ${
            hasNextModel
              ? "trying next model"
              : hasNextProvider
                ? "trying next provider"
                : "no fallback left"
          }`,
          error,
        );
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI provider failed");
}

function validatePersonaInput(input: unknown): PersonaInput {
  const data = input as PersonaInput;
  if (!data?.profile?.name) throw new Error("missing profile");
  if (data.imageDataUrl && !data.imageDataUrl.startsWith("data:image/"))
    throw new Error("invalid image");
  if (data.imageDataUrl && data.imageDataUrl.length > 8_000_000) throw new Error("image too large");
  return data;
}

function validateVoiceInput(input: unknown): VoiceInput {
  const data = input as VoiceInput;
  if (!data?.profile?.name) throw new Error("missing profile");
  if (data.imageDataUrl && !data.imageDataUrl.startsWith("data:image/"))
    throw new Error("invalid image");
  if (data.imageDataUrl && data.imageDataUrl.length > 8_000_000) throw new Error("image too large");
  return data;
}

export async function generateCatPersonaServer(input: PersonaInput): Promise<CatPersona> {
  const data = validatePersonaInput(input);
  const profileFacts = `猫咪名称：${data.profile.name}；性别：${data.profile.gender}；年龄阶段：${data.profile.ageStage}`;
  const wrongGender = data.profile.gender === "小公猫" ? "小母猫、她、她的" : "小公猫、他、他的";
  const prompt = `你是「喵懂」的猫咪性格观察者。你的任务不是给猫套通用人格模板，也不是只描述照片，而是结合基础资料、照片中真实可见的行为、姿态、表情、视线、身体状态和环境互动，推测这只猫最有辨识度的人格特点。

猫咪基础资料：${JSON.stringify(data.profile)}
硬性资料事实：${profileFacts}
照片状态：${data.imageDataUrl ? "已提供；必须优先依据照片中的可见事实" : "未提供；不得虚构任何视觉细节"}

最终结果要让真正养它的主人觉得“对，就是它”，而不是换一只猫也成立。

请先在内部按以下顺序推理，但不要输出推理过程：
照片事实 → 行为线索 → 性格倾向 → 最有辨识度的人格特点 → 它可能如何看待主人。
禁止先决定 MBTI 再寻找证据。

观察时优先抓住 2–4 个真正有辨识度的细节，例如视线、眼睛和耳朵状态、坐趴姿势、松弛或警觉程度、与物体/环境/主人的位置和互动。不要罗列所有物体，不要只写“安静观察、温柔细腻、有自己的节奏”等空泛判断。每个人格结论都应能回答“为什么”。

如果证据支持，优先提炼“A，但是 B”的真实反差，例如想靠近却保留距离；但绝不能为了反差虚构画面、动作、经历、主人行为或长期习惯。

字段要求：
- type：4–6 个中文字符，有行为模式、反差、社交方式或小脾气，有趣但不幼稚；避免“温柔观察家、安静守护者、好奇探索家、治愈陪伴者”等通用模板。
- mbti：完成人格判断后再选择最接近的趣味标签，格式必须为 XXXX-A 或 XXXX-T；不要把它当科学测量或用刻板印象改写事实。
- matchScore：60–99 的整数，反映现有证据与结论的匹配程度。
- monologue：最重要的分享文案。第一人称，优先 20–35 个中文字，结合具体场景，像这只猫此刻会说的话；允许一点小脾气、小傲娇和幽默，不写 AI 散文、鸡汤或泛宠物文学。
- analysis：50–80 个中文字，必须包含至少一个具体可见细节，再说明它可能意味着什么，并形成一个有辨识度的人格判断；不要堆抽象形容词。
- ownerRole：60–90 个中文字，帮助主人重新理解熟悉的小行为。只有存在主人互动证据时才能作较明确判断；证据不足必须使用“如果平时也经常这样”“它可能”等有限推测，禁止套用“专属管家、安全港湾、背景音”等万能关系文案。
- tags：恰好 6 个短标签，混合 2 个性格、2 个行为模式、1 个反差、1 个有趣人格标签；不要全是正面形容词，不要使用“可爱、萌宠、治愈、快乐”等泛标签。
- traits：恰好 4 项，每项 value 为 0–100 整数。根据本次证据从粘人度、独立性、好奇心、警觉度、社交主动性、观察欲、撒娇度、边界感、探索欲、情绪外露度、主人关注度、行动派程度等维度中动态选择最有区分度的 4 项，禁止固定套用同一组维度或分数。
- observations：2–3 项，每项必须采用“真实可观察事实 → 简短解释”，禁止把推测包装成事实。

输出严格 JSON，不要 Markdown，不要附加说明。字段：
{
  "name": "猫名",
  "type": "4-6个中文字、有辨识度的人格称号",
  "mbti": "四字母加-A或-T的趣味人格类型",
  "matchScore": "60-99的整数，表示现有证据与人格描述的匹配度",
  "monologue": "猫咪第一人称心声",
  "analysis": "基于照片具体细节的人格解析",
  "ownerRole": "它与主人关系的个性化解读",
  "tags": ["标签1", "标签2", "标签3", "标签4", "标签5", "标签6"],
  "traits": [
    {"label":"观察欲","value":88},
    {"label":"边界感","value":72},
    {"label":"主人关注度","value":81},
    {"label":"行动派程度","value":46}
  ],
  "observations": [
    {"label":"具体可见行为1","value":"这个行为可能意味着什么"},
    {"label":"具体可见行为2","value":"这个行为可能意味着什么"}
  ]
}

事实与推测边界：
照片只能证明当下可见行为，不能仅凭一张照片确定长期是否粘人、是否喜欢主人、是否胆小或嫉妒、是否有分离焦虑、是否把主人当妈妈或长期社交习惯。可以人格化推测，但必须明确不确定性。不要做医疗诊断。不要生成 dailyMood。

硬性资料约束：
1. 性别和年龄阶段必须完全遵守用户填写的资料：${profileFacts}。
2. 全文不要出现与资料冲突的表达，例如：${wrongGender}；描述猫咪时优先使用“它”。
3. 不要把${data.profile.gender}写成另一种性别，不要把${data.profile.ageStage}写成其他年龄阶段。
4. type、tags、analysis 和 ownerRole 必须彼此一致，但不能互相重复改写。

【喵懂文风】
具体、自然、有观察力，有一点幽默和温柔，像真正养猫的人会说的话。让主人感觉“AI 好像真的观察了一会儿我的猫”，而不是收到心理测试报告、宠物公众号或营销文案。

避免：
- AI 腔、报告腔、公众号腔、鸡汤、过度文艺、营销热梗；
- 连续堆形容词、大量感叹号和波浪号、“喵～”“人家”“本宝宝”等过度卖萌；
- 强行煽情、恋爱化表达、把单次状态直接等同于永久人格；
- 每只猫都套用相同反差句式。

输出前请在内部自检：
1. 换成另一只猫是否仍成立；若是，请重写得更具体。
2. analysis 是否引用至少一个真实可见细节；若没有，请重写。
3. monologue 是否像猫真的会说的话；若不是，请重写。
4. ownerRole 是否在证据不足时假装确定；若是，请降低确定性。
5. 是否大量使用“温柔、敏感、细腻、陪伴、治愈”等通用词；若是，请换成具体行为。
6. 是否提炼出一个有证据支持的独特特点或反差；若没有，请重新判断。`;
  try {
    const result = await callFirstAvailableJson<CatPersona>(
      (provider) => [
        {
          role: "system",
          content:
            "你是「喵懂」的猫咪性格观察者。先从照片事实提取行为线索，再做克制的人格推测；准确和个体辨识度优先于可爱。严格区分可见事实与推断，不虚构、不做医疗诊断、不使用模板化营销或过度卖萌表达。只返回合法 JSON。",
        },
        { role: "user", content: buildVisionContent(provider, prompt, data.imageDataUrl) },
      ],
      {
        maxTokens: 1000,
        temperature: 0.62,
        modelMode: data.imageDataUrl ? "vision" : "text",
        validate: (parsed) =>
          Boolean(
            parsed.monologue?.trim() &&
              parsed.analysis?.trim() &&
              Array.isArray(parsed.tags) &&
              parsed.tags.length >= 6 &&
              Array.isArray(parsed.traits) &&
              parsed.traits.length >= 4 &&
              Array.isArray(parsed.observations) &&
              parsed.observations.length >= 2,
          ),
      },
    );
    const parsed = result.parsed;
    const normalized = normalizePersonaForProfile(
      {
        name: parsed.name || data.profile.name,
        type: parsed.type || "优雅观察者",
        mbti: parsed.mbti || "INFP-A",
        matchScore: Math.max(60, Math.min(99, Number(parsed.matchScore) || 88)),
        monologue: parsed.monologue || "今天也想悄悄靠近你，陪你待一会。",
        analysis:
          parsed.analysis || `${data.profile.name}会先观察环境，再用停留、靠近和注视表达亲近。`,
        ownerRole: parsed.ownerRole || `你是${data.profile.name}确认世界安全的小坐标。`,
        tags: (Array.isArray(parsed.tags) ? parsed.tags : []).slice(0, 6),
        traits: (Array.isArray(parsed.traits) ? parsed.traits : []).slice(0, 4),
        observations: (Array.isArray(parsed.observations) ? parsed.observations : []).slice(0, 3),
        dailyMood: "",
        savedAt: Date.now(),
      },
      data.profile,
    );
    if (
      normalized.tags.length !== 6 ||
      normalized.traits.length !== 4 ||
      normalized.observations.length < 2
    ) {
      if (await shouldRequireRealAI()) throw new Error("AI persona JSON missing required fields");
      return buildStablePersona(data.profile);
    }
    return normalized;
  } catch (error) {
    console.error("NEKO persona AI failed", error);
    if (await shouldRequireRealAI()) throw new Error(getUserFacingAIMessage("persona", error));
    return buildStablePersona(data.profile);
  }
}

export const generateCatPersona = createServerFn({ method: "POST" })
  .inputValidator(validatePersonaInput)
  .handler(async ({ data }): Promise<CatPersona> => generateCatPersonaServer(data));

export async function generateCatVoiceServer(input: VoiceInput): Promise<Voice> {
  const data = validateVoiceInput(input);
  const prompt = `你是「喵懂」的猫咪心声观察者。你不是在描述照片，也不是给照片配一句通用的可爱宠物文案。

你要从猫咪当前真实可见的动作、表情、视线和环境互动中，找出这一刻最有意思、最有辨识度的一个行为细节，再结合已有的人格档案，推测它正在关注什么、可能想做什么、为什么还没有行动，以及它会如何评价眼前发生的事。

【猫咪资料】
${JSON.stringify(data.profile)}

【已有猫咪人格】
${JSON.stringify(data.persona)}

【用户补充场景】
${data.scene || "无补充场景"}

请先在内部判断，不输出推理过程：
1. 猫正在看什么？身体是在放松、准备行动、观察还是回避？
2. 哪个物体、人或动作最吸引它？
3. 是否存在“想靠近但没靠近、想行动但还在等、表面不在意却一直盯着”等有证据的反差？
4. 当前行为与已有的人格有哪些一致或反差？
优先选择其中最有戏的一个点，不要试图一次解释整张照片。

人格档案只影响它说话的口吻、反应方式、行动节奏和表达亲近的方式。不要机械重复 persona 中“温柔、观察型、慢热”等标签，也不要先套人格再改写照片事实。同样的对象，应让冲动型、观察型、傲娇型猫表现出不同态度。

字段要求：
- text：最重要字段。第一人称猫咪口吻，优先 12–30 个中文字，最多 2 句；必须针对照片中的一个具体对象或行为，口语化，有一点猫的脾气、幽默或反差。写它对眼前事情的态度，不写“我喜欢你、我要陪你、我很开心”等泛泛情感。
- subtext：15–35 个中文字，第三人称或旁白，比 text 克制；揭示表面行为之下的小反差，让主人觉得“它确实经常这样”，不能换句话重复 text。
- analysis：45–70 个中文字。结构必须是“一个具体可见细节 + 这个细节可能意味着什么 + 结合人格的克制推测”。不要复述整张照片，不罗列与行为无关的花、家具或装饰。
- mood：2–6 个中文字，描述当前行为状态，例如观察中、跃跃欲试、假装淡定、正在评估、想玩但端着、警觉围观；禁止只写开心、温柔、治愈、平静等抽象情绪。
- tags：2–3 个短标签，体现“当前行为 × 猫咪人格”，至少一个必须指向这一刻的具体行为；不要使用可爱猫咪、萌宠、治愈等泛标签。

优先寻找有事实支撑的“A，但其实 B”，但不能为了搞笑虚构画面中不存在的动作、人物、情绪事件或长期习惯。照片只能证明可见行为，不能据此确定它喜欢或讨厌谁、嫉妒、想念主人、长期粘人或有心理问题。证据不足时，宁可写一个具体的小心思，也不要上升到深刻情感或医疗判断。

避免固定套用“别看我、我只是、表面其实、你继续我先、不是不只是”等句式。请在内部形成至少 3 个不同角度的候选表达，最终只选最符合当前照片、人格且最不像模板的一条。

【喵懂文风】
聪明、克制、轻幽默、有猫味、具体、有一点小脾气，让主人会心一笑。禁止 AI 腔、看图作文、宠物公众号文案、鸡汤、过度煽情、小红书营销腔、大量“喵～”，以及“绝绝子、谁懂、可爱暴击、治愈一整天”等表达。

严格返回 JSON，不要 Markdown，不要附加说明：
{
  "text": "猫咪第一人称心声",
  "subtext": "它没说出口的小心思",
  "analysis": "基于具体画面细节的AI解读",
  "mood": "当前行为状态",
  "tags": ["标签1", "标签2", "标签3"]
}

输出前在内部自检：
1. text 换成另一只猫是否仍成立；若成立，请重写。
2. text 是否针对照片中的具体行为或物体；若没有，请重写。
3. analysis 是否提供了超越表面描述的新理解；若只是看图作文，请重写。
4. subtext 是否多揭示了一层小心思；若只是重复 text，请重写。
5. tags 是否体现这一刻；若只是通用人格词，请重写。
6. 是否为了温柔牺牲了这只猫的脾气和个性；若是，请重写。`;
  try {
    const result = await callFirstAvailableJson<{
      text?: unknown;
      subtext?: unknown;
      analysis?: unknown;
      share?: unknown;
      mood?: unknown;
      location?: unknown;
      tags?: unknown;
    }>(
      (provider) => [
        {
          role: "system",
          content:
            "你是「喵懂」的猫咪心声观察者。先观察可见行为，再结合既有人格创作具体、有猫味、轻幽默的心声。事实优先，不看图作文、不套模板、不虚构、不做医疗判断。只返回合法 JSON。",
        },
        { role: "user", content: buildVisionContent(provider, prompt, data.imageDataUrl) },
      ],
      {
        maxTokens: 620,
        temperature: 0.62,
        timeoutMs: data.imageDataUrl ? 22_000 : 14_000,
        modelMode: data.imageDataUrl ? "vision" : "text",
        validate: (parsed) => {
          const analysis = getObjectRecord(parsed.analysis);
          return Boolean(
            asText(parsed.text) &&
              (asText(parsed.analysis) || asText(analysis?.observation ?? analysis?.summary)),
          );
        },
      },
    );
    const parsed = result.parsed;
    const voice = normalizeVoiceForProfile(parsed, data.profile, data.imageDataUrl);
    if (
      !voice.text.trim() ||
      typeof voice.analysis === "string" ||
      !voice.analysis?.observation.trim() ||
      !voice.analysis?.personalityInterpretation.trim() ||
      !voice.share?.headline.trim() ||
      !voice.share?.insight.trim() ||
      !voice.share?.tags.length
    ) {
      if (await shouldRequireRealAI()) throw new Error("AI voice JSON missing required fields");
      return buildStableVoice(data.profile, data.imageDataUrl, data.scene);
    }
    return voice;
  } catch (error) {
    console.error("NEKO voice AI failed", error);
    if (await shouldRequireRealAI()) throw new Error(getUserFacingAIMessage("voice", error));
    return buildStableVoice(data.profile, data.imageDataUrl, data.scene);
  }
}

export const generateCatVoice = createServerFn({ method: "POST" })
  .inputValidator(validateVoiceInput)
  .handler(async ({ data }): Promise<Voice> => generateCatVoiceServer(data));
