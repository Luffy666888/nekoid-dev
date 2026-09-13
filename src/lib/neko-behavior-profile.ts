import type { CatProfile } from "@/components/neko/catProfileStore";

export type BehaviorTrait =
  "sociability" | "curiosity" | "vigilance" | "attachment" | "expressiveness" | "boundary";
export type QuizAnswer = "a" | "b" | "c";
export type BehaviorProfile = Record<BehaviorTrait, number | null> & {
  loveLanguage: "亲密接触" | "互动玩耍" | "安静共处" | "未知";
  needExpression: "直球型" | "暗示型" | "行动型" | "未知";
  answeredCount: number;
  confidence: Record<BehaviorTrait, number>;
};

type Delta = Partial<Record<BehaviorTrait, number>>;

export const BEHAVIOR_DELTAS: Record<number, Record<QuizAnswer, Delta>> = {
  0: {
    a: { sociability: 2, vigilance: -1 },
    b: { sociability: 0, vigilance: 1 },
    c: { sociability: -2, vigilance: 2 },
  },
  1: {
    a: { curiosity: 2, vigilance: -1 },
    b: { curiosity: 1, vigilance: 2 },
    c: { curiosity: -2, vigilance: -1 },
  },
  2: {
    a: { attachment: 2, expressiveness: 2 },
    b: { attachment: 1, expressiveness: -1 },
    c: { attachment: 2, expressiveness: -2 },
  },
  3: {
    a: { expressiveness: 2, attachment: 1 },
    b: { expressiveness: -2, attachment: 1 },
    c: { expressiveness: 1, curiosity: 1 },
  },
  4: { a: { vigilance: 2 }, b: { vigilance: 0 }, c: { vigilance: -2 } },
  5: {
    a: { boundary: 2, expressiveness: 1 },
    b: { boundary: 1, expressiveness: -1 },
    c: { boundary: -2 },
  },
  6: {
    a: { attachment: 2, expressiveness: 2 },
    b: { attachment: 2, expressiveness: -1 },
    c: { attachment: -1, expressiveness: -1 },
  },
  7: {
    a: { attachment: 2, boundary: -1 },
    b: { attachment: 1, curiosity: 2 },
    c: { attachment: 1, boundary: 2 },
  },
};

const relevantCounts: Record<BehaviorTrait, number> = {
  sociability: 1,
  curiosity: 3,
  vigilance: 3,
  attachment: 5,
  expressiveness: 4,
  boundary: 2,
};

export function buildBehaviorProfile(quiz: CatProfile["quiz"]): BehaviorProfile {
  const sums = Object.fromEntries(Object.keys(relevantCounts).map((key) => [key, 0])) as Record<
    BehaviorTrait,
    number
  >;
  const evidence = { ...sums };
  let answeredCount = 0;
  for (const [rawIndex, rawChoice] of Object.entries(quiz ?? {})) {
    if (rawChoice !== "a" && rawChoice !== "b" && rawChoice !== "c") continue;
    answeredCount += 1;
    for (const [trait, delta] of Object.entries(
      BEHAVIOR_DELTAS[Number(rawIndex)]?.[rawChoice] ?? {},
    )) {
      sums[trait as BehaviorTrait] += delta ?? 0;
      evidence[trait as BehaviorTrait] += 1;
    }
  }
  const scored = {} as Record<BehaviorTrait, number | null>;
  const confidence = {} as Record<BehaviorTrait, number>;
  for (const trait of Object.keys(relevantCounts) as BehaviorTrait[]) {
    confidence[trait] = Math.round((evidence[trait] / relevantCounts[trait]) * 100);
    scored[trait] = evidence[trait]
      ? Math.round(Math.max(18, Math.min(82, 50 + (sums[trait] / (evidence[trait] * 2)) * 32)))
      : null;
  }
  return {
    ...scored,
    loveLanguage:
      quiz?.[7] === "a"
        ? "亲密接触"
        : quiz?.[7] === "b"
          ? "互动玩耍"
          : quiz?.[7] === "c"
            ? "安静共处"
            : "未知",
    needExpression:
      quiz?.[3] === "a"
        ? "直球型"
        : quiz?.[3] === "b"
          ? "暗示型"
          : quiz?.[3] === "c"
            ? "行动型"
            : "未知",
    answeredCount,
    confidence,
  };
}

export function buildCombinationInsights(profile: BehaviorProfile): string[] {
  const high = (trait: BehaviorTrait) => (profile[trait] ?? -1) >= 65;
  const low = (trait: BehaviorTrait) => profile[trait] !== null && (profile[trait] ?? 101) <= 40;
  const insights: string[] = [];
  if (high("attachment") && low("expressiveness"))
    insights.push("很在意主人，但更习惯安静地表达，而不是主动要求关注。");
  if (high("attachment") && high("boundary"))
    insights.push("喜欢主人，同时希望由自己决定身体接触和互动的距离。");
  if (high("curiosity") && high("vigilance"))
    insights.push("对新东西有兴趣，但通常先确认安全，再决定是否靠近。");
  if (low("sociability") && high("attachment"))
    insights.push("对陌生人慢热，却会对熟悉的人建立更深的依赖。");
  if (high("expressiveness") && high("attachment"))
    insights.push("会主动表达需求，也更愿意主动寻找主人互动。");
  if (high("curiosity") && high("boundary"))
    insights.push("很有自己的主意，喜欢自己决定什么时候探索和互动。");
  return insights.slice(0, 3);
}
