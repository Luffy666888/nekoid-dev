import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rename, stat, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { performanceRecord, createPerformanceSink, installPerformanceLogging, MAX_FILE_BYTES } from "../deploy/china/performance-log-preload.mjs";

const input = {
  event: "http_end", operation: "persona", requestId: "0c7be2b8-ea47-4540-aea7-7f16ee779057",
  flowId: "669d7d3b-c802-4eb5-96db-c89871441541", outcome: "ok", durationMs: 125, httpStatus: 200,
};
const parse = value => performanceRecord("NEKO perf", JSON.stringify(value));
async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), "neko-perf-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("only known performance events/fields reach JSON; private debug data is dropped", () => {
  const record = parse({ ...input, prompt: "SECRET", output: "SECRET", token: "SECRET", userId: "SECRET", image: "SECRET", error: "SECRET", timestamp: "SECRET", service: "SECRET", durationMs: -1 });
  assert.equal(record.event, "http_end");
  assert.equal(record.service, "nekoid");
  assert.equal(record.deployment, "china");
  assert.equal(record.durationMs, undefined);
  assert.ok(Number.isFinite(Date.parse(record.timestamp)));
  assert.doesNotMatch(JSON.stringify(record), /SECRET/);
  for (const value of [null, [], {}, { ...input, event: "debug" }, { ...input, requestId: "private-name" }, { ...input, operation: "private-name" }]) assert.equal(parse(value), null);
  assert.equal(performanceRecord("NEKO AI debug", JSON.stringify(input)), null);
  assert.equal(performanceRecord("NEKO perf", "not json"), null);
  assert.equal(performanceRecord("NEKO perf", "x".repeat(17000)), null);
});

test("metadata retains diagnostic numbers/codes but rejects raw messages and URLs", () => {
  const record = parse({ ...input, stage: "stage1", errorCategory: "timeout", networkCode: "UND_ERR_HEADERS_TIMEOUT", model: "gemini-3.7-flash", promptVersion: "v1", headersMs: null, bodyMs: 12, hasImage: true, willRetry: false, inputTokens: 200, reasons: ["root_keys", "https://secret.test/token", "a raw private message"] });
  assert.equal(record.errorCategory, "timeout");
  assert.equal(record.bodyMs, 12);
  assert.equal(record.hasImage, true);
  assert.equal(record.willRetry, false);
  assert.deepEqual(record.reasons, ["root_keys"]);
  assert.equal(parse({ ...input, model: "https://secret.test", errorCategory: "my private message" }).model, undefined);
});

test("JSONL is ordered, private by default and reopens after rename rotation", async t => {
  const file = join(await temporary(t), "performance.jsonl");
  const sink = createPerformanceSink(file);
  for (let attempt = 1; attempt <= 150; attempt++) sink.enqueue(parse({ ...input, attempt }));
  await sink.flush();
  const rows = (await readFile(file, "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(rows.map(row => row.attempt), Array.from({ length: 150 }, (_, i) => i + 1));
  assert.equal((await stat(file)).mode & 0o007, 0);
  await rename(file, `${file}.1`);
  sink.enqueue(parse({ ...input, attempt: 151 }));
  await sink.flush();
  assert.equal(JSON.parse((await readFile(file, "utf8")).trim()).attempt, 151);
  assert.equal((await readFile(`${file}.1`, "utf8")).trim().split("\n").length, 150);
});

test("IO failures, warning failures and oversized queues never throw; recovery works", async () => {
  let clock = 100_000, fail = true, writes = [];
  const sink = createPerformanceSink("test", { now: () => clock, warn() { throw new Error("private IO error"); }, append: async (_file, value) => { if (fail) throw new Error("private IO error"); writes.push(value); }, maxQueuedBytes: 1024 });
  assert.equal(sink.enqueue(parse(input)), true);
  await sink.flush();
  assert.equal(sink.dropped, 1);
  assert.equal(sink.enqueue(parse(input)), false);
  fail = false;
  clock += 31_000;
  sink.enqueue(parse(input));
  await sink.flush();
  assert.equal(writes.length, 1);
  for (let i = 0; i < 20; i++) sink.enqueue(parse(input));
  await sink.flush();
  assert.ok(sink.dropped > 2);
});

test("file size guard stops growth until rotation rather than filling the disk", async t => {
  const file = join(await temporary(t), "performance.jsonl");
  await writeFile(file, "");
  await truncate(file, MAX_FILE_BYTES);
  const sink = createPerformanceSink(file, { warn() {} });
  sink.enqueue(parse(input));
  await sink.flush();
  assert.equal((await stat(file)).size, MAX_FILE_BYTES);
  assert.equal(sink.dropped, 1);
});

test("console output and return value are unchanged; unrelated output is not collected", async t => {
  const file = join(await temporary(t), "performance.jsonl");
  const calls = [];
  const target = { info(...args) { calls.push(args); return 42; } };
  const original = target.info;
  const installed = installPerformanceLogging(file, target);
  assert.equal(target.info("NEKO perf", JSON.stringify(input)), 42);
  target.info("NEKO AI debug", "private prompt");
  await installed.sink.flush();
  assert.equal(calls.length, 2);
  assert.equal((await readFile(file, "utf8")).trim().split("\n").length, 1);
  installed.restore();
  assert.equal(target.info, original);
});

test("actual Node --import entrypoint writes before natural process exit", async t => {
  const file = join(await temporary(t), "performance.jsonl");
  const child = spawnSync(process.execPath, ["--import", new URL("../deploy/china/performance-log-preload.mjs", import.meta.url).href, "--input-type=module", "-e", `console.info('NEKO perf', ${JSON.stringify(JSON.stringify(input))})`], { env: { ...process.env, NEKO_PERF_LOG_FILE: file }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /NEKO perf/);
  assert.equal(JSON.parse((await readFile(file, "utf8")).trim()).requestId, input.requestId);
});
