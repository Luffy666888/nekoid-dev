# 猫咪档案固定评测

本地入口：`http://127.0.0.1:4318/debug/eval`。

```sh
npm run eval:persona
```

需要 Node.js 22.18+（本次使用 24.19）。真实生成沿用项目 `.env.local` 中现有 AI 配置，不把密钥交给浏览器，不写 Supabase，不创建真实猫档案，不改正式 prompt、路由或结果页，也不随生产构建发布。

## 固定测试集

`scripts/fixtures/persona-photo-eval/cases.json` 是 20 组输入，`sources.json` 是图片作者、原页面、许可链接、下载日期与 SHA-256 清单，`images/` 是 20 张固定图片（约 3.6 MB）。所有照片均来自 Wikimedia Commons。图片保留各自许可证，不能把图片视为项目代码的许可范围；展示时保留作者和来源链接。下载的是站点缩略图，未另行裁切或覆盖。

照片由人工看图核对可见事实；姓名、性别、年龄与问卷均为**模拟测试设定**，不是照片中猫的真实生活资料。问卷文本与正式 8 题对应。包括边界与亲近并存、慢热依恋、警觉好奇、独立、接触拒绝、多猫、远景、部分问卷和空问卷。20 个样本用于定位问题，不代表统计意义上的真实猫人格准确率。

`visibleFacts`、`cannotInfer`、`expected` 和 `evidence` 只向评审展示，不注入生成提示。生成输入只有实际支持的 `profile`、照片和空 `videoObservations`。图片不能被当作长期行为证据。本评测从档案生成入口开始，不覆盖上传阶段的猫脸检测。

## 运行与评审

- `生成全部 20 组`：每组一次，串行请求。
- `当前猫独立生成 5 次`：完全相同资料与图片，不传 `previousPersona`，不固定输出或复用结果。
- `全部各生成 5 次`：100 次真实生成。
- `完成当前条后停止`：不再发出下一次生成，保留已经完成的结果。
- 前 9 项为语义评审，默认未评；第 10 项自动计数。每项可以记录原句与 Q 编号依据。Codex 语义初评与用户人工复核必须通过评审人字段区分。
- 两个否决项也默认为未评：明显编造；两个及以上模块重复同一结论。
- 9–10 可上线、7–8 可用但继续调、≤6 失败。任一否决优先。单次合格仍不能替代 5 次稳定性验收。
- 选定固定的 5 次结果，分别评核心人格、认知反差、亲近表达、主人角色的方向；任何一项明显漂移判失败。不同输入或 prompt 版本不能混作同一 cohort。

长度按 Unicode 字符（含标点）计数：标题 4–14、summary 30–50、每条 insight 35–60、bondSummary 10–40、单 tag 2–6，tags 最多 3 个。评测不截断、不修复输出，也不继承生成器自评的“通过”。频率词、连续 8 字重合只作为人工核查信号，不能自动证明没有编造或语义重复。

结果、评分与稳定性记录保存在 `logs/persona-photo-eval/report.json`（已被现有 `.gitignore` 忽略）；支持导出完整 JSON。每次记录输入 hash、模型请求是否附图、使用模型、prompt 版本、耗时、阶段输出及局部修复。`AI_REQUIRE_REAL=true`，离线回退不会被算作真实生成成功；生产链路自带的局部修复保留并记录。请求失败作为失败记录保存，不填充假结果。

命令行：

```sh
npm run eval:persona:live
npm run eval:persona:live -- --case=photo-01 --repeat=5
npm run test:persona:eval
npx tsc -p eval/tsconfig.json
node eval/download-images.mjs
```

命令行与页面共享同一份历史。新批次用进程锁避免相互覆盖；外部命令行批次运行期间页面可读，但需等该批结束后保存评分。页面只绑定本机，写入接口检查 Origin。换测试集内容时升级 `version`，先归档旧报告再运行，避免混用输入版本。

## Visual QA

新评测页没有用户提供的 reference screenshot，按 `docs/MIAO_YIXIA_DESIGN_SYSTEM_V1.md` 实现，正式核心页面未改。检查 desktop 1440px、mobile 393px、小屏 320px，并保存初始回归截图到 `artifacts/persona-eval/`。

- Font family：普通 UI 复用 PingFang SC 字体栈，无 editorial 字体。
- Font size / weight / line height：标题 27/600/34；正文 16/400/24；辅助 14/400/20；按钮 17/600。
- Spacing / padding：使用 `--miao-space-*`，页边距 24，小屏 20，卡片 20/16。
- Radius：复用 card 24、button 22、chip 14 token。
- Color：复用现有文字、表面、品牌和错误色；没有新增视觉色或阴影。
- Image crop：`object-fit: contain`，全图可见，未盖住猫脸/耳朵。
- Safe area：上下左右使用 safe-area inset；无需固定底部操作栏。
- Clipping / bottom overlap：正文整页滚动，无固定底栏遮挡；日志长行可换行并滚动。
- Small screen：单列结果与评分，测试组横向滚动；页面无横向溢出。
