import { createServerFn } from "@tanstack/react-start";
import type { CatPersona, CatProfile, JsonValue } from "@/components/neko/catProfileStore";
import type { Voice } from "@/components/neko/app/voicesStore";
import { buildBehaviorProfile, buildCombinationInsights } from "@/lib/neko-behavior-profile";

export type PersonaInput = {
  profile: CatProfile;
  imageDataUrl?: string | null;
  videoObservations?: CatVideoObservation[] | null;
  previousPersona?: CatPersona | null;
};

export type VoiceInput = {
  profile: CatProfile;
  persona: CatPersona | null;
  imageDataUrl?: string | null;
  scene?: string;
};

export type CatVideoFrameInput = {
  imageDataUrl: string;
  timestampLabel: string;
  position: "start" | "middle" | "end";
};

export type CatVideoObservation = {
  clipId?: string;
  label?: string;
  duration?: string;
  containsCat: boolean;
  summary: string;
  movement: string;
  behaviorSignals: string[];
  personalityEvidence: Array<{ fact: string; interpretation: string }>;
  confidence: "low" | "medium" | "high";
};

export type VideoAnalysisInput = {
  profile: CatProfile;
  clipId?: string;
  label?: string;
  duration?: string;
  frames: CatVideoFrameInput[];
};

type PersonaInsightValue = string | { title?: unknown; text?: unknown };
type PersonaAIResponse = Omit<CatPersona, "misunderstanding" | "loveLanguage" | "ownerRole"> & {
  misunderstanding?: PersonaInsightValue;
  loveLanguage?: PersonaInsightValue;
  ownerRole?: PersonaInsightValue;
  evidence?: Array<{ fact?: unknown; interpretation?: unknown }>;
};

export const PERSONA_PROMPT_VERSIONS = {
  stage1: "persona_stage1_v2",
  stage2: "persona_stage2_v1",
  stage3: "persona_stage3_v2",
} as const;

type PersonaPromptStage = keyof typeof PERSONA_PROMPT_VERSIONS;

export type PersonaBehaviorProfile = {
  sociability: number;
  curiosity: number;
  caution: number;
  attachmentExpression: number;
  independence: number;
  boundary: number;
  environmentalSensitivity: number;
  interactionPreference: number;
};

export type PersonaCoreTrait = {
  trait: string;
  description: string;
  supportedBy: string[];
  confidence: number;
};

export type PersonaUnsupportedClaim = {
  claim: string;
  reason: string;
  source?: string;
};

export type PersonaStage1Output = {
  behaviorProfile: PersonaBehaviorProfile;
  coreTraits: PersonaCoreTrait[];
  unsupportedClaims: PersonaUnsupportedClaim[];
};

export type PersonaGroundedInsight = {
  claim: string;
  explanation: string;
  supportedBy: string[];
  confidence: number;
};

export type PersonaStage2Output = {
  misunderstanding: PersonaGroundedInsight;
  affection: PersonaGroundedInsight;
  ownerRelationship: PersonaGroundedInsight;
};

export type PersonaStage3Output = {
  personaTitle: string;
  mbti: string;
  summary: string;
  monologue: string;
  tags: string[];
  insights: {
    misunderstanding: string;
    affection: string;
    ownerRelationship: string;
  };
  matchScore?: number;
  traits?: Array<{ label: string; value: number }>;
};

export type PersonaEvalResult = {
  scores: {
    comprehensibility: number;
    factualAccuracy: number;
    personalization: number;
    insightValue: number;
    shareability: number;
  };
  total: number;
  passed: boolean;
  fatalRules: Array<{ id: string; passed: boolean; detail?: string }>;
  warnings: string[];
  consistency?: PersonaDriftCheckResult;
};

export type PersonaDriftCheckResult = {
  hasPrevious: boolean;
  previousHasRawInputs: boolean;
  anchored: boolean;
  action: "keep_current" | "anchor_previous";
  reason: string;
  quizChanges: number | null;
  behaviorAverageDifference: number | null;
  coreTraitSimilarity: number;
  personaTitleSimilarity: number;
  tagOverlap: number;
  insightConsistency: number;
  mbtiStable: boolean;
  strongNewEvidence: boolean;
  warnings: string[];
};

type PersonaStageLog = {
  stage: PersonaPromptStage;
  promptVersion: string;
  model: string;
  provider: string;
  latencyMs: number;
  tokenUsage: null;
  retryCount: number;
  ok: boolean;
  error?: string;
  output: unknown;
};

type PersonaPipelineDebug = NonNullable<CatPersona["generation"]>;

type AIProvider = "openai" | "qwen" | "deepseek" | "bytecat";

let workerEnv: Record<string, string | undefined> | null = null;
let envFileCache: Record<string, string> | null | undefined;

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));
  if (typeof value === "object") {
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined || typeof item === "function" || typeof item === "symbol") continue;
      output[key] = toJsonValue(item);
    }
    return output;
  }
  return null;
}

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

async function shouldDebugAIPrompts() {
  const value = (await getServerEnv("NEKO_AI_DEBUG_PROMPTS"))?.toLowerCase().trim();
  return value === "1" || value === "true" || value === "yes";
}

async function shouldExposePersonaDebug() {
  const explicit = (await getServerEnv("NEKO_PERSONA_DEBUG"))?.toLowerCase().trim();
  if (explicit) return explicit === "1" || explicit === "true" || explicit === "yes";
  return (await getServerEnv("NODE_ENV")) === "development";
}

function createGenerationId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `persona-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function hashInput(value: unknown) {
  const source = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function redactAIDebugValue(value: unknown): unknown {
  if (typeof value === "string") {
    const dataUrlMatch = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,/);
    if (dataUrlMatch) {
      return `data:${dataUrlMatch[1]};base64,<redacted ${value.length} chars>`;
    }
    return value;
  }

  if (Array.isArray(value)) return value.map((item) => redactAIDebugValue(item));

  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      /authorization|api[-_]?key/i.test(key) ? "<redacted>" : redactAIDebugValue(entry),
    ]),
  );
}

async function logAIPromptDebug({
  provider,
  model,
  modelMode,
  transport,
  messages,
}: {
  provider: AIProvider;
  model: string;
  modelMode?: "text" | "vision";
  transport: "chat.completions" | "gemini.generateContent";
  messages: unknown[];
}) {
  if (!(await shouldDebugAIPrompts())) return;

  console.info(
    "NEKO AI prompt debug",
    JSON.stringify(
      {
        provider: providerLabel(provider),
        model,
        modelMode: modelMode ?? "text",
        transport,
        messages: redactAIDebugValue(messages),
      },
      null,
      2,
    ),
  );
}

async function logAIDebugEvent(stage: string, details: Record<string, unknown>) {
  if (!(await shouldDebugAIPrompts())) return;

  console.info(`NEKO AI ${stage} debug`, JSON.stringify(redactAIDebugValue(details), null, 2));
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

function personaInsightText(value: PersonaInsightValue | undefined, fallback = "") {
  if (typeof value === "string") return value.trim() || fallback;
  return asText(value?.text, fallback);
}

function charLength(value: string) {
  return Array.from(value).length;
}

function limitChars(value: string, max: number) {
  return Array.from(value).slice(0, max).join("");
}

const plainCopyReplacements: Array<[RegExp, string]> = [
  [/仪式感极强的眼神(?:催促|施压)者/g, "会用眼神叫你"],
  [/眼神(?:催促|施压)/g, "用眼神提醒你"],
  [/仪式感/g, "固定习惯"],
  [/施压/g, "提醒"],
  [/端庄地?定点/g, "安静坐着等你"],
  [/克制讨关注/g, "安静等你发现"],
  [/稳态陪伴/g, "喜欢待在附近"],
  [/稳态/g, "安静"],
  [/节奏掌控|掌控节奏/g, "按自己的想法来"],
  [/秩序感/g, "固定习惯"],
  [/高度敏锐/g, "很会观察动静"],
  [/敏锐/g, "很会观察"],
  [/策略性地?靠近/g, "先观察再靠近"],
  [/策略性/g, "先试探一下"],
  [/精准地?表达/g, "表达得很清楚"],
  [/低频高质互动/g, "不常主动，但会认真回应"],
  [/低频高质/g, "次数不多但会回应"],
  [/视线必经的动线/g, "你看得见的地方"],
  [/直球眼神确认你的注意力/g, "用眼神等你注意到它"],
  [/端正坐好/g, "安静坐着"],
];

const jargonLabelPatterns = [
  /仪式感/,
  /施压/,
  /掌控/,
  /秩序感/,
  /克制讨关注/,
  /高度敏锐|敏锐/,
  /策略性|策略/,
  /精准/,
  /端庄定点|定点/,
  /稳态/,
  /低频|高质/,
  /动线/,
  /节奏/,
  /催促者/,
  /观察家|守护者|陪伴者/,
  /小小?探长|小小?侦探|观察员/,
];

const readableLabelReplacements: Array<[RegExp, string]> = [
  [/眼神.*(?:催促|施压|提醒|表达|叫)/, "会用眼神表达"],
  [/视线|看得见|动线/, "待在你看得见的地方"],
  [/端庄|定点|端正坐好/, "安静坐着等你"],
  [/克制.*关注|讨关注/, "安静等你发现"],
  [/稳态.*陪伴|稳态/, "喜欢待在附近"],
  [/低频|高质/, "不常主动但会回应"],
  [/策略性.*靠近|先确认.*靠近/, "先观察再靠近"],
  [/高度敏锐|敏锐/, "很会观察动静"],
  [/掌控|节奏/, "按自己想法来"],
  [/观察优先/, "先观察再靠近"],
  [/保留距离/, "不急着靠近"],
  [/心动不动/, "想靠近又犹豫"],
  [/小小?探长|小小?侦探/, "会先看清楚"],
  [/观察员/, "先观察再回应"],
  [/关注镜头/, "看着镜头"],
  [/暂不靠近/, "先不靠近"],
];

const readablePersonaTypeReplacements: Array<[RegExp, string]> = [
  [/^亲近有边界$/, "边界感亲近派"],
  [/^好奇但谨慎$/, "好奇谨慎型"],
  [/^热情有分寸$/, "热情有分寸型"],
  [/^不黏但在旁$/, "不黏人陪伴型"],
  [/^先观察再靠近$/, "慢热观察型"],
  [/^会先看清楚$/, "先看再行动"],
  [/^先看再动$/, "先看再行动"],
  [/仪式感极强的眼神(?:催促|施压)者/, "会用眼神表达"],
  [/小小?探长|小小?侦探/, "先看再行动"],
];

function simplifyNekoCopy(text: string) {
  return plainCopyReplacements
    .reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), text)
    .replace(/\s+/g, " ")
    .trim();
}

function hasJargonLabel(value: string) {
  return jargonLabelPatterns.some((pattern) => pattern.test(value));
}

function readableLabelReplacement(value: string) {
  return readableLabelReplacements.find(([pattern]) => pattern.test(value))?.[1] ?? "";
}

function cleanLabelText(value: string) {
  return value
    .replace(/^#+/, "")
    .replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "")
    .trim();
}

function normalizeNaturalLabel(value: unknown, profile: CatProfile, max = 10) {
  const copied = simplifyNekoCopy(normalizeCatFacts(value, profile));
  const replaced = readableLabelReplacement(copied) || copied;
  const cleaned = cleanLabelText(readableLabelReplacement(replaced) || replaced);
  const natural = readableLabelReplacement(cleaned) || cleaned;
  if (!natural || hasJargonLabel(natural)) return "";
  return limitChars(natural, max);
}

function uniqueNaturalLabels(values: unknown[], profile: CatProfile, max = 10) {
  return values
    .map((value) => normalizeNaturalLabel(value, profile, max))
    .filter((value, index, list) => charLength(value) >= 2 && list.indexOf(value) === index);
}

function personaTypeReplacement(value: string) {
  const match = readablePersonaTypeReplacements.find(([pattern]) => pattern.test(value));
  return match ? match[1] : "";
}

function normalizePersonaType(value: unknown, profile: CatProfile, fallback = "先观察再靠近") {
  const copied = simplifyNekoCopy(normalizeCatFacts(value, profile, fallback));
  const replaced = personaTypeReplacement(copied) || readableLabelReplacement(copied) || copied;
  const cleaned = cleanLabelText(replaced);
  const type = personaTypeReplacement(cleaned) || readableLabelReplacement(cleaned) || cleaned;
  return isSpecificPersonaType(type) ? type : fallback;
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
  return simplifyNekoCopy(next);
}

function boundedCopy(value: string, fallback: string, min: number, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const selected = charLength(normalized) >= min ? normalized : fallback;
  return limitChars(selected, max);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function clampScore(value: unknown, fallback = 50) {
  return Math.round(clampNumber(value, 0, 100, fallback));
}

function clampConfidence(value: unknown, fallback = 0.65) {
  return Math.round(clampNumber(value, 0, 1, fallback) * 100) / 100;
}

function normalizeConfidence(value: unknown): CatVideoObservation["confidence"] {
  const text = asText(value).toLowerCase();
  if (text === "high" || text === "高") return "high";
  if (text === "low" || text === "低") return "low";
  return "medium";
}

function normalizeVideoLabels(values: unknown[], profile: CatProfile, fallback: string[]) {
  const labels = values
    .map((value) => cleanLabelText(simplifyNekoCopy(normalizeCatFacts(value, profile))))
    .filter((value, index, list) => charLength(value) >= 2 && list.indexOf(value) === index)
    .slice(0, 4);
  return labels.length >= 2 ? labels : fallback;
}

function normalizeVideoEvidence(
  values: unknown,
  profile: CatProfile,
  fallback: Array<{ fact: string; interpretation: string }>,
) {
  if (!Array.isArray(values)) return fallback;
  const evidence = values
    .map((item) => {
      const raw = getObjectRecord(item);
      return {
        fact: normalizeCatFacts(raw?.fact, profile),
        interpretation: normalizeCatFacts(raw?.interpretation, profile),
      };
    })
    .filter((item) => item.fact && item.interpretation)
    .slice(0, 3);
  return evidence.length ? evidence : fallback;
}

function normalizeVideoObservation(
  input: unknown,
  profile: CatProfile,
  meta: Pick<VideoAnalysisInput, "clipId" | "label" | "duration"> = {},
): CatVideoObservation {
  const raw = getObjectRecord(input) ?? {};
  const label = limitChars(asText(raw.label, meta.label ?? ""), 24);
  const duration = limitChars(asText(raw.duration, meta.duration ?? ""), 12);
  const fallbackFact = label
    ? `${label}这段视频提供了额外的日常动作线索。`
    : `${profile.name}的视频提供了额外的日常动作线索。`;
  const fallbackEvidence = [
    {
      fact: fallbackFact,
      interpretation: "视频线索适合辅助判断当下行为，不单独决定长期性格。",
    },
  ];
  const containsCat =
    typeof raw.containsCat === "boolean"
      ? raw.containsCat
      : typeof raw.hasCat === "boolean"
        ? raw.hasCat
        : true;
  const summary = boundedCopy(
    normalizeCatFacts(raw.summary ?? raw.observation, profile, fallbackFact),
    fallbackFact,
    8,
    90,
  );
  const movement = boundedCopy(
    normalizeCatFacts(raw.movement, profile, "这段视频里的动作变化不大，更适合作为辅助线索。"),
    "这段视频里的动作变化不大，更适合作为辅助线索。",
    6,
    80,
  );
  const behaviorSignals = normalizeVideoLabels(
    Array.isArray(raw.behaviorSignals)
      ? raw.behaviorSignals
      : Array.isArray(raw.tags)
        ? raw.tags
        : [],
    profile,
    ["观察中", "动作线索"],
  );
  return {
    clipId: limitChars(asText(raw.clipId, meta.clipId ?? ""), 64) || undefined,
    label: label || undefined,
    duration: duration || undefined,
    containsCat,
    summary,
    movement,
    behaviorSignals,
    personalityEvidence: normalizeVideoEvidence(
      raw.personalityEvidence ?? raw.evidence,
      profile,
      fallbackEvidence,
    ),
    confidence: normalizeConfidence(raw.confidence),
  };
}

function normalizeVideoObservationsInput(value: unknown, profile: CatProfile) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 3)
    .map((item) => normalizeVideoObservation(item, profile))
    .filter((item) => item.containsCat && (item.summary || item.personalityEvidence.length));
}

function normalizePersonaForProfile(persona: CatPersona, profile: CatProfile): CatPersona {
  const parsedTags = Array.isArray(persona.tags) ? persona.tags : [];
  const parsedTraits = Array.isArray(persona.traits) ? persona.traits : [];
  const parsedObservations = Array.isArray(persona.observations) ? persona.observations : [];
  const normalizedTags = uniqueNaturalLabels(parsedTags, profile);
  return {
    ...persona,
    name: profile.name || persona.name,
    type: normalizePersonaType(persona.type, profile),
    mbti: normalizeCatFacts(persona.mbti, profile) || persona.mbti,
    monologue: normalizeCatFacts(persona.monologue, profile),
    analysis: normalizeCatFacts(persona.analysis, profile),
    corePersonality: normalizeCatFacts(persona.corePersonality, profile),
    misunderstanding: normalizeCatFacts(persona.misunderstanding, profile),
    loveLanguage: normalizeCatFacts(persona.loveLanguage, profile),
    loveLanguageInsight: normalizeCatFacts(persona.loveLanguageInsight, profile),
    ownerRole: normalizeCatFacts(persona.ownerRole, profile),
    ownerRelationship: normalizeCatFacts(persona.ownerRelationship, profile),
    dailyMood: normalizeCatFacts(persona.dailyMood, profile),
    tags: normalizedTags,
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
    evidence: (Array.isArray(persona.evidence) ? persona.evidence : [])
      .map((item) => ({
        fact: normalizeCatFacts(item?.fact, profile),
        interpretation: normalizeCatFacts(item?.interpretation, profile),
      }))
      .filter((item) => item.fact && item.interpretation)
      .slice(0, 4),
  };
}

const genericPersonaTypePatterns = [
  /精致定格派/,
  /柔光守护者/,
  /梦境观察家/,
  /月光陪伴者/,
  /治愈观察者/,
  /仪式感/,
  /眼神(?:催促|施压)/,
  /端庄定点/,
  /克制讨关注/,
  /稳态陪伴/,
  /低频高质/,
  /^(?:温柔|安静|优雅|梦幻|治愈)(?:观察家|守护者|陪伴者|探索家)$/,
];

const forbiddenPersonaLanguage = [
  /[\u4e00-\u9fff]{1,8}(?:控|王|机)$/,
  /营业/,
  /控场/,
  /发令/,
  /施压/,
  /稳态/,
  /高质互动/,
  /策略性靠近/,
];

function usesForbiddenPersonaLanguage(value: unknown) {
  if (typeof value !== "string") return true;
  const text = value.trim();
  return !text || forbiddenPersonaLanguage.some((pattern) => pattern.test(text));
}

function isNaturalPersonaTag(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const tag = value.replace(/^#+/, "").trim();
  const length = Array.from(tag).length;
  return length >= 4 && length <= 8 && !usesForbiddenPersonaLanguage(tag);
}

function isSpecificPersonaType(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const type = cleanLabelText(simplifyNekoCopy(value));
  const length = charLength(type);
  return (
    length >= 4 &&
    length <= 14 &&
    !hasJargonLabel(type) &&
    !usesForbiddenPersonaLanguage(type) &&
    !genericPersonaTypePatterns.some((pattern) => pattern.test(type))
  );
}

function buildStablePersona(profile: CatProfile): CatPersona {
  const behavior = buildBehaviorProfile(profile.quiz);
  if (behavior.answeredCount === 0) {
    return normalizePersonaForProfile(
      {
        name: profile.name,
        type: "还要多看看",
        mbti: "INFP-A",
        matchScore: 60,
        monologue: "先别急着定义我，再陪我多过几天日常吧。",
        analysis:
          "目前缺少日常行为答案，暂时不能确定它是否黏人、边界感如何，或习惯怎样表达亲近。继续记录后，判断会更贴近它。",
        corePersonality: "现在知道得还不够多，先别急着给它下结论。",
        misunderstanding:
          "现在还缺少日常里的具体表现，暂时不能判断你有没有误会它。多记录几次它靠近、躲开、叫你或看着你的情况，会更准。",
        loveLanguage: "现有信息不足以判断它偏好贴贴、玩耍还是安静共处。",
        loveLanguageInsight: "现有信息不足以判断它偏好贴贴、玩耍还是安静共处。",
        ownerRole:
          "目前还不能确定你在它心里是什么位置，只能先确认：你正在认真观察它，也在慢慢了解它。",
        ownerRelationship:
          "目前还不能确定你在它心里是什么位置，只能先确认：你正在认真观察它，也在慢慢了解它。",
        tags: ["还需要多观察", "日常线索不够", "先不急着判断", "继续认识它"],
        traits: [],
        observations: [],
        evidence: [],
        dailyMood: "",
        savedAt: Date.now(),
      },
      profile,
    );
  }
  const ageTone: Record<
    CatProfile["ageStage"],
    { type: string; mbti: string; mood: string; tags: string[]; traits: CatPersona["traits"] }
  > = {
    幼猫: {
      type: "先冲再研究",
      mbti: "ENFP-A",
      mood: "今天也想探索新角落",
      tags: ["主动探索", "喜欢追着玩", "需要多陪玩", "累了就靠近"],
      traits: [
        { label: "粘人度", value: 82 },
        { label: "探索欲", value: 90 },
        { label: "撒娇度", value: 76 },
        { label: "行动派程度", value: 84 },
      ],
    },
    青年猫: {
      type: "先看再行动",
      mbti: "INFP-A",
      mood: "安静又温暖，适合窝在你身边",
      tags: ["先观察再靠近", "喜欢自己决定", "熟了会更黏", "边界感强"],
      traits: [
        { label: "粘人度", value: 72 },
        { label: "独立性", value: 84 },
        { label: "好奇心", value: 88 },
        { label: "边界感", value: 70 },
      ],
    },
    成熟猫: {
      type: "安静陪伴型",
      mbti: "ISFJ-A",
      mood: "今天想安稳地陪你一会",
      tags: ["喜欢待在附近", "不爱强抱", "会用眼神表达", "亲近有分寸"],
      traits: [
        { label: "粘人度", value: 76 },
        { label: "观察欲", value: 82 },
        { label: "边界感", value: 74 },
        { label: "情绪外露度", value: 58 },
      ],
    },
    资深猫: {
      type: "慢节奏陪伴型",
      mbti: "INFJ-A",
      mood: "慢慢看着你，就是它的温柔",
      tags: ["喜欢熟悉位置", "慢慢靠近", "不爱被催", "安静待在身边"],
      traits: [
        { label: "粘人度", value: 70 },
        { label: "观察欲", value: 86 },
        { label: "边界感", value: 80 },
        { label: "行动派程度", value: 46 },
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
      analysis: `${profile.name}通常会先看看周围，再决定要不要靠近。它不一定会大声叫你，但会用停留、靠近或看着你来表达。`,
      corePersonality:
        profile.quiz && Object.values(profile.quiz).some(Boolean)
          ? tone.type
          : "资料还不够多，它的长期性格需要更多日常线索。",
      misunderstanding: `它不是对周围没兴趣，只是更习惯先把情况看明白。平时坐着不动时，也可能早已把注意力放在眼前，只是在等自己认可的时机。`,
      loveLanguage: `如果它平时也常待在你附近却不紧贴，它可能更习惯用关注你的动向、共享同一片空间来表达亲近。`,
      loveLanguageInsight: `如果它平时也常待在你附近却不紧贴，它可能更习惯用关注你的动向、共享同一片空间来表达亲近。`,
      ownerRole: `你可能不是它时时刻刻都要黏着的人，但很可能是它抬头会找的人。只要你在附近，它就更容易放松下来。`,
      ownerRelationship: `你可能不是它时时刻刻都要黏着的人，但很可能是它抬头会找的人。只要你在附近，它就更容易放松下来。`,
      tags: tone.tags,
      traits: tone.traits,
      observations: [
        { label: "行为倾向", value: "先观察，再靠近" },
        { label: "情绪表达", value: "通过停留和注视传递亲近" },
        { label: "亲密关系", value: "需要安全感，也保留自己的小主见" },
        { label: "年龄阶段", value: `${profile.ageStage}特征更明显` },
      ],
      evidence: [],
      dailyMood: tone.mood,
      savedAt: Date.now(),
    },
    profile,
  );
}

const highRiskCopyPatterns = [
  /营业/,
  /控场/,
  /发令/,
  /施压/,
  /稳态/,
  /策略性/,
  /高质/,
  /仪式感极强/,
  /端庄定点/,
  /克制讨关注/,
  /精准互动/,
  /节奏掌控|掌控节奏/,
];

const highRiskLabelPatterns = [...highRiskCopyPatterns, /[\p{Script=Han}A-Za-z0-9]{1,8}[控王机]$/u];

const fatalUnsupportedClaimPatterns = [
  /固定时间/,
  /固定路线/,
  /每天(?:都|按|准时|固定)?/,
  /按点/,
  /准时出现/,
  /生活秩序严格/,
  /经常守在.*固定/,
  /主人不在时.*(?:一定|总会|总是)/,
  /长期每天/,
  /巡查|巡逻|巡视路线/,
];

const genericPersonaWords = ["温柔", "治愈", "可爱", "快乐", "陪伴", "守护", "观察者"];

function getQuizSignal(profile: CatProfile, index: number) {
  const answer = profile.quiz?.[index];
  return answer === "a" || answer === "b" || answer === "c"
    ? `Q${index + 1}:${answer.toUpperCase()}`
    : null;
}

function uniqueSignals(values: Array<string | null | undefined>) {
  return values.filter(
    (value, index, list): value is string => Boolean(value) && list.indexOf(value) === index,
  );
}

function toPersonaBehaviorProfile(profile: CatProfile): PersonaBehaviorProfile {
  const behavior = buildBehaviorProfile(profile.quiz);
  const score = (value: number | null | undefined, fallback = 50) =>
    value === null || value === undefined ? fallback : value;
  const attachment = score(behavior.attachment);
  const expressiveness = score(behavior.expressiveness);
  const boundary = score(behavior.boundary);
  const sociability = score(behavior.sociability);
  const curiosity = score(behavior.curiosity);
  const caution = score(behavior.vigilance);
  return {
    sociability,
    curiosity,
    caution,
    attachmentExpression: Math.round((attachment + expressiveness) / 2),
    independence: Math.round((100 - attachment + boundary) / 2),
    boundary,
    environmentalSensitivity: Math.round((caution + boundary) / 2),
    interactionPreference: Math.round((sociability + expressiveness + attachment) / 3),
  };
}

function addTraitIfSupported(
  traits: PersonaCoreTrait[],
  trait: Omit<PersonaCoreTrait, "supportedBy"> & {
    supportedBy: Array<string | null | undefined>;
  },
) {
  const supportedBy = uniqueSignals(trait.supportedBy);
  if (supportedBy.length < 2) return;
  traits.push({
    trait: trait.trait,
    description: trait.description,
    supportedBy,
    confidence: clampConfidence(trait.confidence, 0.68),
  });
}

function identifyUnsupportedClaimsInText(text: string): PersonaUnsupportedClaim[] {
  return fatalUnsupportedClaimPatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => ({
      claim: pattern.source,
      reason: "包含没有明确输入时禁止生成的长期频率或固定习惯结论",
      source: "rule",
    }));
}

function buildStableStage1(data: PersonaInput): PersonaStage1Output {
  const profile = data.profile;
  const behavior = buildBehaviorProfile(profile.quiz);
  const behaviorProfile = toPersonaBehaviorProfile(profile);
  const traits: PersonaCoreTrait[] = [];

  addTraitIfSupported(traits, {
    trait: "主动亲近",
    description: "它会主动靠近熟悉的人，但不代表愿意一直被抱着。",
    supportedBy: [getQuizSignal(profile, 2), getQuizSignal(profile, 3), getQuizSignal(profile, 6)],
    confidence: behaviorProfile.attachmentExpression >= 64 ? 0.82 : 0.62,
  });

  addTraitIfSupported(traits, {
    trait: "亲近但有边界",
    description: "它在意和人的关系，同时希望自己决定靠近和接触的距离。",
    supportedBy: [getQuizSignal(profile, 5), getQuizSignal(profile, 6), getQuizSignal(profile, 7)],
    confidence: behaviorProfile.boundary >= 60 ? 0.84 : 0.64,
  });

  addTraitIfSupported(traits, {
    trait: "好奇但谨慎",
    description: "它对新东西有兴趣，但通常会先确认安全再靠近。",
    supportedBy: [getQuizSignal(profile, 1), getQuizSignal(profile, 4), getQuizSignal(profile, 7)],
    confidence: behaviorProfile.curiosity >= 60 && behaviorProfile.caution >= 60 ? 0.86 : 0.66,
  });

  addTraitIfSupported(traits, {
    trait: "安静表达亲近",
    description: "它可能很在意主人，但表达方式偏安静，不一定会大声索取关注。",
    supportedBy: [getQuizSignal(profile, 2), getQuizSignal(profile, 3), getQuizSignal(profile, 6)],
    confidence:
      (behavior.attachment ?? 50) >= 60 && (behavior.expressiveness ?? 50) <= 46 ? 0.82 : 0.63,
  });

  addTraitIfSupported(traits, {
    trait: "先观察再行动",
    description: "遇到变化或互动时，它更习惯先看清楚，再决定下一步。",
    supportedBy: [getQuizSignal(profile, 1), getQuizSignal(profile, 4), getQuizSignal(profile, 5)],
    confidence: behaviorProfile.environmentalSensitivity >= 60 ? 0.8 : 0.62,
  });

  for (const observation of data.videoObservations ?? []) {
    const fact = observation.personalityEvidence[0]?.fact || observation.summary;
    if (!fact) continue;
    addTraitIfSupported(traits, {
      trait: "视频里也会先观察",
      description: "视频线索显示它会把注意力放在目标上，再慢慢决定动作。",
      supportedBy: [
        `video:${observation.clipId ?? observation.label ?? "clip"}`,
        getQuizSignal(profile, 1),
        getQuizSignal(profile, 4),
      ],
      confidence: observation.confidence === "high" ? 0.78 : 0.62,
    });
  }

  return {
    behaviorProfile,
    coreTraits: traits
      .filter(
        (trait, index, list) => list.findIndex((item) => item.trait === trait.trait) === index,
      )
      .slice(0, 6),
    unsupportedClaims: [],
  };
}

function getTrait(stage1: PersonaStage1Output, pattern: RegExp) {
  return stage1.coreTraits.find((trait) => pattern.test(trait.trait));
}

function traitSupport(trait?: PersonaCoreTrait) {
  return trait ? [`trait:${trait.trait}`, ...trait.supportedBy].slice(0, 4) : ["behaviorProfile"];
}

function buildStableStage2(stage1: PersonaStage1Output, profile: CatProfile): PersonaStage2Output {
  const cautious = getTrait(stage1, /谨慎|观察/);
  const boundary = getTrait(stage1, /边界/);
  const attachment = getTrait(stage1, /亲近|表达/);
  const fallbackTrait = stage1.coreTraits[0];
  const misunderstandingTrait = cautious ?? boundary ?? fallbackTrait;
  const affectionTrait = attachment ?? boundary ?? fallbackTrait;
  const relationshipTrait = boundary ?? attachment ?? cautious ?? fallbackTrait;

  return {
    misunderstanding: {
      claim: cautious
        ? "它不是没兴趣，只是在先确认安全和节奏。"
        : "它不是不亲人，只是亲近时也需要自己的距离。",
      explanation: cautious
        ? "你看到它停住不动时，不一定代表它冷淡。它可能已经在观察，只是要等自己觉得合适，才会把靠近或互动放出来。"
        : "它愿意靠近你，但不一定喜欢被持续抱住或催着互动。对它来说，能自己决定距离，也是信任的一部分。",
      supportedBy: traitSupport(misunderstandingTrait),
      confidence: misunderstandingTrait?.confidence ?? 0.62,
    },
    affection: {
      claim: boundary
        ? "它表达喜欢的方式，是靠近你，也保留一点自己的边界。"
        : "它表达喜欢时，常常不是黏住，而是把注意力放在你身上。",
      explanation: boundary
        ? "它可能会待在你附近、看你的反应，或者在熟悉的时候主动靠近；但接触多久、距离多近，它更想自己决定。"
        : "它不一定每次都用贴贴表达亲近，也可能用停留、注视、回应你的动作来告诉你：它有在意你。",
      supportedBy: traitSupport(affectionTrait),
      confidence: affectionTrait?.confidence ?? 0.62,
    },
    ownerRelationship: {
      claim: `${profile.name}眼里的你，更像一个可以让它放松观察的人。`,
      explanation: relationshipTrait
        ? "你不一定是它时时刻刻都要黏住的人，但很可能是它会反复确认、也愿意回到附近的人。你在，它更容易按自己的节奏放松下来。"
        : "目前证据还不够多，不能把关系说得太满。比较稳妥的判断是：它正在用自己的节奏认识你，也需要你继续观察它的边界。",
      supportedBy: traitSupport(relationshipTrait),
      confidence: relationshipTrait?.confidence ?? 0.58,
    },
  };
}

function mappedMbti(behaviorProfile: PersonaBehaviorProfile) {
  const e =
    behaviorProfile.sociability >= 58 || behaviorProfile.interactionPreference >= 64 ? "E" : "I";
  const n = behaviorProfile.curiosity >= 56 ? "N" : "S";
  const f = behaviorProfile.attachmentExpression >= 55 ? "F" : "T";
  const j = behaviorProfile.boundary >= 58 || behaviorProfile.caution >= 62 ? "J" : "P";
  const suffix = behaviorProfile.caution >= 70 ? "T" : "A";
  return `${e}${n}${f}${j}-${suffix}`;
}

function choosePersonaTitle(stage1: PersonaStage1Output) {
  const b = stage1.behaviorProfile;
  if (b.sociability >= 62 && b.attachmentExpression >= 62 && b.boundary >= 58)
    return "热情有分寸型";
  if (b.sociability >= 62 && b.attachmentExpression >= 62) return "主动亲近型";
  if (b.attachmentExpression >= 60 && b.boundary >= 62) return "边界感亲近派";
  if (b.curiosity >= 62 && b.caution >= 62) return "好奇谨慎型";
  if (b.independence >= 62 && b.interactionPreference <= 50) return "不黏人陪伴型";
  if (b.sociability <= 42 && b.attachmentExpression >= 58) return "慢热陪伴型";
  if (b.caution >= 64) return "慢热观察型";
  return "安静观察型";
}

function tagsFromStage1(stage1: PersonaStage1Output, profile: CatProfile) {
  const tags: string[] = [];
  for (const trait of stage1.coreTraits) {
    if (/主动/.test(trait.trait)) tags.push("主动靠近");
    if (/边界/.test(trait.trait)) tags.push("边界感强");
    if (/谨慎/.test(trait.trait)) tags.push("先观察再靠近");
    if (/安静表达/.test(trait.trait)) tags.push("安静表达");
    if (/视频|观察/.test(trait.trait)) tags.push("会先看清楚");
  }
  if (stage1.behaviorProfile.attachmentExpression >= 60) tags.push("喜欢待在附近");
  if (stage1.behaviorProfile.boundary >= 60) tags.push("不爱强抱");
  if (stage1.behaviorProfile.curiosity >= 60) tags.push("对新东西好奇");
  const normalized = uniqueNaturalLabels(tags, profile, 8).slice(0, 4);
  return normalized.length >= 4
    ? normalized
    : uniqueNaturalLabels(
        [...normalized, "先观察再靠近", "喜欢待在附近", "有自己的边界", "会用眼神表达"],
        profile,
        8,
      ).slice(0, 4);
}

function catPersonaTraits(stage1: PersonaStage1Output): CatPersona["traits"] {
  const b = stage1.behaviorProfile;
  return [
    { label: "社交主动性", value: b.sociability },
    { label: "好奇心", value: b.curiosity },
    { label: "警觉度", value: b.caution },
    { label: "亲近表达", value: b.attachmentExpression },
    { label: "独立性", value: b.independence },
    { label: "边界感", value: b.boundary },
    { label: "环境敏感度", value: b.environmentalSensitivity },
    { label: "互动偏好", value: b.interactionPreference },
  ]
    .sort((a, b) => Math.abs(b.value - 50) - Math.abs(a.value - 50))
    .slice(0, 4)
    .map((item) => ({ label: item.label, value: clampScore(item.value) }));
}

function buildStableStage3(
  stage1: PersonaStage1Output,
  stage2: PersonaStage2Output,
  profile: CatProfile,
): PersonaStage3Output {
  return {
    personaTitle: choosePersonaTitle(stage1),
    mbti: mappedMbti(stage1.behaviorProfile),
    summary: boundedCopy(
      stage1.coreTraits[0]?.description ??
        "现在的线索还不够多，先保守判断它更习惯按自己的节奏观察和靠近。",
      "它更习惯按自己的节奏观察和靠近。",
      10,
      50,
    ),
    monologue:
      stage1.behaviorProfile.caution >= 62
        ? "让我先看清楚，再决定要不要靠近。"
        : "我在附近啦，只是要按自己的节奏来。",
    tags: tagsFromStage1(stage1, profile),
    insights: {
      misunderstanding: boundedCopy(stage2.misunderstanding.explanation, "", 16, 60),
      affection: boundedCopy(stage2.affection.explanation, "", 16, 60),
      ownerRelationship: boundedCopy(stage2.ownerRelationship.explanation, "", 16, 60),
    },
    matchScore: stage1.coreTraits.length >= 3 ? 88 : stage1.coreTraits.length ? 76 : 62,
    traits: catPersonaTraits(stage1),
  };
}

function normalizeUnsupportedClaims(value: unknown): PersonaUnsupportedClaim[] {
  if (!Array.isArray(value)) return [];
  const claims: PersonaUnsupportedClaim[] = [];
  for (const item of value) {
    const raw = getObjectRecord(item);
    const claim = asText(raw?.claim);
    if (!claim) continue;
    const source = asText(raw?.source);
    const normalized: PersonaUnsupportedClaim = {
      claim,
      reason: asText(raw?.reason, "证据不足"),
    };
    if (source) normalized.source = source;
    claims.push(normalized);
  }
  return claims.slice(0, 8);
}

function normalizeStage1Output(
  value: unknown,
  fallback: PersonaStage1Output,
  profile: CatProfile,
): PersonaStage1Output {
  const raw = getObjectRecord(value) ?? {};
  const rawBehavior = getObjectRecord(raw.behaviorProfile) ?? {};
  const behaviorProfile: PersonaBehaviorProfile = {
    sociability: clampScore(rawBehavior.sociability, fallback.behaviorProfile.sociability),
    curiosity: clampScore(rawBehavior.curiosity, fallback.behaviorProfile.curiosity),
    caution: clampScore(rawBehavior.caution, fallback.behaviorProfile.caution),
    attachmentExpression: clampScore(
      rawBehavior.attachmentExpression,
      fallback.behaviorProfile.attachmentExpression,
    ),
    independence: clampScore(rawBehavior.independence, fallback.behaviorProfile.independence),
    boundary: clampScore(rawBehavior.boundary, fallback.behaviorProfile.boundary),
    environmentalSensitivity: clampScore(
      rawBehavior.environmentalSensitivity,
      fallback.behaviorProfile.environmentalSensitivity,
    ),
    interactionPreference: clampScore(
      rawBehavior.interactionPreference,
      fallback.behaviorProfile.interactionPreference,
    ),
  };
  const unsupportedClaims = [
    ...normalizeUnsupportedClaims(raw.unsupportedClaims),
    ...identifyUnsupportedClaimsInText(JSON.stringify(raw.coreTraits ?? "")),
  ];
  const coreTraits = (Array.isArray(raw.coreTraits) ? raw.coreTraits : [])
    .map((item) => {
      const entry = getObjectRecord(item);
      const trait =
        normalizeNaturalLabel(entry?.trait, profile, 12) || cleanLabelText(asText(entry?.trait));
      const supportedBy = Array.isArray(entry?.supportedBy)
        ? uniqueSignals(entry.supportedBy.map((signal) => asText(signal)))
        : [];
      if (!trait || supportedBy.length < 2) return null;
      return {
        trait,
        description: boundedCopy(
          normalizeCatFacts(entry?.description, profile),
          fallback.coreTraits[0]?.description ?? trait,
          8,
          90,
        ),
        supportedBy,
        confidence: clampConfidence(entry?.confidence, 0.65),
      };
    })
    .filter((item): item is PersonaCoreTrait => Boolean(item))
    .filter(
      (trait) =>
        !fatalUnsupportedClaimPatterns.some((pattern) =>
          pattern.test(`${trait.trait}${trait.description}`),
        ),
    )
    .slice(0, 5);

  return {
    behaviorProfile,
    coreTraits: coreTraits.length ? coreTraits : fallback.coreTraits,
    unsupportedClaims,
  };
}

function normalizeInsight(value: unknown, fallback: PersonaGroundedInsight) {
  const raw = getObjectRecord(value) ?? {};
  const supportedBy = Array.isArray(raw.supportedBy)
    ? uniqueSignals(raw.supportedBy.map((item) => asText(item)))
    : fallback.supportedBy;
  return {
    claim: boundedCopy(asText(raw.claim), fallback.claim, 6, 70),
    explanation: boundedCopy(asText(raw.explanation), fallback.explanation, 16, 120),
    supportedBy: supportedBy.length ? supportedBy.slice(0, 5) : fallback.supportedBy,
    confidence: clampConfidence(raw.confidence, fallback.confidence),
  };
}

function textBigrams(value: string) {
  const chars = Array.from(value.replace(/[，。！？、；：\s]/g, ""));
  const grams = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) grams.add(`${chars[i]}${chars[i + 1]}`);
  return grams;
}

function semanticSimilarity(a: string, b: string) {
  const left = textBigrams(a);
  const right = textBigrams(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const item of left) if (right.has(item)) overlap += 1;
  return overlap / Math.min(left.size, right.size);
}

const behaviorProfileKeys: Array<keyof PersonaBehaviorProfile> = [
  "sociability",
  "curiosity",
  "caution",
  "attachmentExpression",
  "independence",
  "boundary",
  "environmentalSensitivity",
  "interactionPreference",
];

function behaviorProfileFromJson(value: unknown): PersonaBehaviorProfile | null {
  const raw = getObjectRecord(value);
  if (!raw) return null;
  let seen = 0;
  const profile = behaviorProfileKeys.reduce((next, key) => {
    const numeric = Number(raw[key]);
    if (Number.isFinite(numeric)) seen += 1;
    return {
      ...next,
      [key]: Number.isFinite(numeric) ? clampScore(numeric) : 50,
    };
  }, {} as PersonaBehaviorProfile);
  return seen >= 4 ? profile : null;
}

function quizAnswersFromJson(value: unknown): Record<string, string> | null {
  const raw = getObjectRecord(value);
  if (!raw) return null;
  const answers: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(raw)) {
    const answer = asText(rawValue).toLowerCase();
    if (answer === "a" || answer === "b" || answer === "c") answers[String(key)] = answer;
  }
  return Object.keys(answers).length ? answers : null;
}

function countQuizChanges(
  current: Record<string, string> | null,
  previous: Record<string, string> | null,
) {
  if (!current || !previous) return null;
  const keys = Array.from(new Set([...Object.keys(current), ...Object.keys(previous)]));
  return keys.reduce((sum, key) => sum + (current[key] === previous[key] ? 0 : 1), 0);
}

function averageBehaviorDifference(
  current: PersonaBehaviorProfile,
  previous: PersonaBehaviorProfile | null,
) {
  if (!previous) return null;
  const total = behaviorProfileKeys.reduce(
    (sum, key) => sum + Math.abs(current[key] - previous[key]),
    0,
  );
  return Math.round((total / behaviorProfileKeys.length) * 10) / 10;
}

function extractPreviousQuiz(previous: CatPersona) {
  const generation = getObjectRecord(previous.generation);
  const rawInputs = getObjectRecord(generation?.rawInputs);
  const rawProfile = getObjectRecord(rawInputs?.profile);
  return (
    quizAnswersFromJson(generation?.questionnaireAnswers) ??
    quizAnswersFromJson(rawProfile?.quiz) ??
    quizAnswersFromJson(rawInputs?.questionnaireAnswers)
  );
}

function extractPreviousBehavior(previous: CatPersona) {
  const generation = getObjectRecord(previous.generation);
  const rawInputs = getObjectRecord(generation?.rawInputs);
  return (
    behaviorProfileFromJson(generation?.behaviorProfile) ??
    behaviorProfileFromJson(rawInputs?.behaviorProfile)
  );
}

function previousHasRawInputs(previous: CatPersona) {
  const generation = getObjectRecord(previous.generation);
  return Boolean(
    generation?.rawInputs || generation?.behaviorProfile || generation?.questionnaireAnswers,
  );
}

function hasStrongNewBehaviorEvidence(data: PersonaInput) {
  return (data.videoObservations ?? []).some(
    (observation) =>
      observation.containsCat &&
      observation.confidence === "high" &&
      observation.personalityEvidence.some(
        (evidence) => charLength(`${evidence.fact}${evidence.interpretation}`) >= 12,
      ),
  );
}

function tagOverlapRatio(currentTags: string[], previousTags: string[]) {
  const current = currentTags.slice(0, 3);
  const previous = previousTags.slice(0, 3);
  const denominator = Math.min(current.length, previous.length);
  if (!denominator) return 0;
  const overlap = current.filter((tag) => previous.includes(tag)).length;
  return Math.round((overlap / denominator) * 100) / 100;
}

function evaluatePersonaDrift(
  data: PersonaInput,
  stage1: PersonaStage1Output,
  finalCopy: PersonaStage3Output,
): PersonaDriftCheckResult {
  const previous = data.previousPersona;
  if (!previous) {
    return {
      hasPrevious: false,
      previousHasRawInputs: false,
      anchored: false,
      action: "keep_current",
      reason: "no_previous_persona",
      quizChanges: null,
      behaviorAverageDifference: null,
      coreTraitSimilarity: 0,
      personaTitleSimilarity: 0,
      tagOverlap: 0,
      insightConsistency: 0,
      mbtiStable: true,
      strongNewEvidence: false,
      warnings: [],
    };
  }

  const currentQuiz = quizAnswersFromJson(data.profile.quiz ?? {});
  const previousQuiz = extractPreviousQuiz(previous);
  const previousBehavior = extractPreviousBehavior(previous);
  const quizChanges = countQuizChanges(currentQuiz, previousQuiz);
  const behaviorAverageDifference = averageBehaviorDifference(
    stage1.behaviorProfile,
    previousBehavior,
  );
  const strongNewEvidence = hasStrongNewBehaviorEvidence(data);
  const previousTitle = normalizePersonaType(previous.type, data.profile, "");
  const currentTitle = normalizePersonaType(finalCopy.personaTitle, data.profile, "");
  const previousTags = uniqueNaturalLabels(previous.tags ?? [], data.profile, 8);
  const currentTags = uniqueNaturalLabels(finalCopy.tags, data.profile, 8);
  const previousText = [
    previousTitle,
    previous.corePersonality,
    previous.analysis,
    ...previousTags,
  ].join("");
  const currentText = [
    currentTitle,
    finalCopy.summary,
    ...currentTags,
    ...stage1.coreTraits.map((trait) => `${trait.trait}${trait.description}`),
  ].join("");
  const previousInsights = [
    previous.misunderstanding,
    previous.loveLanguageInsight ?? previous.loveLanguage,
    previous.ownerRelationship ?? previous.ownerRole,
  ].filter(Boolean) as string[];
  const currentInsights = Object.values(finalCopy.insights);
  const insightConsistency = previousInsights.length
    ? Math.round(
        (previousInsights.reduce(
          (sum, text, index) => sum + semanticSimilarity(text, currentInsights[index] ?? ""),
          0,
        ) /
          previousInsights.length) *
          100,
      ) / 100
    : 0;
  const titleSimilarity = semanticSimilarity(previousTitle, currentTitle);
  const coreTraitSimilarity = semanticSimilarity(previousText, currentText);
  const tagOverlap = tagOverlapRatio(currentTags, previousTags);
  const mbtiStable = !previous.mbti || previous.mbti === finalCopy.mbti;
  const hasRaw = previousHasRawInputs(previous);

  const rawStable =
    hasRaw &&
    quizChanges !== null &&
    quizChanges <= 1 &&
    behaviorAverageDifference !== null &&
    behaviorAverageDifference < 15 &&
    !strongNewEvidence;
  const rawLikelyStable =
    hasRaw &&
    quizChanges !== null &&
    quizChanges <= 1 &&
    behaviorAverageDifference === null &&
    !strongNewEvidence &&
    (mbtiStable || tagOverlap >= 0.34 || coreTraitSimilarity >= 0.18);
  const visibleLikelyStable =
    !hasRaw &&
    !strongNewEvidence &&
    (mbtiStable || tagOverlap >= 0.34 || titleSimilarity >= 0.3 || coreTraitSimilarity >= 0.18);
  const anchored = Boolean(previousTitle) && (rawStable || rawLikelyStable || visibleLikelyStable);

  const warnings = [];
  if (!anchored && previousTitle && !strongNewEvidence && !mbtiStable) {
    warnings.push("persona_drift_allowed_without_strong_video_evidence");
  }
  if (anchored && tagOverlap < 0.67) warnings.push("tag_overlap_repaired_to_previous_anchor");
  if (anchored && !mbtiStable) warnings.push("mbti_repaired_to_previous_anchor");

  return {
    hasPrevious: true,
    previousHasRawInputs: hasRaw,
    anchored,
    action: anchored ? "anchor_previous" : "keep_current",
    reason: anchored
      ? hasRaw
        ? "similar_questionnaire_and_behavior_profile"
        : "visible_previous_persona_matches_current_direction"
      : strongNewEvidence
        ? "strong_new_video_evidence"
        : "input_or_semantic_direction_changed",
    quizChanges,
    behaviorAverageDifference,
    coreTraitSimilarity,
    personaTitleSimilarity: titleSimilarity,
    tagOverlap,
    insightConsistency,
    mbtiStable,
    strongNewEvidence,
    warnings,
  };
}

function applyPreviousPersonaAnchor(
  finalCopy: PersonaStage3Output,
  previous: CatPersona,
  fallback: PersonaStage3Output,
  profile: CatProfile,
): PersonaStage3Output {
  const previousTitle = normalizePersonaType(previous.type, profile, "");
  const previousTags = uniqueNaturalLabels(previous.tags ?? [], profile, 8);
  const tags = uniqueNaturalLabels(
    [...previousTags.slice(0, 3), ...finalCopy.tags, ...fallback.tags],
    profile,
    8,
  ).slice(0, 4);
  const previousMbti = /^[IE][NS][FT][JP]-[AT]$/.test(previous.mbti) ? previous.mbti : "";
  return {
    ...finalCopy,
    personaTitle: previousTitle || finalCopy.personaTitle,
    mbti: previousMbti || finalCopy.mbti,
    summary: boundedCopy(
      normalizeCatFacts(previous.corePersonality ?? previous.analysis ?? "", profile),
      finalCopy.summary,
      10,
      50,
    ),
    tags: tags.length >= 4 ? tags : fallback.tags,
    insights: {
      misunderstanding: normalizeFinalInsight(
        previous.misunderstanding,
        finalCopy.insights.misunderstanding,
      ),
      affection: normalizeFinalInsight(
        previous.loveLanguageInsight ?? previous.loveLanguage,
        finalCopy.insights.affection,
      ),
      ownerRelationship: normalizeFinalInsight(
        previous.ownerRelationship ?? previous.ownerRole,
        finalCopy.insights.ownerRelationship,
      ),
    },
  };
}

function dedupeStage2Insights(stage2: PersonaStage2Output, fallback: PersonaStage2Output) {
  const next = { ...stage2 };
  const pairs: Array<[keyof PersonaStage2Output, keyof PersonaStage2Output]> = [
    ["misunderstanding", "affection"],
    ["misunderstanding", "ownerRelationship"],
    ["affection", "ownerRelationship"],
  ];
  for (const [a, b] of pairs) {
    const left = `${next[a].claim}${next[a].explanation}`;
    const right = `${next[b].claim}${next[b].explanation}`;
    if (semanticSimilarity(left, right) > 0.58) next[b] = fallback[b];
  }
  return next;
}

function normalizeStage2Output(value: unknown, fallback: PersonaStage2Output) {
  const raw = getObjectRecord(value) ?? {};
  return dedupeStage2Insights(
    {
      misunderstanding: normalizeInsight(raw.misunderstanding, fallback.misunderstanding),
      affection: normalizeInsight(raw.affection, fallback.affection),
      ownerRelationship: normalizeInsight(raw.ownerRelationship, fallback.ownerRelationship),
    },
    fallback,
  );
}

function normalizeFinalInsight(value: unknown, fallback: string) {
  if (typeof value === "string") return boundedCopy(value, fallback, 16, 60);
  const raw = getObjectRecord(value);
  return boundedCopy(asText(raw?.text ?? raw?.explanation ?? raw?.claim), fallback, 16, 60);
}

function normalizeStage3Output(
  value: unknown,
  fallback: PersonaStage3Output,
  profile: CatProfile,
): PersonaStage3Output {
  const raw = getObjectRecord(value) ?? {};
  const rawInsights = getObjectRecord(raw.insights) ?? {};
  const tags = Array.isArray(raw.tags) ? uniqueNaturalLabels(raw.tags, profile, 8).slice(0, 4) : [];
  const rawTraits = Array.isArray(raw.traits)
    ? raw.traits
        .map((item) => {
          const entry = getObjectRecord(item);
          return entry
            ? {
                label: normalizeCatFacts(entry.label, profile, "特质"),
                value: clampScore(entry.value, 50),
              }
            : null;
        })
        .filter((item): item is { label: string; value: number } => Boolean(item?.label))
        .slice(0, 4)
    : undefined;
  return {
    personaTitle: normalizePersonaType(
      raw.personaTitle ?? raw.type,
      profile,
      fallback.personaTitle,
    ),
    mbti: /^[IE][NS][FT][JP]-[AT]$/.test(asText(raw.mbti)) ? asText(raw.mbti) : fallback.mbti,
    summary: boundedCopy(
      normalizeCatFacts(raw.summary ?? raw.corePersonality, profile),
      fallback.summary,
      10,
      50,
    ),
    monologue: boundedCopy(normalizeCatFacts(raw.monologue, profile), fallback.monologue, 10, 36),
    tags: tags.length >= 4 ? tags : fallback.tags,
    insights: {
      misunderstanding: normalizeFinalInsight(
        rawInsights.misunderstanding ?? raw.misunderstanding,
        fallback.insights.misunderstanding,
      ),
      affection: normalizeFinalInsight(
        rawInsights.affection ?? raw.loveLanguageInsight ?? raw.loveLanguage,
        fallback.insights.affection,
      ),
      ownerRelationship: normalizeFinalInsight(
        rawInsights.ownerRelationship ?? raw.ownerRelationship ?? raw.ownerRole,
        fallback.insights.ownerRelationship,
      ),
    },
    matchScore: clampScore(raw.matchScore, fallback.matchScore ?? 80),
    traits: rawTraits?.length === 4 ? rawTraits : fallback.traits,
  };
}

function hasHighRiskCopy(value: string) {
  return highRiskCopyPatterns.some((pattern) => pattern.test(value));
}

function hasHighRiskLabel(value: string) {
  return highRiskLabelPatterns.some((pattern) => pattern.test(value)) || hasJargonLabel(value);
}

function containsWrongFacts(text: string, profile: CatProfile) {
  const wrongGender =
    profile.gender === "小公猫"
      ? /小母猫|她|她的/
      : /小公猫|他会|他是|他的|他在|他也|他不|他更|他想|他把|他对|他总/;
  const wrongAge = AGE_STAGES.some((stage) => stage !== profile.ageStage && text.includes(stage));
  return { wrongGender: wrongGender.test(text), wrongAge };
}

function runFinalCopySelfCheck(stage3: PersonaStage3Output, profile: CatProfile) {
  const allText = [
    stage3.personaTitle,
    stage3.summary,
    stage3.monologue,
    ...stage3.tags,
    stage3.insights.misunderstanding,
    stage3.insights.affection,
    stage3.insights.ownerRelationship,
  ].join("\n");
  const issues: string[] = [];
  if (charLength(stage3.personaTitle) > 14 || charLength(stage3.personaTitle) < 4) {
    issues.push("title_length");
  }
  if (hasHighRiskCopy(allText) || hasHighRiskLabel(stage3.personaTitle)) {
    issues.push("high_risk_jargon");
  }
  if (fatalUnsupportedClaimPatterns.some((pattern) => pattern.test(allText))) {
    issues.push("unsupported_long_term_claim");
  }
  if (stage3.tags.some((tag) => charLength(tag) > 10 || hasHighRiskLabel(tag))) {
    issues.push("tag_readability");
  }
  const facts = containsWrongFacts(allText, profile);
  if (facts.wrongGender) issues.push("wrong_gender");
  if (facts.wrongAge) issues.push("wrong_age");
  const insightTexts = Object.values(stage3.insights);
  if (
    semanticSimilarity(insightTexts[0], insightTexts[1]) > 0.58 ||
    semanticSimilarity(insightTexts[0], insightTexts[2]) > 0.58 ||
    semanticSimilarity(insightTexts[1], insightTexts[2]) > 0.58
  ) {
    issues.push("duplicate_insights");
  }
  return { passed: issues.length === 0, issues };
}

function repairStage3Output(
  stage3: PersonaStage3Output,
  fallback: PersonaStage3Output,
  profile: CatProfile,
) {
  const checked = runFinalCopySelfCheck(stage3, profile);
  if (checked.passed) return stage3;
  return {
    ...stage3,
    personaTitle:
      checked.issues.includes("title_length") || checked.issues.includes("high_risk_jargon")
        ? fallback.personaTitle
        : stage3.personaTitle,
    tags:
      checked.issues.includes("tag_readability") || checked.issues.includes("high_risk_jargon")
        ? fallback.tags
        : stage3.tags,
    insights: checked.issues.includes("duplicate_insights") ? fallback.insights : stage3.insights,
    summary: normalizeCatFacts(stage3.summary, profile, fallback.summary),
    monologue: normalizeCatFacts(stage3.monologue, profile, fallback.monologue),
  };
}

export function evaluatePersonaGeneration({
  profile,
  stage1,
  finalCopy,
  consistency,
}: {
  profile: CatProfile;
  stage1: PersonaStage1Output;
  stage2: PersonaStage2Output;
  finalCopy: PersonaStage3Output;
  consistency?: PersonaDriftCheckResult;
}): PersonaEvalResult {
  const allText = [
    finalCopy.personaTitle,
    finalCopy.summary,
    finalCopy.monologue,
    ...finalCopy.tags,
    ...Object.values(finalCopy.insights),
  ].join("\n");
  const selfCheck = runFinalCopySelfCheck(finalCopy, profile);
  const facts = containsWrongFacts(allText, profile);
  const fatalRules = [
    {
      id: "gender",
      passed: !facts.wrongGender,
      detail: facts.wrongGender ? "性别表达与资料冲突" : undefined,
    },
    {
      id: "age_stage",
      passed: !facts.wrongAge,
      detail: facts.wrongAge ? "年龄阶段与资料冲突" : undefined,
    },
    {
      id: "long_term_fabrication",
      passed: !fatalUnsupportedClaimPatterns.some((pattern) => pattern.test(allText)),
      detail: "编造长期习惯或固定频率",
    },
    {
      id: "title_readability",
      passed:
        charLength(finalCopy.personaTitle) >= 4 &&
        charLength(finalCopy.personaTitle) <= 14 &&
        !hasHighRiskLabel(finalCopy.personaTitle),
      detail: "标题不可自然理解或含高风险造词",
    },
    { id: "ai_jargon", passed: !hasHighRiskCopy(allText), detail: "出现明显 AI 造词或报告腔词汇" },
    {
      id: "duplicate_insights",
      passed: !selfCheck.issues.includes("duplicate_insights"),
      detail: "3 条 insight 语义重复",
    },
    {
      id: "unsupported_claim_visible",
      passed: stage1.unsupportedClaims.every((claim) => !allText.includes(claim.claim)),
      detail: "unsupported claim 被写进最终确定事实",
    },
  ];
  const unsupportedPenalty = stage1.unsupportedClaims.length ? 6 : 0;
  const comprehensibility = Math.max(
    0,
    20 -
      (hasHighRiskLabel(finalCopy.personaTitle) ? 8 : 0) -
      finalCopy.tags.filter((tag) => hasHighRiskLabel(tag) || charLength(tag) > 10).length * 3,
  );
  const factualAccuracy = Math.max(
    0,
    20 -
      unsupportedPenalty -
      (facts.wrongGender ? 20 : 0) -
      (facts.wrongAge ? 20 : 0) -
      (fatalUnsupportedClaimPatterns.some((pattern) => pattern.test(allText)) ? 12 : 0),
  );
  const genericCount = genericPersonaWords.filter((word) => allText.includes(word)).length;
  const personalization = Math.max(
    0,
    Math.min(20, stage1.coreTraits.length * 4 + 8 - genericCount * 2),
  );
  const insightTexts = Object.values(finalCopy.insights);
  const insightValue = Math.max(
    0,
    20 -
      insightTexts.filter((text) => charLength(text) < 24).length * 4 -
      (selfCheck.issues.includes("duplicate_insights") ? 10 : 0),
  );
  const shareability = Math.max(
    0,
    20 -
      (charLength(finalCopy.monologue) < 10 || charLength(finalCopy.monologue) > 36 ? 5 : 0) -
      (charLength(finalCopy.personaTitle) > 14 ? 5 : 0) -
      (hasHighRiskCopy(finalCopy.monologue) ? 6 : 0),
  );
  const scores = {
    comprehensibility,
    factualAccuracy,
    personalization,
    insightValue,
    shareability,
  };
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const warnings = [
    ...selfCheck.issues,
    ...stage1.unsupportedClaims.map((claim) => `unsupported:${claim.claim}`),
    ...(consistency?.warnings ?? []),
  ];
  return {
    scores,
    total,
    passed: total >= 80 && fatalRules.every((rule) => rule.passed),
    fatalRules,
    warnings,
    ...(consistency ? { consistency } : {}),
  };
}

function stage3ToPersona(
  stage3: PersonaStage3Output,
  stage1: PersonaStage1Output,
  profile: CatProfile,
): CatPersona {
  return normalizePersonaForProfile(
    {
      name: profile.name,
      type: stage3.personaTitle,
      mbti: stage3.mbti,
      matchScore: clampScore(stage3.matchScore, 82),
      monologue: stage3.monologue,
      analysis: stage3.insights.misunderstanding,
      corePersonality: stage3.summary,
      misunderstanding: stage3.insights.misunderstanding,
      loveLanguage: stage3.insights.affection,
      loveLanguageInsight: stage3.insights.affection,
      ownerRole: stage3.insights.ownerRelationship,
      ownerRelationship: stage3.insights.ownerRelationship,
      tags: stage3.tags,
      traits: stage3.traits?.length === 4 ? stage3.traits : catPersonaTraits(stage1),
      observations: stage1.coreTraits.slice(0, 3).map((trait) => ({
        label: trait.trait,
        value: trait.description,
      })),
      evidence: stage1.coreTraits.slice(0, 4).map((trait) => ({
        fact: trait.supportedBy.join("、"),
        interpretation: trait.description,
      })),
      dailyMood: "",
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
    ? uniqueNaturalLabels(input.tags, profile).slice(0, 3)
    : [];
  const mood = normalizeCatFacts(input.mood, profile, "想被关注");
  const voiceTags = (
    tags.length >= 3
      ? tags
      : uniqueNaturalLabels([...tags, mood, "想靠近一点", "安静等你发现", "有点小主意"], profile)
  ).slice(0, 3);
  const rawAnalysis =
    input.analysis && typeof input.analysis === "object"
      ? (input.analysis as Record<string, unknown>)
      : {};
  const legacyAnalysis = typeof input.analysis === "string" ? input.analysis : undefined;
  const analysisSummary = boundedCopy(
    normalizeCatFacts(
      rawAnalysis.observation ?? rawAnalysis.summary ?? legacyAnalysis,
      profile,
      `${profile.name}保持停留并注视周围，姿态放松，同时持续关注当前互动。`,
    ),
    `${profile.name}保持停留并注视周围，姿态放松，同时持续关注当前互动。`,
    20,
    30,
  );
  const subtext = boundedCopy(
    normalizeCatFacts(input.subtext, profile, "它没有急着行动，像是在等自己想动的时候。"),
    "它没有急着行动，像是在等自己想动的时候。",
    15,
    30,
  );
  const personalityInterpretation = boundedCopy(
    normalizeCatFacts(rawAnalysis.personalityInterpretation ?? input.subtext, profile, subtext),
    subtext,
    20,
    30,
  );
  const rawShare =
    input.share && typeof input.share === "object" ? (input.share as Record<string, unknown>) : {};
  const parsedShareTags = Array.isArray(rawShare.tags)
    ? uniqueNaturalLabels(rawShare.tags, profile).slice(0, 3)
    : [];
  const shareTags = (
    parsedShareTags.length >= 2
      ? parsedShareTags
      : uniqueNaturalLabels(
          [...parsedShareTags, ...voiceTags, "会用眼神表达", "先观察再回应", "有点小主意"],
          profile,
        )
  ).slice(0, 3);
  return {
    time: "刚刚",
    createdAt: Date.now(),
    location: normalizeCatFacts(input.location, profile, "家里") || "家里",
    grad: "linear-gradient(135deg, oklch(0.9 0.06 280), oklch(0.92 0.05 320))",
    tags: voiceTags,
    aspect: "3:4",
    text: boundedCopy(
      normalizeCatFacts(input.text, profile, `靠近一点嘛，今天也想被你看见。`),
      `靠近一点嘛，今天也想被你看见。`,
      12,
      30,
    ),
    subtext,
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
      tags: shareTags,
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
        personalityInterpretation: `它习惯先看看你的反应，再决定要不要靠近。`,
      },
      share: {
        headline: text,
        insight: `它不是没反应，只是更习惯先看一会儿，等你注意到它。`,
        tags: [mood, "先观察再回应", "有点小主意"],
      },
      mood,
      location: "家里",
      tags: [mood, "想靠近一点", "有点小主意"],
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

function getUserFacingAIMessage(kind: "persona" | "voice" | "video", error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  if (message.includes("image too large")) {
    return kind === "video"
      ? "视频抽帧太大了，请换一段短一点的视频再试。"
      : "图片太大了，请换一张小一点的照片再试。";
  }

  if (message.includes("invalid image") || message.includes("missing profile")) {
    return kind === "video"
      ? "视频画面读取失败，请换一段视频再试。"
      : "猫咪资料读取失败，请返回检查后再试。";
  }

  if (isTimeoutLikeError(error)) {
    if (kind === "video") return "AI 现在有点忙，视频观察暂时没有生成成功，请稍后再试。";
    return kind === "voice"
      ? "AI 现在有点忙，猫咪心声暂时没有生成成功，请稍后再试。"
      : "AI 现在有点忙，人格档案暂时没有生成成功，请稍后再试。";
  }

  if (kind === "video") return "AI 视频观察暂时没有生成成功，请稍后再试。";
  return kind === "voice"
    ? "AI 心声暂时没有生成成功，请稍后再试。"
    : "AI 人格档案暂时没有生成成功，请稍后再试。";
}

const BYTECAT_DEFAULT_TEXT_MODELS = [
  "gemini-3.7-flash",
  "gemini-3-flash-preview",
  "gpt-5.6-sol",
  "gpt-5.5",
] as const;

const BYTECAT_DEFAULT_VISION_MODELS = [
  "gemini-3.7-flash",
  "gemini-3-flash-preview",
  "gpt-5.6-sol",
  "gpt-5.5",
] as const;

const MAX_VIDEO_ANALYSIS_FRAMES = 4;
const MAX_VIDEO_FRAME_DATA_URL_LENGTH = 3_000_000;
const MAX_VIDEO_ANALYSIS_TOTAL_DATA_URL_LENGTH = 7_000_000;

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
    const configuredModels = uniqueModels([
      await getProviderModel(provider, mode),
      ...parseModelList(await getServerEnv("BYTECAT_VISION_FALLBACK_MODELS")),
      ...BYTECAT_DEFAULT_VISION_MODELS,
    ]);
    return configuredModels;
  }

  const configuredModels = uniqueModels([
    await getProviderModel(provider, mode),
    ...parseModelList(await getServerEnv("BYTECAT_TEXT_FALLBACK_MODELS")),
    ...BYTECAT_DEFAULT_TEXT_MODELS,
  ]);
  return configuredModels;
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
    await logAIPromptDebug({
      provider,
      model,
      modelMode: options.modelMode,
      transport: isGeminiGenerateContent ? "gemini.generateContent" : "chat.completions",
      messages,
    });

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

function buildVisionContent(
  provider: AIProvider,
  prompt: string,
  imageDataUrl?: string | string[] | null,
) {
  if (provider === "deepseek") return prompt;
  const imageDataUrls = Array.isArray(imageDataUrl)
    ? imageDataUrl
    : imageDataUrl
      ? [imageDataUrl]
      : [];
  return [
    { type: "text", text: prompt },
    ...imageDataUrls.map((url) => ({ type: "image_url", image_url: { url, detail: "low" } })),
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
  return {
    ...data,
    videoObservations: normalizeVideoObservationsInput(data.videoObservations, data.profile),
  };
}

function validateVoiceInput(input: unknown): VoiceInput {
  const data = input as VoiceInput;
  if (!data?.profile?.name) throw new Error("missing profile");
  if (data.imageDataUrl && !data.imageDataUrl.startsWith("data:image/"))
    throw new Error("invalid image");
  if (data.imageDataUrl && data.imageDataUrl.length > 8_000_000) throw new Error("image too large");
  return data;
}

function validateVideoAnalysisInput(input: unknown): VideoAnalysisInput {
  const data = input as VideoAnalysisInput;
  if (!data?.profile?.name) throw new Error("missing profile");
  const rawFrames = Array.isArray(data.frames)
    ? data.frames.slice(0, MAX_VIDEO_ANALYSIS_FRAMES)
    : [];
  let totalLength = 0;
  const frames = rawFrames.map((frame, index) => {
    const imageDataUrl = asText(frame?.imageDataUrl);
    if (!imageDataUrl.startsWith("data:image/")) throw new Error("invalid image");
    if (imageDataUrl.length > MAX_VIDEO_FRAME_DATA_URL_LENGTH) throw new Error("image too large");
    totalLength += imageDataUrl.length;
    if (totalLength > MAX_VIDEO_ANALYSIS_TOTAL_DATA_URL_LENGTH) throw new Error("image too large");
    const fallbackPosition = index === 0 ? "start" : index === 1 ? "middle" : "end";
    const position =
      frame?.position === "start" || frame?.position === "middle" || frame?.position === "end"
        ? frame.position
        : fallbackPosition;
    return {
      imageDataUrl,
      timestampLabel: limitChars(asText(frame?.timestampLabel, `${index + 1}`), 16),
      position,
    };
  });
  if (!frames.length) throw new Error("missing video frames");
  return {
    profile: data.profile,
    clipId: limitChars(asText(data.clipId), 64) || undefined,
    label: limitChars(asText(data.label), 24) || undefined,
    duration: limitChars(asText(data.duration), 12) || undefined,
    frames,
  };
}

export async function analyzeCatVideoClipServer(
  input: VideoAnalysisInput,
): Promise<CatVideoObservation> {
  const data = validateVideoAnalysisInput(input);
  await logAIDebugEvent("video input", {
    clipId: data.clipId,
    label: data.label,
    duration: data.duration,
    frameCount: data.frames.length,
    frames: data.frames.map((frame) => ({
      position: frame.position,
      timestampLabel: frame.timestampLabel,
      imageDataUrl: frame.imageDataUrl,
    })),
  });
  const frameOrder = data.frames
    .map((frame, index) => `${index + 1}. ${frame.position} ${frame.timestampLabel}`)
    .join("\n");
  const prompt = `你是「喵一下」的视频行为观察者。你会看到同一段猫咪视频中按时间顺序抽出的 ${data.frames.length} 张画面，不是在做单张照片描述。

猫咪资料：${JSON.stringify(data.profile)}
视频信息：${JSON.stringify({
    clipId: data.clipId,
    label: data.label,
    duration: data.duration,
  })}
抽帧顺序：
${frameOrder}

请只依据这些画面判断这段视频里有没有猫，以及能支持人格报告的少量行为线索。重点看：动作是否变化、是否靠近或远离、是否观察某个对象、是否准备行动、是否放松、是否回避。不要编造画面之外的主人行为、声音、长期习惯或医疗结论。

输出严格 JSON，不要 Markdown，不要附加说明：
{
  "clipId": "${data.clipId ?? ""}",
  "label": "${data.label ?? ""}",
  "duration": "${data.duration ?? ""}",
  "containsCat": true,
  "summary": "40字以内概括这段视频里最有用的行为线索",
  "movement": "20-50字描述时间顺序里的动作变化或保持不变",
  "behaviorSignals": ["2-4个口语行为标签"],
  "personalityEvidence": [
    {"fact":"可观察事实","interpretation":"为什么它能辅助人格判断"}
  ],
  "confidence": "low|medium|high"
}

如果没有看到猫，containsCat 必须为 false，summary 写明未看到猫，其他字段简短返回。`;

  try {
    const result = await callFirstAvailableJson<Partial<CatVideoObservation>>(
      (provider) => [
        {
          role: "system",
          content:
            "你是「喵一下」的视频行为观察者。按时间顺序比较抽帧，只提取能支持猫咪人格报告的真实行为线索；不虚构、不做医疗诊断。只返回合法 JSON。",
        },
        {
          role: "user",
          content: buildVisionContent(
            provider,
            prompt,
            data.frames.map((frame) => frame.imageDataUrl),
          ),
        },
      ],
      {
        maxTokens: 720,
        temperature: 0.45,
        timeoutMs: 24_000,
        modelMode: "vision",
        validate: (parsed) => {
          if (typeof parsed.containsCat !== "boolean") return false;
          if (parsed.containsCat === false) return asText(parsed.summary).length >= 3;
          return Boolean(
            asText(parsed.summary).length >= 8 &&
            asText(parsed.movement).length >= 6 &&
            Array.isArray(parsed.behaviorSignals) &&
            parsed.behaviorSignals.length >= 2 &&
            Array.isArray(parsed.personalityEvidence) &&
            parsed.personalityEvidence.length >= 1,
          );
        },
      },
    );
    const observation = normalizeVideoObservation(result.parsed, data.profile, data);
    await logAIDebugEvent("video observation", observation as unknown as Record<string, unknown>);
    return observation;
  } catch (error) {
    console.error("NEKO video analysis AI failed", error);
    if (await shouldRequireRealAI()) throw new Error(getUserFacingAIMessage("video", error));
    return normalizeVideoObservation(
      {
        containsCat: true,
        summary: `${data.profile.name}的视频已经收到，但本次没有获得稳定的 AI 视频观察。`,
        movement: "视频会作为辅助线索保留，最终判断仍以问卷和照片为主。",
        behaviorSignals: ["视频待复查", "辅助线索"],
        personalityEvidence: [
          {
            fact: "视频已上传但 AI 观察不可用。",
            interpretation: "不能据此追加明确人格判断，只能保守生成报告。",
          },
        ],
        confidence: "low",
      },
      data.profile,
      data,
    );
  }
}

export const analyzeCatVideoClip = createServerFn({ method: "POST" })
  .inputValidator(validateVideoAnalysisInput)
  .handler(async ({ data }): Promise<CatVideoObservation> => analyzeCatVideoClipServer(data));

function personaInputSnapshot(
  data: PersonaInput,
  behaviorProfile: PersonaBehaviorProfile,
  timestamp: string,
): JsonValue {
  return toJsonValue({
    profile: data.profile,
    questionnaireAnswers: data.profile.quiz ?? {},
    behaviorProfile,
    imageObservations: {
      photo: data.imageDataUrl
        ? {
            provided: true,
            mimeType: data.imageDataUrl.match(/^data:([^;,]+)/)?.[1] ?? "image",
            byteLengthApprox: data.imageDataUrl.length,
          }
        : { provided: false },
      videoObservations: data.videoObservations ?? [],
    },
    previousPersona: data.previousPersona
      ? {
          type: data.previousPersona.type,
          mbti: data.previousPersona.mbti,
          tags: data.previousPersona.tags,
          corePersonality: data.previousPersona.corePersonality,
          generation: data.previousPersona.generation
            ? {
                inputHash: data.previousPersona.generation.inputHash,
                questionnaireAnswers: data.previousPersona.generation.questionnaireAnswers,
                behaviorProfile: data.previousPersona.generation.behaviorProfile,
                finalCopy: data.previousPersona.generation.finalCopy,
              }
            : null,
        }
      : null,
    promptVersion: PERSONA_PROMPT_VERSIONS,
    timestamp,
  });
}

function stage1Prompt(data: PersonaInput, behaviorProfile: PersonaBehaviorProfile) {
  return `你是「喵一下」Persona Generation Pipeline 的 Stage 1：结构化人格判断。

本阶段只回答“它是什么样的猫”。不要写漂亮文案，不要生成分享文案，不要追求有趣。

输入：
猫咪资料：${JSON.stringify(data.profile)}
原始问卷答案：${JSON.stringify(data.profile.quiz ?? {})}
规则化 Behavior Profile：${JSON.stringify(behaviorProfile)}
照片状态：${data.imageDataUrl ? "已提供；只能支持当下可见事实，不能支持长期习惯" : "未提供"}
结构化视频观察：${JSON.stringify(data.videoObservations ?? [])}
上一版人格 prior：${JSON.stringify(
    data.previousPersona
      ? {
          type: data.previousPersona.type,
          mbti: data.previousPersona.mbti,
          tags: data.previousPersona.tags,
          corePersonality: data.previousPersona.corePersonality,
        }
      : null,
  )}

核心规则：
1. 每个 coreTrait 必须有 supportedBy，且至少 2 个独立信号支持。
2. 单张照片只能支持当下可见事实，不能支持长期习惯。
3. 如果证据不足，就降低 confidence 或不要生成 trait。
4. 不要为了凑完整人格而创造 trait。
5. 禁止把固定时间、固定路线、每天按点、生活秩序严格、主人不在时一定怎样等长期频率事实写成结论；出现这类内容必须进入 unsupportedClaims。
6. previousPersona 只能作为稳定性参考。如果当前问卷/视频没有强新证据，不要轻易改变核心方向；如果强证据变化，必须以当前输入为准。

输出严格 JSON，不要 Markdown：
{
  "behaviorProfile": {
    "sociability": 0,
    "curiosity": 0,
    "caution": 0,
    "attachmentExpression": 0,
    "independence": 0,
    "boundary": 0,
    "environmentalSensitivity": 0,
    "interactionPreference": 0
  },
  "coreTraits": [
    {
      "trait": "主动亲近",
      "description": "它会主动靠近主人，但不一定喜欢持续身体接触",
      "supportedBy": ["Q3:A", "Q6:A"],
      "confidence": 0.86
    }
  ],
  "unsupportedClaims": []
}`;
}

function stage2Prompt(stage1: PersonaStage1Output) {
  return `你是「喵一下」Persona Generation Pipeline 的 Stage 2：Grounded Insight 生成。

只能基于 Stage 1 的 coreTraits 生成洞察，不能重新发明新的人格事实。

Stage 1 输出：
${JSON.stringify(stage1)}

请固定生成 3 个语义不同的 insight：
1. misunderstanding：你可能一直误会它的一件事
2. affection：它表达喜欢的方式
3. ownerRelationship：在它眼里，你的位置

要求：
- 三条必须语义不同，不允许只是换句话重复。
- supportedBy 必须引用 Stage 1 的 grounded traits，例如 "trait:亲近但有边界"。
- 如果证据不足，降低 confidence，不要写确定事实。

输出严格 JSON：
{
  "misunderstanding": {
    "claim": "...",
    "explanation": "...",
    "supportedBy": ["trait:xxx", "Qx:x"],
    "confidence": 0.82
  },
  "affection": {
    "claim": "...",
    "explanation": "...",
    "supportedBy": ["trait:xxx"],
    "confidence": 0.82
  },
  "ownerRelationship": {
    "claim": "...",
    "explanation": "...",
    "supportedBy": ["trait:xxx"],
    "confidence": 0.82
  }
}`;
}

function stage3Prompt(
  stage1: PersonaStage1Output,
  stage2: PersonaStage2Output,
  profile: CatProfile,
  previousPersona?: CatPersona | null,
) {
  return `你是「喵一下」Persona Generation Pipeline 的 Stage 3：最终用户文案改写。

本阶段只负责把已经确定的内容说成人话。不允许修改 Stage 1 / Stage 2 的事实。

猫咪资料：${JSON.stringify({
    name: profile.name,
    gender: profile.gender,
    ageStage: profile.ageStage,
  })}
Grounded Traits：${JSON.stringify(stage1.coreTraits)}
Insights：${JSON.stringify(stage2)}
上一版人格 prior：${JSON.stringify(
    previousPersona
      ? {
          type: previousPersona.type,
          mbti: previousPersona.mbti,
          tags: previousPersona.tags,
          corePersonality: previousPersona.corePersonality,
          misunderstanding: previousPersona.misunderstanding,
          loveLanguageInsight: previousPersona.loveLanguageInsight ?? previousPersona.loveLanguage,
          ownerRelationship: previousPersona.ownerRelationship ?? previousPersona.ownerRole,
        }
      : null,
  )}

人格标题规则：
- 可理解性 > 准确 > 共鸣 > 创意。
- 禁止造词，禁止 XX控、XX王、XX机、营业、控场、发令、施压、稳态、高质互动、策略性靠近、仪式感极强、端庄定点、克制讨关注。
- 标题必须像一个人格名称，不要只是形容词短语。优先 “XX型/派/系”“XX的XX者”，或“主动亲近，但很有边界”这类轻句式。
- 优先 4-10 个中文字符；句式标题最多 12-14 字；如果超过 14 字必须改短；普通养猫人第一次看到就懂。
- 避免“亲近有边界”“按自己节奏营业的互动控”这类不自然标题；可改为“边界感亲近派”“慢热观察型”。
- 如果上一版 prior 与当前 grounded traits 没有明显冲突，保持标题语义方向、MBTI 和前 3 个 tags 的大部分重合。

Tags 规则：
- 必须是自然行为语言，每个 2-6 个中文字为佳。
- 好例：主动靠近、不爱强抱、先观察再靠近、喜欢待在附近、边界感强、会用眼神表达。
- 坏例：互动控场王、眼神发令机、克制讨关注、稳态陪伴、精准互动。

Insight 规则：
- 三条 insight 每条 35-60 个中文字符，2-3 行即可，不要写成 80-100 字报告。
- 只写用户能理解的相处观察，不要写心理学报告腔。

Final Copy Self-check：
输出前逐条检查：普通养猫人能否一眼看懂；有没有需要解释的词；有没有 AI 造词感；有没有把推测写成事实；有没有重复表达；有没有营销腔或心理学报告腔。任一不通过，自动改写。

输出严格 JSON：
{
  "personaTitle": "...",
  "mbti": "INFP-A",
  "summary": "...",
  "monologue": "...",
  "tags": ["...", "...", "...", "..."],
  "insights": {
    "misunderstanding": "...",
    "affection": "...",
    "ownerRelationship": "..."
  },
  "matchScore": 88,
  "traits": [
    {"label": "好奇心", "value": 70},
    {"label": "边界感", "value": 70},
    {"label": "亲近表达", "value": 70},
    {"label": "警觉度", "value": 70}
  ]
}`;
}

async function runPersonaAIStage<T>({
  stage,
  fallback,
  buildMessages,
  normalize,
  options,
}: {
  stage: PersonaPromptStage;
  fallback: T;
  buildMessages: (provider: AIProvider) => unknown[];
  normalize: (value: unknown, fallback: T) => T;
  options: {
    maxTokens: number;
    temperature: number;
    timeoutMs?: number;
    modelMode?: "text" | "vision";
    validate: (parsed: unknown) => boolean;
  };
}): Promise<{ output: T; log: PersonaStageLog }> {
  const startedAt = Date.now();
  try {
    const result = await callFirstAvailableJson<unknown>(buildMessages, {
      ...options,
      validate: options.validate,
    });
    const output = normalize(result.parsed, fallback);
    return {
      output,
      log: {
        stage,
        promptVersion: PERSONA_PROMPT_VERSIONS[stage],
        model: result.model,
        provider: providerLabel(result.provider),
        latencyMs: Date.now() - startedAt,
        tokenUsage: null,
        retryCount: 0,
        ok: true,
        output,
      },
    };
  } catch (error) {
    if (await shouldRequireRealAI()) throw error;
    return {
      output: fallback,
      log: {
        stage,
        promptVersion: PERSONA_PROMPT_VERSIONS[stage],
        model: "stable-fallback",
        provider: "local",
        latencyMs: Date.now() - startedAt,
        tokenUsage: null,
        retryCount: 0,
        ok: false,
        error: getErrorMessage(error),
        output: fallback,
      },
    };
  }
}

export async function generateCatPersonaServer(input: PersonaInput): Promise<CatPersona> {
  const data = validatePersonaInput(input);
  const generationId = createGenerationId();
  const stableStage1 = buildStableStage1(data);
  const inputTimestamp = new Date().toISOString();
  const inputSnapshot = personaInputSnapshot(data, stableStage1.behaviorProfile, inputTimestamp);
  const inputHash = hashInput(inputSnapshot);
  const stageLogs: PersonaStageLog[] = [];
  let retryCount = 0;

  await logAIDebugEvent("persona input snapshot", {
    generationId,
    inputHash,
    snapshot: inputSnapshot,
  });

  try {
    const stage1Run = await runPersonaAIStage<PersonaStage1Output>({
      stage: "stage1",
      fallback: stableStage1,
      buildMessages: (provider) => [
        {
          role: "system",
          content:
            "你是「喵一下」Persona Pipeline 的 Stage 1。只做结构化人格判断，严格区分证据与推断，禁止编造长期频率事实。只返回合法 JSON。",
        },
        {
          role: "user",
          content: buildVisionContent(
            provider,
            stage1Prompt(data, stableStage1.behaviorProfile),
            data.imageDataUrl,
          ),
        },
      ],
      normalize: (value, fallback) => normalizeStage1Output(value, fallback, data.profile),
      options: {
        maxTokens: 1200,
        temperature: 0.12,
        timeoutMs: data.imageDataUrl ? 24_000 : 16_000,
        modelMode: data.imageDataUrl ? "vision" : "text",
        validate: (parsed) => {
          const raw = getObjectRecord(parsed);
          return Boolean(
            raw?.behaviorProfile &&
            Array.isArray(raw.coreTraits) &&
            Array.isArray(raw.unsupportedClaims),
          );
        },
      },
    });
    stageLogs.push(stage1Run.log);

    const stableStage2 = buildStableStage2(stage1Run.output, data.profile);
    const stage2Run = await runPersonaAIStage<PersonaStage2Output>({
      stage: "stage2",
      fallback: stableStage2,
      buildMessages: () => [
        {
          role: "system",
          content:
            "你是「喵一下」Persona Pipeline 的 Stage 2。只基于 Stage 1 grounded traits 生成 3 条不同洞察，不新增事实。只返回合法 JSON。",
        },
        { role: "user", content: stage2Prompt(stage1Run.output) },
      ],
      normalize: normalizeStage2Output,
      options: {
        maxTokens: 820,
        temperature: 0.42,
        timeoutMs: 16_000,
        modelMode: "text",
        validate: (parsed) => {
          const raw = getObjectRecord(parsed);
          return Boolean(raw?.misunderstanding && raw.affection && raw.ownerRelationship);
        },
      },
    });
    let stage2Output = stage2Run.output;
    if (
      fatalUnsupportedClaimPatterns.some((pattern) => pattern.test(JSON.stringify(stage2Output)))
    ) {
      stage2Output = stableStage2;
      stage2Run.log.ok = false;
      stage2Run.log.error =
        "Stage 2 produced an unsupported long-term claim; replaced with grounded fallback.";
      stage2Run.log.output = stage2Output;
      retryCount += 1;
    }
    stageLogs.push(stage2Run.log);

    const stableStage3 = buildStableStage3(stage1Run.output, stage2Output, data.profile);
    const stage3Run = await runPersonaAIStage<PersonaStage3Output>({
      stage: "stage3",
      fallback: stableStage3,
      buildMessages: () => [
        {
          role: "system",
          content:
            "你是「喵一下」Persona Pipeline 的 Stage 3。只做人话改写，不改变 Stage 1/2 事实；标题和标签必须自然易懂。只返回合法 JSON。",
        },
        {
          role: "user",
          content: stage3Prompt(stage1Run.output, stage2Output, data.profile, data.previousPersona),
        },
      ],
      normalize: (value, fallback) => normalizeStage3Output(value, fallback, data.profile),
      options: {
        maxTokens: 920,
        temperature: 0.5,
        timeoutMs: 16_000,
        modelMode: "text",
        validate: (parsed) => {
          const raw = getObjectRecord(parsed);
          const insights = getObjectRecord(raw?.insights);
          return Boolean(
            raw?.personaTitle &&
            raw.mbti &&
            raw.summary &&
            Array.isArray(raw.tags) &&
            insights?.misunderstanding &&
            insights.affection &&
            insights.ownerRelationship,
          );
        },
      },
    });
    let finalCopy = stage3Run.output;
    const selfCheck = runFinalCopySelfCheck(finalCopy, data.profile);
    if (!selfCheck.passed) {
      finalCopy = repairStage3Output(finalCopy, stableStage3, data.profile);
      stage3Run.log.retryCount += 1;
      stage3Run.log.output = finalCopy;
      stage3Run.log.error = [
        stage3Run.log.error,
        `Stage 3 self-check repaired: ${selfCheck.issues.join(",")}`,
      ]
        .filter(Boolean)
        .join("; ");
      retryCount += 1;
    }

    let driftCheck = evaluatePersonaDrift(data, stage1Run.output, finalCopy);
    if (driftCheck.anchored && data.previousPersona) {
      finalCopy = repairStage3Output(
        applyPreviousPersonaAnchor(finalCopy, data.previousPersona, stableStage3, data.profile),
        stableStage3,
        data.profile,
      );
      driftCheck = {
        ...evaluatePersonaDrift(data, stage1Run.output, finalCopy),
        anchored: true,
        action: "anchor_previous",
        reason: driftCheck.reason,
        warnings: driftCheck.warnings,
      };
      stage3Run.log.retryCount += 1;
      stage3Run.log.output = finalCopy;
      stage3Run.log.error = [
        stage3Run.log.error,
        `Persona drift check anchored previous persona: ${driftCheck.reason}`,
      ]
        .filter(Boolean)
        .join("; ");
      retryCount += 1;
    }

    let evalResult = evaluatePersonaGeneration({
      profile: data.profile,
      stage1: stage1Run.output,
      stage2: stage2Output,
      finalCopy,
      consistency: driftCheck,
    });
    if (!evalResult.passed && evalResult.fatalRules.some((rule) => !rule.passed)) {
      finalCopy =
        driftCheck.anchored && data.previousPersona
          ? repairStage3Output(
              applyPreviousPersonaAnchor(
                stableStage3,
                data.previousPersona,
                stableStage3,
                data.profile,
              ),
              stableStage3,
              data.profile,
            )
          : stableStage3;
      evalResult = evaluatePersonaGeneration({
        profile: data.profile,
        stage1: stage1Run.output,
        stage2: stage2Output,
        finalCopy,
        consistency: driftCheck,
      });
      stage3Run.log.ok = false;
      stage3Run.log.error = [
        stage3Run.log.error,
        "Fatal eval rule triggered; replaced Stage 3 only.",
      ]
        .filter(Boolean)
        .join("; ");
      stage3Run.log.output = finalCopy;
      stage3Run.log.retryCount += 1;
      retryCount += 1;
    }
    stageLogs.push(stage3Run.log);

    const modelSummary = stageLogs
      .map((log) => `${log.stage}:${log.provider}/${log.model}`)
      .join(", ");
    const persona = {
      ...stage3ToPersona(finalCopy, stage1Run.output, data.profile),
      provider: "persona-pipeline",
      model: modelSummary,
    } satisfies CatPersona;

    if (await shouldExposePersonaDebug()) {
      const generation: PersonaPipelineDebug = {
        generationId,
        inputHash,
        timestamp: inputTimestamp,
        promptVersion: PERSONA_PROMPT_VERSIONS,
        model: modelSummary,
        rawInputs: inputSnapshot,
        questionnaireAnswers: toJsonValue(data.profile.quiz ?? {}),
        behaviorProfile: toJsonValue(stage1Run.output.behaviorProfile),
        groundedTraits: toJsonValue(stage1Run.output.coreTraits),
        unsupportedClaims: toJsonValue(stage1Run.output.unsupportedClaims),
        insights: toJsonValue(stage2Output),
        finalCopy: toJsonValue(finalCopy),
        evalResult: toJsonValue(evalResult),
        stageLogs: toJsonValue(stageLogs),
        retryCount,
      };
      persona.generation = generation;
    }

    await logAIDebugEvent("persona pipeline output", {
      generationId,
      inputHash,
      stage1: stage1Run.output,
      stage2: stage2Output,
      finalCopy,
      evalResult,
      stageLogs,
    });

    return persona;
  } catch (error) {
    console.error("NEKO persona pipeline failed", error);
    if (await shouldRequireRealAI()) throw new Error(getUserFacingAIMessage("persona", error));
    const fallback = buildStablePersona(data.profile);
    if (await shouldExposePersonaDebug()) {
      fallback.generation = {
        generationId,
        inputHash,
        timestamp: inputTimestamp,
        promptVersion: PERSONA_PROMPT_VERSIONS,
        model: "stable-fallback",
        rawInputs: inputSnapshot,
        questionnaireAnswers: toJsonValue(data.profile.quiz ?? {}),
        behaviorProfile: toJsonValue(stableStage1.behaviorProfile),
        groundedTraits: toJsonValue(stableStage1.coreTraits),
        unsupportedClaims: toJsonValue(stableStage1.unsupportedClaims),
        insights: toJsonValue(buildStableStage2(stableStage1, data.profile)),
        finalCopy: null,
        evalResult: null,
        stageLogs: toJsonValue(stageLogs),
        retryCount,
      };
    }
    return fallback;
  }
}

export const generateCatPersona = createServerFn({ method: "POST" })
  .inputValidator(validatePersonaInput)
  .handler(async ({ data }): Promise<CatPersona> => generateCatPersonaServer(data));

export async function generateCatVoiceServer(input: VoiceInput): Promise<Voice> {
  const data = validateVoiceInput(input);
  const prompt = `你是「喵一下」的猫咪心声观察者。你不是在描述照片，也不是给照片配一句通用的可爱宠物文案。

你要从猫咪当前真实可见的动作、表情、视线和环境互动中，找出这一刻最有意思、最有辨识度的一个行为细节，再结合已有的人格档案，推测它正在关注什么、可能想做什么、为什么还没有行动，以及它会如何评价眼前发生的事。

【猫咪资料】
${JSON.stringify(data.profile)}

【已有猫咪人格】
${JSON.stringify(data.persona)}

【用户补充场景】
${data.scene || "无补充场景"}

语言总原则：
1. 第一优先级是人话。普通养猫人第一次看到，就应该马上懂。
2. 禁止创造新概念。不要把简单行为包装成自造术语。
3. 不要写成心理学报告、品牌广告、MBTI 博主或学术分析。
4. 先描述主人能观察到的真实行为，再给一层轻度解释。

禁止在 tags、analysis、subtext 和分享 insight 中使用这类抽象包装词：
仪式感、施压、掌控节奏、节奏掌控、秩序感、克制讨关注、高度敏锐、策略性靠近、精准表达、端庄定点、稳态陪伴、低频高质互动、眼神施压、眼神催促。
坏例：眼神施压、端庄定点、克制讨关注、稳态陪伴、低频高质互动。
好例：会用眼神表达、喜欢待在附近、先观察再靠近、不爱大声催促、有自己的边界、熟了会更黏。

请先在内部判断，不输出推理过程：
1. 猫正在看什么？身体是在放松、准备行动、观察还是回避？
2. 哪个物体、人或动作最吸引它？
3. 是否存在“想靠近但没靠近、想行动但还在等、表面不在意却一直盯着”等有证据的反差？
4. 当前行为与已有的人格有哪些一致或反差？
优先选择其中最有戏的一个点，不要试图一次解释整张照片。

人格档案只影响它说话的口吻、反应方式、靠近方式和表达亲近的方式。不要机械重复 persona 中“温柔、观察型、慢热”等标签，也不要先套人格再改写照片事实。同样的对象，应让冲动型、观察型、傲娇型猫表现出不同态度。

字段要求：
- text：最重要字段。第一人称猫咪口吻，优先 12–30 个中文字，最多 2 句；必须针对照片中的一个具体对象或行为，口语化，有一点猫的脾气、幽默或反差。写它对眼前事情的态度，不写“我喜欢你、我要陪你、我很开心”等泛泛情感。
- subtext：15–30 个中文字，第三人称或旁白，比 text 安静一点；揭示表面行为之下的小反差，让主人觉得“它确实经常这样”，不能换句话重复 text。
- analysis：拆成 observation 和 personalityInterpretation，两段合计优先 40–60 个中文字。observation 只保留一个具体可见行为及其可能含义；personalityInterpretation 用一句话联系既有人格。先写真实能看到的行为，再做轻度解释。不要重复罗列前爪、仰头、注视、没有扑等同一组事实，不罗列与行为无关的花、家具或装饰。
- mood：2–6 个中文字，描述当前行为状态，例如观察中、跃跃欲试、假装淡定、正在评估、想玩但端着、警觉围观；禁止只写开心、温柔、治愈、平静等抽象情绪。
- tags：严格生成 3 个自然口语标签，每个优先 4–10 个中文字，依次表达“当前行为、行为模式、反差或趣味”。必须一眼能懂，不造抽象新词，不只写人格形容词，不带 #；不要使用可爱猫咪、萌宠、治愈等泛标签。

不要频繁使用“赏脸、本喵、勉强、人类、铲屎官、高贵、本小姐”等通用傲娇猫套话。趣味必须来自当前可见行为，而不是把所有猫写成同一种傲娇角色。

优先寻找有事实支撑的“A，但其实 B”，但不能为了搞笑虚构画面中不存在的动作、人物、情绪事件或长期习惯。照片只能证明可见行为，不能据此确定它喜欢或讨厌谁、嫉妒、想念主人、长期粘人或有心理问题。证据不足时，宁可写一个具体的小心思，也不要上升到深刻情感或医疗判断。

避免固定套用“别看我、我只是、表面其实、你继续我先、不是不只是”等句式。请在内部形成至少 3 个不同角度的候选表达，最终只选最符合当前照片、人格且最不像模板的一条。

【喵一下文风】
聪明、自然、轻幽默、有猫味、具体、有一点小脾气，让主人会心一笑。禁止 AI 腔、看图作文、宠物公众号文案、鸡汤、过度煽情、小红书营销腔、大量“喵～”，以及“绝绝子、谁懂、可爱暴击、治愈一整天”等表达。

严格返回 JSON，不要 Markdown，不要附加说明：
{
  "text": "猫咪第一人称心声",
  "subtext": "它没说出口的小心思",
  "analysis": {
    "observation": "一个具体行为及其可能含义",
    "personalityInterpretation": "该行为和既有人格的自然联系"
  },
  "mood": "当前行为状态",
  "tags": ["标签1", "标签2", "标签3"]
}

输出前在内部自检：
1. text 换成另一只猫是否仍成立；若成立，请重写。
2. text 是否针对照片中的具体行为或物体；若没有，请重写。
3. analysis 是否提供了超越表面描述的新理解；若只是看图作文，请重写。
4. subtext 是否多揭示了一层小心思；若只是重复 text，请重写。
5. tags 是否体现这一刻；若只是通用人格词，请重写。
6. 这句话一个普通养猫人第一次看到，能不能立刻理解；如果不能，请改成更简单的中文。
7. 是否为了温柔牺牲了这只猫的脾气和个性；若是，请重写。`;
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
            "你是「喵一下」的猫咪心声观察者。先观察可见行为，再结合既有人格创作具体、有猫味、轻幽默的心声。事实优先，不看图作文、不套模板、不虚构、不做医疗判断。只返回合法 JSON。",
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
