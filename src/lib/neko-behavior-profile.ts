import type { CatProfile } from "@/components/neko/catProfileStore";

export type BehaviorTrait =
  "sociability" | "curiosity" | "vigilance" | "attachment" | "expressiveness" | "boundary";
export type QuizAnswer = "a" | "b" | "c";
export type QuestionnaireVersion = "web-v1" | "ios-v1";

type Question = { question: string; a: string; b: string; c: string };

// These versions describe the existing clients, not interchangeable A/B/C scales.
// Keep their displayed wording intact; a contract test compares both clients.
export const PERSONA_QUESTIONNAIRES: Record<QuestionnaireVersion, readonly Question[]> = {
  "ios-v1": [
    {
      question: "陌生人来到家里时，它通常会？",
      a: "很快靠近，主动看看",
      b: "保持距离，先观察",
      c: "先躲起来，确认安全再说",
    },
    {
      question: "家里出现没见过的东西时，它通常会？",
      a: "马上过去研究",
      b: "观察一会儿再靠近",
      c: "兴趣不大，懒得理",
    },
    {
      question: "你回到家时，它更像哪一种？",
      a: "很快出现，主动迎你",
      b: "会出现，但比较淡定",
      c: "继续做自己的事",
    },
    {
      question: "它想让你做什么时，通常怎么表达？",
      a: "叫你、蹭你，很直接",
      b: "待在附近，等你发现",
      c: "自己先行动或解决",
    },
    {
      question: "突然有很大的声音或动静时，它通常会？",
      a: "马上警觉，去确认",
      b: "先停下来观察",
      c: "大多不太受影响",
    },
    {
      question: "遇到不喜欢的互动时，它通常会？",
      a: "明确躲开或拒绝",
      b: "先忍一会儿，再离开",
      c: "通常都比较配合",
    },
    {
      question: "你忙自己的事时，它通常在哪里？",
      a: "待在你附近",
      b: "自己找地方待着",
      c: "到处走走，看心情",
    },
    {
      question: "它最喜欢哪种陪伴方式？",
      a: "和你有很多互动",
      b: "待在一起，各做各的",
      c: "有需要时再来找你",
    },
  ],
  "web-v1": [
    {
      question: "陌生人来到家里时，它通常会？",
      a: "很快靠近，主动看看是谁",
      b: "保持一点距离，先观察一阵",
      c: "先躲起来，确定安全再说",
    },
    {
      question: "家里出现一个从没见过的东西，它通常？",
      a: "第一时间凑过去研究",
      b: "远远观察，过一会儿再靠近",
      c: "兴趣不大，基本懒得管",
    },
    {
      question: "你回到家时，它通常？",
      a: "很快出现，主动来迎接你",
      b: "看见你了，但继续待在原来的地方",
      c: "表面没什么反应，过一会儿才靠近",
    },
    {
      question: "它想让你做什么时，通常怎么告诉你？",
      a: "叫你、蹭你，想办法让你注意到",
      b: "待在附近看着你，等你自己发现",
      c: "直接行动，比如带你过去或扒拉东西",
    },
    {
      question: "突然出现很大的声音或动静，它通常？",
      a: "马上警觉，先确认发生了什么",
      b: "会被吓一下，但很快恢复正常",
      c: "基本没什么反应，该干嘛干嘛",
    },
    {
      question: "遇到自己不喜欢的互动时，它通常？",
      a: "很快明确表达：走开、挣脱或拒绝",
      b: "会忍一会儿，不舒服了才离开",
      c: "大多数时候都挺配合",
    },
    {
      question: "你忙自己的事情时，它通常？",
      a: "会主动来找你，希望你注意它",
      b: "喜欢待在你附近，但不一定打扰你",
      c: "自己找地方待着，各忙各的",
    },
    {
      question: "如果让它自己选，它最喜欢你怎么陪它？",
      a: "摸摸它、抱抱它，和它贴贴",
      b: "陪它玩、逗它，一起做点什么",
      c: "不用一直互动，待在它附近就好",
    },
  ],
};

export function questionnaireAnswersForPrompt(
  quiz: CatProfile["quiz"],
  version: QuestionnaireVersion = "web-v1",
) {
  return PERSONA_QUESTIONNAIRES[version].map((question, index) => {
    const value = quiz?.[index];
    const choice = value === "a" || value === "b" || value === "c" ? value : null;
    return {
      questionId: `Q${index + 1}`,
      reference: choice ? `Q${index + 1}:${choice.toUpperCase()}` : null,
      question: question.question,
      answer: choice ? question[choice] : null,
    };
  });
}

export type BehaviorProfile = Record<BehaviorTrait, number | null> & {
  loveLanguage: "亲密接触" | "互动玩耍" | "互动陪伴" | "安静共处" | "按需互动" | "未知";
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

// iOS Q3/Q4/Q7/Q8 differ from the web questionnaire. Staying alone must not
// increase attachment, quiet company is not play, and interaction is not hugging.
export const IOS_BEHAVIOR_DELTAS: Record<number, Record<QuizAnswer, Delta>> = {
  0: BEHAVIOR_DELTAS[0],
  1: {
    a: { curiosity: 2, vigilance: -1 },
    b: { curiosity: 1, vigilance: 2 },
    c: { curiosity: -2 },
  },
  2: {
    a: { attachment: 2, expressiveness: 2 },
    b: { attachment: 1, expressiveness: 0 },
    c: { attachment: -1, expressiveness: -1 },
  },
  3: {
    a: { expressiveness: 2, attachment: 1 },
    b: { expressiveness: -1, attachment: 1 },
    c: { attachment: -1, expressiveness: 0 },
  },
  4: { a: { vigilance: 2 }, b: { vigilance: 1 }, c: { vigilance: -2 } },
  5: BEHAVIOR_DELTAS[5],
  6: { a: { attachment: 2 }, b: { attachment: -1 }, c: { attachment: -1 } },
  7: {
    a: { attachment: 2, expressiveness: 1 },
    b: { attachment: 1, expressiveness: -1 },
    c: { attachment: -1, expressiveness: 0 },
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

export function buildBehaviorProfile(
  quiz: CatProfile["quiz"],
  version: QuestionnaireVersion = "web-v1",
): BehaviorProfile {
  const deltas = version === "ios-v1" ? IOS_BEHAVIOR_DELTAS : BEHAVIOR_DELTAS;
  const sums = Object.fromEntries(Object.keys(relevantCounts).map((key) => [key, 0])) as Record<
    BehaviorTrait,
    number
  >;
  const evidence = { ...sums };
  let answeredCount = 0;
  for (const [rawIndex, rawChoice] of Object.entries(quiz ?? {})) {
    if (rawChoice !== "a" && rawChoice !== "b" && rawChoice !== "c") continue;
    if (!/^[0-7]$/.test(rawIndex)) continue;
    answeredCount += 1;
    for (const [trait, delta] of Object.entries(deltas[Number(rawIndex)]?.[rawChoice] ?? {})) {
      sums[trait as BehaviorTrait] += delta ?? 0;
      evidence[trait as BehaviorTrait] += 1;
    }
  }
  const scored = {} as Record<BehaviorTrait, number | null>;
  const confidence = {} as Record<BehaviorTrait, number>;
  for (const trait of Object.keys(relevantCounts) as BehaviorTrait[]) {
    const possibleCount =
      version === "ios-v1"
        ? Object.values(deltas).filter((choices) =>
            Object.values(choices).some((delta) => trait in delta),
          ).length
        : relevantCounts[trait];
    confidence[trait] = Math.round((evidence[trait] / possibleCount) * 100);
    scored[trait] = evidence[trait]
      ? Math.round(Math.max(18, Math.min(82, 50 + (sums[trait] / (evidence[trait] * 2)) * 32)))
      : null;
  }
  return {
    ...scored,
    loveLanguage:
      version === "ios-v1"
        ? quiz?.[7] === "a"
          ? "互动陪伴"
          : quiz?.[7] === "b"
            ? "安静共处"
            : quiz?.[7] === "c"
              ? "按需互动"
              : "未知"
        : quiz?.[7] === "a"
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
