import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdirSync, openSync, closeSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { loadAIServer } from "../scripts/bytecat-test-loader.mjs";
import { extractCopy, lengthChecks, riskHints } from "./core.ts";
export const fixtureDir = new URL("../scripts/fixtures/persona-photo-eval/", import.meta.url);
const logDir = new URL("../logs/persona-photo-eval/", import.meta.url);
const reportFile = new URL("report.json", logDir);
const lockFile = new URL("runner.lock", logDir);
export async function createEvaluation() {
  try {
    process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const dataset = JSON.parse(await readFile(new URL("cases.json", fixtureDir), "utf8"));
  const sources = JSON.parse(await readFile(new URL("sources.json", fixtureDir), "utf8"));
  let saved = {};
  try {
    saved = JSON.parse(await readFile(reportFile, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (saved.datasetVersion && saved.datasetVersion !== dataset.version)
    throw Error("测试集版本改变；请先归档 logs/persona-photo-eval/report.json");
  const state = {
    datasetVersion: dataset.version,
    cases: dataset.cases,
    sources,
    runs: saved.runs ?? [],
    stability: saved.stability ?? {},
    job: null,
  };
  let writes = Promise.resolve(),
    ownsJob = false;
  async function refresh() {
    if (ownsJob) return;
    try {
      const fresh = JSON.parse(await readFile(reportFile, "utf8"));
      state.runs = fresh.runs;
      state.stability = fresh.stability ?? {};
      state.job = fresh.job ?? null;
      if (state.job?.status === "running") {
        try {
          const lock = JSON.parse(readFileSync(lockFile, "utf8"));
          process.kill(lock.pid, 0);
        } catch {
          state.job = { ...state.job, status: "cancelled", current: null };
        }
      }
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  function persist() {
    const content =
      JSON.stringify(
        {
          datasetVersion: state.datasetVersion,
          runs: state.runs,
          stability: state.stability,
          job: state.job,
        },
        null,
        2,
      ) + "\n";
    writes = writes
      .catch(() => {})
      .then(async () => {
        await mkdir(logDir, { recursive: true });
        await writeFile(new URL("report.tmp", logDir), content);
        await rename(new URL("report.tmp", logDir), reportFile);
      });
    return writes;
  }
  async function generate(item, batchId, ordinal) {
    const started = Date.now(),
      id = randomUUID(),
      source = sources.find((s) => s.file === item.photo.file);
    const bytes = await readFile(new URL(`images/${item.photo.file}`, fixtureDir));
    if (createHash("sha256").update(bytes).digest("hex") !== source.sha256)
      throw Error("图片校验失败");
    const input = {
      profile: item.profile,
      imageDataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
      videoObservations: [],
    };
    const inputHash = createHash("sha256")
      .update(JSON.stringify({ profile: item.profile, photoSha256: source.sha256 }))
      .digest("hex");
    const run = {
      id,
      batchId,
      caseId: item.id,
      ordinal,
      createdAt: new Date().toISOString(),
      durationMs: 0,
      inputHash,
      mode: "live",
      status: "ok",
      requests: [],
    };
    try {
      const api = loadAIServer("neko-ai", {
        env: {
          ...process.env,
          NEKO_PERSONA_DEBUG: "true",
          NEKO_AI_DEBUG_PROMPTS: "false",
          AI_REQUIRE_REAL: "true",
        },
        logger: { info() {}, error() {} },
        fetch: async (url, init) => {
          const body = JSON.parse(init.body),
            request = {
              model:
                body.model ??
                decodeURIComponent(
                  new URL(url).pathname.split("/models/")[1]?.split(":")[0] ?? "unknown",
                ),
              imageAttached: /image_url|inline_data|inlineData/.test(init.body),
            };
          run.requests.push(request);
          const requestStart = Date.now();
          try {
            const response = await fetch(url, init);
            request.status = response.status;
            return response;
          } finally {
            request.durationMs = Date.now() - requestStart;
          }
        },
      });
      // Deliberately omit previousPersona: stability must not be manufactured by prior anchoring.
      const persona = await api.generateCatPersonaServer(input);
      if (
        !persona.generation ||
        persona.generation.model === "stable-fallback" ||
        persona.generation.stageLogs.some((s) => s.model === "stable-fallback")
      )
        throw Error("检测到离线回退，不能计作真实生成");
      run.copy = extractCopy(persona);
      run.checks = lengthChecks(run.copy);
      run.hints = riskHints(run.copy);
      run.model = persona.model;
      run.promptVersion = persona.generation.promptVersion;
      run.generation = persona.generation;
    } catch (error) {
      run.status = "error";
      run.error = String(error.message).replace(/(?:sk-|Bearer\s+)\S+/gi, "[redacted]");
    }
    run.durationMs = Date.now() - started;
    state.runs.push(run);
    await persist();
    return run;
  }
  function start(ids, count) {
    if (state.job?.status === "running") throw Error("已有评测正在运行");
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !state.cases.some((c) => c.id === id)) ||
      ![1, 5].includes(count)
    )
      throw Error("请选择有效测试组，重复次数为 1 或 5");
    mkdirSync(logDir, { recursive: true });
    try {
      const lock = JSON.parse(readFileSync(lockFile, "utf8"));
      try {
        process.kill(lock.pid, 0);
        throw Error("另一个评测进程正在运行");
      } catch (e) {
        if (e.code === "ESRCH") unlinkSync(lockFile);
        else throw e;
      }
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const fd = openSync(lockFile, "wx");
    writeFileSync(fd, JSON.stringify({ pid: process.pid }));
    closeSync(fd);
    ownsJob = true;
    // Reload under the lock so a CLI run and a browser session never overwrite each other's history.
    try {
      const fresh = JSON.parse(readFileSync(reportFile, "utf8"));
      state.runs = fresh.runs;
      state.stability = fresh.stability ?? {};
    } catch (e) {
      if (e.code !== "ENOENT") {
        unlinkSync(lockFile);
        ownsJob = false;
        throw e;
      }
    }
    const job = (state.job = {
      id: randomUUID(),
      total: ids.length * count,
      completed: 0,
      current: null,
      status: "running",
      cancelRequested: false,
    });
    const done = (async () => {
      try {
        await persist();
        for (const id of ids)
          for (let i = 1; i <= count; i++) {
            if (job.cancelRequested) {
              job.status = "cancelled";
              job.current = null;
              return;
            }
            job.current = `${id} · ${i}/${count}`;
            try {
              await generate(
                state.cases.find((c) => c.id === id),
                job.id,
                i,
              );
            } catch (e) {
              state.runs.push({
                id: randomUUID(),
                batchId: job.id,
                caseId: id,
                ordinal: i,
                createdAt: new Date().toISOString(),
                durationMs: 0,
                inputHash: "invalid",
                mode: "live",
                status: "error",
                error: e.message,
              });
              await persist();
            }
            job.completed++;
            await persist();
          }
        job.status = job.cancelRequested ? "cancelled" : "done";
        job.current = null;
      } finally {
        if (job.status === "running") job.status = "cancelled";
        await persist();
        unlinkSync(lockFile);
        ownsJob = false;
      }
    })();
    return { job, done };
  }
  return {
    state,
    start,
    persist,
    refresh,
    canReview() {
      return ownsJob || state.job?.status !== "running";
    },
    cancel() {
      if (state.job && !ownsJob && state.job.status === "running")
        throw Error("此批由命令行启动，请在对应终端按 Ctrl+C 停止");
      if (state.job) state.job.cancelRequested = true;
    },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const evaluation = await createEvaluation();
  const ids =
    process.argv
      .find((a) => a.startsWith("--case="))
      ?.slice(7)
      .split(",") ?? evaluation.state.cases.map((c) => c.id);
  const count = Number(process.argv.find((a) => a.startsWith("--repeat="))?.slice(9) ?? 1);
  const { job, done } = evaluation.start(ids, count);
  const timer = setInterval(
    () => console.log(`${job.completed}/${job.total} ${job.current ?? job.status}`),
    15000,
  );
  process.on("SIGINT", () => evaluation.cancel());
  await done;
  clearInterval(timer);
  const results = evaluation.state.runs.filter((r) => r.batchId === job.id);
  console.log(
    JSON.stringify({
      batchId: job.id,
      completed: results.length,
      errors: results.filter((r) => r.status === "error").length,
      report: fileURLToPath(reportFile),
    }),
  );
  if (results.some((r) => r.status === "error")) process.exitCode = 1;
}
