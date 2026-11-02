import { useEffect, useState } from "react";
import { RUBRIC, MODULES, emptyReview, verdict, stabilityVerdict, caseVerdict } from "./core";
import type { EvalState, EvalRun, Review, Score, StabilityReview } from "./core";
async function post(path: string, body: unknown) {
  const response = await fetch(`/__eval/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
}
function ScoreControl({
  value,
  onChange,
  label,
}: {
  value: Score;
  onChange: (value: Score) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value === null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : (Number(e.target.value) as Score))}
    >
      <option value="">未评</option>
      <option value="1">1 · 通过</option>
      <option value="0">0 · 不通过</option>
    </select>
  );
}
function RunReview({ run, onSaved }: { run: EvalRun; onSaved: () => void }) {
  const [review, setReview] = useState<Review>(() => run.review ?? emptyReview(run));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const current = verdict(run, review);
  async function save() {
    setSaving(true);
    try {
      await post("review", { runId: run.id, review });
      setMessage("评分已保存");
      onSaved();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="eval-review" aria-label="十项验收评分">
      <div className="eval-row">
        <h3 className="neko-text-card-title">验收评分</h3>
        <span className={current.failed ? "eval-danger" : "eval-secondary"}>
          {current.score === null ? "—" : `${current.score}/10`} · {current.label}
        </span>
      </div>
      <p className="neko-text-support eval-secondary">
        前 9 项人工评分；第 10 项自动检查。未评项不会算作通过。
      </p>
      <ol className="eval-rubric">
        {RUBRIC.map((label, i) => (
          <li key={label}>
            <div className="eval-score-row">
              <label htmlFor={`reason-${run.id}-${i}`}>
                {i + 1}. {label}
              </label>
              {i === 9 ? (
                <span>{review.scores[9]} · 自动</span>
              ) : (
                <ScoreControl
                  label={`第 ${i + 1} 项评分`}
                  value={review.scores[i]}
                  onChange={(s) =>
                    setReview({ ...review, scores: review.scores.map((v, j) => (i === j ? s : v)) })
                  }
                />
              )}
            </div>
            {i < 9 && (
              <input
                id={`reason-${run.id}-${i}`}
                aria-label={`第 ${i + 1} 项依据`}
                placeholder="引用输出原句、Q 编号或照片事实"
                value={review.reasons[i]}
                onChange={(e) =>
                  setReview({
                    ...review,
                    reasons: review.reasons.map((v, j) => (i === j ? e.target.value : v)),
                  })
                }
              />
            )}
          </li>
        ))}
      </ol>
      <fieldset>
        <legend className="neko-text-card-title">一票否决</legend>
        {(["fabrication", "repetition"] as const).map((key) => (
          <label className="eval-score-row" key={key}>
            {key === "fabrication" ? "出现明显编造" : "两个及以上模块重复同一结论"}
            <select
              aria-label={key === "fabrication" ? "编造否决" : "重复否决"}
              value={review[key] === null ? "" : String(review[key])}
              onChange={(e) =>
                setReview({
                  ...review,
                  [key]: e.target.value === "" ? null : e.target.value === "true",
                })
              }
            >
              <option value="">未评</option>
              <option value="false">未发现</option>
              <option value="true">触发否决</option>
            </select>
          </label>
        ))}
      </fieldset>
      <label>
        评审人
        <input
          value={review.reviewer}
          onChange={(e) => setReview({ ...review, reviewer: e.target.value })}
        />
      </label>
      <label>
        评审备注
        <textarea
          value={review.notes}
          onChange={(e) => setReview({ ...review, notes: e.target.value })}
        />
      </label>
      <button className="miao-primary-button" onClick={save} disabled={saving}>
        {saving ? "保存中…" : "保存评分"}
      </button>
      <p role="status" className="neko-text-support">
        {message}
      </p>
    </section>
  );
}
function Stability({
  runs,
  saved,
  onSaved,
}: {
  runs: EvalRun[];
  saved?: StabilityReview;
  onSaved: () => void;
}) {
  const latest = runs.slice(-5);
  const [review, setReview] = useState<StabilityReview>(
    () =>
      saved ?? {
        core: null,
        misunderstanding: null,
        affection: null,
        relationship: null,
        notes: "",
        runIds: latest.map((r) => r.id),
      },
  );
  const [message, setMessage] = useState("");
  const selected = review.runIds
    .map((id) => runs.find((r) => r.id === id))
    .filter((r): r is EvalRun => Boolean(r));
  return (
    <section className="miao-card eval-section">
      <h2 className="neko-text-module-title">同一只猫 · 5 次稳定性</h2>
      <p>{stabilityVerdict(runs, review)}</p>
      <p className="neko-text-support eval-secondary">
        比较核心人格与三条洞察的方向。措辞可以变化；任一方向明显漂移即失败。每次均不携带上一版结果。
      </p>
      <button
        className="miao-secondary-button"
        disabled={latest.length < 5}
        onClick={() =>
          setReview({
            core: null,
            misunderstanding: null,
            affection: null,
            relationship: null,
            notes: "",
            runIds: latest.map((r) => r.id),
          })
        }
      >
        比较最近 5 次
      </button>
      <div className="eval-comparison">
        {selected.map((r, i) => (
          <article key={r.id}>
            <h3 className="neko-text-card-title">第 {i + 1} 次</h3>
            <p className="neko-text-support eval-secondary">
              {new Date(r.createdAt).toLocaleString("zh-CN")}
            </p>
            <p>
              {r.copy?.title ?? r.error} {r.copy?.mbti}
            </p>
            {MODULES.slice(0, 4).map(([k, label]) => (
              <div key={k}>
                <h4 className="neko-text-card-title">{label}</h4>
                <p>{r.copy?.modules[k] ?? "生成失败"}</p>
              </div>
            ))}
          </article>
        ))}
      </div>
      <div className="eval-stability-scores">
        {(["core", "misunderstanding", "affection", "relationship"] as const).map((k, i) => (
          <label className="eval-score-row" key={k}>
            {["核心人格方向一致", "认知反差方向一致", "亲近表达方向一致", "主人角色方向一致"][i]}
            <ScoreControl
              label={`${k} 稳定性`}
              value={review[k]}
              onChange={(v) => setReview({ ...review, [k]: v })}
            />
          </label>
        ))}
      </div>
      <label>
        稳定性依据
        <textarea
          value={review.notes}
          onChange={(e) => setReview({ ...review, notes: e.target.value })}
        />
      </label>
      <button
        className="miao-primary-button"
        disabled={selected.length !== 5}
        onClick={async () => {
          try {
            await post("stability", { caseId: runs[0].caseId, review });
            setMessage("稳定性评分已保存");
            onSaved();
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        保存稳定性评分
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
export function PersonaEval() {
  const [state, setState] = useState<EvalState | null>(null);
  const [caseId, setCaseId] = useState("photo-01");
  const [runId, setRunId] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const r = await fetch("/__eval/state");
      if (!r.ok) throw Error("无法读取本地评测");
      setState(await r.json());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 2500);
    return () => clearInterval(timer);
  }, []);
  if (!state)
    return (
      <main className="eval-page">
        <h1 className="neko-text-page-title">猫咪档案评测</h1>
        <p>{error || "正在读取固定测试集…"}</p>
      </main>
    );
  const item = state.cases.find((c) => c.id === caseId)!;
  const source = state.sources.find((s) => s.file === item.photo.file)!;
  const runs = state.runs.filter((r) => r.caseId === caseId);
  const run = runs.find((r) => r.id === runId) ?? runs.at(-1);
  const running = state.job?.status === "running";
  const latest = state.cases
    .map((c) => state.runs.filter((r) => r.caseId === c.id).at(-1))
    .filter((r): r is EvalRun => Boolean(r));
  const resultForCase = (id: string) =>
    caseVerdict(
      state.runs.filter((r) => r.caseId === id),
      state.stability[id],
    );
  const failures = state.cases.filter((c) => resultForCase(c.id).failed).length,
    reviewed = latest.filter((r) => verdict(r).score !== null).length;
  async function start(ids: string[], count: number) {
    setBusy(true);
    setError("");
    try {
      await post("run", { ids, count });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    a.download = `persona-eval-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return (
    <main className="eval-page neko-text-body">
      <header className="eval-section">
        <h1 className="neko-text-page-title">猫咪档案评测</h1>
        <p className="eval-secondary">20 组固定输入，逐项验收每一次生成。</p>
        <p className="neko-text-support eval-secondary">
          网络真实照片 +
          模拟问卷。姓名、性别、年龄均为测试设定，不代表照片中猫的真实档案。评测只验证对输入的忠实度。
        </p>
      </header>
      <section className="miao-card eval-section">
        <div className="eval-row">
          <h2 className="neko-text-module-title">本轮概览</h2>
          <span className="neko-text-support">{state.datasetVersion}</span>
        </div>
        <p>
          已生成 {latest.length}/20 组 · 已评分 {reviewed}/20 组 · 失败 {failures} 组 · 累计{" "}
          {state.runs.length} 次
        </p>
        <div className="eval-actions">
          <button
            className="miao-primary-button"
            disabled={running || busy}
            onClick={() =>
              start(
                state!.cases.map((c) => c.id),
                1,
              )
            }
          >
            生成全部 20 组
          </button>
          <button
            className="miao-secondary-button"
            disabled={running || busy}
            onClick={() =>
              start(
                state!.cases.map((c) => c.id),
                5,
              )
            }
          >
            全部各生成 5 次
          </button>
          <button className="miao-secondary-button" onClick={download}>
            导出结果与评分
          </button>
        </div>
        <p className="neko-text-support eval-secondary">
          9–10：可上线；7–8：可用但继续调；≤6：失败。一票否决和稳定性失败优先。单次合格后仍需完成 5
          次稳定性验收。
        </p>
        {state.job && (
          <div role="status">
            <p>
              {running ? "生成中" : state.job.status === "cancelled" ? "已停止" : "生成完成"}：
              {state.job.completed}/{state.job.total} {state.job.current}
            </p>
            {running && (
              <button
                className="miao-secondary-button"
                disabled={state.job.cancelRequested}
                onClick={async () => {
                  try {
                    await post("cancel", {});
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {state.job.cancelRequested ? "等待当前请求结束…" : "完成当前条后停止"}
              </button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="eval-danger">
            {error}
          </p>
        )}
      </section>
      <div className="eval-workspace">
        <aside className="miao-card eval-case-list">
          <h2 className="neko-text-module-title">固定测试集</h2>
          <label className="neko-text-support">
            筛选
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">全部 20 组</option>
              <option value="unreviewed">待评分</option>
              <option value="failed">失败 / 否决</option>
            </select>
          </label>
          <nav aria-label="测试组">
            {state.cases
              .filter((c) => {
                const r = state.runs.filter((r) => r.caseId === c.id).at(-1);
                return (
                  filter === "all" ||
                  (filter === "failed"
                    ? resultForCase(c.id).failed
                    : !r || verdict(r).score === null)
                );
              })
              .map((c, i) => {
                const r = state.runs.filter((r) => r.caseId === c.id).at(-1),
                  v = r ? resultForCase(c.id) : null;
                return (
                  <button
                    className="eval-case"
                    aria-current={caseId === c.id ? "true" : undefined}
                    key={c.id}
                    onClick={() => {
                      setCaseId(c.id);
                      setRunId("");
                    }}
                  >
                    <span className="neko-text-card-title">
                      {c.id.slice(-2)} · {c.name}
                    </span>
                    <span className="neko-text-support">{c.focus}</span>
                    <span className="neko-text-support eval-secondary">
                      {v ? `${v.score === null ? "—" : v.score + "/10"} · ${v.label}` : "尚未生成"}
                    </span>
                  </button>
                );
              })}
          </nav>
        </aside>
        <div className="eval-detail">
          <section className="miao-card eval-section">
            <h2 className="neko-text-module-title">
              {item.id.slice(-2)} · {item.name}：{item.focus}
            </h2>
            <div className="eval-input-grid">
              <figure>
                <img
                  src={`/__eval/image/${item.photo.file}`}
                  alt={item.photo.visibleFacts.join("；")}
                />
                <figcaption className="neko-text-support eval-secondary">
                  <a href={source.sourcePage} target="_blank" rel="noreferrer">
                    原图来源
                  </a>{" "}
                  · {source.author} ·{" "}
                  <a href={source.licenseUrl || source.sourcePage} target="_blank" rel="noreferrer">
                    {source.license}
                  </a>
                  <br />
                  原图未裁切；本地测试缩略图。
                </figcaption>
              </figure>
              <div>
                <h3 className="neko-text-card-title">照片可见事实</h3>
                <ul>
                  {item.photo.visibleFacts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <h3 className="neko-text-card-title">不能从照片推断</h3>
                <ul>
                  {item.photo.cannotInfer.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            </div>
            <details>
              <summary className="neko-text-card-title">
                模拟资料与问卷 · {item.evidence.length}/8 题
              </summary>
              <p>
                {item.profile.gender} · {item.profile.ageStage} · 缺失题目保持未知
              </p>
              {item.evidence.length ? (
                item.evidence.map((e) => (
                  <p key={e.id}>
                    <strong>{e.id}</strong> {e.text}
                  </p>
                ))
              ) : (
                <p>未填写问卷，只能保守表达资料不足。</p>
              )}
            </details>
            <details>
              <summary className="neko-text-card-title">人工验收参考方向</summary>
              {Object.entries(item.expected).map(([k, v]) => (
                <p key={k}>
                  {k}：{v}
                </p>
              ))}
              <p className="neko-text-support eval-secondary">
                仅供评审，未作为提示传入模型；允许多种合理措辞。
              </p>
            </details>
            <div className="eval-actions">
              <button
                className="miao-primary-button"
                disabled={running || busy}
                onClick={() => start([caseId], 1)}
              >
                生成当前组
              </button>
              <button
                className="miao-secondary-button"
                disabled={running || busy}
                onClick={() => start([caseId], 5)}
              >
                当前猫独立生成 5 次
              </button>
            </div>
          </section>
          <section className="miao-card eval-section">
            <div className="eval-row">
              <h2 className="neko-text-module-title">生成结果</h2>
              <select
                aria-label="选择生成记录"
                value={run?.id ?? ""}
                onChange={(e) => setRunId(e.target.value)}
              >
                <option value="" disabled>
                  尚未生成
                </option>
                {runs.map((r, i) => (
                  <option key={r.id} value={r.id}>
                    第 {i + 1} 次 · {new Date(r.createdAt).toLocaleString("zh-CN")}
                  </option>
                ))}
              </select>
            </div>
            {!run ? (
              <p className="eval-secondary">生成后，五个模块和 10 项验收会一起显示。</p>
            ) : run.status === "error" ? (
              <p role="alert" className="eval-danger">
                生成失败：{run.error}。本条不会被记为合格。
              </p>
            ) : (
              <>
                <p className="neko-text-support eval-secondary">
                  真实生成 · {(run.durationMs / 1000).toFixed(1)} 秒 · {run.model}
                </p>
                <div className="eval-result-grid">
                  <div>
                    <h3 className="neko-text-module-title">{run.copy!.title}</h3>
                    <p>{run.copy!.mbti}</p>
                    <p className="neko-text-support eval-secondary">
                      生成 tags（{run.copy!.tags.length} 个）：{run.copy!.tags.join("、")}
                    </p>
                    {MODULES.map(([key, label]) => (
                      <article className="eval-output" key={key}>
                        <div className="eval-row">
                          <h4 className="neko-text-card-title">{label}</h4>
                          <span className="neko-text-support eval-secondary">
                            {key} · {Array.from(run.copy!.modules[key]).length} 字
                          </span>
                        </div>
                        <p>{run.copy!.modules[key]}</p>
                      </article>
                    ))}
                    <details>
                      <summary>自动长度检查</summary>
                      {run.checks?.map((c) => (
                        <p key={c.label} className={c.passed ? "" : "eval-danger"}>
                          {c.label}：{c.count} / {c.min}–{c.max} {c.passed ? "通过" : "不通过"}
                        </p>
                      ))}
                    </details>
                    <details>
                      <summary>待人工核查的信号 · {run.hints?.length ?? 0}</summary>
                      {run.hints?.length ? (
                        run.hints.map((h) => <p key={h}>{h}</p>)
                      ) : (
                        <p>未命中启发式规则，不代表语义合格。</p>
                      )}
                    </details>
                    <details>
                      <summary>原始结果、证据和阶段日志</summary>
                      <pre>
                        {JSON.stringify(
                          {
                            inputHash: run.inputHash,
                            promptVersion: run.promptVersion,
                            copy: run.copy,
                            requests: run.requests,
                            generation: run.generation,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </div>
                  <RunReview key={run.id} run={run} onSaved={refresh} />
                </div>
              </>
            )}
          </section>
          <Stability key={caseId} runs={runs} saved={state.stability[caseId]} onSaved={refresh} />
        </div>
      </div>
    </main>
  );
}
