import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadAIServer } from "./bytecat-test-loader.mjs";

const cases = JSON.parse(
  await readFile(new URL("./fixtures/persona-evaluation-cases.json", import.meta.url), "utf8"),
);

const live = process.argv.includes("--live");
const targetCaseId = process.argv.find((arg) => arg.startsWith("--case="))?.slice("--case=".length);
const selectedCases = targetCaseId ? cases.filter((item) => item.id === targetCaseId) : cases;

assert.ok(selectedCases.length, `No persona evaluation case matched ${targetCaseId}`);

const api = loadAIServer("neko-ai", {
  env: {
    ...process.env,
    NEKO_PERSONA_DEBUG: "true",
    AI_REQUIRE_REAL: live ? "true" : "false",
  },
  logger: live ? console : { info() {}, error() {} },
});

const report = [];

function hasForbiddenClaim(text, claim) {
  if (claim === "一定") return /(?<!不)一定/u.test(text);
  if (claim === "确定") return /(?<!不)确定/u.test(text);
  return text.includes(claim);
}

for (const item of selectedCases) {
  const persona = await api.generateCatPersonaServer({
    profile: item.profile,
    videoObservations: item.videoObservations ?? [],
  });
  const generation = persona.generation;
  assert.ok(generation, `${item.id} did not return debug generation data`);
  const groundedTraits = generation.groundedTraits ?? [];
  const finalText = [
    persona.type,
    persona.mbti,
    persona.monologue,
    persona.analysis,
    persona.corePersonality,
    persona.misunderstanding,
    persona.loveLanguageInsight,
    persona.ownerRelationship,
    ...(persona.tags ?? []),
  ].join("\n");
  const missingExpectedTraits = (item.expectedTraits ?? []).filter(
    (trait) => !JSON.stringify(groundedTraits).includes(trait),
  );
  const forbiddenHits = (item.forbiddenClaims ?? []).filter((claim) =>
    hasForbiddenClaim(finalText, claim),
  );
  const evalResult = generation.evalResult;
  const passed =
    Boolean(evalResult?.passed) && missingExpectedTraits.length === 0 && forbiddenHits.length === 0;

  report.push({
    id: item.id,
    name: item.name ?? item.id,
    passed,
    score: evalResult?.total ?? 0,
    title: persona.type,
    tags: persona.tags,
    missingExpectedTraits,
    forbiddenHits,
    fatalRules: evalResult?.fatalRules ?? [],
    generation,
  });
}

await mkdir(new URL("../logs/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../logs/persona-evaluation-report.json", import.meta.url),
  JSON.stringify(report, null, 2),
);

const failed = report.filter((item) => !item.passed);
const average = Math.round(
  report.reduce((sum, item) => sum + Number(item.score ?? 0), 0) / Math.max(1, report.length),
);

console.log(
  JSON.stringify(
    {
      mode: live ? "live" : "stable",
      cases: report.length,
      passed: report.length - failed.length,
      failed: failed.map((item) => item.id),
      average,
      reportPath: "logs/persona-evaluation-report.json",
      liuliuDebug: report.find((item) => item.id === "liuliu_high_social_boundary"),
    },
    null,
    2,
  ),
);

if (failed.length) process.exitCode = 1;
