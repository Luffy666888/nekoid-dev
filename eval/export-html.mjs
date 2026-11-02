import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { RUBRIC, MODULES, verdict, caseVerdict, stabilityVerdict } from "./core.ts";

const root = new URL("../", import.meta.url);
const state = JSON.parse(
  await readFile(new URL("artifacts/persona-eval/initial-reviewed-report.json", root), "utf8"),
);
const cssSource = await readFile(new URL("src/styles.css", root), "utf8");
const rootCss = cssSource.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
const tokens = rootCss
  .match(/--(?:miao-[a-z0-9-]+|font-neko-ui|background|gradient-cta)\s*:[^;]+;/g)
  .join("\n");
const typography = ["page-title", "module-title", "card-title", "body", "support", "button"]
  .map((name) => cssSource.match(new RegExp(`\\.neko-text-${name}\\s*\\{[^}]+\\}`))[0])
  .join("\n");
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const link = (url, label) =>
  /^https?:\/\//.test(url || "")
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`
    : esc(label);
const list = (values) => `<ul>${values.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>`;
const date = (value) =>
  new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const successful = state.runs.filter((r) => r.status === "ok");
const latest = state.cases.map((c) =>
  state.runs.filter((r) => r.caseId === c.id && r.status === "ok").at(-1),
);
const mean = (latest.reduce((sum, r) => sum + (verdict(r).score ?? 0), 0) / latest.length).toFixed(
  1,
);
const passed = state.cases.filter((c) =>
  caseVerdict(
    state.runs.filter((r) => r.caseId === c.id),
    state.stability[c.id],
  ).label.startsWith("可上线"),
).length;
const fabrications = latest.filter((r) => r.review?.fabrication === true).length;
const repetitions = latest.filter((r) => r.review?.repetition === true).length;
const tagsOver = successful.filter((r) => r.copy.tags.length > 3).length;
const shortInsights = successful.filter((r) =>
  r.checks.some(
    (c) => ["misunderstanding", "affection", "relationship"].includes(c.label) && !c.passed,
  ),
).length;

function renderRun(run, index, open) {
  if (run.status !== "ok")
    return `<details class="run"><summary class="neko-text-card-title">第 ${index + 1} 次尝试 · 生成失败</summary><p class="danger">${run.requests?.length ? "AI 档案生成未成功；本条保留为失败记录。" : "本地评测适配器加载失败，重新加载后已重试。"}</p><p class="secondary neko-text-support">${date(run.createdAt)} · ${(run.durationMs / 1000).toFixed(1)} 秒</p></details>`;
  const v = verdict(run),
    review = run.review;
  return `<details class="run" ${open ? "open" : ""} data-success="true"><summary class="neko-text-card-title">第 ${index + 1} 次尝试 · ${esc(run.copy.title)} · ${v.score ?? "未评"}/10 · ${esc(v.label)}</summary>
  <p class="secondary neko-text-support">${date(run.createdAt)} · ${(run.durationMs / 1000).toFixed(1)} 秒 · ${esc(review?.reviewer ?? "尚未评审")}</p>
  <div class="result-grid"><div><h3 class="neko-text-module-title">${esc(run.copy.title)}</h3><p>${esc(run.copy.mbti)}</p><p class="secondary neko-text-support">生成 tags（${run.copy.tags.length} 个）：${esc(run.copy.tags.join("、"))}</p>
  ${MODULES.map(([k, label]) => `<section class="module"><div class="row"><h4 class="neko-text-card-title">${esc(label)}</h4><span class="neko-text-support secondary">${k} · ${Array.from(run.copy.modules[k]).length} 字</span></div><p>${esc(run.copy.modules[k])}</p></section>`).join("")}
  <details class="inset"><summary class="neko-text-card-title">自动长度检查</summary>${list(run.checks.map((c) => `${c.label}：${c.count} / ${c.min}–${c.max}，${c.passed ? "通过" : "不通过"}`))}</details>
  <details class="inset"><summary class="neko-text-card-title">使用模型与版本</summary><p class="neko-text-support">${esc(run.model)}</p>${list(Object.entries(run.promptVersion ?? {}).map(([k, v]) => `${k}：${v}`))}</details></div>
  <section aria-label="十项评分"><h3 class="neko-text-card-title">10 项验收与依据</h3><ol class="rubric">${RUBRIC.map((label, i) => `<li><div class="row"><strong>${i + 1}. ${esc(label)}</strong><span class="score ${review?.scores[i] === 0 ? "danger" : ""}">${review?.scores[i] ?? "未评"}</span></div><p class="secondary">${esc(review?.reasons[i] ?? "尚未评审")}</p></li>`).join("")}</ol>
  <div class="veto"><h4 class="neko-text-card-title">一票否决</h4><p>明显编造：<strong>${review?.fabrication === true ? "触发" : review?.fabrication === false ? "未发现" : "未评"}</strong></p><p>两个及以上模块复读：<strong>${review?.repetition === true ? "触发" : review?.repetition === false ? "未发现" : "未评"}</strong></p></div><p class="neko-text-support secondary">${esc(review?.notes ?? "")}</p></section></div></details>`;
}

let casesHtml = "";
for (const item of state.cases) {
  const source = state.sources.find((s) => s.file === item.photo.file),
    runs = state.runs.filter((r) => r.caseId === item.id);
  const bytes = await readFile(
    new URL(`scripts/fixtures/persona-photo-eval/images/${item.photo.file}`, root),
  );
  if (createHash("sha256").update(bytes).digest("hex") !== source.sha256)
    throw Error(`Image checksum mismatch: ${item.photo.file}`);
  const last = runs.filter((r) => r.status === "ok").at(-1),
    v = last ? verdict(last) : { score: null, label: "生成失败" };
  casesHtml += `<details class="case card" id="${item.id}" ${item.id === "photo-01" ? "open" : ""} data-fabrication="${last?.review?.fabrication === true}" data-repetition="${last?.review?.repetition === true}" data-score="${v.score ?? -1}">
  <summary><span class="neko-text-module-title">${item.id.slice(-2)} · ${esc(item.name)}：${esc(item.focus)}</span><span class="neko-text-support case-status">${v.score ?? "—"}/10 · ${esc(v.label)}</span></summary>
  <div class="case-content"><div class="input-grid"><figure><img src="data:image/jpeg;base64,${bytes.toString("base64")}" alt="${esc(item.photo.visibleFacts.join("；"))}" loading="lazy"/><figcaption class="neko-text-support secondary">${link(source.sourcePage, "原图来源")} · ${esc(source.author)} · ${link(source.licenseUrl || source.sourcePage, source.license)}<br/>站点缩略图，未另行裁切。图片保留原许可。</figcaption></figure>
  <div><h3 class="neko-text-card-title">照片可见事实</h3>${list(item.photo.visibleFacts)}<h3 class="neko-text-card-title">不能从照片推断</h3>${list(item.photo.cannotInfer)}<p class="secondary neko-text-support">测试设定：${esc(item.profile.gender)} · ${esc(item.profile.ageStage)}，不代表照片中猫的真实资料。</p></div></div>
  <details class="inset"><summary class="neko-text-card-title">模拟问卷 · ${item.evidence.length}/8 题</summary>${item.evidence.length ? list(item.evidence.map((e) => `${e.id} · ${e.text}`)) : "<p>未填写问卷，缺失信息保持未知。</p>"}</details>
  <details class="inset"><summary class="neko-text-card-title">验收参考方向</summary>${list(Object.entries(item.expected).map(([key, value]) => `${{ core: "核心人格", misunderstanding: "认知反差", affection: "亲近表达", relationship: "主人角色" }[key]}：${value}`))}<p class="neko-text-support secondary">只供评审参考，未作为提示传入生成器。</p></details>
  ${runs.map((run, i) => renderRun(run, i, run.id === last?.id)).join("")}</div></details>`;
}

const stable = state.stability["photo-01"],
  cohort = stable.runIds.map((id) => state.runs.find((r) => r.id === id));
const stabilityHtml = `<section class="card" id="stability"><h2 class="neko-text-module-title">同一只猫 · 5 次稳定性</h2><p class="danger">${esc(stabilityVerdict(cohort, stable))}</p><p class="secondary">相同照片和问卷独立生成 5 次，均不携带上一版人格。仅第一只猫完成本轮重复测试，其余 19 组稳定性待验收。</p>
<div class="comparison">${cohort
  .map(
    (run, i) =>
      `<article><h3 class="neko-text-card-title">第 ${i + 1} 次 · ${esc(run.copy.mbti)}</h3><p>${esc(run.copy.title)}</p>${MODULES.slice(
        0,
        4,
      )
        .map(
          ([key, label]) =>
            `<h4 class="neko-text-card-title">${label}</h4><p>${esc(run.copy.modules[key])}</p>`,
        )
        .join("")}</article>`,
  )
  .join("")}</div>
<div class="stability-scores">${["core", "misunderstanding", "affection", "relationship"].map((key, i) => `<p>${["核心人格", "认知反差", "亲近表达", "主人角色"][i]}方向一致：<strong>${stable[key] === 1 ? "1 · 通过" : stable[key] === 0 ? "0 · 不通过" : "未评"}</strong></p>`).join("")}</div><p class="secondary">${esc(stable.notes)}</p></section>`;

const css = `:root {${tokens}} ${typography}
*{box-sizing:border-box}html{scroll-behavior:auto}body{margin:0;background:var(--background);color:var(--miao-text-primary);font-family:var(--font-neko-ui);-webkit-font-smoothing:antialiased}main{max-width:1440px;margin:auto;padding:max(var(--miao-space-6),env(safe-area-inset-top)) max(var(--miao-page-margin),env(safe-area-inset-right)) max(var(--miao-space-10),env(safe-area-inset-bottom)) max(var(--miao-page-margin),env(safe-area-inset-left))}h1,h2,h3,h4{margin:0}p{margin:var(--miao-space-3) 0;overflow-wrap:anywhere}ul{padding-left:var(--miao-space-6)}li+li{margin-top:var(--miao-space-2)}a{color:var(--miao-brand);text-decoration:underline;overflow-wrap:anywhere}button,input,select{font:inherit;color:inherit}button,summary{cursor:pointer}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--miao-brand);outline-offset:var(--miao-space-1)}.secondary{color:var(--miao-text-secondary)}.danger{color:var(--miao-danger)}.card{background:var(--miao-surface);border:1px solid var(--miao-border);border-radius:var(--miao-radius-card);padding:var(--miao-space-5);margin-top:var(--miao-space-6)}.row{display:flex;justify-content:space-between;gap:var(--miao-space-3);align-items:baseline;flex-wrap:wrap}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--miao-space-4);margin-block:var(--miao-space-5)}.stats div{border-left:1px solid var(--miao-border);padding-left:var(--miao-space-4)}.stats dt{color:var(--miao-text-secondary)}.stats dd{margin:var(--miao-space-2) 0 0}.actions{display:flex;gap:var(--miao-space-3);flex-wrap:wrap;margin-block:var(--miao-space-4)}button{min-height:54px;border:1px solid var(--miao-brand);border-radius:var(--miao-radius-button);background:var(--miao-surface);padding:var(--miao-space-3) var(--miao-space-5);font-family:var(--font-neko-ui)}.filters{display:flex;gap:var(--miao-space-4);flex-wrap:wrap;margin-block:var(--miao-space-4)}.filters label{white-space:nowrap;display:flex;align-items:center;gap:var(--miao-space-2);flex:1 1 260px}input,select{width:100%;min-width:0;padding:var(--miao-space-3);background:var(--miao-surface);border:1px solid var(--miao-border);border-radius:var(--miao-radius-chip)}.case-nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:var(--miao-space-3);margin-top:var(--miao-space-4)}.case-nav a{padding-block:var(--miao-space-2)}.case{scroll-margin-top:var(--miao-space-5)}.case>summary{line-height:27px}.case-status{display:block;color:var(--miao-text-secondary);margin:var(--miao-space-2) 0 0 var(--miao-space-5)}.case-content{margin-top:var(--miao-space-5)}.input-grid,.result-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--miao-space-6);margin-block:var(--miao-space-5)}figure{margin:0;min-width:0}figure img{width:100%;height:320px;object-fit:contain;background:var(--miao-surface-muted);border-radius:var(--miao-radius-chip)}figcaption{margin-top:var(--miao-space-2)}.inset,.run{border-top:1px solid var(--miao-border);padding-top:var(--miao-space-4);margin-top:var(--miao-space-4)}.module{padding-block:var(--miao-space-4);border-bottom:1px solid var(--miao-border)}.module h4{margin:0}.rubric{list-style:none;padding:0;margin:var(--miao-space-4) 0 0}.rubric li{border-top:1px solid var(--miao-border);padding-block:var(--miao-space-3);margin:0}.rubric strong{font-weight:600;flex:1;min-width:0}.rubric .row{flex-wrap:nowrap}.score{font-weight:600;flex-shrink:0}.rubric p{margin-bottom:0}.veto{border-top:1px solid var(--miao-border);padding-top:var(--miao-space-4)}.comparison{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:var(--miao-space-5);margin-top:var(--miao-space-5)}.comparison article{min-width:0;border-top:1px solid var(--miao-border);padding-top:var(--miao-space-4)}.comparison h4{margin-top:var(--miao-space-5)}.stability-scores{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--miao-space-3);border-top:1px solid var(--miao-border);margin-top:var(--miao-space-5)}footer{margin-top:var(--miao-space-8)}[hidden]{display:none!important}#empty{padding:var(--miao-space-5)}
@media(max-width:1000px){.comparison{grid-template-columns:repeat(2,minmax(0,1fr))}.result-grid{grid-template-columns:1fr}}
@media(max-width:640px){main{padding-inline:max(var(--miao-page-margin-compact),env(safe-area-inset-left))}.card{padding:var(--miao-space-4)}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.input-grid,.comparison,.stability-scores{grid-template-columns:1fr}figure img{height:280px}.actions button{flex:1 1 100%}.filters label{display:block}.filters input,.filters select{margin-top:var(--miao-space-2)}.case-nav{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media print{html{scroll-behavior:auto}.controls,.case-nav,.actions{display:none!important}main{max-width:none;padding:0}.card{border-radius:0;box-shadow:none}.input-grid,.result-grid{grid-template-columns:1fr}.comparison{grid-template-columns:repeat(2,minmax(0,1fr))}figure img{height:240px}.rubric li,.module,figure{break-inside:avoid}summary{break-after:avoid}a{color:inherit}body{background:white}}
`;
const js = `
const cards=[...document.querySelectorAll('.case')];
const search=document.querySelector('#search'),filter=document.querySelector('#filter');
function applyFilters(){const query=search.value.trim().toLowerCase();let visible=0;for(const card of cards){const matches=(!query||card.textContent.toLowerCase().includes(query))&&(filter.value==='all'||filter.value==='fabrication'&&card.dataset.fabrication==='true'||filter.value==='repetition'&&card.dataset.repetition==='true'||filter.value==='low'&&Number(card.dataset.score)<=6);card.hidden=!matches;if(matches)visible++;}document.querySelector('#visible-count').textContent='显示 '+visible+' / '+cards.length+' 组';document.querySelector('#empty').hidden=visible!==0;}
search.addEventListener('input',applyFilters);filter.addEventListener('change',applyFilters);
document.querySelector('#expand').addEventListener('click',()=>{for(const card of cards)if(!card.hidden){card.open=true;for(const detail of card.querySelectorAll('details'))detail.open=true;}});
document.querySelector('#collapse').addEventListener('click',()=>{for(const card of cards){card.open=false;for(const detail of card.querySelectorAll('details'))detail.open=false;}});
function openTarget(){const id=decodeURIComponent(location.hash.slice(1));const target=document.getElementById(id);if(target?.classList.contains('case')){search.value='';filter.value='all';applyFilters();target.open=true;target.scrollIntoView();}}window.addEventListener('hashchange',openTarget);openTarget();
let beforePrint=[];window.addEventListener('beforeprint',()=>{beforePrint=[...document.querySelectorAll('details')].map(el=>[el,el.open]);for(const [el]of beforePrint)el.open=true;});window.addEventListener('afterprint',()=>{for(const [el,wasOpen]of beforePrint)el.open=wasOpen;});document.querySelector('#print').addEventListener('click',()=>window.print());
`;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>猫咪档案评测报告 · 2026-10-30</title><style>${css}</style></head><body class="neko-text-body"><main id="top">
<header><h1 class="neko-text-page-title">猫咪档案评测报告</h1><p class="secondary">2026-10-30 · 首轮基线 · ${esc(state.datasetVersion)}</p><p>20 组固定照片与模拟问卷，逐项检查准确性、模块重复、洞察、个体特征与简洁度。</p><p class="neko-text-support secondary">照片、文案与评分均已嵌入此文件，可离线打开。姓名、性别、年龄与问卷为模拟测试设定；评分是 Codex 语义初评，待人工复核，不是真实动物性格的客观标签。</p></header>
<section class="card"><h2 class="neko-text-module-title">首轮结论：暂未达到上线标准</h2><dl class="stats"><div><dt>固定测试组</dt><dd class="neko-text-main-title neko-text-module-title">${state.cases.length} 组</dd></div><div><dt>有效文案</dt><dd class="neko-text-module-title">${successful.length} 份</dd></div><div><dt>最新结果均分</dt><dd class="neko-text-module-title">${mean} / 10</dd></div><div><dt>达到上线标准</dt><dd class="neko-text-module-title">${passed} / ${state.cases.length}</dd></div></dl>
${list([`20 组最新结果中，${repetitions} 组触发模块复读否决，${fabrications} 组还被初评为补写了输入未提供的事实。`, `${tagsOver}/${successful.length} 份文案返回 4 个 tags，超过 3 个上限；${shortInsights}/${successful.length} 份至少一条 insight 低于 35 字。`, "第一只猫独立生成 5 次，核心人格与洞察方向出现变化；稳定性初评失败。", `共 ${state.runs.length} 次尝试，保留 ${state.runs.length - successful.length} 次失败记录；失败样本已补跑成功。`])}<p class="neko-text-support secondary">均分取每组最新有效结果。采用项目默认模型与回退顺序，反映整个生成链路，不能归因为某一个模型。</p></section>
<section class="card"><h2 class="neko-text-module-title">验收规则</h2><p>每项 0/1 分。9–10：可上线；7–8：可用但继续调；≤6：失败。明显编造，或两个及以上模块重复同一结论，均一票否决。单次合格仍需通过 5 次稳定性验收。</p><details class="inset"><summary class="neko-text-card-title">查看 10 项标准与长度限制</summary>${list(RUBRIC)}<p>标题 4–14 字；summary 30–50 字；每条 insight 35–60 字；bondSummary 10–40 字；每个 tag 2–6 字，最多 3 个。按 Unicode 字符计数，包含标点。</p><p class="secondary">前 9 项与否决项为语义初评，第 10 项自动检查。所有生成原文保留，不为报告做截断或改写。</p></details><p><a href="#stability">查看同一只猫的 5 次对比</a></p></section>
<section class="card controls"><h2 class="neko-text-module-title">浏览测试结果</h2><div class="filters"><label for="search">搜索<input id="search" type="search" placeholder="猫名、行为或原文关键词"></label><label for="filter">筛选<select id="filter"><option value="all">全部结果</option><option value="fabrication">触发编造否决</option><option value="repetition">触发复读否决</option><option value="low">总分 ≤6</option></select></label></div><div class="actions"><button id="expand" class="neko-text-button">展开全部</button><button id="collapse" class="neko-text-button">收起全部</button><button id="print" class="neko-text-button">打印报告</button></div><p id="visible-count" class="neko-text-support secondary" role="status">显示 20 / 20 组</p><nav class="case-nav" aria-label="测试组目录">${state.cases.map((c) => `<a href="#${c.id}">${c.id.slice(-2)} · ${esc(c.name)}</a>`).join("")}</nav></section>
<noscript><p>可直接点击每组标题展开阅读全部内容。</p></noscript><p id="empty" hidden>没有匹配的结果。</p>${casesHtml}${stabilityHtml}
<footer class="neko-text-support secondary"><p>照片来自 Wikimedia Commons，作者与原许可逐张列出。网络连接仅在主动打开来源或许可链接时需要。</p><p>本报告为首轮只读快照，包含 ${state.cases.length} 组输入、${successful.length} 份有效结果及 ${state.runs.length - successful.length} 条失败记录。<a href="#top">返回顶部</a></p></footer></main><script>${js}</script></body></html>`;
const destination = new URL("artifacts/persona-eval/猫咪档案评测报告-2026-10-30.html", root);
await mkdir(new URL("artifacts/persona-eval/", root), { recursive: true });
await writeFile(destination, html, "utf8");
console.log(
  JSON.stringify({
    file: fileURLToPath(destination),
    bytes: (await stat(destination)).size,
    cases: state.cases.length,
    runs: state.runs.length,
    successful: successful.length,
  }),
);
