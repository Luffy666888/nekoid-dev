# ByteCat 本地备用模型验证

测试日期：2026-09-12（Asia/Shanghai）。前几轮在本地完成；随后按用户要求部署到 Cloudflare，线上结果见本文末尾。

本地页面：<http://127.0.0.1:5173/>。

## 实测结果

下表记录多轮真实请求中的成功耗时。成功样本不代表稳定性承诺；超时、空响应也单独记录。各模型逐个直接调用项目中的服务实现，禁止其他备用模型替代被测模型完成请求。

| 模型 | 简单文本 | 猫咪正脸 | 人格档案（含图） | 心声（含图） | 限制 |
| --- | --- | --- | --- | --- | --- |
| `gpt-5.6-sol` | 2.45–3.68 秒 | 8.48–15.40 秒 | 19.31 秒 | 16.80–20.05 秒 | 图片请求出现 20/22 秒超时；存在性识别数次 HTTP 200 但正文为空白，不能当作有效识别结果 |
| `gpt-5.5` | 2.79–5.39 秒 | 3.15–8.90 秒 | 15.76 秒 | 14.93 秒 | 出现 18 秒文本超时、22 秒图片生成超时，以及 8 秒存在性识别超时 |
| `gemini-3-flash-preview` | 3.40–11.79 秒 | 5.08–6.73 秒 | 8.55–9.01 秒 | 9.28 秒 | 出现 8/20 秒识别超时和 22 秒心声生成超时 |
| `gemini-3.7-flash` | 3.11–3.54 秒 | 5.58–5.93 秒 | 13.77–13.84 秒 | 6.31–9.53 秒 | 修正请求参数后，两轮五项业务测试全部通过；本次优先作为视觉备用模型 |

Gemini 3.7 的存在性识别成功耗时为 4.86–5.22 秒。Gemini Preview 也返回过有效存在性结果（5.17 秒）；GPT 5.5 成功过一次（3.63 秒），后续仍有超时。Sol 的存在性识别不稳定，增加输出额度后仍复现空白正文。

GPT 5.5 心声补测将**测试进程**的图片超时临时放宽至 60 秒，实际 14.93 秒完成；应用仍使用 22 秒备用模型限制。统计使用约 83 KB、最长边 900 像素的 JPEG，接近网页上传压缩后的图片。早期 1 MB 图片测试也出现更多超时，未将其耗时混入本表。

结论：四个模型均已接入，并均有文本、图片识别、人格及心声的成功样本；当前 Gemini 3.7 表现最稳定。其他模型保留为后续备用，不能声称所有请求都会在当前时限内成功。

## 真实本地 HTTP 链路

- 首页与 `/api/ios/health` 均返回 HTTP 200。
- `/api/ios/detect-cat-face` 返回有效 `isCat: true`，总耗时 4.16 秒。
- `/api/ios/onboarding/persona` 返回完整人格档案，总耗时 15.89 秒。
- 同一次人格请求的服务端日志确认：`gpt-5.6-terra` 在 8000 ms 超时，随后 `gemini-3.7-flash` 用 7874 ms 返回结果。这验证了真实 HTTP 请求中的自动切换。

## 接入与容错

- GPT：`https://www.bytecatcode.org/v1/chat/completions`，使用 `BYTECAT_API_KEY` 的 Bearer 鉴权。
- Gemini：`https://bytecat.lamclod.cn/v1beta/models/{model}:generateContent`，使用独立的 `BYTECAT_GEMINI_API_KEY` 与 `x-goog-api-key` 请求头。
- Gemini 发送 `contents`、`systemInstruction` 和 `inlineData` 图片；只解析最终回答，忽略 `thought: true` 的部分。
- 不指定 `thinkingLevel`：实测 ByteCat 的 Gemini 3.7 部分上游会拒绝该可选参数。字段定义参见 [Gemini 官方 API 文档](https://ai.google.dev/api/generate-content#ThinkingConfig)，供应商兼容性以实际响应为准。
- 空回答、截断结果、非 JSON 或缺少业务字段的结果触发下一模型，不当作识别否定或生成成功。
- 超时覆盖请求及完整响应体读取。图片存在性识别先尝试备用模型；全部失败后才使用既有的 `vision_unavailable` 宽松结果。
- 图像候选仅使用视觉模型列表，不再最后尝试文本主模型 Luna。

本地配置：

```dotenv
BYTECAT_MODEL=gpt-5.6-luna
BYTECAT_VISION_MODEL=gpt-5.6-terra
BYTECAT_TEXT_FALLBACK_MODELS=gemini-3.7-flash,gemini-3-flash-preview,gpt-5.5,gpt-5.6-sol
BYTECAT_VISION_FALLBACK_MODELS=gemini-3.7-flash,gemini-3-flash-preview,gpt-5.6-sol,gpt-5.5
BYTECAT_PRIMARY_TIMEOUT_MS=8000
BYTECAT_TEXT_TIMEOUT_MS=18000
BYTECAT_VISION_TIMEOUT_MS=22000
```

主模型最多等待 8 秒。备用文本生成单次最多 18 秒，备用图片生成单次最多 22 秒；正脸识别单次最多 20 秒，存在性识别单次最多 8 秒。连续失败时，总等待时间会叠加。

真实 Gemini key 保存在被 Git 忽略的 `.env.local`（权限 `600`）与 Cloudflare Worker secrets。源代码、测试文件及浏览器构建产物均已检查，没有包含私有 API key。

## 复测

需要 Node.js 22+ 与已安装的项目依赖。

```sh
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
pnpm test:ai
pnpm test:ai:live
# 只测试一个模型：
pnpm test:ai:live gemini-3.7-flash
# 只测试某几种业务，并将结果写入独立文件：
BYTECAT_TEST_SCENARIOS=persona,voice BYTECAT_TEST_REPORT=logs/bytecat-retest.json pnpm test:ai:live gpt-5.5
```

真实测试读取 `.env.local`，会消耗 ByteCat API 额度。默认将不含图片和密钥的结果写入 `logs/bytecat-live-results.json`；任何场景失败时以非零状态退出。测试样图由仓库的 `src/assets/neko-real-cat.jpg` 压缩为 `scripts/fixtures/bytecat-cat.jpg`。

## 代码验证

- 9 项离线回归测试通过，覆盖响应体超时、自动切换、不同密钥与协议、Gemini 思考内容过滤、无效检测结果、业务字段缺失及候选去重。
- 两个修改的 AI 服务文件 ESLint 通过；`git diff --check` 通过。
- `pnpm build:china` 的本地 Node 构建通过。
- 全项目 `tsc --noEmit` 仍有既有错误：`src/lib/send-sms-hook.server.ts:137`，TS7053 字符串索引类型问题。该文件本次未修改；AI 接入未新增 TypeScript 诊断。

## 同日远端代码同步

随后拉取 Web/后端仓库 `origin/nekoid-init` 至 `5df8a19`、iOS 前端仓库 `origin/main` 至 `e66dc6f`。合并保留远端新提示词、四项人格特征、结构化心声分析及分享字段，同时保留本地备用模型、独立 Gemini key 和 8 秒主模型超时。

合并后的 12 项离线回归测试、全项目 TypeScript 检查和本地 Node 构建通过。上述短信模块类型错误已由远端提交修复。上表模型耗时是本次同步前的提示词测试记录；此次代码同步没有重新运行收费的全模型实测。

## Gemini 兜底接入最新逻辑（本地，未 push）

纯文本与图片业务均优先尝试 Gemini 备用：主模型失败或达到当前本地 8 秒时限后，依次尝试 `gemini-3.7-flash`、`gemini-3-flash-preview`，然后才使用已保留的 GPT 备用模型。沿用刚拉取的新版人格和心声提示词、四项人格特征、结构化分析及分享数据。

针对新提示词的真实请求结果：

| 模型 | 新版人格（含图） | 新版心声（含图） |
| --- | --- | --- |
| `gemini-3.7-flash` | 通过，6.91 秒 | 通过，5.22 秒 |
| `gemini-3-flash-preview` | 通过，10.03 秒 | 通过，6.82 秒 |

这四次请求均由指定 Gemini 独立完成，没有借助其他模型替代完成。另有 16 项离线测试通过，覆盖新版业务完整自动切换链路，包括 Terra 超时、Gemini 3.7 字段缺失/空回答/限流后继续使用 Preview 的情况。全项目 TypeScript 检查、本地 Node 构建以及本地首页和健康接口检查通过。这一阶段未提交、未 push、未部署；后续服务器发布见下一节。

## 正式服务器部署与验证

按用户要求于 2026-09-12 21:04（Asia/Shanghai）部署到 Cloudflare Worker `nekoid`，版本为 `78332390-403a-4a57-b501-28a9f57a3881`，承接 100% 流量。部署基于 `5df8a19` 加本地修改；没有执行 Git 提交或 push。

Gemini key、兜底顺序及超时设置已同步至 Worker secrets。先执行仓库的增量数据库迁移，新增 5 个分析与分享字段，生产迁移历史版本为 `20260912130236`。SQL 元数据和 REST Data API 均确认字段可用，原有字段、数据与权限规则保留。

| 线上检查 | 结果 | 总耗时 |
| --- | --- | --- |
| 主域名、备用域名首页 | 均为 HTTP 200 | — |
| `/api/ios/health` | HTTP 200 | — |
| `/api/ios/detect-cat-face` | HTTP 200，正确识别猫咪 | 8.31 秒 |
| `/api/ios/onboarding/persona` | HTTP 200，6 个标签、4 项特征及至少 2 个观察项 | 17.43 秒 |
| `/api/ios/voice`（未登录） | HTTP 401，保留登录校验 | — |

Worker 日志确认，同一次线上人格请求中，Terra 在 8000 ms 超时后，自动切换到 Gemini 3.7，后者在 7816 ms 返回成功，没有 Worker 异常。心声完整生成已在本地针对新版提示词实测通过；线上本轮仅验证未登录请求会被拒绝，登录后的 App 心声生成由用户继续验证。

验证记录位于被 Git 忽略的 `logs/production-gemini-results.json` 和 `logs/production-gemini-server-proof.json`。App 保持原有线上接口地址即可测试。
