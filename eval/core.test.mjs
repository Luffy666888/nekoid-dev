import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  extractCopy,
  lengthChecks,
  emptyReview,
  verdict,
  stabilityVerdict,
  riskHints,
} from "./core.ts";
const copy = {
  title: "安静陪伴型",
  mbti: "ISFP",
  tags: ["会观察"],
  modules: {
    summary: "它".repeat(30),
    misunderstanding: "甲".repeat(35),
    affection: "乙".repeat(35),
    relationship: "丙".repeat(35),
    bondSummary: "丁".repeat(10),
  },
};
const run = {
  id: "r1",
  caseId: "c1",
  status: "ok",
  inputHash: "same",
  promptVersion: { stage1: "v1" },
  copy,
  checks: lengthChecks(copy),
};
const full = {
  ...emptyReview(run),
  scores: Array(10).fill(1),
  fabrication: false,
  repetition: false,
};
test("unknown semantic criteria and vetoes cannot pass", () => {
  assert.equal(verdict(run).score, null);
  assert.equal(verdict(run, { ...full, fabrication: null }).score, null);
});
test("both vetoes override a perfect score", () => {
  for (const key of ["fabrication", "repetition"])
    assert.equal(verdict(run, { ...full, [key]: true }).label, "一票否决");
});
test("exact 0/1 thresholds and non-overridable length checks", () => {
  for (const [points, label] of [
    [10, "可上线（单次）"],
    [9, "可上线（单次）"],
    [8, "可用但继续调"],
    [7, "可用但继续调"],
    [6, "失败"],
  ]) {
    const scores = Array.from({ length: 10 }, (_, i) => (i < 10 - points ? 0 : 1));
    assert.equal(verdict(run, { ...full, scores }).label, label);
  }
  const bad = { ...run, checks: lengthChecks({ ...copy, tags: ["一个", "两个", "三个", "四个"] }) };
  assert.equal(verdict(bad, full).score, 9);
});
test("all five modules, title and tags are checked, Unicode does not double count", () => {
  const checks = lengthChecks({ ...copy, modules: { ...copy.modules, summary: "𠮷".repeat(30) } });
  assert.ok(checks.every((c) => c.passed));
  assert.equal(
    lengthChecks({ ...copy, modules: { ...copy.modules, affection: "短" } }).find(
      (c) => c.label === "affection",
    ).passed,
    false,
  );
  assert.equal(extractCopy({}).modules.summary, "");
});
test("five runs need identical inputs, prompt versions, successful generation and semantic review", () => {
  const runs = Array.from({ length: 5 }, (_, i) => ({ ...run, id: `r${i}` }));
  const review = {
    core: 1,
    misunderstanding: 1,
    affection: 1,
    relationship: 1,
    runIds: runs.map((r) => r.id),
    notes: "",
  };
  assert.match(stabilityVerdict(runs, review), /^通过/);
  assert.match(stabilityVerdict(runs, { ...review, affection: 0 }), /^失败/);
  assert.match(stabilityVerdict(runs, { ...review, core: null }), /^待评/);
  assert.match(
    stabilityVerdict(
      runs.map((r, i) => (i ? r : { ...r, inputHash: "changed" })),
      review,
    ),
    /^待评/,
  );
  assert.match(
    stabilityVerdict(
      runs.map((r, i) => (i ? r : { ...r, promptVersion: { stage1: "v2" } })),
      review,
    ),
    /^待评/,
  );
  assert.match(
    stabilityVerdict(
      runs.map((r, i) => (i ? r : { ...r, status: "error" })),
      review,
    ),
    /^失败/,
  );
  assert.match(
    stabilityVerdict(runs, { ...review, runIds: ["r1", "r1", "r1", "r1", "r1"] }),
    /^待评/,
  );
});
test("risk hints are hints, never an automatic semantic score", () => {
  const c = { ...copy, modules: { ...copy.modules, summary: "每天清晨都会沿着固定路线巡视" } };
  assert.ok(riskHints(c).length);
  assert.equal(verdict({ ...run, copy: c }).score, null);
});
test("20 frozen licensed photos are distinct, available, checksummed and grounded in actual questionnaire choices", async () => {
  const base = new URL("../scripts/fixtures/persona-photo-eval/", import.meta.url);
  const dataset = JSON.parse(await readFile(new URL("cases.json", base), "utf8")),
    sources = JSON.parse(await readFile(new URL("sources.json", base), "utf8"));
  assert.equal(dataset.cases.length, 20);
  assert.equal(sources.length, 20);
  assert.equal(new Set(sources.map((s) => s.sha256)).size, 20);
  const ui = await readFile(
    new URL("../src/components/neko/onboarding/Screen4Quiz.tsx", import.meta.url),
    "utf8",
  );
  for (const q of dataset.questions)
    for (const text of Object.values(q)) assert.ok(ui.includes(text), "Question wording drifted");
  for (const c of dataset.cases) {
    const s = sources.find((s) => s.file === c.photo.file);
    assert.ok(s.author && s.license && s.sourcePage && s.url);
    const bytes = await readFile(new URL(`images/${s.file}`, base));
    assert.equal(bytes[0], 255);
    assert.equal(bytes[1], 216);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), s.sha256);
    assert.ok(c.photo.visibleFacts.length >= 2);
    assert.equal(c.evidence.length, Object.keys(c.profile.quiz).length);
  }
});

test("case release verdict includes stability and all five individual reviews", async () => {
  const { caseVerdict } = await import("./core.ts");
  const runs = Array.from({ length: 5 }, (_, i) => ({ ...run, id: `r${i}`, review: full }));
  const review = {
    core: 1,
    misunderstanding: 1,
    affection: 1,
    relationship: 1,
    runIds: runs.map((r) => r.id),
    notes: "",
  };
  assert.match(caseVerdict(runs, review).label, /可上线/);
  assert.equal(caseVerdict(runs, { ...review, core: 0 }).failed, true);
  assert.match(caseVerdict(runs).label, /待验收/);
  assert.equal(
    caseVerdict(
      runs.map((r, i) => (i ? r : { ...r, review: { ...full, fabrication: true } })),
      review,
    ).failed,
    true,
  );
  assert.match(caseVerdict([...runs, { ...runs[4], id: "new" }], review).label, /待验收/);
});
