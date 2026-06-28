import { CharacterReveal } from "@/components/character-reveal"

export default function Page() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* 柔和背景光晕 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-accent/50 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-16 size-64 rounded-full bg-primary/20 blur-3xl"
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-10">
        <header className="mb-7 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-balance text-foreground">
            读懂它的小世界
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
            AI 通过你上传的照片，生成专属角色形象与人格档案
          </p>
        </header>

        <CharacterReveal />

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          NEKO.ID · 展示原型，仅供预览
        </footer>
      </div>
    </main>
  )
}
