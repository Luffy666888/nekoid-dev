/** Evaluation rules are independent of the generator's own self-evaluation. */
export const RUBRIC = [
  "summary 只讲核心人格，不讲关系、不举长例子",
  "misunderstanding 有明确认知反差",
  "affection 描述具体的亲近表达",
  "relationship 说清主人是什么角色",
  "bondSummary 只做情绪收尾",
  "五个模块之间没有明显复读",
  "至少 2 处明显来自这只猫的具体行为或资料",
  "没有编造长期习惯",
  "没有 AI 腔、造词或空泛套话",
  "全部在长度限制内",
] as const;
export const MODULES = [
  ["summary", "核心人格"],
  ["misunderstanding", "认知反差"],
  ["affection", "亲近表达"],
  ["relationship", "主人角色"],
  ["bondSummary", "情绪收尾"],
] as const;
export type ModuleKey = (typeof MODULES)[number][0];
export type Score = 0 | 1 | null;
export type Review = {
  scores: Score[];
  reasons: string[];
  fabrication: boolean | null;
  repetition: boolean | null;
  notes: string;
  reviewer: string;
};
export type StabilityReview = {
  core: Score;
  misunderstanding: Score;
  affection: Score;
  relationship: Score;
  notes: string;
  runIds: string[];
};
export type EvalCase = {
  id: string;
  name: string;
  focus: string;
  profile: {
    name: string;
    gender: string;
    ageStage: string;
    quiz: Record<string, string>;
    updatedAt: number;
  };
  photo: { file: string; visibleFacts: string[]; cannotInfer: string[] };
  expected: { core: string; misunderstanding: string; affection: string; relationship: string };
  evidence: { id: string; text: string }[];
};
export type Source = {
  file: string;
  title: string;
  url: string;
  sourcePage: string;
  author: string;
  license: string;
  licenseUrl: string;
  sha256: string;
};
export type EvalRun = {
  id: string;
  batchId: string;
  caseId: string;
  ordinal: number;
  createdAt: string;
  durationMs: number;
  inputHash: string;
  mode: "live";
  status: "ok" | "error";
  error?: string;
  model?: string;
  promptVersion?: Record<string, string>;
  copy?: { title: string; mbti: string; tags: string[]; modules: Record<ModuleKey, string> };
  checks?: ReturnType<typeof lengthChecks>;
  hints?: string[];
  generation?: unknown;
  review?: Review;
  requests?: { model: string; status?: number; imageAttached: boolean; durationMs?: number }[];
};
export type EvalState = {
  datasetVersion: string;
  cases: EvalCase[];
  sources: Source[];
  runs: EvalRun[];
  stability: Record<string, StabilityReview>;
  job: null | {
    id: string;
    total: number;
    completed: number;
    current: string | null;
    status: "running" | "done" | "cancelled";
    cancelRequested: boolean;
  };
};
type PersonaCopyInput = {
  persona?: { personaTitle?: string; mbti?: string; summary?: string };
  type?: string;
  mbti?: string;
  tags?: string[];
  corePersonality?: string;
  insights?: Partial<
    Record<"misunderstanding" | "affection" | "relationship", { conclusion?: string }>
  >;
  bondSummary?: { quote?: string };
};
export function extractCopy(persona: PersonaCopyInput): NonNullable<EvalRun["copy"]> {
  return {
    title: persona.persona?.personaTitle ?? persona.type ?? "",
    mbti: persona.persona?.mbti ?? persona.mbti ?? "",
    tags: persona.tags ?? [],
    modules: {
      summary: persona.persona?.summary ?? persona.corePersonality ?? "",
      misunderstanding: persona.insights?.misunderstanding?.conclusion ?? "",
      affection: persona.insights?.affection?.conclusion ?? "",
      relationship: persona.insights?.relationship?.conclusion ?? "",
      bondSummary: persona.bondSummary?.quote ?? "",
    },
  };
}
// Unicode code points, including punctuation; never slice or repair copy in the evaluator.
export function lengthChecks(copy: NonNullable<EvalRun["copy"]>) {
  const fields: [string, string, number, number][] = [
    ["人格标题", copy.title, 4, 14],
    ["summary", copy.modules.summary, 30, 50],
    ...(["misunderstanding", "affection", "relationship"] as const).map(
      (k) => [k, copy.modules[k], 35, 60] as [string, string, number, number],
    ),
    ["bondSummary", copy.modules.bondSummary, 10, 40],
    ...copy.tags.map((t, i) => [`tag ${i + 1}`, t, 2, 6] as [string, string, number, number]),
  ];
  return [
    ...fields.map(([label, text, min, max]) => ({
      label,
      count: Array.from(text).length,
      min,
      max,
      passed: Array.from(text).length >= min && Array.from(text).length <= max,
    })),
    { label: "tags 数量", count: copy.tags.length, min: 0, max: 3, passed: copy.tags.length <= 3 },
  ];
}
export function emptyReview(run: EvalRun): Review {
  return {
    scores: [...Array(9).fill(null), run.checks?.every((c) => c.passed) ? 1 : 0],
    reasons: Array(10).fill(""),
    fabrication: null,
    repetition: null,
    notes: "",
    reviewer: "",
  };
}
export function verdict(run: EvalRun, review = run.review ?? emptyReview(run)) {
  if (run.status === "error") return { score: null, label: "生成失败", failed: true };
  const scores = [...review.scores.slice(0, 9), run.checks?.every((c) => c.passed) ? 1 : 0];
  const score = scores.reduce<number>((sum, s) => sum + (s ?? 0), 0);
  if (review.fabrication === true || review.repetition === true)
    return {
      score: scores.some((s) => s === null) ? null : score,
      label: "一票否决",
      failed: true,
    };
  if (scores.some((s) => s === null) || review.fabrication === null || review.repetition === null)
    return { score: null, label: "待人工评分", failed: false };
  return {
    score,
    label: score >= 9 ? "可上线（单次）" : score >= 7 ? "可用但继续调" : "失败",
    failed: score <= 6,
  };
}
export function stabilityVerdict(runs: EvalRun[], review?: StabilityReview) {
  // A cohort is exactly five independent runs of the same immutable input and prompt version.
  if (!review || review.runIds.length !== 5) return "待评：需要固定 5 次结果";
  const cohort = review.runIds.map((id) => runs.find((r) => r.id === id));
  if (new Set(review.runIds).size !== 5 || cohort.some((r) => !r)) return "待评：结果已变化";
  if (cohort.some((r) => r!.status !== "ok")) return "失败：存在生成错误";
  if (
    new Set(cohort.map((r) => r!.inputHash)).size !== 1 ||
    new Set(cohort.map((r) => JSON.stringify(r!.promptVersion))).size !== 1
  )
    return "待评：输入或 prompt 版本不一致";
  const values = [review.core, review.misunderstanding, review.affection, review.relationship];
  return values.includes(0)
    ? "失败：核心或洞察方向漂移"
    : values.includes(null)
      ? "待评：逐项判断方向"
      : "通过：5 次方向一致";
}
export function riskHints(copy: NonNullable<EvalRun["copy"]>) {
  const hints: string[] = [];
  const entries = Object.entries(copy.modules);
  for (const [key, text] of entries) {
    const longTerm = text.match(/每天|每晚|固定时间|固定路线|总是|从不|永远|一定|准时|半夜|清晨/g);
    if (longTerm) hints.push(`${key} 含待核查频率或绝对词：${[...new Set(longTerm)].join("、")}`);
  }
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const clean = (s: string) => s.replace(/[\p{P}\s]/gu, "");
      const a = clean(entries[i][1]),
        b = clean(entries[j][1]);
      if (
        a.length >= 8 &&
        Array.from({ length: a.length - 7 }, (_, k) => a.slice(k, k + 8)).some((s) => b.includes(s))
      )
        hints.push(`${entries[i][0]} / ${entries[j][0]} 有连续 8 字重合，请判断是否同一结论`);
    }
  return hints;
}

export function caseVerdict(runs: EvalRun[], review?: StabilityReview) {
  const latest = runs.at(-1);
  if (!latest) return { score: null, label: "尚未生成", failed: false };
  const result = verdict(latest);
  if (result.failed) return result;
  const stability = stabilityVerdict(runs, review);
  if (review?.runIds.includes(latest.id) && stability.startsWith("失败"))
    return { ...result, label: "失败：稳定性不通过", failed: true };
  if (result.score !== null && result.score >= 9) {
    if (!review?.runIds.includes(latest.id) || !stability.startsWith("通过"))
      return { ...result, label: "单次合格 · 稳定性待验收" };
    // A stable cohort can still contain a fabricated or unreviewed individual run.
    const cohort = runs.filter((run) => review.runIds.includes(run.id));
    if (cohort.some((run) => verdict(run).failed))
      return { ...result, label: "失败：5 次中有不合格结果", failed: true };
    if (cohort.some((run) => (verdict(run).score ?? -1) < 9))
      return { ...result, label: "5 次结果尚未全部合格" };
    return { ...result, label: "可上线：单次与稳定性通过" };
  }
  return result;
}
