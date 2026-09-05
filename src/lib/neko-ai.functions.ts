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
      .slice(0, 3),
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
      .filter((observation) => observation.value),
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
    analysis?: unknown;
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
  return {
    time: "刚刚",
    createdAt: Date.now(),
    location: normalizeCatFacts(input.location, profile, "家里") || "家里",
    grad: "linear-gradient(135deg, oklch(0.9 0.06 280), oklch(0.92 0.05 320))",
    tags: (tags.length ? tags : [`💭 ${mood}`, "✨ 小心思"]).slice(0, 3),
    aspect: "3:4",
    text:
      normalizeCatFacts(input.text, profile, `靠近一点嘛，今天也想被你看见。`) ||
      `靠近一点嘛，今天也想被你看见。`,
    media: imageDataUrl ?? undefined,
    mediaType: "photo",
    analysis:
      normalizeCatFacts(
        input.analysis,
        profile,
        `${profile.name}的表情和停留姿态给人一种想被关注、又保持自己节奏的感觉。`,
      ) || `${profile.name}的表情和停留姿态给人一种想被关注、又保持自己节奏的感觉。`,
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
  const analysis = sceneText
    ? `结合你补充的场景，${profile.name}的停留和注视更像是在回应当下互动，而不是单纯发呆。`
    : `${profile.name}是${profile.ageStage}里的${profile.gender}，画面里的停留和注视适合解读为想被关注。`;
  return normalizeVoiceForProfile(
    {
      text,
      analysis,
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

async function callChatCompletion(
  provider: AIProvider,
  messages: unknown[],
  options: {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    modelMode?: "text" | "vision";
  } = {},
) {
  const isDeepSeek = provider === "deepseek";
  const isQwen = provider === "qwen";
  const isBytecat = provider === "bytecat";
  const apiKey = isQwen
    ? await getServerEnv("DASHSCOPE_API_KEY")
    : isDeepSeek
      ? await getServerEnv("DEEPSEEK_API_KEY")
      : isBytecat
        ? await getServerEnv("BYTECAT_API_KEY")
        : await getServerEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error(
      isQwen
        ? "Missing DASHSCOPE_API_KEY"
        : isDeepSeek
          ? "Missing DEEPSEEK_API_KEY"
          : isBytecat
            ? "Missing BYTECAT_API_KEY"
            : "Missing OPENAI_API_KEY",
    );
  }

  const baseUrl = isQwen
    ? (await getServerEnv("DASHSCOPE_BASE_URL")) ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1"
    : isDeepSeek
      ? (await getServerEnv("DEEPSEEK_BASE_URL")) || "https://api.deepseek.com"
      : isBytecat
        ? (await getServerEnv("BYTECAT_BASE_URL")) || "https://www.bytecatcode.org/v1"
        : (await getServerEnv("OPENAI_BASE_URL")) || "https://api.openai.com/v1";
  const model = await getProviderModel(provider, options.modelMode);
  const timeoutMs =
    options.timeoutMs ?? (isBytecat && options.modelMode === "vision" ? 45_000 : 18_000);
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
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
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${providerLabel(provider)} timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const label = providerLabel(provider);
    console.error(`NEKO ${label} error ${res.status}: ${text.slice(0, 500)}`);
    throw new Error(`${label} error ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  console.info(
    `NEKO ${providerLabel(provider)} success model=${model} duration=${Date.now() - startedAt}ms`,
  );
  return json.choices?.[0]?.message?.content ?? "{}";
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
  },
): Promise<{ parsed: T; provider: AIProvider }> {
  const providers = await getAIProviderOrder();
  let lastError: unknown;
  for (const provider of providers) {
    try {
      const raw = await callChatCompletion(provider, buildMessages(provider), options);
      return { parsed: extractJson<T>(raw), provider };
    } catch (error) {
      lastError = error;
      console.error(
        `NEKO ${providerLabel(provider)} failed, ${providers.length > 1 ? "trying next provider" : "no fallback provider"}`,
        error,
      );
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI provider failed");
}

function validatePersonaInput(input: unknown): PersonaInput {
  const data = input as PersonaInput;
  if (!data?.profile?.name) throw new Error("missing profile");
  if (data.imageDataUrl && !data.imageDataUrl.startsWith("data:image/"))
    throw new Error("invalid image");
  if (data.imageDataUrl && data.imageDataUrl.length > 8_000_000)
    throw new Error("image too large");
  return data;
}

function validateVoiceInput(input: unknown): VoiceInput {
  const data = input as VoiceInput;
  if (!data?.profile?.name) throw new Error("missing profile");
  if (data.imageDataUrl && !data.imageDataUrl.startsWith("data:image/"))
    throw new Error("invalid image");
  if (data.imageDataUrl && data.imageDataUrl.length > 8_000_000)
    throw new Error("image too large");
  return data;
}

export async function generateCatPersonaServer(input: PersonaInput): Promise<CatPersona> {
  const data = validatePersonaInput(input);
  const profileFacts = `猫咪名称：${data.profile.name}；性别：${data.profile.gender}；年龄阶段：${data.profile.ageStage}`;
  const wrongGender = data.profile.gender === "小公猫" ? "小母猫、她、她的" : "小公猫、他、他的";
  const prompt = `请为这只猫生成 NEKO.ID 的猫咪人格档案。猫咪资料：${JSON.stringify(data.profile)}。硬性资料事实：${profileFacts}。${data.imageDataUrl ? "用户已上传猫咪正脸照片；当前模型如无法直接读取图片，请主要依据猫咪基础资料进行拟人化创作。" : ""}输出严格 JSON，不要 Markdown。字段：
{
  "name": "猫名",
  "type": "四到六字人格类型",
  "mbti": "类似 INTJ-A 的趣味类型",
  "matchScore": 88,
  "monologue": "第一人称内心独白，温柔、有代入感，40字以内",
  "analysis": "人格解析，80字以内",
  "ownerRole": "它眼中的主人关系，80字以内",
  "tags": ["6个短标签"],
  "traits": [{"label":"粘人度","value":68},{"label":"独立性","value":90},{"label":"好奇心","value":82}],
  "observations": [{"label":"观察依据","value":"一句短值"}],
  "dailyMood": "首页今日情绪，一句话"
}
硬性要求：
1. 性别和年龄阶段必须完全遵守用户填写的资料：${profileFacts}。
2. 全文不要出现与资料冲突的表达，例如：${wrongGender}；描述猫咪时优先使用“它”。
3. 不要把${data.profile.gender}写成另一种性别，不要把${data.profile.ageStage}写成其他年龄阶段。
4. 基于行为学线索 + 拟人化创作，不做医疗诊断。语言适合小红书分享。`;
  try {
    const result = await callFirstAvailableJson<CatPersona>(
      (provider) => [
        {
          role: "system",
          content:
            "你是 NEKO.ID 的猫咪人格设计师，擅长把猫咪照片和主人描述转化为温柔、有记忆感、可分享的人格档案。只返回 JSON。",
        },
        { role: "user", content: buildVisionContent(provider, prompt, data.imageDataUrl) },
      ],
      { maxTokens: 720, temperature: 0.58, modelMode: data.imageDataUrl ? "vision" : "text" },
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
        traits: (Array.isArray(parsed.traits) ? parsed.traits : []).slice(0, 3),
        observations: (Array.isArray(parsed.observations) ? parsed.observations : []).slice(0, 4),
        dailyMood: parsed.dailyMood || "今天好像有点想你",
        savedAt: Date.now(),
      },
      data.profile,
    );
    if (
      !normalized.tags.length ||
      normalized.traits.length < 3 ||
      !normalized.observations.length
    ) {
      if (await shouldRequireRealAI()) throw new Error("AI persona JSON missing required fields");
      return buildStablePersona(data.profile);
    }
    return normalized;
  } catch (error) {
    console.error("NEKO persona AI failed", error);
    if (await shouldRequireRealAI())
      throw new Error(getUserFacingAIMessage("persona", error));
    return buildStablePersona(data.profile);
  }
}

export const generateCatPersona = createServerFn({ method: "POST" })
  .inputValidator(validatePersonaInput)
  .handler(async ({ data }): Promise<CatPersona> => generateCatPersonaServer(data));

export async function generateCatVoiceServer(input: VoiceInput): Promise<Voice> {
  const data = validateVoiceInput(input);
  const prompt = `请基于用户上传的猫咪照片，为 NEKO.ID 生成一条真实、有画面依据的“猫咪心声”。猫咪资料：${JSON.stringify(data.profile)}。人格档案：${JSON.stringify(data.persona)}。用户补充场景：${data.scene || "无"}。
你必须先观察图片里的猫咪姿态、表情、视线、周围物品/环境，再生成内容。不要写泛泛的“等待心声”“AI会结合照片”等占位文案。不要机械复述用户补充场景，不要出现“给它新买了…”这种主人视角陈述；气泡文案必须像猫咪自己短短说出的小心思。
输出严格 JSON：
{
  "text": "猫咪第一人称心声，1-2句，32字以内；要自然、机灵、温柔，像猫在说话；必须贴合画面中的具体动作/表情/环境",
  "analysis": "AI心声解析，70字以内；说明你从照片哪些可见细节推断出这段心声",
  "mood": "情绪短语",
  "location": "地点短语",
  "tags": ["2-3个带 emoji 的标签"]
}
要求：温柔、拟人化、适合小红书卡片；只做情绪陪伴和行为想象，不做医疗诊断；只返回 JSON。`;
  try {
    const result = await callFirstAvailableJson<{
      text?: unknown;
      analysis?: unknown;
      mood?: unknown;
      location?: unknown;
      tags?: unknown;
    }>(
      (provider) => [
        {
          role: "system",
          content:
            "你是猫咪心声翻译官和宠物照片观察员。必须基于图片可见信息生成猫咪第一人称心声，并给出简短 AI 解析。只返回 JSON。",
        },
        { role: "user", content: buildVisionContent(provider, prompt, data.imageDataUrl) },
      ],
      {
        maxTokens: 320,
        temperature: 0.5,
        timeoutMs: data.imageDataUrl ? 45_000 : 14_000,
        modelMode: data.imageDataUrl ? "vision" : "text",
      },
    );
    const parsed = result.parsed;
    const voice = normalizeVoiceForProfile(parsed, data.profile, data.imageDataUrl);
    if (!voice.text.trim() || !voice.analysis?.trim()) {
      if (await shouldRequireRealAI()) throw new Error("AI voice JSON missing required fields");
      return buildStableVoice(data.profile, data.imageDataUrl, data.scene);
    }
    return voice;
  } catch (error) {
    console.error("NEKO voice AI failed", error);
    if (await shouldRequireRealAI())
      throw new Error(getUserFacingAIMessage("voice", error));
    return buildStableVoice(data.profile, data.imageDataUrl, data.scene);
  }
}

export const generateCatVoice = createServerFn({ method: "POST" })
  .inputValidator(validateVoiceInput)
  .handler(async ({ data }): Promise<Voice> => generateCatVoiceServer(data));
