import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "../screens/_shared";
import { BackButton } from "./BackButton";
import { updateCatProfile } from "../catProfileStore";

const QUESTIONS = [
  { q: "陌生人来家里时，它通常会？", a: "立刻躲起来", b: "主动观察" },
  { q: "家里出现新玩具时，它会？", a: "立即研究", b: "观察很久再靠近" },
  { q: "你回家时，它会？", a: "马上出现", b: "假装不在意" },
  { q: "被抚摸的时候，它更喜欢？", a: "蹭过来", b: "保持一点距离" },
  { q: "听到突然的声响，它会？", a: "瞬间警觉", b: "懒得理你" },
  { q: "看见镜子里的自己，它会？", a: "好奇靠近", b: "完全无视" },
  { q: "你忙的时候，它通常？", a: "在你脚边", b: "找自己的位置" },
  { q: "睡觉时，它喜欢？", a: "和你贴着", b: "独占一个角落" },
];

export function Screen4Quiz({ onNext, onPrev }: { onNext?: () => void; onPrev?: () => void } = {}) {
  const [answers, setAnswers] = useState<Record<number, "a" | "b" | null>>({});

  const pick = (idx: number, choice: "a" | "b") => {
    setAnswers((prev) => ({ ...prev, [idx]: prev[idx] === choice ? null : choice }));
  };

  const handleSubmit = () => {
    const answered = Object.values(answers).filter(Boolean).length;
    if (answered < QUESTIONS.length) {
      toast("请先回答完问题");
      return;
    }
    updateCatProfile({ quiz: answers });
    onNext?.();
  };

  return (
    <div className="absolute inset-0 flex flex-col pt-[58px] overflow-hidden"
      style={{ background: "var(--gradient-cream)" }}>
      <Sparkles count={14} />
      <BackButton onPrev={onPrev} />
      <div className="relative z-10 flex-1 overflow-y-auto scrollbar-none pb-[170px]">
      <div className="relative z-10 mb-3 flex items-center justify-end px-7">
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={"h-1 rounded-full " + (i <= 3 ? "w-6 bg-[oklch(0.82_0.1_320)]" : "w-3 bg-[oklch(0.9_0.02_310)]")} />
          ))}
        </div>
      </div>
      <div className="relative z-10 px-7">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-light leading-tight text-foreground">行为小测试</h1>
          <button onClick={() => { updateCatProfile({ quiz: answers }); onNext?.(); }} className="text-[10px] tracking-[0.3em] text-[oklch(0.6_0.06_300)]">跳过 ›</button>
        </div>
        <p className="mt-1.5 text-[12px] text-[oklch(0.58_0.04_300)]">帮助 AI 更准确理解它（可跳过）</p>
      </div>
      <div className="relative z-10 mt-5 space-y-3 px-5">
        {QUESTIONS.map((q, i) => (
          <div key={i} className="rounded-[22px] glass p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[oklch(0.95_0.04_320)] text-[10px] font-medium text-[oklch(0.5_0.1_320)]">{i + 1}</span>
              <span className="text-[12.5px] font-medium text-foreground">{q.q}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Opt label="A" text={q.a} active={answers[i] === "a"} onClick={() => pick(i, "a")} />
              <Opt label="B" text={q.b} active={answers[i] === "b"} onClick={() => pick(i, "b")} />
            </div>
          </div>
        ))}
      </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-20 px-5 pt-5 pb-[max(10px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); handleSubmit(); }}
          className="flex w-full touch-manipulation select-none items-center justify-center gap-2 rounded-full px-6 py-4 text-[14px] font-medium text-white shadow-[0_16px_32px_-14px_oklch(0.78_0.11_305/0.55)] active:scale-[0.98] transition-transform duration-75"
          style={{ background: "var(--gradient-cta)" }}
        >
          <span>好了，开始解析</span><span>✨</span>
        </button>
        <p className="mt-3 text-center text-[10.5px] leading-relaxed text-[oklch(0.58_0.05_300)]">AI 将结合测试结果，<br />生成更准确的人格分析</p>
      </div>
    </div>
  );
}

function Opt({ label, text, active, onClick }: { label: string; text: string; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={
      "flex items-center gap-2 rounded-2xl px-3 py-2.5 text-[12px] text-left transition active:scale-[0.98] duration-150 " +
      (active
        ? "text-white shadow-[0_8px_18px_-10px_oklch(0.78_0.11_305/0.45)]"
        : "bg-white/70 text-[oklch(0.45_0.04_300)] border border-[oklch(0.9_0.02_310/0.5)]")
    } style={active ? { background: "var(--gradient-selected)" } : undefined}>
      <span className={"flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium " + (active ? "bg-white/25 text-white" : "bg-[oklch(0.95_0.025_320)] text-[oklch(0.5_0.1_320)]")}>{label}</span>
      <span className={active ? "font-medium" : ""}>{text}</span>
    </button>
  );
}
