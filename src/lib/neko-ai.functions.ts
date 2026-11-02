import { createServerFn } from "@tanstack/react-start";
import type {
  CatPersona,
  CatProfile,
  JsonValue,
  PersonaBondSummary,
  PersonaDimension,
  PersonaDimensionKey,
  PersonaDirection,
  PersonaInsights,
  PersonaStrength,
  PersonaSummary,
} from "@/components/neko/catProfileStore";
import type { Voice } from "@/components/neko/app/voicesStore";
import {
  buildBehaviorProfile,
  buildCombinationInsights,
  questionnaireAnswersForPrompt,
  type QuestionnaireVersion,
  type QuizAnswer,
} from "@/lib/neko-behavior-profile";
import { PerformanceTrace, elapsedMs, monotonicNow, performanceErrorCategory, performanceNetworkCode } from "./performance-trace";
import { joinVoiceAnalysis, limitVoiceAnalysis, VOICE_ANALYSIS_GENERATION_MAX_CHARACTERS } from "./voice-analysis";
import { buildVoiceAnalysisStylePrompt, selectVoiceAnalysisStyleExamples, VOICE_ANALYSIS_STYLE_VERSION } from "./voice-analysis-style";
import {
  parseQuestionnaireAnswers as quizAnswersFromJson,
  personaQuestionnaireAnswers as extractPreviousQuiz,
} from "@/lib/persona-questionnaire";

export type PersonaInput = {
  profile: CatProfile;
  questionnaireVersion?: QuestionnaireVersion;
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

type VoiceCurrentIntent =
  | "想靠近"
  | "想观察"
  | "想玩"
  | "想抓"
  | "想等待"
  | "想让主人参与"
  | "想自己处理"
  | "想保持距离"
  | "想休息"
  | "想获得关注";

type VoiceGenerationOutput = {
  visibleObservations: string[];
  currentIntent: VoiceCurrentIntent;
  voiceLine: string;
  subtext: string;
  analysis: {
    observation: string;
    personalityInterpretation: string;
  };
  mood: string;
  sceneTags: string[];
  tags?: string[]; // Legacy responses remain readable; the schema emits sceneTags.
};

const VOICE_CURRENT_INTENTS: VoiceCurrentIntent[] = [
  "想靠近",
  "想观察",
  "想玩",
  "想抓",
  "想等待",
  "想让主人参与",
  "想自己处理",
  "想保持距离",
  "想休息",
  "想获得关注",
];

const VOICE_TAG_MAX_CHARACTERS = 5;

const VOICE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "visibleObservations",
    "currentIntent",
    "voiceLine",
    "subtext",
    "analysis",
    "mood",
    "sceneTags",
  ],
  properties: {
    visibleObservations: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string" },
    },
    currentIntent: { type: "string", enum: VOICE_CURRENT_INTENTS },
    voiceLine: { type: "string", minLength: 14, maxLength: 28 },
    subtext: { type: "string" },
    analysis: {
      type: "object",
      additionalProperties: false,
      required: ["observation", "personalityInterpretation"],
      properties: {
        observation: { type: "string" },
        personalityInterpretation: { type: "string" },
      },
    },
    mood: { type: "string" },
    sceneTags: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", minLength: 2, maxLength: VOICE_TAG_MAX_CHARACTERS },
    },
  },
} as const;

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
  stage1: "persona_stage1_v4_questionnaire_evidence",
  stage2: "persona_stage2_v1",
  stage3: "persona_stage3_protocol_v2",
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
  persona: PersonaSummary;
  dimensions: PersonaDimension[];
  insights: PersonaInsights;
  bondSummary: PersonaBondSummary;
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

type AIValidationContext = {
  provider: AIProvider;
  model: string;
  attempt: number;
  durationMs: number;
};

type AIDiagnostics = { trace: PerformanceTrace; stage: string; attempt?: number };

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

function strictLengthCopy(value: string, fallback: string, min: number, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const length = charLength(normalized);
  return length >= min && length <= max ? normalized : fallback;
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

function buildStablePersona(
  profile: CatProfile,
  questionnaireVersion?: QuestionnaireVersion,
): CatPersona {
  const behavior = buildBehaviorProfile(profile.quiz, questionnaireVersion);
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

function getQuizSignal(profile: CatProfile, index: number, supportedChoices: readonly QuizAnswer[]) {
  const answer = profile.quiz?.[index];
  return (answer === "a" || answer === "b" || answer === "c") && supportedChoices.includes(answer)
    ? `Q${index + 1}:${answer.toUpperCase()}`
    : null;
}

function uniqueSignals(values: Array<string | null | undefined>) {
  return values.filter(
    (value, index, list): value is string => Boolean(value) && list.indexOf(value) === index,
  );
}

function toPersonaBehaviorProfile(
  profile: CatProfile,
  questionnaireVersion?: QuestionnaireVersion,
): PersonaBehaviorProfile {
  const behavior = buildBehaviorProfile(profile.quiz, questionnaireVersion);
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
  const ios = data.questionnaireVersion === "ios-v1";
  const behavior = buildBehaviorProfile(profile.quiz, data.questionnaireVersion);
  const behaviorProfile = toPersonaBehaviorProfile(profile, data.questionnaireVersion);
  const traits: PersonaCoreTrait[] = [];
  const signal = (index: number, choices: readonly QuizAnswer[]) =>
    getQuizSignal(profile, index, choices);
  const contactSignals = uniqueSignals([
    signal(2, ios ? ["a", "b"] : ["a", "c"]),
    signal(3, ["a", "b"]),
    signal(6, ios ? ["a"] : ["a", "b"]),
    signal(7, ios ? ["a", "b"] : ["a", "b", "c"]),
  ]);
  const boundarySignal = signal(5, ["a", "b"]);
  const curiositySignals = uniqueSignals([
    signal(1, ["a", "b"]),
    // Only the web option explicitly describes playing together.
    ios ? null : signal(7, ["b"]),
  ]);
  const cautionSignals = uniqueSignals([
    signal(0, ["b", "c"]),
    signal(1, ["b"]),
    signal(4, ios ? ["a", "b"] : ["a"]),
  ]);

  addTraitIfSupported(traits, {
    trait: "主动亲近",
    description: "它会通过主动迎接、寻找互动或直接表达需求来和你交流。",
    supportedBy: [
      signal(2, ["a"]),
      signal(3, ["a"]),
      ios ? signal(7, ["a"]) : signal(6, ["a"]),
    ],
    confidence: behaviorProfile.attachmentExpression >= 64 ? 0.82 : 0.62,
  });

  // A compound trait needs evidence for both halves, not just any two answers.
  if (contactSignals.length && boundarySignal) {
    addTraitIfSupported(traits, {
      trait: "亲近但有边界",
      description: "它愿意靠近或一起待着，遇到不喜欢的互动也会表达边界。",
      supportedBy: [...contactSignals, boundarySignal],
      confidence: behaviorProfile.boundary >= 60 ? 0.84 : 0.64,
    });
  }

  if (curiositySignals.length && cautionSignals.length) {
    addTraitIfSupported(traits, {
      trait: "好奇但谨慎",
      description: "它有探索或玩耍的兴趣，遇到陌生情况或动静时也会先确认。",
      supportedBy: [...curiositySignals, ...cautionSignals],
      confidence: behaviorProfile.curiosity >= 60 && behaviorProfile.caution >= 60 ? 0.86 : 0.66,
    });
  }

  addTraitIfSupported(traits, {
    trait: "安静表达亲近",
    description: "它会用淡定地出现、在附近等待或安静共处来表达亲近。",
    supportedBy: [
      signal(2, ios ? ["b"] : ["c"]),
      signal(3, ["b"]),
      ios ? null : signal(6, ["b"]),
      signal(7, ios ? ["b"] : ["c"]),
    ],
    confidence:
      (behavior.attachment ?? 50) >= 60 && (behavior.expressiveness ?? 50) <= 46 ? 0.82 : 0.63,
  });

  addTraitIfSupported(traits, {
    trait: "先观察再行动",
    description: "遇到变化或互动时，它更习惯先看清楚，再决定下一步。",
    supportedBy: [signal(0, ["b"]), signal(1, ["b"]), signal(4, ios ? ["b"] : ["a"])],
    confidence: behaviorProfile.environmentalSensitivity >= 60 ? 0.8 : 0.62,
  });

  if (ios) {
    addTraitIfSupported(traits, {
      trait: "喜欢自己安排",
      description: "它常会先做自己的事或自己解决需求，互动更看当下的需要。",
      supportedBy: [
        signal(2, ["c"]),
        signal(3, ["c"]),
        signal(6, ["b", "c"]),
        signal(7, ["c"]),
      ],
      confidence: 0.72,
    });
  }
  // Video observations still go to Stage 1. Their presence alone is not evidence
  // of "observing first"; this deterministic fallback must not invent that trait.

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

const PERSONA_DIMENSION_DEFINITIONS: ReadonlyArray<
  Pick<PersonaDimension, "key" | "name" | "leftLabel" | "rightLabel">
> = [
  { key: "social", name: "社交倾向", leftLabel: "主动亲近", rightLabel: "慢热谨慎" },
  { key: "exploration", name: "探索倾向", leftLabel: "好奇探索", rightLabel: "稳定保守" },
  { key: "companionship", name: "陪伴倾向", leftLabel: "喜欢陪伴", rightLabel: "独立自主" },
  { key: "boundary", name: "边界倾向", leftLabel: "接受互动", rightLabel: "边界明确" },
] as const;

const PERSONA_DIRECTION_VALUES: Record<PersonaDirection, number> = {
  left: 85,
  center_left: 68,
  center: 50,
  center_right: 32,
  right: 15,
};

function directionFromLeftAffinity(value: number): PersonaDirection {
  const score = clampScore(value, 50);
  if (score >= 80) return "left";
  if (score >= 60) return "center_left";
  if (score > 40) return "center";
  if (score > 20) return "center_right";
  return "right";
}

function strengthFromLeftAffinity(value: number): PersonaStrength {
  const distance = Math.abs(clampScore(value, 50) - 50);
  if (distance >= 30) return "strong";
  if (distance >= 14) return "medium";
  return "weak";
}

export function personaDimensionsFromBehavior(
  behavior: PersonaBehaviorProfile,
): PersonaDimension[] {
  const leftAffinities: Record<PersonaDimensionKey, number> = {
    social: behavior.sociability,
    exploration: behavior.curiosity,
    companionship: Math.round((behavior.attachmentExpression + (100 - behavior.independence)) / 2),
    boundary: 100 - behavior.boundary,
  };
  return PERSONA_DIMENSION_DEFINITIONS.map((definition) => {
    const value = leftAffinities[definition.key];
    return {
      ...definition,
      direction: directionFromLeftAffinity(value),
      strength: strengthFromLeftAffinity(value),
    };
  });
}

function legacyTraitsFromDimensions(dimensions: PersonaDimension[]): CatPersona["traits"] {
  return dimensions.map((dimension) => ({
    label: dimension.name,
    value: PERSONA_DIRECTION_VALUES[dimension.direction],
  }));
}

function buildStableStage3(
  stage1: PersonaStage1Output,
  stage2: PersonaStage2Output,
  profile: CatProfile,
): PersonaStage3Output {
  const summaryFallback =
    "它习惯先观察环境变化，再按自己的节奏决定是否靠近或参与互动。";
  const misunderstandingFallback =
    "它不是对眼前的互动没兴趣，而是更习惯先确认安全和节奏再靠近。";
  const affectionFallback =
    "它会用待在附近、留意你的动向和适时回应，表达对你的亲近。";
  const relationshipFallback =
    "你是它生活里稳定而熟悉的重要参照，也是它愿意安心靠近的人。";
  const bondFallback =
    "不用时时靠得很近，它知道你一直是可以安心回来的地方。";
  const relationship = strictLengthCopy(
    stage2.ownerRelationship.explanation,
    relationshipFallback,
    28,
    45,
  );
  return {
    persona: {
      personaTitle: choosePersonaTitle(stage1),
      mbti: mappedMbti(stage1.behaviorProfile),
      summary: strictLengthCopy(
        stage1.coreTraits[0]?.description ??
          summaryFallback,
        summaryFallback,
        28,
        42,
      ),
    },
    dimensions: personaDimensionsFromBehavior(stage1.behaviorProfile),
    insights: {
      misunderstanding: {
        title: "你可能一直误会它的一件事",
        conclusion: strictLengthCopy(
          stage2.misunderstanding.explanation,
          misunderstandingFallback,
          28,
          45,
        ),
      },
      affection: {
        title: "它表达喜欢的方式",
        conclusion: strictLengthCopy(
          stage2.affection.explanation,
          affectionFallback,
          28,
          45,
        ),
      },
      relationship: {
        title: "在它眼里，你的位置",
        conclusion: relationship,
      },
    },
    bondSummary: {
      title: `${profile.name}和你的关系`,
      quote: strictLengthCopy(
        stage2.ownerRelationship.claim || bondFallback,
        bondFallback,
        20,
        35,
      ),
    },
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

function previousPersonaForIdenticalQuiz(data: PersonaInput): CatPersona | null {
  if (!data.previousPersona) return null;
  const changes = countQuizChanges(
    quizAnswersFromJson(data.profile.quiz ?? {}),
    extractPreviousQuiz(data.previousPersona),
  );
  return changes === 0 ? data.previousPersona : null;
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
    previous.questionnaireAnswers ||
      generation?.rawInputs ||
      generation?.behaviorProfile ||
      generation?.questionnaireAnswers,
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
  const previousTitle = normalizePersonaType(
    previous.persona?.personaTitle ?? previous.type,
    data.profile,
    "",
  );
  const currentTitle = normalizePersonaType(finalCopy.persona.personaTitle, data.profile, "");
  const previousTags = uniqueNaturalLabels(previous.tags ?? [], data.profile, 8);
  const currentTags = tagsFromStage1(stage1, data.profile);
  const previousText = [
    previousTitle,
    previous.corePersonality,
    previous.analysis,
    ...previousTags,
  ].join("");
  const currentText = [
    currentTitle,
    finalCopy.persona.summary,
    ...currentTags,
    ...stage1.coreTraits.map((trait) => `${trait.trait}${trait.description}`),
  ].join("");
  const previousInsights = [
    previous.misunderstanding,
    previous.loveLanguageInsight ?? previous.loveLanguage,
    previous.ownerRelationship ?? previous.ownerRole,
  ].filter(Boolean) as string[];
  const currentInsights = [
    finalCopy.insights.misunderstanding.conclusion,
    finalCopy.insights.affection.conclusion,
    finalCopy.insights.relationship.conclusion,
  ];
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
  const mbtiStable = !previous.mbti || previous.mbti === finalCopy.persona.mbti;
  const hasRaw = previousHasRawInputs(previous);

  // The questionnaire is the only retention gate. Even one changed answer
  // disables the prior, regardless of similar traits, copy or model scores.
  const anchored = quizChanges === 0;

  const warnings = [];
  if (anchored && tagOverlap < 0.67) warnings.push("tag_overlap_repaired_to_previous_anchor");
  if (anchored && !mbtiStable) warnings.push("mbti_repaired_to_previous_anchor");

  return {
    hasPrevious: true,
    previousHasRawInputs: hasRaw,
    anchored,
    action: anchored ? "anchor_previous" : "keep_current",
    reason: anchored
      ? "identical_questionnaire"
      : quizChanges === null
        ? "previous_questionnaire_unavailable"
        : "questionnaire_changed",
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
  const previousTitle = normalizePersonaType(
    previous.persona?.personaTitle ?? previous.type,
    profile,
    "",
  );
  const previousMbti = /^[IE][NS][FT][JP]-[AT]$/.test(previous.mbti) ? previous.mbti : "";
  return {
    ...finalCopy,
    persona: {
      personaTitle: previousTitle || finalCopy.persona.personaTitle,
      mbti: previousMbti || finalCopy.persona.mbti,
      summary: strictLengthCopy(
        normalizeCatFacts(
          previous.persona?.summary ?? previous.corePersonality ?? previous.analysis ?? "",
          profile,
        ),
        finalCopy.persona.summary,
        28,
        42,
      ),
    },
    insights: {
      misunderstanding: {
        title: finalCopy.insights.misunderstanding.title,
        conclusion: normalizeFinalInsight(
          previous.insights?.misunderstanding.conclusion ?? previous.misunderstanding,
          finalCopy.insights.misunderstanding.conclusion,
        ),
      },
      affection: {
        title: finalCopy.insights.affection.title,
        conclusion: normalizeFinalInsight(
          previous.insights?.affection.conclusion ??
            previous.loveLanguageInsight ??
            previous.loveLanguage,
          finalCopy.insights.affection.conclusion,
        ),
      },
      relationship: {
        title: finalCopy.insights.relationship.title,
        conclusion: normalizeFinalInsight(
          previous.insights?.relationship.conclusion ??
            previous.ownerRelationship ??
            previous.ownerRole,
          finalCopy.insights.relationship.conclusion,
        ),
      },
    },
    bondSummary: previous.bondSummary ?? fallback.bondSummary,
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
  if (typeof value === "string") return strictLengthCopy(value, fallback, 28, 45);
  const raw = getObjectRecord(value);
  return strictLengthCopy(
    asText(raw?.text ?? raw?.explanation ?? raw?.claim),
    fallback,
    28,
    45,
  );
}

function normalizeStage3Output(
  value: unknown,
  fallback: PersonaStage3Output,
  profile: CatProfile,
): PersonaStage3Output {
  const raw = getObjectRecord(value) ?? {};
  const rawPersona = getObjectRecord(raw.persona) ?? {};
  const rawInsights = getObjectRecord(raw.insights) ?? {};
  const rawBond = getObjectRecord(raw.bondSummary) ?? {};
  const insight = (key: keyof PersonaInsights) => {
    const entry = getObjectRecord(rawInsights[key]) ?? {};
    return {
      title: asText(entry.title, fallback.insights[key].title),
      conclusion: strictLengthCopy(
        normalizeCatFacts(entry.conclusion, profile),
        fallback.insights[key].conclusion,
        28,
        45,
      ),
    };
  };
  return {
    persona: {
      personaTitle: normalizePersonaType(
        rawPersona.personaTitle,
        profile,
        fallback.persona.personaTitle,
      ),
      mbti: /^[IE][NS][FT][JP]-[AT]$/.test(asText(rawPersona.mbti))
        ? asText(rawPersona.mbti)
        : fallback.persona.mbti,
      summary: strictLengthCopy(
        normalizeCatFacts(rawPersona.summary, profile),
        fallback.persona.summary,
        28,
        42,
      ),
    },
    dimensions: fallback.dimensions,
    insights: {
      misunderstanding: insight("misunderstanding"),
      affection: insight("affection"),
      relationship: insight("relationship"),
    },
    bondSummary: {
      title: asText(rawBond.title, fallback.bondSummary.title),
      quote: strictLengthCopy(
        normalizeCatFacts(rawBond.quote, profile),
        fallback.bondSummary.quote,
        20,
        35,
      ),
    },
  };
}

const PERSONA_DIRECTIONS = new Set<PersonaDirection>([
  "left",
  "center_left",
  "center",
  "center_right",
  "right",
]);
const PERSONA_STRENGTHS = new Set<PersonaStrength>(["weak", "medium", "strong"]);
const PERSONA_DIMENSION_KEYS = new Set<PersonaDimensionKey>([
  "social",
  "exploration",
  "companionship",
  "boundary",
]);

function hasExactKeys(record: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

const FINAL_COPY_LENGTHS = {
  personaTitle: { min: 4, max: 12 },
  summary: { min: 28, max: 42 },
  insight: { min: 28, max: 45 },
  bondSummary: { min: 20, max: 35 },
} as const;

const genericFinalCopyPatterns = [
  /它很(?:可爱|温柔|特别|有个性)/,
  /独一无二/,
  /治愈(?:你|一切|每一天)/,
  /充满爱/,
  /性格很好/,
];

function hasLengthInRange(value: string, range: { min: number; max: number }) {
  const length = charLength(value);
  return length >= range.min && length <= range.max;
}

function normalizedSimilarityText(value: string) {
  return value.replace(/[，。！？、；：,.!?;:\s]/g, "");
}

function finalCopyIsHighlySimilar(left: string, right: string) {
  const a = normalizedSimilarityText(left);
  const b = normalizedSimilarityText(right);
  if (!a || !b) return false;
  const contained = Math.min(charLength(a), charLength(b)) >= 12 && (a.includes(b) || b.includes(a));
  return contained || semanticSimilarity(a, b) >= 0.5;
}

function hasIncrementalFinalCopy(
  misunderstanding: string,
  affection: string,
  relationship: string,
  bondSummary: string,
) {
  const sections = [misunderstanding, affection, relationship, bondSummary];
  for (let left = 0; left < sections.length; left += 1) {
    for (let right = left + 1; right < sections.length; right += 1) {
      if (finalCopyIsHighlySimilar(sections[left], sections[right])) return false;
    }
  }
  return true;
}

function summaryHasCorePersonaScope(value: string) {
  return !/(?:你|主人|我们|彼此|关系|比如|例如|每当|有一次)/.test(value);
}

function hasMisunderstandingContrast(value: string) {
  return /不是[^。！？]{2,}而是[^。！？]{2,}/.test(value);
}

function hasConcreteAffectionBehavior(value: string) {
  return /(?:靠近|待在|留在|跟着|看着|注视|眼神|蹭|贴|碰|呼噜|尾巴|守在|坐在|躺在|玩耍|回应|迎接|等你|附近|同一空间)/.test(value);
}

function describesOwnerRole(value: string) {
  return value.includes("你") &&
    /(?:参照|依靠|归处|底气|伙伴|家人|安全感|安心|放心|信任|熟悉|稳定|重要|可以.+的人|愿意.+的人)/.test(value);
}

function isEmotionalBondClosing(value: string) {
  const analyzesPersona = /(?:人格|倾向|维度|行为模式|说明|意味着|表明|更像|不是.+而是|因为|所以)/.test(value);
  const hasWarmRelation = /(?:你|彼此|一起|身边|回来|回到|安心|放心|陪着)/.test(value);
  return !analyzesPersona && hasWarmRelation;
}

function hasGenericFinalCopy(value: string) {
  return genericFinalCopyPatterns.some((pattern) => pattern.test(value));
}

export function validatePersonaResultProtocol(value: unknown): boolean {
  const raw = getObjectRecord(value);
  if (!raw || !hasExactKeys(raw, ["persona", "dimensions", "insights", "bondSummary"]))
    return false;
  const persona = getObjectRecord(raw.persona);
  const insights = getObjectRecord(raw.insights);
  const bond = getObjectRecord(raw.bondSummary);
  if (!persona || !insights || !bond) return false;
  if (!hasExactKeys(persona, ["mbti", "personaTitle", "summary"])) return false;
  if (!hasExactKeys(insights, ["misunderstanding", "affection", "relationship"])) return false;
  if (!hasExactKeys(bond, ["title", "quote"])) return false;
  if (!asText(persona.mbti) || !asText(persona.personaTitle) || !asText(persona.summary))
    return false;
  const personaTitle = asText(persona.personaTitle);
  const summary = asText(persona.summary);
  const bondQuote = asText(bond.quote);
  if (
    !hasLengthInRange(personaTitle, FINAL_COPY_LENGTHS.personaTitle) ||
    !hasLengthInRange(summary, FINAL_COPY_LENGTHS.summary) ||
    !summaryHasCorePersonaScope(summary)
  )
    return false;
  if (
    !asText(bond.title) ||
    !hasLengthInRange(bondQuote, FINAL_COPY_LENGTHS.bondSummary) ||
    !isEmotionalBondClosing(bondQuote)
  )
    return false;

  const conclusions: Record<"misunderstanding" | "affection" | "relationship", string> = {
    misunderstanding: "",
    affection: "",
    relationship: "",
  };
  for (const key of ["misunderstanding", "affection", "relationship"] as const) {
    const item = getObjectRecord(insights[key]);
    if (!item || !hasExactKeys(item, ["title", "conclusion"])) return false;
    const conclusion = asText(item.conclusion);
    if (!asText(item.title) || !hasLengthInRange(conclusion, FINAL_COPY_LENGTHS.insight))
      return false;
    conclusions[key] = conclusion;
  }
  if (asText(getObjectRecord(insights.misunderstanding)?.title) !== "你可能一直误会它的一件事") return false;
  if (asText(getObjectRecord(insights.affection)?.title) !== "它表达喜欢的方式") return false;
  if (asText(getObjectRecord(insights.relationship)?.title) !== "在它眼里，你的位置") return false;
  if (!hasMisunderstandingContrast(conclusions.misunderstanding)) return false;
  if (!hasConcreteAffectionBehavior(conclusions.affection)) return false;
  if (!describesOwnerRole(conclusions.relationship)) return false;
  if (
    hasGenericFinalCopy(
      [summary, conclusions.misunderstanding, conclusions.affection, conclusions.relationship, bondQuote].join("\n"),
    )
  )
    return false;
  if (
    !hasIncrementalFinalCopy(
      conclusions.misunderstanding,
      conclusions.affection,
      conclusions.relationship,
      bondQuote,
    )
  )
    return false;

  if (!Array.isArray(raw.dimensions) || raw.dimensions.length !== 4) return false;
  const seen = new Set<string>();
  for (const value of raw.dimensions) {
    const dimension = getObjectRecord(value);
    if (
      !dimension ||
      !hasExactKeys(dimension, ["key", "name", "leftLabel", "rightLabel", "direction", "strength"])
    )
      return false;
    const key = asText(dimension.key) as PersonaDimensionKey;
    if (!PERSONA_DIMENSION_KEYS.has(key) || seen.has(key)) return false;
    seen.add(key);
    const expected = PERSONA_DIMENSION_DEFINITIONS.find((item) => item.key === key);
    if (
      !expected ||
      dimension.name !== expected.name ||
      dimension.leftLabel !== expected.leftLabel ||
      dimension.rightLabel !== expected.rightLabel ||
      !PERSONA_DIRECTIONS.has(dimension.direction as PersonaDirection) ||
      !PERSONA_STRENGTHS.has(dimension.strength as PersonaStrength)
    )
      return false;
  }
  return seen.size === 4;
}

function validatePersonaStage3ModelOutput(value: unknown, dimensions: PersonaDimension[]) {
  const raw = getObjectRecord(value);
  if (!raw || !hasExactKeys(raw, ["persona", "insights", "bondSummary"])) return false;
  return validatePersonaResultProtocol({ ...raw, dimensions });
}

// Diagnostics only. The existing boolean validators remain the acceptance gate.
function personaValidationReasons(stage: PersonaPromptStage, value: unknown): string[] {
  const raw = getObjectRecord(value);
  if (!raw) return ["root_not_object"];
  if (stage === "stage1") {
    return [!raw.behaviorProfile && "behavior_profile_missing", !Array.isArray(raw.coreTraits) && "core_traits_not_array",
      !Array.isArray(raw.unsupportedClaims) && "unsupported_claims_not_array"].filter((v): v is string => Boolean(v));
  }
  if (stage === "stage2") {
    return [!raw.misunderstanding && "misunderstanding_missing", !raw.affection && "affection_missing",
      !raw.ownerRelationship && "relationship_missing"].filter((v): v is string => Boolean(v));
  }
  const reasons: string[] = [];
  if (!hasExactKeys(raw, ["persona", "insights", "bondSummary"])) reasons.push("root_keys");
  const check = (
    value: unknown,
    name: string,
    fields: Record<string, { min: number; max: number } | null>,
  ) => {
    const object = getObjectRecord(value);
    if (!object) { reasons.push(`${name}_missing`); return; }
    if (!hasExactKeys(object, Object.keys(fields))) reasons.push(`${name}_keys`);
    for (const [field, range] of Object.entries(fields)) {
      if (!asText(object[field])) reasons.push(`${name}_${field}_empty`);
      else if (range !== null && charLength(asText(object[field])) < range.min)
        reasons.push(`${name}_${field}_too_short`);
      else if (range !== null && charLength(asText(object[field])) > range.max)
        reasons.push(`${name}_${field}_too_long`);
    }
  };
  check(raw.persona, "persona", {
    mbti: null,
    personaTitle: FINAL_COPY_LENGTHS.personaTitle,
    summary: FINAL_COPY_LENGTHS.summary,
  });
  check(raw.bondSummary, "bond", { title: null, quote: FINAL_COPY_LENGTHS.bondSummary });
  const insights = getObjectRecord(raw.insights);
  if (!insights || !hasExactKeys(insights, ["misunderstanding", "affection", "relationship"])) reasons.push("insight_keys");
  for (const name of ["misunderstanding", "affection", "relationship"])
    check(insights?.[name], name, { title: null, conclusion: FINAL_COPY_LENGTHS.insight });
  const persona = getObjectRecord(raw.persona);
  const bond = getObjectRecord(raw.bondSummary);
  const misunderstanding = asText(getObjectRecord(insights?.misunderstanding)?.conclusion);
  const affection = asText(getObjectRecord(insights?.affection)?.conclusion);
  const relationship = asText(getObjectRecord(insights?.relationship)?.conclusion);
  const quote = asText(bond?.quote);
  if (persona && !summaryHasCorePersonaScope(asText(persona.summary))) reasons.push("summary_scope");
  if (misunderstanding && !hasMisunderstandingContrast(misunderstanding)) reasons.push("misunderstanding_contrast");
  if (affection && !hasConcreteAffectionBehavior(affection)) reasons.push("affection_not_concrete");
  if (relationship && !describesOwnerRole(relationship)) reasons.push("relationship_role_missing");
  if (quote && !isEmotionalBondClosing(quote)) reasons.push("bond_not_emotional_closing");
  if (
    misunderstanding && affection && relationship && quote &&
    !hasIncrementalFinalCopy(misunderstanding, affection, relationship, quote)
  ) reasons.push("final_copy_semantic_overlap");
  return reasons.length ? reasons : ["result_protocol"];
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
    stage3.persona.personaTitle,
    stage3.persona.summary,
    stage3.insights.misunderstanding.conclusion,
    stage3.insights.affection.conclusion,
    stage3.insights.relationship.conclusion,
    stage3.bondSummary.quote,
  ].join("\n");
  const issues: string[] = [];
  if (!hasLengthInRange(stage3.persona.personaTitle, FINAL_COPY_LENGTHS.personaTitle)) {
    issues.push("title_length");
  }
  if (!hasLengthInRange(stage3.persona.summary, FINAL_COPY_LENGTHS.summary)) issues.push("summary_length");
  if (!summaryHasCorePersonaScope(stage3.persona.summary)) issues.push("summary_scope");
  if (!hasMisunderstandingContrast(stage3.insights.misunderstanding.conclusion))
    issues.push("misunderstanding_contrast");
  if (!hasConcreteAffectionBehavior(stage3.insights.affection.conclusion))
    issues.push("affection_not_concrete");
  if (!describesOwnerRole(stage3.insights.relationship.conclusion))
    issues.push("relationship_role_missing");
  if (!isEmotionalBondClosing(stage3.bondSummary.quote)) issues.push("bond_not_emotional_closing");
  if (
    !Object.values(stage3.insights).every((item) =>
      hasLengthInRange(item.conclusion, FINAL_COPY_LENGTHS.insight),
    )
  ) issues.push("insight_length");
  if (!hasLengthInRange(stage3.bondSummary.quote, FINAL_COPY_LENGTHS.bondSummary))
    issues.push("bond_length");
  if (hasHighRiskCopy(allText) || hasHighRiskLabel(stage3.persona.personaTitle)) {
    issues.push("high_risk_jargon");
  }
  if (fatalUnsupportedClaimPatterns.some((pattern) => pattern.test(allText))) {
    issues.push("unsupported_long_term_claim");
  }
  const facts = containsWrongFacts(allText, profile);
  if (facts.wrongGender) issues.push("wrong_gender");
  if (facts.wrongAge) issues.push("wrong_age");
  const insightTexts = Object.values(stage3.insights).map((item) => item.conclusion);
  if (
    semanticSimilarity(insightTexts[0], insightTexts[1]) > 0.58 ||
    semanticSimilarity(insightTexts[0], insightTexts[2]) > 0.58 ||
    semanticSimilarity(insightTexts[1], insightTexts[2]) > 0.58
  ) {
    issues.push("duplicate_insights");
  }
  if (
    !hasIncrementalFinalCopy(
      stage3.insights.misunderstanding.conclusion,
      stage3.insights.affection.conclusion,
      stage3.insights.relationship.conclusion,
      stage3.bondSummary.quote,
    )
  ) issues.push("duplicate_final_sections");
  if (hasGenericFinalCopy(allText)) issues.push("generic_copy");
  return { passed: issues.length === 0, issues };
}

function repairStage3Output(
  stage3: PersonaStage3Output,
  fallback: PersonaStage3Output,
  profile: CatProfile,
) {
  const checked = runFinalCopySelfCheck(stage3, profile);
  if (checked.passed) return stage3;
  const personaNeedsFallback = checked.issues.some((issue) =>
    ["title_length", "summary_length", "summary_scope", "high_risk_jargon", "generic_copy"].includes(issue),
  );
  const insightsNeedFallback = checked.issues.some((issue) =>
    [
      "insight_length",
      "misunderstanding_contrast",
      "affection_not_concrete",
      "relationship_role_missing",
      "duplicate_insights",
      "duplicate_final_sections",
      "generic_copy",
    ].includes(issue),
  );
  const bondNeedsFallback = checked.issues.some((issue) =>
    [
      "bond_length",
      "bond_not_emotional_closing",
      "duplicate_final_sections",
      "unsupported_long_term_claim",
      "generic_copy",
    ].includes(issue),
  );
  return {
    ...stage3,
    persona: personaNeedsFallback ? fallback.persona : stage3.persona,
    insights: insightsNeedFallback ? fallback.insights : stage3.insights,
    bondSummary: bondNeedsFallback ? fallback.bondSummary : stage3.bondSummary,
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
    finalCopy.persona.personaTitle,
    finalCopy.persona.summary,
    ...Object.values(finalCopy.insights).map((item) => item.conclusion),
    finalCopy.bondSummary.quote,
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
        charLength(finalCopy.persona.personaTitle) >= 4 &&
        charLength(finalCopy.persona.personaTitle) <= 12 &&
        !hasHighRiskLabel(finalCopy.persona.personaTitle),
      detail: "标题不可自然理解或含高风险造词",
    },
    { id: "ai_jargon", passed: !hasHighRiskCopy(allText), detail: "出现明显 AI 造词或报告腔词汇" },
    {
      id: "duplicate_insights",
      passed:
        !selfCheck.issues.includes("duplicate_insights") &&
        !selfCheck.issues.includes("duplicate_final_sections"),
      detail: "洞察或关系总结语义重复",
    },
    {
      id: "final_copy_roles",
      passed: !selfCheck.issues.some((issue) =>
        [
          "summary_length",
          "summary_scope",
          "insight_length",
          "misunderstanding_contrast",
          "affection_not_concrete",
          "relationship_role_missing",
          "bond_length",
          "bond_not_emotional_closing",
          "generic_copy",
        ].includes(issue),
      ),
      detail: "最终文案长度或字段职责不符合协议",
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
    20 - (hasHighRiskLabel(finalCopy.persona.personaTitle) ? 8 : 0),
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
  const insightTexts = Object.values(finalCopy.insights).map((item) => item.conclusion);
  const insightValue = Math.max(
    0,
    20 -
      insightTexts.filter((text) => !hasLengthInRange(text, FINAL_COPY_LENGTHS.insight)).length * 4 -
      (selfCheck.issues.includes("duplicate_insights") ||
      selfCheck.issues.includes("duplicate_final_sections")
        ? 10
        : 0),
  );
  const shareability = Math.max(
    0,
    20 -
      (!hasLengthInRange(finalCopy.bondSummary.quote, FINAL_COPY_LENGTHS.bondSummary)
        ? 5
        : 0) -
      (charLength(finalCopy.persona.personaTitle) > 12 ? 5 : 0) -
      (hasHighRiskCopy(finalCopy.bondSummary.quote) ? 6 : 0),
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
  const tags = tagsFromStage1(stage1, profile);
  const matchScore = stage1.coreTraits.length >= 3 ? 88 : stage1.coreTraits.length ? 76 : 62;
  const monologue =
    stage1.behaviorProfile.caution >= 62
      ? "让我先看清楚，再决定要不要靠近。"
      : "我在附近啦，只是要按自己的节奏来。";
  return normalizePersonaForProfile(
    {
      name: profile.name,
      persona: stage3.persona,
      dimensions: stage3.dimensions,
      insights: stage3.insights,
      bondSummary: stage3.bondSummary,
      type: stage3.persona.personaTitle,
      mbti: stage3.persona.mbti,
      matchScore,
      monologue,
      analysis: stage3.insights.misunderstanding.conclusion,
      corePersonality: stage3.persona.summary,
      misunderstanding: stage3.insights.misunderstanding.conclusion,
      loveLanguage: stage3.insights.affection.conclusion,
      loveLanguageInsight: stage3.insights.affection.conclusion,
      ownerRole: stage3.insights.relationship.conclusion,
      ownerRelationship: stage3.insights.relationship.conclusion,
      tags,
      traits: legacyTraitsFromDimensions(stage3.dimensions),
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

const visibleObservationInterpretationTerms = [
  "谨慎",
  "镇定",
  "独立",
  "策略",
  "边界",
  "人格",
  "性格",
  "喜欢",
  "讨厌",
  "想念",
  "嫉妒",
];

const voiceLineForbiddenTerms = [
  "稳态",
  "控场",
  "发令",
  "营业",
  "策略性靠近",
  "仪式感极强",
  "行为模式",
  "人格倾向",
  "探索欲",
  "边界意识",
  "作为一只",
  "展现出了",
  "用自己的方式理解这个世界",
];

const genericVoiceLines = [
  "我喜欢你",
  "我要陪着你",
  "我很开心",
  "有你在我就安心",
  "今天也要开心",
  "我把温柔藏在心里",
];

function canonicalVoicePersona(persona: CatPersona | null) {
  if (!persona) return null;
  const summary = persona.persona ?? {
    mbti: persona.mbti,
    personaTitle: persona.type,
    summary: persona.corePersonality || persona.analysis,
  };
  const dimensions = Array.isArray(persona.dimensions)
    ? persona.dimensions.map(({ key, direction, strength }) => ({ key, direction, strength }))
    : PERSONA_DIMENSION_DEFINITIONS.map((definition, index) => {
        const legacy = persona.traits?.find((trait) => trait.label === definition.name) ??
          persona.traits?.[index];
        const affinity = clampScore(legacy?.value, 50);
        return {
          key: definition.key,
          direction: directionFromLeftAffinity(affinity),
          strength: strengthFromLeftAffinity(affinity),
        };
      });
  return { persona: summary, dimensions };
}

function normalizeVisibleObservations(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asText(item))
    .filter(Boolean)
    .filter(
      (item) => !visibleObservationInterpretationTerms.some((term) => item.includes(term)),
    )
    .map((item) => limitChars(item, 32))
    .slice(0, 6);
}

function sentenceCount(value: string) {
  return value
    .split(/[。！？!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function normalizedComparableText(value: string) {
  return Array.from(value)
    .filter((character) => /[\p{L}\p{N}]/u.test(character))
    .join("");
}

function hasMeaningfulTextOverlap(first: string, second: string) {
  const source = normalizedComparableText(first);
  const target = normalizedComparableText(second);
  if (!source || !target) return false;
  const shorter = source.length <= target.length ? source : target;
  const longer = source.length <= target.length ? target : source;
  const windowSize = Math.min(6, shorter.length);
  if (windowSize < 4) return longer.includes(shorter);
  for (let index = 0; index <= shorter.length - windowSize; index += 1) {
    if (longer.includes(shorter.slice(index, index + windowSize))) return true;
  }
  return false;
}

function voiceStyleConflictsWithPersona(
  voiceLine: string,
  intent: VoiceCurrentIntent,
  persona: CatPersona | null,
) {
  const dimensions = persona?.dimensions ?? [];
  const dimension = (key: PersonaDimensionKey) => dimensions.find((item) => item.key === key);
  const companionship = dimension("companionship");
  const boundary = dimension("boundary");
  if (
    companionship?.direction === "right" &&
    companionship.strength === "strong" &&
    /快抱我|一直陪我|你别走/.test(voiceLine) &&
    intent !== "想靠近" &&
    intent !== "想获得关注"
  ) {
    return true;
  }
  if (
    boundary?.direction === "right" &&
    boundary.strength === "strong" &&
    /快抱我|快摸我/.test(voiceLine) &&
    intent !== "想获得关注"
  ) {
    return true;
  }
  return false;
}

function inspectVoiceGenerationOutput(parsed: VoiceGenerationOutput, persona: CatPersona | null) {
  const observations = normalizeVisibleObservations(parsed.visibleObservations);
  const currentIntent = asText(parsed.currentIntent) as VoiceCurrentIntent;
  const voiceLine = asText(parsed.voiceLine);
  const personaTitle = persona?.persona?.personaTitle || persona?.type || "";
  const mbti = persona?.persona?.mbti || persona?.mbti || "";
  const analysis = getObjectRecord(parsed.analysis);
  const analysisObservation = asText(analysis?.observation);
  const analysisInterpretation = asText(analysis?.personalityInterpretation);
  const analysisLength = charLength(joinVoiceAnalysis({
    observation: analysisObservation,
    personalityInterpretation: analysisInterpretation,
  }));
  const validIntent = VOICE_CURRENT_INTENTS.includes(currentIntent);
  const voiceLineLength = charLength(voiceLine);
  const voiceLineSentences = sentenceCount(voiceLine);
  const sceneTags = Array.isArray(parsed.sceneTags) ? parsed.sceneTags : parsed.tags;

  // Report every applicable failure, without requiring literal intent keywords.
  // Dependent checks are skipped when their prerequisites are already invalid.
  const failedChecks = {
    visible_observations_missing: observations.length === 0,
    current_intent_invalid: !validIntent,
    voice_line_too_short: voiceLineLength < 14,
    voice_line_too_long: voiceLineLength > 28,
    voice_line_too_many_sentences: voiceLineSentences > 2,
    voice_line_forbidden_terms: voiceLineForbiddenTerms.some((term) => voiceLine.includes(term)),
    voice_line_generic_template: genericVoiceLines.some((line) => voiceLine.includes(line)),
    voice_line_contains_mbti: Boolean(mbti && voiceLine.includes(mbti)),
    voice_line_contains_persona_title: Boolean(personaTitle && voiceLine.includes(personaTitle)),
    voice_line_persona_conflict:
      validIntent &&
      observations.length > 0 &&
      voiceStyleConflictsWithPersona(voiceLine, currentIntent, persona),
    subtext_missing: !asText(parsed.subtext),
    analysis_observation_missing: !analysisObservation,
    analysis_personality_interpretation_missing: !analysisInterpretation,
    analysis_too_long: analysisLength > VOICE_ANALYSIS_GENERATION_MAX_CHARACTERS,
    analysis_repeats_voice_line: hasMeaningfulTextOverlap(
      voiceLine,
      `${analysisObservation}${analysisInterpretation}`,
    ),
    // Tags are normalized/deduplicated locally after generation. A label issue
    // must not reject an otherwise valid voice and trigger another model call.
  };
  const reasons = Object.entries(failedChecks)
    .filter(([, failed]) => failed)
    .map(([reason]) => reason);

  return {
    valid: reasons.length === 0,
    reasons,
    // Only counts and an allowlisted enum are logged, never generated/user text.
    metrics: {
      observationInputCount: Array.isArray(parsed.visibleObservations)
        ? parsed.visibleObservations.length
        : 0,
      observationAcceptedCount: observations.length,
      currentIntent: validIntent ? currentIntent : null,
      voiceLineLength,
      voiceLineSentences,
      analysisLength,
      sceneTagCount: Array.isArray(sceneTags) ? sceneTags.length : null,
      hasPersona: Boolean(persona),
    },
  };
}

function validateVoiceGenerationOutput(
  parsed: VoiceGenerationOutput,
  persona: CatPersona | null,
  context?: AIValidationContext & { generationId: string; totalDurationMs: number },
) {
  const report = inspectVoiceGenerationOutput(parsed, persona);
  if (context) {
    console.info(
      "NEKO voice validation",
      JSON.stringify({ event: "voice_validation", ...context, ...report }),
    );
  }
  return report.valid;
}

// Keep the shared persona wording rules intact. Heart-voice chips have a
// smaller budget, so shorten known rewrites as complete phrases, never slices.
const shortVoiceTagReplacements: Record<string, string> = {
  "会用眼神表达": "眼神示意",
  "待在你看得见的地方": "待在附近",
  "安静坐着等你": "坐着等你",
  "安静等你发现": "等你发现",
  "喜欢待在附近": "爱待在附近",
  "不常主动但会回应": "偶尔回应",
  "不常主动但会认真回应": "认真回应",
  "次数不多但会回应": "偶尔回应",
  "先观察再靠近": "先看再靠近",
  "很会观察动静": "留意动静",
  "按自己想法来": "有小主意",
  "想靠近又犹豫": "还在犹豫",
  "先观察再回应": "先看再回应",
  "表达得很清楚": "直接表达",
};

const voiceIntentTagFallbacks: Record<VoiceCurrentIntent, string[]> = {
  "想靠近": ["想凑近", "靠近一点", "慢慢来"],
  "想观察": ["先看看", "还在观察", "不着急"],
  "想玩": ["想玩了", "玩心上来了", "有点好奇"],
  "想抓": ["想伸爪", "准备出爪", "盯着目标"],
  "想等待": ["等一等", "还在等", "不着急"],
  "想让主人参与": ["等你回应", "叫你加入", "想和你一起"],
  "想自己处理": ["自己来", "先让我试试", "有小主意"],
  "想保持距离": ["先别靠近", "留点距离", "慢慢来"],
  "想休息": ["想歇会儿", "休息一下", "先不打扰"],
  "想获得关注": ["看看我", "等你理我", "求关注"],
};

function normalizeVoiceTags(values: unknown[], profile: CatProfile) {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => {
      const cleaned = cleanLabelText(simplifyNekoCopy(normalizeCatFacts(value, profile)));
      // Preserve already-natural short scene facts. Persona-oriented rewrites
      // would otherwise turn e.g. “视线朝前” into the unrelated “待在附近”.
      if (
        charLength(cleaned) >= 2 &&
        charLength(cleaned) <= VOICE_TAG_MAX_CHARACTERS &&
        !hasJargonLabel(cleaned)
      ) {
        return cleaned;
      }
      return normalizeNaturalLabel(value, profile, Number.MAX_SAFE_INTEGER);
    })
    .map((value) => shortVoiceTagReplacements[value] ?? value)
    .filter((value, index, list) =>
      charLength(value) >= 2 &&
      charLength(value) <= VOICE_TAG_MAX_CHARACTERS &&
      list.indexOf(value) === index,
    );
}

function normalizeVoiceForProfile(
  input: {
    text?: unknown;
    voiceLine?: unknown;
    subtext?: unknown;
    analysis?: unknown;
    share?: unknown;
    mood?: unknown;
    location?: unknown;
    sceneTags?: unknown;
    tags?: unknown;
    currentIntent?: unknown;
  },
  profile: CatProfile,
  imageDataUrl?: string | null,
): Voice {
  const intent = asText(input.currentIntent ?? input.mood) as VoiceCurrentIntent;
  const fallbackTags = VOICE_CURRENT_INTENTS.includes(intent)
    ? voiceIntentTagFallbacks[intent]
    : [];
  // An overlong tag must not cause another model call or become half a phrase.
  // Use the already inferred intent; legacy/missing intent gets neutral labels.
  const generatedTags = Array.isArray(input.sceneTags) ? input.sceneTags : input.tags;
  const sceneTags = normalizeVoiceTags([
    ...(Array.isArray(generatedTags) ? generatedTags : []),
    ...fallbackTags,
    "这一刻", "日常片段", "随手记录",
  ], profile).slice(0, 3);
  const rawAnalysis =
    input.analysis && typeof input.analysis === "object"
      ? (input.analysis as Record<string, unknown>)
      : {};
  const legacyAnalysis = typeof input.analysis === "string" ? input.analysis : undefined;
  const analysisSummary = normalizeCatFacts(
    rawAnalysis.observation ?? rawAnalysis.summary ?? legacyAnalysis,
    profile,
    "它停留原地，注视周围。",
  );
  const subtext = boundedCopy(
    normalizeCatFacts(input.subtext, profile, "它没有急着行动，像是在等自己想动的时候。"),
    "它没有急着行动，像是在等自己想动的时候。",
    15,
    30,
  );
  const personalityInterpretation = normalizeCatFacts(
    rawAnalysis.personalityInterpretation ?? input.subtext,
    profile,
    "它似乎想先观察一会儿。",
  );
  const rawShare =
    input.share && typeof input.share === "object" ? (input.share as Record<string, unknown>) : {};
  return {
    time: "刚刚",
    createdAt: Date.now(),
    location: normalizeCatFacts(input.location, profile, "家里") || "家里",
    grad: "linear-gradient(135deg, oklch(0.9 0.06 280), oklch(0.92 0.05 320))",
    sceneTags,
    tags: sceneTags,
    aspect: "3:4",
    text: normalizeCatFacts(
      input.voiceLine ?? input.text,
      profile,
      `我先看看，再决定要不要靠近。`,
    ),
    subtext,
    media: imageDataUrl ?? undefined,
    mediaType: "photo",
    analysis: limitVoiceAnalysis({
      observation: analysisSummary,
      personalityInterpretation,
    }, VOICE_ANALYSIS_GENERATION_MAX_CHARACTERS),
    share: {
      headline: boundedCopy(
        normalizeCatFacts(rawShare.headline, profile, asText(input.voiceLine ?? input.text)),
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
      tags: sceneTags,
    },
  } as Voice;
}

function buildStableVoice(
  profile: CatProfile,
  persona: CatPersona | null,
  imageDataUrl?: string | null,
  scene?: string,
): Voice {
  const sceneText = scene?.trim();
  const sceneLower = sceneText ?? "";
  let text = `这个有点意思，我再看一会。`;
  let mood = "想观察";
  let sceneTags = ["看着眼前", "保持原位", "正在观望中"];
  if (/猫条|零食|吃|罐头|冻干/.test(sceneLower)) {
    text = `我已经闻到了，这个先别拿走。`;
    mood = "想靠近";
    sceneTags = ["朝向食物", "闻着眼前", "等着开饭中"];
  } else if (/逗猫棒|玩具|球|羽毛|玩/.test(sceneLower)) {
    text = `你先别停，我还在看什么时候出爪。`;
    mood = "想抓";
    sceneTags = ["盯住玩具", "抬爪准备", "想玩先等等"];
  } else if (/睡|窝|床|沙发|趴/.test(sceneLower)) {
    text = `这里正合适，先让我安静躺一会。`;
    mood = "想休息";
    sceneTags = ["趴在原地", "趴着放松", "准备再眯会"];
  } else if (/看|盯|拍照|镜头|照片/.test(sceneLower)) {
    text = `你先别动，我还要再看清楚一点。`;
    mood = "想观察";
    sceneTags = ["看着镜头", "保持坐姿", "认真打量中"];
  } else if (/抱|摸|靠近|蹭|陪/.test(sceneLower)) {
    const boundary = persona?.dimensions?.find((item) => item.key === "boundary");
    text =
      boundary?.direction === "right"
        ? `先别急着抱，让我自己靠近你。`
        : `可以再靠近一点，我现在没有要躲。`;
    mood = boundary?.direction === "right" ? "想保持距离" : "想靠近";
    sceneTags = ["身体靠近", "看着眼前", "想靠近一点"];
  } else if (sceneText) {
    text = `我听见了，先让我看看是怎么回事。`;
  }
  const analysisSummary = sceneText
    ? "结合补充场景，它正在留意周围。"
    : "画面证据有限，它正在留意周围。";
  return normalizeVoiceForProfile(
    {
      text,
      analysis: {
        observation: analysisSummary,
        personalityInterpretation: persona
          ? "具体想法还需要更多线索。"
          : "暂不能据此判断长期习惯。",
      },
      share: {
        headline: text,
        insight: `它不是没反应，只是更习惯先看一会儿，等你注意到它。`,
      },
      mood,
      location: "家里",
      sceneTags,
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
    responseSchema?: Record<string, unknown>;
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
      ...(options.responseSchema ? { responseJsonSchema: options.responseSchema } : {}),
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
    responseSchema?: Record<string, unknown>;
    diagnostics?: AIDiagnostics;
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
  const transportStarted = monotonicNow();
  let headersMs: number | null = null;
  let bodyMs: number | null = null;
  let httpStatus: number | null = null;
  let requestBytes = 0;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let thoughtTokens: number | null = null;
  let outcome = "error";
  let errorCategory: string | null = null;
  let networkCode: string | null = null;
  const requestBody = (payload: unknown) => {
    const body = JSON.stringify(payload);
    if (options.diagnostics) requestBytes = new TextEncoder().encode(body).byteLength;
    return body;
  };
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
          body: requestBody(chatMessagesToGeminiPayload(messages, options)),
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
        body: requestBody({
          model,
          temperature: options.temperature ?? 0.82,
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
          response_format:
            provider === "openai" && options.responseSchema
              ? {
                  type: "json_schema",
                  json_schema: {
                    name: "persona_result",
                    strict: true,
                    schema: options.responseSchema,
                  },
                }
              : { type: "json_object" },
          messages,
        }),
      });
    }

    headersMs = elapsedMs(transportStarted);
    httpStatus = res.status;
    if (!res.ok) {
      const bodyStarted = monotonicNow();
      const text = await res.text();
      bodyMs = elapsedMs(bodyStarted);
      const label = providerLabel(provider);
      throw new Error(`${label} ${model} error ${res.status}: ${text.slice(0, 300)}`);
    }

    // Keep the deadline active until the entire response body has arrived.
    const bodyStarted = monotonicNow();
    const json = await res.json();
    bodyMs = elapsedMs(bodyStarted);
    const tokenCount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    inputTokens = tokenCount(json.usageMetadata?.promptTokenCount ?? json.usage?.prompt_tokens);
    outputTokens = tokenCount(json.usageMetadata?.candidatesTokenCount ?? json.usage?.completion_tokens);
    thoughtTokens = tokenCount(json.usageMetadata?.thoughtsTokenCount ?? json.usage?.completion_tokens_details?.reasoning_tokens);
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
    outcome = "ok";
    return content;
  } catch (error) {
    errorCategory = controller.signal.aborted ? "timeout" : performanceErrorCategory(error);
    networkCode = performanceNetworkCode(error);
    if (controller.signal.aborted) {
      throw new Error(`${providerLabel(provider)} ${model} timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.diagnostics?.trace.log("ai_transport_end", {
      stage: options.diagnostics.stage, attempt: options.diagnostics.attempt ?? 1,
      provider, model, transport: isGeminiGenerateContent ? "gemini" : "chat",
      durationMs: elapsedMs(transportStarted), timeoutMs, headersMs, bodyMs,
      httpStatus, requestBytes, inputTokens, outputTokens, thoughtTokens, outcome, errorCategory, networkCode,
    });
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
    validate?: (parsed: T, context: AIValidationContext) => boolean;
    responseSchema?: Record<string, unknown>;
    diagnostics?: AIDiagnostics;
    validationReasons?: (parsed: T) => string[];
  },
): Promise<{ parsed: T; provider: AIProvider; model: string; attempts: number }> {
  const providers = await getAIProviderOrder();
  let lastError: unknown;
  let attempt = 0;
  for (const provider of providers) {
    const models = await getProviderModels(provider, options.modelMode);
    for (const model of models) {
      attempt++;
      const startedAt = Date.now();
      const attemptStarted = monotonicNow();
      const diagnostics = options.diagnostics ? { ...options.diagnostics, attempt } : undefined;
      if (diagnostics) {
        diagnostics.trace.modelAttempts++;
        diagnostics.trace.log("ai_attempt_start", { stage: diagnostics.stage, attempt, provider, model });
      }
      let reasons: string[] = [];
      let validationMs: number | null = null;
      try {
        const raw = await callChatCompletion(provider, buildMessages(provider), {
          ...options,
          model,
          diagnostics,
        });
        const validationStarted = monotonicNow();
        const parsed = extractJson<T>(raw);
        const invalid =
          !parsed ||
          (options.validate && !options.validate(parsed, {
            provider,
            model,
            attempt,
            durationMs: Date.now() - startedAt,
          }));
        validationMs = elapsedMs(validationStarted);
        if (invalid) {
          reasons = parsed && options.validationReasons ? options.validationReasons(parsed) : ["required_fields"];
          throw new Error(`${providerLabel(provider)} ${model} JSON missing required fields`);
        }
        diagnostics?.trace.log("ai_attempt_end", {
          stage: diagnostics.stage, attempt, provider, model, outcome: "ok",
          durationMs: elapsedMs(attemptStarted), validationMs, willRetry: false,
        });
        return { parsed, provider, model, attempts: attempt };
      } catch (error) {
        lastError = error;
        const hasNextModel = models.indexOf(model) < models.length - 1;
        const hasNextProvider = providers.indexOf(provider) < providers.length - 1;
        diagnostics?.trace.log("ai_attempt_end", {
          stage: diagnostics.stage, attempt, provider, model, outcome: "error",
          durationMs: elapsedMs(attemptStarted), validationMs,
          errorCategory: performanceErrorCategory(error), reasons,
          willRetry: hasNextModel || hasNextProvider,
        });
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
    questionnaireVersion: data.questionnaireVersion === "ios-v1" ? "ios-v1" : "web-v1",
    // Filter before constructing either prompt, not merely after generation.
    previousPersona: previousPersonaForIdenticalQuiz(data),
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
  trace = new PerformanceTrace("video_analysis"),
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
        diagnostics: { trace, stage: "video_observation" },
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
    questionnaireVersion: data.questionnaireVersion ?? "web-v1",
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
问卷版本：${data.questionnaireVersion ?? "web-v1"}
问卷题目与所选答案（这是选项含义的唯一依据）：${JSON.stringify(questionnaireAnswersForPrompt(data.profile.quiz, data.questionnaireVersion))}
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
6. previousPersona 仅在两次问卷答案完全一致时提供；提供时保持上一版 MBTI。未提供时必须独立判断，不猜测或沿用历史人格。
7. 原始问卷键从 0 开始，证据引用统一使用上方 reference（Q1 对应键 0）。只引用真实已选答案；answer/reference 为 null 表示未回答，不能作为证据，也不能猜测选项含义。
8. 判断依据是所选答案的具体意思，不是“回答过这道题”。同一题及其派生分数只算一个信号；“亲近但有边界”等复合特征必须分别有支持两部分的证据。不要把“独自待着”解释为高依恋，不要把“安静共处”解释为互动玩耍。

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
      "trait": "有证据支持的特征",
      "description": "只解释所引用证据真正支持的含义",
      "supportedBy": ["复制第一条实际 reference 或视频证据编号", "复制另一独立信号的实际 reference 或视频证据编号"],
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

const PERSONA_STAGE3_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["persona", "insights", "bondSummary"],
  properties: {
    persona: {
      type: "object",
      additionalProperties: false,
      required: ["mbti", "personaTitle", "summary"],
      properties: {
        mbti: { type: "string", minLength: 1 },
        personaTitle: { type: "string", minLength: 4, maxLength: 12 },
        summary: { type: "string", minLength: 28, maxLength: 42 },
      },
    },
    insights: {
      type: "object",
      additionalProperties: false,
      required: ["misunderstanding", "affection", "relationship"],
      properties: Object.fromEntries(
        ["misunderstanding", "affection", "relationship"].map((key) => [
          key,
          {
            type: "object",
            additionalProperties: false,
            required: ["title", "conclusion"],
            properties: {
              title: { type: "string", minLength: 1 },
              conclusion: { type: "string", minLength: 28, maxLength: 45 },
            },
          },
        ]),
      ),
    },
    bondSummary: {
      type: "object",
      additionalProperties: false,
      required: ["title", "quote"],
      properties: {
        title: { type: "string", minLength: 1 },
        quote: { type: "string", minLength: 20, maxLength: 35 },
      },
    },
  },
};

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
四维人格已由代码根据 Stage 1 固定映射，本阶段禁止输出或重新判断 dimensions。
上一版人格 prior：${JSON.stringify(
    previousPersona
      ? {
          personaTitle: previousPersona.persona?.personaTitle ?? previousPersona.type,
          mbti: previousPersona.persona?.mbti ?? previousPersona.mbti,
          summary: previousPersona.persona?.summary ?? previousPersona.corePersonality,
          insights: previousPersona.insights ?? {
            misunderstanding: previousPersona.misunderstanding,
            affection: previousPersona.loveLanguageInsight ?? previousPersona.loveLanguage,
            relationship: previousPersona.ownerRelationship ?? previousPersona.ownerRole,
          },
          bondSummary: previousPersona.bondSummary,
        }
      : null,
  )}

【人格结论】
- persona 只包含 mbti、personaTitle、summary。
- summary 只总结核心人格，不讲主人关系，不举例，不重复罗列 dimensions；严格 28-42 个中文字符。
- 上一版 prior 仅在问卷答案完全一致时提供；提供时保留上一版 MBTI。prior 为 null 时独立生成，不参考历史人格。

personaTitle 规则：
- 可理解性 > 准确 > 共鸣 > 创意。
- 禁止造词，禁止 XX控、XX王、XX机、营业、控场、发令、施压、稳态、高质互动、策略性靠近、仪式感极强、端庄定点、克制讨关注。
- 标题必须像一个人格名称，不要只是形容词短语。优先 “XX型/派/系”“XX的XX者”，或“主动亲近，但很有边界”这类轻句式。
- 优先 4-10 个中文字符，最多 12 字；如果超过 12 字必须改短；普通养猫人第一次看到就懂。
- 避免“亲近有边界”“按自己节奏营业的互动控”这类不自然标题；可改为“边界感亲近派”“慢热观察型”。

【三个洞察】
- 必须完整输出 misunderstanding、affection、relationship。
- title 固定使用给定语义，不创造第四种洞察。
- conclusion 每条严格 28-45 个中文字符，一句话讲清楚。
- misunderstanding 必须明确写成“不是 A，而是 B”的认知反差，必须同时出现“不是”和“而是”。
- affection 必须描述具体可理解的亲近表达方式，例如靠近、待在附近、看着、蹭、回应或一起玩；不能只写抽象的“信任”“喜欢”。
- relationship 必须描述主人在猫咪生活中的角色，明确说明“你”是怎样的参照、依靠、伙伴、归处或重要的人。
- 三条必须提供不同信息，不允许把同一人格特点换三种说法重复。

【关系总结】
- bondSummary 只负责情绪总结，不重复 dimensions 或 insights，也不继续分析人格。
- quote 严格 20-35 个中文字符，自然、温暖、不肉麻；不要出现“倾向、维度、行为模式、意味着、表明、因为、所以”等分析语气。

【信息增量检查】
- misunderstanding、affection、relationship、bondSummary 四项各自承担不同职责。
- 任意两项不得复述同一个核心结论，也不得只替换同义词。
- 输出前逐对比较四项；只要语义高度相似，必须重新改写后再输出。
- 超长、过短、空泛、职责不符或语义重复都属于 invalid，不能依赖 UI 省略号处理。

【证据约束】
- 所有结论只能基于输入。禁止根据单张照片推断长期习惯，禁止编造固定路线、固定时间、每天发生的行为。
- 证据不足时仍返回完整字段，但表达更谨慎，不允许编造。

Final Copy Self-check：
输出前逐条检查：普通养猫人能否一眼看懂；有没有需要解释的词；有没有 AI 造词感；有没有把推测写成事实；有没有重复表达；有没有营销腔或心理学报告腔。任一不通过，自动改写。

只输出以下严格 JSON，不允许额外字段：
{
  "persona": {
    "mbti": "INFP-A",
    "personaTitle": "...",
    "summary": "..."
  },
  "insights": {
    "misunderstanding": {
      "title": "你可能一直误会它的一件事",
      "conclusion": "..."
    },
    "affection": {
      "title": "它表达喜欢的方式",
      "conclusion": "..."
    },
    "relationship": {
      "title": "在它眼里，你的位置",
      "conclusion": "..."
    }
  },
  "bondSummary": {
    "title": "${profile.name}和你的关系",
    "quote": "..."
  }
}`;
}

async function runPersonaAIStage<T>({
  stage,
  trace,
  fallback,
  buildMessages,
  normalize,
  options,
}: {
  stage: PersonaPromptStage;
  trace: PerformanceTrace;
  fallback: T;
  buildMessages: (provider: AIProvider) => unknown[];
  normalize: (value: unknown, fallback: T) => T;
  options: {
    maxTokens: number;
    temperature: number;
    timeoutMs?: number;
    modelMode?: "text" | "vision";
    validate: (parsed: unknown) => boolean;
    responseSchema?: Record<string, unknown>;
  };
}): Promise<{ output: T; log: PersonaStageLog }> {
  const startedAt = Date.now();
  const started = monotonicNow();
  const attemptsBefore = trace.modelAttempts;
  trace.log("persona_stage_start", { stage, promptVersion: PERSONA_PROMPT_VERSIONS[stage] });
  try {
    const result = await callFirstAvailableJson<unknown>(buildMessages, {
      ...options,
      validate: options.validate,
      diagnostics: { trace, stage },
      validationReasons: (parsed) => personaValidationReasons(stage, parsed),
    });
    const normalizationStarted = monotonicNow();
    const output = normalize(result.parsed, fallback);
    trace.log("persona_stage_end", { stage, outcome: "ok", durationMs: elapsedMs(started),
      normalizeMs: elapsedMs(normalizationStarted), modelAttempts: result.attempts, modelRetries: result.attempts - 1 });
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
    trace.log("persona_stage_end", { stage, outcome: "error", durationMs: elapsedMs(started),
      modelAttempts: trace.modelAttempts - attemptsBefore, errorCategory: performanceErrorCategory(error) });
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

export async function generateCatPersonaServer(input: PersonaInput, trace = new PerformanceTrace("persona")): Promise<CatPersona> {
  const pipelineStarted = monotonicNow();
  const data = validatePersonaInput(input);
  const generationId = trace.requestId;
  const stableStage1 = buildStableStage1(data);
  const inputTimestamp = new Date().toISOString();
  const inputSnapshot = personaInputSnapshot(data, stableStage1.behaviorProfile, inputTimestamp);
  const inputHash = hashInput(inputSnapshot);
  const stageLogs: PersonaStageLog[] = [];
  let retryCount = 0;
  trace.log("persona_start", { hasImage: Boolean(data.imageDataUrl),
    answeredCount: Object.keys(data.profile.quiz ?? {}).length,
    videoObservationCount: data.videoObservations?.length ?? 0, hasPrior: Boolean(data.previousPersona) });

  await logAIDebugEvent("persona input snapshot", {
    generationId,
    inputHash,
    snapshot: inputSnapshot,
  });

  try {
    const stage1Run = await runPersonaAIStage<PersonaStage1Output>({
      stage: "stage1",
      trace,
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
      trace,
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
      trace.log("persona_local_repair", { stage: "stage2", reason: "unsupported_long_term_claim", extraModelCalls: 0 });
    }
    stageLogs.push(stage2Run.log);

    const stableStage3 = buildStableStage3(stage1Run.output, stage2Output, data.profile);
    const stage3Run = await runPersonaAIStage<PersonaStage3Output>({
      stage: "stage3",
      trace,
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
        responseSchema: PERSONA_STAGE3_JSON_SCHEMA,
        validate: (parsed) => validatePersonaStage3ModelOutput(parsed, stableStage3.dimensions),
      },
    });
    const postprocessStarted = monotonicNow();
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
      trace.log("persona_local_repair", { stage: "stage3", reason: "self_check", extraModelCalls: 0 });
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
      trace.log("persona_local_repair", { stage: "stage3", reason: "previous_persona_anchor", extraModelCalls: 0 });
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
      trace.log("persona_local_repair", { stage: "stage3", reason: "fatal_eval", extraModelCalls: 0 });
    }
    stageLogs.push(stage3Run.log);

    const modelSummary = stageLogs
      .map((log) => `${log.stage}:${log.provider}/${log.model}`)
      .join(", ");
    const persona = {
      ...stage3ToPersona(finalCopy, stage1Run.output, data.profile),
      questionnaireAnswers: quizAnswersFromJson(data.profile.quiz ?? {}) ?? undefined,
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

    trace.log("persona_end", { outcome: "ok", durationMs: elapsedMs(pipelineStarted),
      postprocessMs: elapsedMs(postprocessStarted), modelAttempts: trace.modelAttempts,
      modelRetries: Math.max(0, trace.modelAttempts - 3), localRepairs: retryCount });
    return persona;
  } catch (error) {
    trace.log("persona_end", { outcome: "error", durationMs: elapsedMs(pipelineStarted),
      modelAttempts: trace.modelAttempts, completedStages: stageLogs.length, errorCategory: performanceErrorCategory(error) });
    console.error("NEKO persona pipeline failed", error);
    if (await shouldRequireRealAI()) throw new Error(getUserFacingAIMessage("persona", error));
    const fallback = buildStablePersona(data.profile, data.questionnaireVersion);
    fallback.questionnaireAnswers = quizAnswersFromJson(data.profile.quiz ?? {}) ?? undefined;
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

export async function generateCatVoiceServer(input: VoiceInput, trace = new PerformanceTrace("voice")): Promise<Voice> {
  const data = validateVoiceInput(input);
  const generationId = trace.requestId;
  const startedAt = Date.now();
  const styleExamples = selectVoiceAnalysisStyleExamples();
  const stylePrompt = buildVoiceAnalysisStylePrompt(styleExamples);
  trace.log("voice_style_examples", {
    version: VOICE_ANALYSIS_STYLE_VERSION,
    exampleIds: styleExamples.map(({ id }) => id),
  });
  const personaContext = canonicalVoicePersona(data.persona);
  const profileContext = {
    name: data.profile.name,
    gender: data.profile.gender,
    ageStage: data.profile.ageStage,
  };
  const prompt = `你是「喵一下」的猫咪心声观察者。请按固定链路工作：
当前画面事实 → 当前意图 → 既有人格只调整表达口吻 → 一句猫咪心声。

【猫咪基础资料】
${JSON.stringify(profileContext)}

【稳定人格档案】
${JSON.stringify(personaContext ?? "暂无稳定人格档案")}

【用户补充场景】
${data.scene || "无补充场景"}

事实优先级必须固定为：当前图片真实可见信息 > 用户补充场景 > 稳定人格档案 > 文风创意。
如果人格与画面冲突，以画面为准；人格不能改变事实，也不能强迫当前行为符合长期标签。

第一步 visibleObservations：
- 输出 1–6 条只靠图片可以直接确认的事实，例如视线方向、姿势、动作、与人或物体的距离。
- 禁止出现“喜欢、讨厌、谨慎、独立、想念、嫉妒、性格、人格”等解释或心理结论。
- 看不清就少写，不能补全不存在的人、物体、动作或长期习惯。

第二步 currentIntent：
- 只能从以下值选一个：${VOICE_CURRENT_INTENTS.join("、")}。
- 必须能由 visibleObservations 或用户场景直接支持。
- 证据不足时优先选“想观察”或“想等待”，不要编造强烈情绪。

第三步人格调味：
- personaTitle、MBTI 和 summary 只影响语气，不得直接写进 voiceLine。
- dimensions 只用于细调：social 影响靠近方式，exploration 影响探索口吻，companionship 影响是否邀请主人参与，boundary 影响互动距离。
- 人格影响约占表达的 20%，画面与场景事实至少占 70%，其余才是轻幽默。
- 没有人格档案时照常生成，不得凭空补人格。

第四步 voiceLine：
- 第一人称猫咪口吻，优先 14–24 个中文字，最长 28 个中文字，最多 2 句。
- 必须回应画面中的具体对象或动作；自然、口语、轻幽默、有一点猫自己的脾气。
- 不要复述 MBTI 或人格名称，不要写分析报告。
- 禁止泛泛的“我喜欢你、我要陪着你、我很开心、有你在我就安心”。
- 禁止“稳态、控场、发令、营业、策略性靠近、仪式感极强、行为模式、人格倾向、探索欲、边界意识”等 AI 术语。
- 避免“赏脸、本喵、勉强、人类、铲屎官、高贵、本小姐”等通用傲娇模板。

兼容字段：
- subtext：15–30 字，不重复 voiceLine，只揭示一层有事实依据的小反差。
- analysis 是页面的「AI 解读」正文：observation 与 personalityInterpretation 两项合计不超过 ${VOICE_ANALYSIS_GENERATION_MAX_CHARACTERS} 个字符（含标点和两项之间的一个空格），不是每项各 ${VOICE_ANALYSIS_GENERATION_MAX_CHARACTERS} 字。用完整自然的句子，不设最低字数；超长时重新精简表达，禁止截掉句尾或用省略号凑字数。
- analysis.observation：用一句自然中文串起最关键可见事实，不扩写背景。
- analysis.personalityInterpretation：只做克制联系；没有人格或证据冲突时明确保守，不强行贴标签。
- 两段 AI 解读不得复述或改写 voiceLine。
- mood：2–6 字，描述当前行为状态。
- sceneTags：严格 3 个、不带 #，每个 2–${VOICE_TAG_MAX_CHARACTERS} 个字，最多 ${VOICE_TAG_MAX_CHARACTERS} 个字；只写有画面或场景依据的动作、状态或小心思，标签之间不要重复意思，不强凑反差。
- 标签用日常口语，读一遍就懂；允许轻微俏皮，禁止生造词、书面堆砌、拟人职业头衔，禁止把两句话压成一串词。例如玩毛球时可写「盯上毛球」「准备出爪」「想玩了」，休息时可写「犯困了」「歇一会儿」。只学表达方式，不能把示例事实套到当前画面。
- 不要写「文静脸庞猎手心」「端坐蓄势待发」这类需要猜意思的标签；超长就换成完整短语，不能截半句或加省略号。

严格返回符合 schema 的 JSON，不要 Markdown。输出前自检：意图是否有可见证据、心声是否换只猫也成立、是否把人格写成事实、是否出现 AI 造词、每个标签是否都在 ${VOICE_TAG_MAX_CHARACTERS} 字以内且一读就懂、AI 解读合计是否超过 ${VOICE_ANALYSIS_GENERATION_MAX_CHARACTERS} 字；任一不合格就在本次输出前改好。`;
  try {
    const result = await callFirstAvailableJson<VoiceGenerationOutput>(
      (provider) => [
        {
          role: "system",
          content:
            "你是「喵一下」的猫咪心声观察者。严格执行可见事实→当前意图→人格调味→心声的顺序；事实优先，不虚构、不套模板。只返回符合 schema 的 JSON。\n\n" + stylePrompt,
        },
        { role: "user", content: buildVisionContent(provider, prompt, data.imageDataUrl) },
      ],
      {
        maxTokens: 620,
        temperature: 0.62,
        timeoutMs: data.imageDataUrl ? 22_000 : 14_000,
        modelMode: data.imageDataUrl ? "vision" : "text",
        responseSchema: VOICE_JSON_SCHEMA,
        diagnostics: { trace, stage: "voice_generation" },
        validate: (parsed, context) =>
          validateVoiceGenerationOutput(parsed, data.persona, {
            ...context,
            generationId,
            totalDurationMs: Date.now() - startedAt,
          }),
        validationReasons: (parsed) => inspectVoiceGenerationOutput(parsed, data.persona).reasons,
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
      return buildStableVoice(data.profile, data.persona, data.imageDataUrl, data.scene);
    }
    return voice;
  } catch (error) {
    console.error("NEKO voice AI failed", error);
    if (await shouldRequireRealAI()) throw new Error(getUserFacingAIMessage("voice", error));
    return buildStableVoice(data.profile, data.persona, data.imageDataUrl, data.scene);
  }
}

export const generateCatVoice = createServerFn({ method: "POST" })
  .inputValidator(validateVoiceInput)
  .handler(async ({ data }): Promise<Voice> => generateCatVoiceServer(data));
