import { Screen1Welcome } from "./Screen1Welcome";
import { Screen2Photo } from "./Screen2Photo";
import { Screen3Video } from "./Screen3Video";
import { Screen4Quiz } from "./Screen4Quiz";
import { Screen5Analyzing } from "./Screen5Analyzing";
import { Screen6Result } from "./Screen6Result";
import { useState } from "react";

const SCREENS = [Screen1Welcome, Screen2Photo, Screen3Video, Screen4Quiz, Screen5Analyzing, Screen6Result];

export function OnboardingShowcase() {
  const [stack, setStack] = useState<number[]>([0]);
  const i = stack[stack.length - 1];
  const Current = SCREENS[i] as React.ComponentType<{ onNext?: () => void; onPrev?: () => void; onRestart?: () => void }>;
  const go = (target: number) =>
    setStack((s) => (s[s.length - 1] === target ? s : [...s, Math.max(0, Math.min(SCREENS.length - 1, target))]));
  const next = () => go(i + 1);
  const prev = stack.length > 1 ? () => setStack((s) => s.slice(0, -1)) : undefined;
  const restart = () => go(4);
  return (
    <div className="relative h-[100dvh] overflow-hidden" style={{ background: "var(--gradient-cream)" }}>
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-80" style={{ background: "var(--gradient-aura)" }} />
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, oklch(0.78 0.11 305 / .35) 1px, transparent 0)", backgroundSize: "32px 32px" }} />
      <div className="relative z-10 mx-auto h-[100dvh] w-full max-w-[480px] overflow-hidden">
        <Current onNext={next} onPrev={prev} onRestart={restart} />
      </div>
    </div>
  );
}
