# 喵一下 App Design System v1

> 本文档是「喵一下」App 的唯一视觉规范。  
> 后续所有页面、组件、UI 重构必须遵循本文档。  
> 不允许因为页面由不同模型、不同时间或不同组件实现，就自行定义字体、字号、间距、圆角、颜色或组件样式。

---

# 0. 核心原则

喵一下的视觉关键词：

**轻 / 柔和 / 精致 / 克制 / 有一点杂志感 / 真实猫咪优先**

不是：

- 梦幻少女风
- 高饱和粉紫
- AI 科技感
- 大量发光
- 大量渐变
- 卡片套卡片
- 大段文字报告
- 可爱元素堆砌
- 每个页面重新设计一遍

所有设计遵循：

**内容 > 装饰**

**真实猫咪 > AI视觉**

**可读性 > 梦幻感**

**统一 > 创意发挥**

---

# 1. 全局字体系统 Typography

除人格结果 Hero 的 editorial 元素外，整个 App 只使用一套 UI 字体体系。

## 1.1 普通中文 UI

字体：

`PingFang SC`

### 一级页面标题

用于：

- 首页
- 我的
- 设置
- 猫咪档案
- 猫咪心声

规格：

- 27pt
- Semibold
- line-height：34pt

禁止：

- Bold / Heavy
- 32pt+
- 超大标题

---

### 页面主标题

例如：

- 记录一个瞬间
- 这是它想对你说的话
- 行为小测试

规格：

- 24pt
- Semibold
- line-height：32pt

---

### Section 标题

例如：

- 猫咪心声
- 我的猫咪
- 设置
- 原来六六是这样的猫

规格：

- 20pt
- Semibold
- line-height：27pt

---

### Card 标题

例如：

- 猫咪档案
- 你可能一直误会它的一件事
- 它表达喜欢的方式

规格：

- 17pt
- Semibold
- line-height：24pt

---

### 正文

规格：

- 16pt
- Regular
- line-height：24pt

长正文禁止小于：

`15pt`

---

### 辅助说明

例如：

- 帮助 AI 更准确理解它
- 查看和管理所有心声
- 基本信息与人格

规格：

- 14pt
- Regular
- line-height：20pt

---

### Button

规格：

- 17pt
- Semibold

---

### Tab Bar

规格：

- 13pt
- Medium

图标：

- 22–24pt

---

# 2. Editorial / 杂志字体

只允许用于人格结果页 Hero。

## 中文人格大标题

字体：

`Songti SC Semibold`

Fallback：

`STSong`

要求：

- 只用于人格名称
- 最多两行
- 禁止用于普通 UI
- 禁止整个页面宋体化

---

## 英文 Editorial

字体：

`Didot`

Fallback：

1. Bodoni 72
2. Baskerville

用于：

- CAT PROFILE
- CAT · INSIGHT
- A Kinder World With Cats

禁止用于普通按钮、正文。

---

# 3. 人格大标题规范

人格标题是特殊组件，不允许普通 Text 随便实现。

## 长度

优先：

4–10 个中文字符

最多：

14 字

超过 14 字：

**必须重新生成文案**

禁止单纯缩小字体硬塞。

---

## 换行

最多：

2 行

禁止：

- 单字孤行
- 最后一行只有 1–2 个字
- 3 行标题

---

## 字号

≤ 6 字：

38pt

7–10 字：

34pt

11–14 字：

30pt

---

## 文案要求

必须像一个人格名称。

推荐：

- 温柔的生活观察家
- 热情有分寸型
- 慢热观察派
- 安静陪伴型
- 好奇但谨慎的探索者

禁止：

- 互动控场王
- 眼神发令机
- 按自己节奏营业的互动控
- 仪式感极强的眼神催促者
- 稳态陪伴
- 端庄定点

原则：

**用户必须一眼看懂。**

---

# 4. Spacing System

全 App 统一使用：

`4 / 8pt grid`

常用值：

4  
8  
12  
16  
20  
24  
32  
40

禁止出现大量随机：

13 / 19 / 27 / 37pt

---

## 页面左右 margin

统一：

`24pt`

特殊紧凑页面最低：

`20pt`

---

## 一级标题 → 首个模块

`20–24pt`

---

## Section 之间

`28–32pt`

---

## Card 之间

`12–16pt`

---

## Card padding

常规：

`20pt`

紧凑型：

`16pt`

---

# 5. Corner Radius

统一圆角体系：

小元素 / chip：

`12–14pt`

按钮：

`18–22pt`

普通 Card：

`22–24pt`

大 Hero：

`28–32pt`

禁止：

每个组件随意使用不同圆角。

---

# 6. Color System

整体：

低饱和、奶白、粉紫。

禁止：

高饱和紫
高饱和粉
大红渐变
蓝紫科技感

---

## 页面背景

使用非常浅：

奶白 → 淡粉 → 淡紫

渐变必须弱。

背景只负责气氛，
不能抢内容。

---

## Primary Purple

建议作为品牌强调：

低饱和薰衣草紫

用途：

- selected state
- icon
- progress
- CTA gradient 左侧

---

## Soft Pink

只作为辅助：

- gradient 右侧
- chip background
- 柔光

---

## 主文字

接近：

深紫灰 / 深灰

禁止纯紫正文。

---

## Secondary Text

比正文浅一级。

但必须满足：

**正常距离无需眯眼即可阅读。**

---

# 7. Gradient

渐变只能用于：

- Primary CTA
- 很轻的页面背景
- 极少量 Hero overlay

禁止：

- 每张 card 渐变
- 每个 icon 渐变
- 大面积高饱和渐变

---

# 8. Button System

## Primary Button

高度：

`54pt`

圆角：

`22pt`

字体：

17pt Semibold

使用：

低饱和紫 → 粉渐变

---

## Secondary Button

高度：

`54pt`

白 / 奶白背景

品牌紫边框

---

## Danger Button

禁止红色大渐变。

使用：

白底  
浅红描边  
红色文字

危险操作必须二次确认。

---

# 9. Bottom Action Bar

所有结果页统一：

使用：

`safeAreaInset(edge: .bottom)`

禁止：

普通 VStack 放在 ScrollView 最下面。

要求：

- 永远不遮正文
- 内容区域必须有 bottom inset
- Home Indicator 安全
- 高度稳定

---

# 10. Tab Bar

固定三个：

首页  
发布  
我的

规格：

Icon：

22–24pt

Label：

13pt Medium

中间发布按钮可以突出，
但不能变成巨大悬浮球。

Tab Bar：

- 贴底
- 不做巨型白色胶囊
- 不做厚阴影
- 与 iOS 原生体验接近

---

# 11. Card System

Card 使用：

- 奶白 / 白色
- 轻透明
- 轻描边
- 极轻阴影或无阴影

禁止：

- 厚重阴影
- 玻璃拟态泛滥
- Card 套 Card 套 Card

原则：

一层内容只使用一层容器。

---

# 12. 猫咪心声 Card

固定结构：

猫咪心声气泡
↓
真实照片
↓
3 个 tags
↓
更多 …

不要显示：

- 地点
- 多余状态
- 重复时间信息

Tags 最多：

3 个

---

# 13. Heart Voice Loading

整个页面只允许一个主要 loading 信息。

识别中：

图片气泡：

「正在读懂它这一刻的心声…」

AI 解读：

使用 skeleton

禁止同时出现：

- toast
- pill
- spinner
- 多条 loading 解释

原则：

**一个状态只表达一次。**

---

# 14. Persona Result Page

页面固定为四层。

## Layer 1 — Magazine Hero

包含：

- 真实猫照片
- CAT PROFILE
- 猫名
- MBTI
- Persona Title
- 一句 summary
- 3 个 tags

禁止 Hero 里放大量正文。

---

## Layer 2 — Personality Visualization

使用：

4 个核心行为维度

例如：

好奇心  
亲近度  
边界感  
警觉度

使用：

horizontal bars

优先于雷达图。

原因：

更易读、更轻、更适合移动端。

---

## Layer 3 — 3 Insights

固定：

01 你可能一直误会它的一件事

02 它表达喜欢的方式

03 在它眼里，你的位置

每条：

一句 conclusion  
+  
一句 explanation

正文：

35–60 中文字符。

禁止长报告。

---

## Layer 4 — Relationship Summary

例如：

「六六和你的关系」

一句具有情绪价值的话。

目标：

成为用户最想截图 / 分享的内容。

---

# 15. Persona Hero 图片规则

用户真实照片必须是视觉中心。

禁止整张图大面积白色遮罩。

原则：

猫脸清晰  
毛发清晰  
眼睛清晰

文字区域才可以使用局部 gradient overlay。

---

## Focal point

优先识别猫脸位置。

Hero crop 必须优先：

- 猫脸完整
- 耳朵完整
- 主体不被标题遮挡

禁止普通 centerCrop 直接糊上去。

---

# 16. Tags

Persona / Heart Voice tags 都统一：

字号：

13–14pt

Medium

左右 padding：

12–16pt

高度：

30–34pt

最多：

3 个

禁止：

4–5 个 tag 堆一排。

---

# 17. 文案密度

移动端每个信息块：

最多表达一个核心观点。

禁止：

一个 Card 里：

标题 +
80 字解释 +
第二段 +
tags +
小标题

---

# 18. Text Length Limits

Persona Summary：

30–50 中文字符

Insight：

35–60 中文字符

Heart Voice：

建议 15–45 中文字符

Tag：

2–6 字

Persona Title：

4–10 字优先

---

# 19. 图片与文字比例

核心原则：

**有照片的页面，让照片说话。**

Hero：

图片视觉面积 ≥ 60%

不要让文字覆盖图片超过约 40% 的有效区域。

---

# 20. 一级页面信息架构

## 首页

首页
↓
猫咪心声
↓
Timeline

禁止再次显示 Persona Card。

---

## 我的

我的
↓
Persona Summary Card
↓
我的猫咪
↓
设置

Persona Summary 只在「我的」存在。

---

# 21. 我的页

只保留：

猫咪档案  
猫咪心声  
设置

不要独立展示：

账号与数据

账号功能进入：

设置。

---

# 22. Setting

设置包含：

账号  
隐私  
用户协议  
关于喵一下  
版本  
退出登录

退出登录放最底部。

---

# 23. Navigation Title

一级页面标题：

27pt Semibold

统一：

首页  
我的

不要：
一个有标题，一个没有。

---

# 24. Questionnaire

所有问题：

单页滚动。

禁止：

一题一页。

选项：

纵向。

选项高度：

64–72pt 左右

不要 90–100pt 巨型卡片。

---

# 25. Animation

动画只用于：

- 页面转场
- loading
- selected state
  -轻微 feedback

Duration：

0.2–0.35s

禁止：

- 大量弹跳
- 长时间渐变动画
- 装饰性无限动画

---

# 26. Design Token Implementation

必须建立统一代码层 Design System。

建议创建：

`DesignSystem.swift`

包含：

```swift
enum MiaoTypography {}
enum MiaoSpacing {}
enum MiaoRadius {}
enum MiaoColors {}
enum MiaoShadow {}
```

所有页面必须调用 token。

禁止：

```swift
.font(.system(size: 23))
.padding(.horizontal, 19)
.cornerRadius(27)
```

这种散落 hardcode。

---

# 27. Codex 开发规则

以后任何 UI 任务必须先执行：

### STEP 1 — Inspect

先检查现有组件。

必须回答：

- 当前页面使用哪些组件
- 使用哪些 typography token
- 哪些地方 hardcoded
- 与设计稿的差异

---

### STEP 2 — Plan

在修改前列出：

- 将修改哪些组件
- 不修改哪些业务逻辑
- 哪些 Design Token 被使用

---

### STEP 3 — Implement

只能修改当前任务要求的页面 / component。

禁止顺手：

- 重构 unrelated code
- 改 prompt
- 改 backend
- 改其他页面
- 自己重新设计

---

### STEP 4 — Visual QA

完成后必须逐项检查：

字体  
字号  
字重  
行高  
padding  
margin  
圆角  
安全区  
图片 crop  
文字截断  
bottom overlap

---

# 28. 设计稿优先级

如果提供目标设计稿：

**目标设计稿 > Codex 自己的审美判断**

Codex 不允许将设计稿理解为：

“风格参考”。

应该理解为：

**visual source of truth**

只允许根据真实设备尺寸做必要响应式适配。

---

# 29. 禁止自由发挥

除非明确要求，否则 Codex 禁止：

- 新增装饰
- 新增英文
- 新增渐变
- 新增 emoji
- 新增标签
- 修改文字结构
- 修改页面信息架构
- 修改按钮名称
- 改字体
- 改图片处理方式

---

# 30. UI 修改原则

每次只处理：

**一个页面 / 一个问题域。**

不要一次同时改：

UI  
backend  
Prompt  
数据结构  
路由

除非任务明确要求。

---

# 31. Visual Regression

每个核心页面都需要保存 reference screenshot。

至少包括：

- 首页
- 我的
- 发布 Step 1
- 行为测试
- 心声识别结果
- Persona Result
- 设置

以后 UI 修改后：

必须对比 reference screenshot。

禁止页面越改越偏。

---

# 32. Persona Generation Visual Stability

相似输入：

核心人格保持稳定。

UI 不应该因为 Persona 文案变化导致：

- Hero 高度巨变
- 标题三行
- tags 换行失控
- 内容溢出

必须通过内容长度限制保护 UI。

---

# 33. Accessibility / Readability

正文最低：

15pt

主要
