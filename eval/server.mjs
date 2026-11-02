import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createEvaluation, fixtureDir } from "./runner.mjs";
import { emptyReview } from "./core.ts";
const evaluation = await createEvaluation();
const root = fileURLToPath(new URL("..", import.meta.url));
function json(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}
function validScores(values, length) {
  return (
    Array.isArray(values) &&
    values.length === length &&
    values.every((s) => s === 0 || s === 1 || s === null)
  );
}
async function body(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 100000) throw Error("请求过大");
  }
  return JSON.parse(data);
}
const server = await createServer({
  root,
  configFile: false,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "local-persona-evaluation",
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url, "http://localhost");
          if (url.pathname === "/debug/eval" || url.pathname === "/") {
            req.url = "/eval/index.html";
            return next();
          }
          if (!url.pathname.startsWith("/__eval/")) return next();
          try {
            const host = req.headers.host ?? "";
            if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host))
              return json(res, 403, { error: "只允许本机访问" });
            if (req.method === "POST" && req.headers.origin !== `http://${host}`)
              return json(res, 403, { error: "请求来源不匹配" });
            if (req.method === "GET" && url.pathname === "/__eval/state") {
              await evaluation.refresh();
              return json(res, 200, evaluation.state);
            }
            if (req.method === "GET" && url.pathname.startsWith("/__eval/image/")) {
              const filename = url.pathname.split("/").at(-1);
              if (!evaluation.state.sources.some((s) => s.file === filename))
                return json(res, 404, { error: "图片不存在" });
              res.setHeader("Content-Type", "image/jpeg");
              res.end(await readFile(new URL(`images/${filename}`, fixtureDir)));
              return;
            }
            if (req.method !== "POST") return json(res, 404, { error: "接口不存在" });
            const input = await body(req);
            await evaluation.refresh();
            if (url.pathname === "/__eval/run") {
              const { job, done } = evaluation.start(input.ids, input.count);
              done.catch(() => {
                job.status = "cancelled";
              });
              return json(res, 202, job);
            }
            if (url.pathname === "/__eval/cancel") {
              evaluation.cancel();
              return json(res, 200, { ok: true });
            }
            if (url.pathname === "/__eval/review") {
              if (!evaluation.canReview())
                throw Error("命令行批次生成中，请结束后保存评分，避免覆盖历史");
              const run = evaluation.state.runs.find((r) => r.id === input.runId),
                r = input.review;
              if (
                !run ||
                !r ||
                !validScores(r.scores, 10) ||
                !Array.isArray(r.reasons) ||
                r.reasons.length !== 10 ||
                r.reasons.some((s) => typeof s !== "string") ||
                ![true, false, null].includes(r.fabrication) ||
                ![true, false, null].includes(r.repetition) ||
                typeof r.notes !== "string" ||
                typeof r.reviewer !== "string"
              )
                throw Error("评分格式不正确");
              run.review = { ...r, scores: [...r.scores.slice(0, 9), emptyReview(run).scores[9]] };
              await evaluation.persist();
              return json(res, 200, { ok: true });
            }
            if (url.pathname === "/__eval/stability") {
              if (!evaluation.canReview())
                throw Error("命令行批次生成中，请结束后保存评分，避免覆盖历史");
              const r = input.review;
              if (
                !evaluation.state.cases.some((c) => c.id === input.caseId) ||
                !r ||
                !validScores([r.core, r.misunderstanding, r.affection, r.relationship], 4) ||
                typeof r.notes !== "string" ||
                !Array.isArray(r.runIds) ||
                r.runIds.length !== 5 ||
                new Set(r.runIds).size !== 5 ||
                r.runIds.some(
                  (id) =>
                    !evaluation.state.runs.some(
                      (run) => run.id === id && run.caseId === input.caseId,
                    ),
                )
              )
                throw Error("需要同一组的 5 次结果");
              evaluation.state.stability[input.caseId] = r;
              await evaluation.persist();
              return json(res, 200, { ok: true });
            }
            return json(res, 404, { error: "接口不存在" });
          } catch (e) {
            json(res, 400, { error: e.message });
          }
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 4318, strictPort: true },
  appType: "spa",
});
await server.listen();
console.log("猫咪档案评测：http://127.0.0.1:4318/debug/eval");
