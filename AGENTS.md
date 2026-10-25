# Project Memory

- Production deploy target is Cloudflare Workers service `nekoid`.
- Cloudflare account ID: `a90c9128a6517064a3c70ef87c8f3cf0`.
- Production primary custom domain: `www.neko-id.uk`.
- Production apex fallback domain: `neko-id.uk`.
- Follow `DEPLOYMENT.md` for repeat deployments.
- Never commit `.env.local`; production ByteCat values are stored as Cloudflare Worker secrets.
- Supabase project for persistence: `Neko-ID` / ref `jbjgrkivscrombvnlcrl`.
- Supabase storage bucket for user media: `neko-media`.
- Real Supabase secret keys must be rotated if exposed and must only live in `.env.local` / Worker secrets.
- Auth uses Supabase email OTP only. The Magic Link or OTP email template must include `{{ .Token }}` so users receive a 6-digit code for `/auth/login`.

# Miao Yixia UI Rules

所有「喵一下」App 的 UI 开发、重构、修复和新增页面，都必须先完整阅读并严格遵循：

`docs/MIAO_YIXIA_DESIGN_SYSTEM_V1.md`

该文档是项目 UI 的唯一 visual source of truth。执行任何 UI 工作时，必须把“统一性 > 单页创意”作为强制原则。如果当前页面实现与 Design System 冲突，优先修正为 Design System，不得为了保留旧页面局部样式继续制造新例外。

除非用户明确要求修改设计系统，否则：

- 禁止自行新增字体体系。
- 禁止自行定义新的字号层级。
- 禁止自行定义新的 spacing 规则。
- 禁止自行定义新的圆角体系。
- 禁止自行增加高饱和渐变。
- 禁止随意增加阴影、玻璃拟态或发光效果。
- 禁止因为“更有设计感”而自行改变信息架构。
- 禁止新增 emoji、英文装饰、tag 或 icon。
- 禁止自行修改按钮名称。
- 禁止把设计稿当成“灵感参考”；有设计稿时，设计稿必须作为 visual source of truth，只允许为真实设备尺寸做必要的响应式适配。

普通 UI 必须优先使用 Design System token。禁止在页面中大量直接 hardcode：

- `.font(.system(size: ...))`
- `.padding(...)`
- `.cornerRadius(...)`
- `foregroundColor(...)`
- `foregroundStyle(...)`
- `.shadow(...)`
- 直接构造颜色值

如果已有对应 token，必须使用 token。仅当 Design System 明确允许且不存在适用 token 时，才可在局部组件中使用经过说明的特例；不得由页面自行扩展 token 体系。

## Required UI Task Workflow

每个 UI 任务必须依次执行以下步骤，不得跳过：

### STEP 1 — Inspect

修改前先检查并说明：

- 当前页面使用哪些组件。
- 当前页面使用哪些 Design Token。
- 哪些样式仍然 hardcoded。
- 当前实现与 reference design / Design System 的差异。

### STEP 2 — Plan

实现前必须明确：

- 将修改哪些组件。
- 明确不修改哪些业务逻辑。
- 将使用哪些 Design Token。

### STEP 3 — Implement

只修改当前任务明确要求的范围。除非用户明确要求，否则禁止顺手修改：

- backend
- prompt
- 数据结构
- 路由
- 其他页面
- unrelated component

### STEP 4 — Visual QA

完成后必须逐项检查并报告：

- font family
- font size
- font weight
- line height
- spacing
- padding
- radius
- color
- image crop
- safe area
- clipping
- bottom overlap
- small-screen behavior

## Persona Result Mandatory Rules

Persona Result 页面还必须满足：

- Hero 必须遵循 Design System 的 Magazine Hero 规范。
- 中文人格标题固定使用 Design System 定义的 editorial font。
- 普通 UI 不允许使用 editorial font。
- Persona Title 最多两行，禁止单字孤行。
- Hero 图片必须优先保证用户真实猫咪清晰可见，猫脸、眼睛、毛发和耳朵不能被无意义遮挡。
- 禁止使用大面积白色遮罩把猫咪洗掉。
- tags 最多 3 个。
- Insight 必须遵循长度和结构限制，禁止做成长篇 AI 报告。

## Scope And Regression Rules

- 每次只处理一个页面或一个问题域，除非用户明确扩大范围。
- UI 修改不得隐式改变业务逻辑、数据流或交互语义。
- 核心页面修改后必须与 reference screenshot 做 visual regression 对比。
- 没有 reference screenshot 时，应明确指出缺失，不得自行发明新的视觉方向。
- 任何设计系统例外都必须由用户明确授权，并在变更说明中记录。
