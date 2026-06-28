"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { Upload, Sparkles, RefreshCw, Camera } from "lucide-react"
import { Button } from "@/components/ui/button"

type Phase = "idle" | "generating" | "done"

const DEFAULT_PHOTO = "/uploaded-cat-photo.png"
const DEFAULT_CHARACTER = "/ai-character-cat.png"

export function CharacterReveal() {
  const [photo, setPhoto] = useState<string>(DEFAULT_PHOTO)
  const [phase, setPhase] = useState<Phase>("done")
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPhoto(url)
    setPhase("generating")
    // 原型：模拟 AI 角色生成过程
    setTimeout(() => setPhase("done"), 2600)
  }

  function regenerate() {
    setPhase("generating")
    setTimeout(() => setPhase("done"), 2600)
  }

  return (
    <section className="mx-auto w-full max-w-md">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFile}
      />

      {/* AI 角色形象卡片 —— 用户上传猫咪的 AI character 图片 */}
      <div className="relative overflow-hidden rounded-4xl border border-border bg-card shadow-[0_18px_60px_-20px_rgba(220,120,180,0.55)]">
        <div className="relative aspect-square w-full">
          <Image
            src={phase === "done" ? DEFAULT_CHARACTER : photo}
            alt="你的猫咪 AI 角色形象"
            fill
            priority
            className={`object-cover transition-all duration-700 ${
              phase === "generating" ? "scale-105 blur-md brightness-95" : "scale-100 blur-0"
            }`}
          />

          {/* 生成中遮罩 */}
          {phase === "generating" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/55 backdrop-blur-sm">
              <Sparkles className="size-7 animate-pulse text-primary" />
              <p className="text-sm font-medium text-foreground">AI 正在角色化你的猫咪…</p>
            </div>
          )}

          {/* 角色标签 */}
          {phase === "done" && (
            <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-primary-foreground shadow-sm">
              <Sparkles className="size-3.5" />
              <span className="text-xs font-semibold">AI 角色形象</span>
            </div>
          )}
        </div>

        {/* 角色信息 */}
        <div className="space-y-4 px-6 pb-6 pt-5 text-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">NEKO.ID</p>
            <h2 className="mt-1 text-2xl font-bold text-balance text-foreground">奶油小公主</h2>
            <p className="mt-1 text-sm text-primary font-medium">温柔黏人 · 高冷外表派</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "亲密度", value: "92%" },
              { label: "好奇心", value: "78%" },
              { label: "傲娇值", value: "85%" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-secondary px-2 py-3">
                <p className="text-lg font-bold text-secondary-foreground">{s.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            它看起来高冷，其实最依赖你。喜欢在你看不见的地方默默守护，等你伸手时又假装不在意——
            一只把爱藏进尾巴尖的小公主。
          </p>
        </div>
      </div>

      {/* 原图对照 + 操作 */}
      <div className="mt-5 flex items-center gap-3 rounded-3xl border border-border bg-card/70 p-3">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-2xl">
          <Image src={photo} alt="你上传的猫咪原图" fill className="object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">基于你上传的照片生成</p>
          <p className="text-xs text-muted-foreground">换一张照片即可重新生成专属角色</p>
        </div>
        <Button
          size="icon"
          variant="secondary"
          onClick={regenerate}
          disabled={phase === "generating"}
          aria-label="重新生成"
          className="shrink-0 rounded-2xl"
        >
          <RefreshCw className={`size-4 ${phase === "generating" ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* 上传按钮 */}
      <div className="mt-5 flex flex-col gap-2.5">
        <Button
          size="lg"
          onClick={() => inputRef.current?.click()}
          disabled={phase === "generating"}
          className="h-12 rounded-2xl text-base font-semibold"
        >
          <Upload className="size-4" />
          上传猫咪照片，生成角色
        </Button>
        <Button
          size="lg"
          variant="ghost"
          onClick={() => inputRef.current?.click()}
          disabled={phase === "generating"}
          className="h-11 rounded-2xl text-sm text-muted-foreground"
        >
          <Camera className="size-4" />
          拍一张
        </Button>
      </div>
    </section>
  )
}
