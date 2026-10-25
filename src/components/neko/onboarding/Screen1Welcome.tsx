import hero from "@/assets/neko-hero.jpg";

export function Screen1Welcome({ onNext }: { onNext?: () => void; onPrev?: () => void } = {}) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center pt-[max(64px,calc(env(safe-area-inset-top)+32px))] text-foreground"
      style={{ background: "var(--gradient-cream)" }}
    >
      <div className="relative z-10 mt-8 h-[230px] w-[230px] px-7">
        <div className="absolute inset-[34px] overflow-hidden rounded-full bg-white p-1.5 shadow-[var(--miao-shadow-card)]">
          <img
            src={hero}
            alt=""
            className="h-full w-full rounded-full object-cover"
            loading="lazy"
            width={1024}
            height={1024}
          />
        </div>
      </div>
      <div className="relative z-10 mt-8 flex flex-col items-center px-6">
        <div className="neko-text-support text-[var(--miao-brand)]">喵一下</div>
        <h1 className="mt-3 neko-text-page-title text-foreground">读懂它的小世界</h1>
        <p className="mt-3 max-w-[300px] text-center neko-text-support text-[var(--miao-text-secondary)]">
          AI 将通过照片、视频和行为分析
          <br />
          生成专属于它的人格档案
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-20 w-full px-6 pt-5 pb-[max(16px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            onNext?.();
          }}
          className="miao-primary-button flex w-full touch-manipulation select-none items-center justify-center"
        >
          开始创建猫咪人格档案
        </button>
      </div>
    </div>
  );
}
