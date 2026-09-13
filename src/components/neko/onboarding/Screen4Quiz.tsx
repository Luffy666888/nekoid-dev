import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "../screens/_shared";
import { BackButton } from "./BackButton";
import { updateCatProfile } from "../catProfileStore";

const QUESTIONS = [
  {
    q: "陌生人来到家里时，它通常会？",
    a: "很快靠近，主动看看是谁",
    b: "保持一点距离，先观察一阵",
    c: "先躲起来，确定安全再说",
  },
  {
    q: "家里出现一个从没见过的东西，它通常？",
    a: "第一时间凑过去研究",
    b: "远远观察，过一会儿再靠近",
    c: "兴趣不大，基本懒得管",
  },
  {
    q: "你回到家时，它通常？",
    a: "很快出现，主动来迎接你",
    b: "看见你了，但继续待在原来的地方",
    c: "表面没什么反应，过一会儿才靠近",
  },
  {
    q: "它想让你做什么时，通常怎么告诉你？",
    a: "叫你、蹭你，想办法让你注意到",
    b: "待在附近看着你，等你自己发现",
    c: "直接行动，比如带你过去或扒拉东西",
  },
  {
    q: "突然出现很大的声音或动静，它通常？",
    a: "马上警觉，先确认发生了什么",
    b: "会被吓一下，但很快恢复正常",
    c: "基本没什么反应，该干嘛干嘛",
  },
  {
    q: "遇到自己不喜欢的互动时，它通常？",
    a: "很快明确表达：走开、挣脱或拒绝",
    b: "会忍一会儿，不舒服了才离开",
    c: "大多数时候都挺配合",
  },
  {
    q: "你忙自己的事情时，它通常？",
    a: "会主动来找你，希望你注意它",
    b: "喜欢待在你附近，但不一定打扰你",
    c: "自己找地方待着，各忙各的",
  },
  {
    q: "如果让它自己选，它最喜欢你怎么陪它？",
    a: "摸摸它、抱抱它，和它贴贴",
    b: "陪它玩、逗它，一起做点什么",
    c: "不用一直互动，待在它附近就好",
  },
];

export function Screen4Quiz({ onNext, onPrev }: { onNext?: () => void; onPrev?: () => void } = {}) {
  const [answers, setAnswers] = useState<Record<number, "a" | "b" | "c" | null>>({});

  const pick = (idx: number, choice: "a" | "b" | "c") => {
    setAnswers((prev) => ({ ...prev, [idx]: prev[idx] === choice ? null : choice }));
  };

  const handleSubmit = () => {
    const answered = Object.values(answers).filter(Boolean).length;
    if (answered < QUESTIONS.length) toast(`已根据 ${answered} 道回答生成，未回答的题目不会被推测`);
    updateCatProfile({ quiz: answers });
    onNext?.();
  };

  return (
    <div
      className="absolute inset-0 flex flex-col pt-[58px] overflow-hidden"
      style={{ background: "var(--gradient-cream)" }}
    >
      <Sparkles count={14} />
      <BackButton onPrev={onPrev} />
      <div className="relative z-10 flex-1 overflow-y-auto scrollbar-none pb-[170px]">
        <div className="relative z-10 mb-3 flex items-center justify-end px-7">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={
                  "h-1 rounded-full " +
                  (i <= 3 ? "w-6 bg-[oklch(0.82_0.1_320)]" : "w-3 bg-[oklch(0.9_0.02_310)]")
                }
              />
            ))}
          </div>
        </div>
        <div className="relative z-10 px-7">
          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-light leading-tight text-foreground">行为小测试</h1>
            <button
              onClick={() => {
                updateCatProfile({ quiz: answers });
                onNext?.();
              }}
              className="text-[10px] tracking-[0.3em] text-[oklch(0.6_0.06_300)]"
            >
              跳过 ›
            </button>
          </div>
          <p className="mt-1.5 text-[12px] text-[oklch(0.58_0.04_300)]">
            帮助 AI 更准确理解它（可跳过）
          </p>
        </div>
        <div className="relative z-10 mt-5 space-y-3 px-5">
          {QUESTIONS.map((q, i) => (
            <div key={i} className="rounded-[22px] glass p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[oklch(0.95_0.04_320)] text-[10px] font-medium text-[oklch(0.5_0.1_320)]">
                  {i + 1}
                </span>
                <span className="text-[12.5px] font-medium text-foreground">{q.q}</span>
              </div>
              <div className="mt-3 grid gap-2">
                <Opt
                  label="A"
                  text={q.a}
                  active={answers[i] === "a"}
                  onClick={() => pick(i, "a")}
                />
                <Opt
                  label="B"
                  text={q.b}
                  active={answers[i] === "b"}
                  onClick={() => pick(i, "b")}
                />
                <Opt
                  label="C"
                  text={q.c}
                  active={answers[i] === "c"}
                  onClick={() => pick(i, "c")}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-20 px-5 pt-5 pb-[max(10px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex w-full touch-manipulation select-none items-center justify-center gap-2 rounded-full px-6 py-4 text-[14px] font-medium text-white shadow-[0_16px_32px_-14px_oklch(0.78_0.11_305/0.55)] active:scale-[0.98] transition-transform duration-75"
          style={{ background: "var(--gradient-cta)" }}
        >
          <span>好了，开始解析</span>
          <span>✨</span>
        </button>
        <p className="mt-3 text-center text-[10.5px] leading-relaxed text-[oklch(0.58_0.05_300)]">
          AI 将结合测试结果，
          <br />
          生成更准确的人格分析
        </p>
      </div>
    </div>
  );
}

function Opt({
  label,
  text,
  active,
  onClick,
}: {
  label: string;
  text: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center gap-2 rounded-2xl px-3 py-2.5 text-[12px] text-left transition active:scale-[0.98] duration-150 " +
        (active
          ? "text-white shadow-[0_8px_18px_-10px_oklch(0.78_0.11_305/0.45)]"
          : "bg-white/70 text-[oklch(0.45_0.04_300)] border border-[oklch(0.9_0.02_310/0.5)]")
      }
      style={active ? { background: "var(--gradient-selected)" } : undefined}
    >
      <span
        className={
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium " +
          (active
            ? "bg-white/25 text-white"
            : "bg-[oklch(0.95_0.025_320)] text-[oklch(0.5_0.1_320)]")
        }
      >
        {label}
      </span>
      <span className={active ? "font-medium" : ""}>{text}</span>
    </button>
  );
}
